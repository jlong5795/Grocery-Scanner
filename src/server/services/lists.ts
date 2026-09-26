import { TRPCError } from "@trpc/server";

import { Prisma, type PrismaClient } from "../../../generated/prisma";
import { normalizeFingerprint } from "~/server/domain/fingerprint";

/**
 * Shopping list rules (spec Flows C and D). The list lives outside the scan
 * flow: at most one list is open at a time, anyone can add to it whenever, and
 * adding the first item creates it.
 */

type Db = PrismaClient | Prisma.TransactionClient;

const OPEN_STATUSES = ["OPEN", "SHOPPING"] as const;

export function getOpenList(db: Db) {
  return db.groceryList.findFirst({
    where: { status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
}

/** The open list, creating one if none exists. Safe under concurrent callers. */
export async function getOrCreateOpenList(db: Db) {
  const existing = await getOpenList(db);
  if (existing) return existing;
  try {
    return await db.groceryList.create({ data: { status: "OPEN" } });
  } catch (err) {
    // Someone else created it first; the partial unique index guarantees one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const list = await getOpenList(db);
      if (list) return list;
    }
    throw err;
  }
}

export interface AddItemInput {
  label: string;
  quantity?: string | null;
  notes?: string | null;
  sourceItemId?: string | null;
  pinnedStoreId?: string | null;
  addedById: string;
}

/**
 * Add to the open list. An item already on the list (same catalog item, or the
 * same label typed by hand) isn't added twice; the existing row is returned
 * with `duplicate: true` so the UI can say who added it.
 */
export async function addItem(db: Db, input: AddItemInput) {
  const list = await getOrCreateOpenList(db);
  const label = input.label.trim();
  if (!label) throw new TRPCError({ code: "BAD_REQUEST", message: "Item name is required." });

  const unchecked = await db.groceryListItem.findMany({
    where: { listId: list.id, checkedAt: null },
    select: { id: true, label: true, sourceItemId: true },
  });
  const normalized = normalizeFingerprint(label);
  const dup = unchecked.find(
    (i) =>
      (input.sourceItemId && i.sourceItemId === input.sourceItemId) ||
      normalizeFingerprint(i.label) === normalized,
  );
  if (dup) {
    const item = await db.groceryListItem.findUniqueOrThrow({
      where: { id: dup.id },
      include: { addedBy: { select: { id: true, name: true } } },
    });
    return { item, duplicate: true };
  }

  let pinnedStoreId = input.pinnedStoreId ?? null;
  if (!pinnedStoreId && input.sourceItemId) {
    const source = await db.pantryItem.findUnique({
      where: { id: input.sourceItemId },
      select: { preferredStoreId: true },
    });
    pinnedStoreId = source?.preferredStoreId ?? null;
  }

  const last = await db.groceryListItem.aggregate({
    where: { listId: list.id },
    _max: { position: true },
  });

  const item = await db.groceryListItem.create({
    data: {
      listId: list.id,
      label,
      quantity: input.quantity?.trim() || null,
      notes: input.notes?.trim() || null,
      sourceItemId: input.sourceItemId ?? null,
      pinnedStoreId,
      addedById: input.addedById,
      position: (last._max.position ?? -1) + 1,
    },
    include: { addedBy: { select: { id: true, name: true } } },
  });
  return { item, duplicate: false };
}

/**
 * Check an item off (or un-check it). A checked item that came from the
 * catalog is back in stock without needing a scan; un-checking puts it back
 * to OUT since it's still on the list to buy.
 */
export async function setChecked(db: Db, itemId: string, userId: string, checked: boolean) {
  const item = await db.groceryListItem.update({
    where: { id: itemId },
    data: checked
      ? { checkedAt: new Date(), checkedById: userId }
      : { checkedAt: null, checkedById: null },
  });
  if (item.sourceItemId) {
    await db.pantryItem.update({
      where: { id: item.sourceItemId },
      data: checked ? { status: "IN_STOCK", lastSeenAt: new Date() } : { status: "OUT" },
    });
  }
  return item;
}

/**
 * End the trip: the list becomes COMPLETE and is kept as history. Unchecked
 * items named in `carryOver` move to a new open list, keeping who added them.
 * Unchecked items that are dropped stay on the completed list; their catalog
 * items go back to IN_STOCK so the next scan decides whether they're missing.
 */
export async function finishTrip(db: PrismaClient, listId: string, carryOver: string[]) {
  return db.$transaction(async (tx) => {
    const list = await tx.groceryList.findUnique({
      where: { id: listId },
      include: { items: { where: { checkedAt: null } } },
    });
    if (!list || list.status === "COMPLETE") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That list isn't open." });
    }

    await tx.groceryList.update({
      where: { id: listId },
      data: { status: "COMPLETE", completedAt: new Date() },
    });

    const carry = new Set(carryOver);
    const moving = list.items.filter((i) => carry.has(i.id));
    const dropped = list.items.filter((i) => !carry.has(i.id));

    let nextListId: string | null = null;
    if (moving.length > 0) {
      const next = await getOrCreateOpenList(tx);
      nextListId = next.id;
      await tx.groceryListItem.updateMany({
        where: { id: { in: moving.map((i) => i.id) } },
        data: { listId: next.id },
      });
    }

    const droppedSources = dropped.map((i) => i.sourceItemId).filter((id): id is string => !!id);
    if (droppedSources.length > 0) {
      await tx.pantryItem.updateMany({
        where: { id: { in: droppedSources }, status: "OUT" },
        data: { status: "IN_STOCK" },
      });
    }

    return { carriedOver: moving.length, nextListId };
  });
}
