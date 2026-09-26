import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { makeUser, resetDb, testDb } from "~/test/db";

import { addItem, finishTrip, getOpenList, getOrCreateOpenList, setChecked } from "./lists";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("open list", () => {
  it("creates a list on the first add and reuses it after", async () => {
    const jason = await makeUser(db, "Jason");
    expect(await getOpenList(db)).toBeNull();

    const a = await addItem(db, { label: "Milk", addedById: jason.id });
    const b = await addItem(db, { label: "Eggs", addedById: jason.id });

    expect(a.item.listId).toBe(b.item.listId);
    expect(await db.groceryList.count()).toBe(1);
  });

  it("never creates two open lists under concurrent adds", async () => {
    await Promise.all(Array.from({ length: 8 }, () => getOrCreateOpenList(db)));
    expect(await db.groceryList.count({ where: { status: "OPEN" } })).toBe(1);
  });

  it("returns the existing row instead of adding a duplicate", async () => {
    const jason = await makeUser(db, "Jason");
    const sam = await makeUser(db, "Sam");
    await addItem(db, { label: "Whole milk", addedById: jason.id });

    const again = await addItem(db, { label: "whole  MILK", addedById: sam.id });

    expect(again.duplicate).toBe(true);
    expect(again.item.addedBy.name).toBe("Jason");
    expect(await db.groceryListItem.count()).toBe(1);
  });

  it("copies the catalog item's standing store pin onto the list item", async () => {
    const jason = await makeUser(db, "Jason");
    const bakery = await db.store.create({ data: { name: "Bakery", adapterKey: "mock" } });
    const bread = await db.pantryItem.create({
      data: { fingerprint: "sourdough bread", storageType: "DRY", displayName: "Sourdough", preferredStoreId: bakery.id },
    });

    const { item } = await addItem(db, { label: "Sourdough", sourceItemId: bread.id, addedById: jason.id });

    expect(item.pinnedStoreId).toBe(bakery.id);
  });
});

describe("checking items off", () => {
  it("restocks the catalog item, and un-checking puts it back to OUT", async () => {
    const jason = await makeUser(db, "Jason");
    const pb = await db.pantryItem.create({
      data: { fingerprint: "jif peanut butter", storageType: "DRY", displayName: "Jif", status: "OUT" },
    });
    const { item } = await addItem(db, { label: "Jif", sourceItemId: pb.id, addedById: jason.id });

    await setChecked(db, item.id, jason.id, true);
    expect((await db.pantryItem.findUniqueOrThrow({ where: { id: pb.id } })).status).toBe("IN_STOCK");
    expect((await db.groceryListItem.findUniqueOrThrow({ where: { id: item.id } })).checkedById).toBe(jason.id);

    await setChecked(db, item.id, jason.id, false);
    expect((await db.pantryItem.findUniqueOrThrow({ where: { id: pb.id } })).status).toBe("OUT");
  });
});

describe("finishTrip", () => {
  it("completes the list and carries chosen unchecked items to a new open list", async () => {
    const jason = await makeUser(db, "Jason");
    const sam = await makeUser(db, "Sam");
    const cereal = await db.pantryItem.create({
      data: { fingerprint: "cheerios", storageType: "DRY", displayName: "Cheerios", status: "OUT" },
    });
    const bought = await addItem(db, { label: "Milk", addedById: jason.id });
    const carried = await addItem(db, { label: "Saffron", addedById: sam.id });
    const dropped = await addItem(db, { label: "Cheerios", sourceItemId: cereal.id, addedById: jason.id });
    await setChecked(db, bought.item.id, jason.id, true);

    const result = await finishTrip(db, bought.item.listId, [carried.item.id]);

    const old = await db.groceryList.findUniqueOrThrow({ where: { id: bought.item.listId } });
    expect(old.status).toBe("COMPLETE");
    expect(old.completedAt).not.toBeNull();

    const next = await db.groceryListItem.findUniqueOrThrow({ where: { id: carried.item.id } });
    expect(next.listId).toBe(result.nextListId);
    expect(next.addedById).toBe(sam.id);

    // Dropped item stays on the completed list; its catalog item is back to in stock.
    expect((await db.groceryListItem.findUniqueOrThrow({ where: { id: dropped.item.id } })).listId).toBe(old.id);
    expect((await db.pantryItem.findUniqueOrThrow({ where: { id: cereal.id } })).status).toBe("IN_STOCK");
  });

  it("leaves no open list when nothing is carried over", async () => {
    const jason = await makeUser(db, "Jason");
    const { item } = await addItem(db, { label: "Milk", addedById: jason.id });

    const result = await finishTrip(db, item.listId, []);

    expect(result.nextListId).toBeNull();
    expect(await getOpenList(db)).toBeNull();
  });
});
