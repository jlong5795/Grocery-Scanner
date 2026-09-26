import type { PrismaClient } from "../../../../generated/prisma";
import { fingerprintSimilarity } from "~/server/domain/fingerprint";
import { chooseStore, departmentRank } from "~/server/domain/stores";

import type { StoreAdapter, StoreOffer } from "./types";

/**
 * Deal search (spec section 7) and final-list grouping (section 8).
 *
 * Offer titles carry brand and size noise ("Kroger Whole Milk, 1 gal"), so the
 * bar is lower than for catalog matching, but still conservative: a missed
 * match just means no deal shown; a wrong match could send someone to buy the
 * wrong product ("peanut butter" must not match "peanut butter cups").
 */
export const OFFER_MATCH_THRESHOLD = 0.6;

export function bestOffer(query: string, offers: readonly StoreOffer[]): StoreOffer | null {
  let best: { offer: StoreOffer; score: number } | null = null;
  for (const offer of offers) {
    const score = fingerprintSimilarity(query, offer.title);
    if (score < OFFER_MATCH_THRESHOLD) continue;
    const better =
      !best ||
      score > best.score ||
      (score === best.score &&
        (offer.priceCents ?? Infinity) < (best.offer.priceCents ?? Infinity));
    if (better) best = { offer, score };
  }
  return best?.offer ?? null;
}

type GetAdapter = (adapterKey: string) => StoreAdapter | null;

/**
 * Search every designated store for each unchecked item (or just `itemIds`,
 * for items added mid-trip) and replace their DealMatch rows.
 */
export async function searchDeals(
  db: PrismaClient,
  listId: string,
  getAdapter: GetAdapter,
  itemIds?: string[],
) {
  const [stores, items] = await Promise.all([
    db.store.findMany({ include: { departments: true } }),
    db.groceryListItem.findMany({
      where: { listId, checkedAt: null, ...(itemIds ? { id: { in: itemIds } } : {}) },
      include: { sourceItem: { select: { displayName: true } } },
    }),
  ]);

  let matched = 0;
  for (const item of items) {
    const query = item.sourceItem?.displayName ?? item.label;
    const rows = [];
    for (const store of stores) {
      const adapter = getAdapter(store.adapterKey);
      if (!adapter) continue;
      const offer = bestOffer(query, await adapter.search(query));
      if (!offer) continue;

      let departmentId: string | null = null;
      if (offer.department) {
        const existing = store.departments.find(
          (d) => d.name.toLowerCase() === offer.department!.toLowerCase(),
        );
        const dept =
          existing ??
          (await db.department.upsert({
            where: { storeId_name: { storeId: store.id, name: offer.department } },
            update: {},
            create: {
              storeId: store.id,
              name: offer.department,
              sortOrder: departmentRank(offer.department),
            },
          }));
        if (!existing) store.departments.push(dept);
        departmentId = dept.id;
      }

      rows.push({
        groceryItemId: item.id,
        storeId: store.id,
        departmentId,
        title: offer.title,
        priceCents: offer.priceCents,
        wasPriceCents: offer.wasPriceCents,
        couponSummary: offer.couponSummary,
        sourceUrl: offer.sourceUrl,
      });
    }

    await db.$transaction([
      db.dealMatch.deleteMany({ where: { groceryItemId: item.id } }),
      db.dealMatch.createMany({ data: rows }),
    ]);
    if (rows.length > 0) matched++;
  }
  return { searched: items.length, matched };
}

/**
 * The shopping view: items grouped by chosen store, then by department.
 * Items with no deal anywhere land in an "Any store" bucket at the end.
 */
export async function getFinalList(db: PrismaClient, listId: string) {
  const [stores, list] = await Promise.all([
    db.store.findMany({ orderBy: { priority: "asc" } }),
    db.groceryList.findUniqueOrThrow({
      where: { id: listId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            addedBy: { select: { id: true, name: true, email: true } },
            checkedBy: { select: { id: true, name: true } },
            dealMatches: { include: { department: true, store: true } },
            substitutions: {
              orderBy: { createdAt: "desc" },
              include: { askedTo: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
  ]);

  type Item = (typeof list.items)[number];
  type Row = Item & { chosenDeal: Item["dealMatches"][number] | null; otherDeals: Item["dealMatches"] };
  const buckets = new Map<string | null, Map<string, Row[]>>();
  const deptOrder = new Map<string, number>(); // "storeId:dept" -> sortOrder

  for (const item of list.items) {
    const storeId = chooseStore(item.pinnedStoreId, item.dealMatches, stores);
    const chosenDeal = item.dealMatches.find((d) => d.storeId === storeId) ?? null;
    const department = chosenDeal?.department?.name ?? "Other";
    if (chosenDeal?.department) {
      deptOrder.set(`${storeId}:${department}`, chosenDeal.department.sortOrder);
    }
    const row: Row = {
      ...item,
      chosenDeal,
      otherDeals: item.dealMatches.filter((d) => d !== chosenDeal),
    };
    const byDept = buckets.get(storeId) ?? new Map<string, Row[]>();
    byDept.set(department, [...(byDept.get(department) ?? []), row]);
    buckets.set(storeId, byDept);
  }

  const storeOrder = new Map(stores.map((s, i) => [s.id, i]));
  const deptSort = (storeId: string | null) => (a: string, b: string) => {
    const order = (name: string) => deptOrder.get(`${storeId}:${name}`) ?? departmentRank(name);
    return order(a) - order(b) || a.localeCompare(b);
  };

  const groups = [...buckets.entries()]
    .sort(([a], [b]) =>
      a === null ? 1 : b === null ? -1 : (storeOrder.get(a) ?? 0) - (storeOrder.get(b) ?? 0),
    )
    .map(([storeId, byDept]) => ({
      storeId,
      storeName: stores.find((s) => s.id === storeId)?.name ?? "Any store",
      departments: [...byDept.keys()].sort(deptSort(storeId)).map((name) => ({
        name,
        // Checked items drop to the bottom of their section.
        items: byDept
          .get(name)!
          .sort((a, b) => Number(!!a.checkedAt) - Number(!!b.checkedAt) || a.position - b.position),
      })),
    }));

  return { list: { id: list.id, status: list.status, createdAt: list.createdAt }, groups };
}
