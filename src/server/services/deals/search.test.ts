import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { addItem } from "~/server/services/lists";
import { makeUser, resetDb, testDb } from "~/test/db";

import { bestOffer, getFinalList, searchDeals } from "./search";
import type { StoreAdapter, StoreOffer } from "./types";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const offer = (title: string, priceCents: number | null, department: string | null = null): StoreOffer => ({
  title,
  priceCents,
  wasPriceCents: null,
  couponSummary: null,
  department,
  sourceUrl: null,
});

describe("bestOffer", () => {
  it("matches noisy titles but not different products", () => {
    const offers = [offer("Reese's Peanut Butter Cups", 199), offer("Jif Creamy Peanut Butter, 16 oz", 349)];
    expect(bestOffer("jif creamy peanut butter", offers)?.priceCents).toBe(349);
    expect(bestOffer("peanut butter", [offers[0]!])).toBeNull();
  });
});

describe("searchDeals + getFinalList", () => {
  it("groups by cheapest store then department, honoring pins", async () => {
    const jason = await makeUser(db, "Jason");
    const kroger = await db.store.create({ data: { name: "Kroger", adapterKey: "k", priority: 0 } });
    const aldi = await db.store.create({ data: { name: "Aldi", adapterKey: "a", priority: 1 } });
    const catalogs: Record<string, StoreOffer[]> = {
      k: [offer("Whole Milk", 399, "Dairy"), offer("Bananas", 59, "Produce")],
      a: [offer("Whole Milk", 289, "Dairy"), offer("Bananas", 49, "Produce")],
    };
    const getAdapter = (key: string): StoreAdapter => ({
      key,
      search: async (q) => catalogs[key]!.filter((o) => o.title.toLowerCase().includes(q.toLowerCase())),
    });

    const milk = await addItem(db, { label: "Whole milk", addedById: jason.id });
    await addItem(db, { label: "Bananas", addedById: jason.id, pinnedStoreId: kroger.id });
    await addItem(db, { label: "Saffron", addedById: jason.id });
    const listId = milk.item.listId;

    const result = await searchDeals(db, listId, getAdapter);
    expect(result).toEqual({ searched: 3, matched: 2 });

    const view = await getFinalList(db, listId);
    const summary = view.groups.map((g) => ({
      store: g.storeName,
      departments: g.departments.map((d) => [d.name, d.items.map((i) => i.label)]),
    }));
    expect(summary).toEqual([
      { store: "Kroger", departments: [["Produce", ["Bananas"]]] },
      { store: "Aldi", departments: [["Dairy", ["Whole milk"]]] },
      { store: "Any store", departments: [["Other", ["Saffron"]]] },
    ]);
    expect(view.groups[0]!.departments[0]!.items[0]!.otherDeals).toHaveLength(1);
    expect(await db.department.count({ where: { storeId: aldi.id } })).toBe(2);
  });

  it("replaces an item's previous deals on re-search", async () => {
    const jason = await makeUser(db, "Jason");
    await db.store.create({ data: { name: "Mock", adapterKey: "mock" } });
    const { item } = await addItem(db, { label: "Eggs", addedById: jason.id });
    const { mockAdapter } = await import("./mock");
    await searchDeals(db, item.listId, () => mockAdapter());
    await searchDeals(db, item.listId, () => mockAdapter());
    expect(await db.dealMatch.count()).toBe(1);
  });
});
