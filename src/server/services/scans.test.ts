import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { RawDetection } from "~/server/domain/inventory";
import { makeUser, resetDb, testDb } from "~/test/db";

import { type DetectFn, finalizeScan, processScan, reviewScan } from "./scans";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const box = { xMin: 0, yMin: 0, xMax: 100, yMax: 100 };
const det = (fingerprint: string, confidence: number, name = fingerprint): Omit<RawDetection, "photoIndex"> => ({
  fingerprint,
  name,
  brand: null,
  category: null,
  confidence,
  boundingBox: box,
});

/** Fake vision: returns the given detections for each photo index. */
function fakeDetect(byPhoto: Omit<RawDetection, "photoIndex">[][]): DetectFn {
  return async (photo) => (byPhoto[photo.index] ?? []).map((d) => ({ ...d, photoIndex: photo.index }));
}
const readPhoto = async () => ({ bytes: Buffer.from("x"), contentType: "image/jpeg" });

async function scanWithPhotos(storageType: "DRY" | "REFRIGERATED", photos: number) {
  const user = await makeUser(db, `Scanner${Math.random().toString(36).slice(2, 6)}`);
  return db.scan.create({
    data: {
      storageType,
      createdById: user.id,
      photos: { create: Array.from({ length: photos }, (_, i) => ({ url: `p/${i}.jpg`, width: 10, height: 10 })) },
    },
  });
}

describe("processScan", () => {
  it("drops low confidence, dedupes across photos, and bands the rest", async () => {
    const scan = await scanWithPhotos("DRY", 2);
    await processScan(db, scan.id, {
      readPhoto,
      detect: fakeDetect([
        [det("jif peanut butter", 0.8), det("mystery jar", 0.5)],
        [det("peanut butter jif", 0.95), det("cheerios", 0.9)],
      ]),
    });

    const after = await db.scan.findUniqueOrThrow({ where: { id: scan.id }, include: { detections: true } });
    expect(after.status).toBe("REVIEW");
    expect(after.detections.map((d) => d.fingerprint).sort()).toEqual(["cheerios", "peanut butter jif"]);
    expect(after.detections.every((d) => d.status === "CONFIRMED")).toBe(true);
  });

  it("matches detections to existing catalog items", async () => {
    const pb = await db.pantryItem.create({
      data: { fingerprint: "jif creamy peanut butter", storageType: "DRY", displayName: "Jif Creamy" },
    });
    const scan = await scanWithPhotos("DRY", 1);
    await processScan(db, scan.id, { readPhoto, detect: fakeDetect([[det("creamy peanut butter, jif", 0.75)]]) });

    const [d] = await db.detection.findMany({ where: { scanId: scan.id } });
    expect(d!.matchedItemId).toBe(pb.id);
    expect(d!.status).toBe("PENDING_REVIEW");
  });

  it("marks the scan FAILED with a message when vision throws", async () => {
    const scan = await scanWithPhotos("DRY", 1);
    await processScan(db, scan.id, {
      readPhoto,
      detect: async () => {
        throw new Error("model unavailable");
      },
    });
    const after = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(after.status).toBe("FAILED");
    expect(after.error).toBe("model unavailable");
  });
});

describe("reviewScan + finalizeScan", () => {
  it("requires every flagged item to be decided before saving", async () => {
    const scan = await scanWithPhotos("DRY", 1);
    await processScan(db, scan.id, { readPhoto, detect: fakeDetect([[det("rice", 0.75)]]) });
    await expect(finalizeScan(db, scan.id)).rejects.toThrow(/Confirm or reject/);
  });

  it("updates the catalog and flags only unseen, un-ignored items of the scanned type", async () => {
    const make = (fingerprint: string, over: object = {}) =>
      db.pantryItem.create({
        data: { fingerprint, storageType: "DRY", displayName: fingerprint, lastSeenAt: new Date(0), ...over },
      });
    const seen = await make("jif peanut butter");
    const missing = await make("cheerios");
    const ignored = await make("birthday candles", { ignored: true });
    const fridge = await make("whole milk", { storageType: "REFRIGERATED" });
    const moved = await make("ketchup", { storageType: "REFRIGERATED" });

    const scan = await scanWithPhotos("DRY", 1);
    await processScan(db, scan.id, {
      readPhoto,
      detect: fakeDetect([
        [det("jif peanut butter", 0.95), det("ketchup", 0.9), det("basmati rice", 0.8), det("glitter", 0.72)],
      ]),
    });
    const pending = await db.detection.findMany({ where: { scanId: scan.id, status: "PENDING_REVIEW" } });
    await reviewScan(db, scan.id, [
      { detectionId: pending.find((d) => d.fingerprint === "basmati rice")!.id, action: "confirm", name: "Tilda Basmati Rice" },
      { detectionId: pending.find((d) => d.fingerprint === "glitter")!.id, action: "reject" },
    ]);

    const result = await finalizeScan(db, scan.id);

    expect(result).toEqual({ seen: 3, created: 1, notSpotted: 1 });
    const byId = async (id: string) => db.pantryItem.findUniqueOrThrow({ where: { id } });
    expect((await byId(seen.id)).lastSeenAt.getTime()).toBeGreaterThan(0);
    expect((await byId(missing.id)).status).toBe("NOT_SPOTTED");
    expect((await byId(ignored.id)).status).toBe("IN_STOCK");
    expect((await byId(fridge.id)).status).toBe("IN_STOCK"); // not scanned today
    expect((await byId(moved.id)).storageType).toBe("DRY"); // seen in the pantry now
    const rice = await db.pantryItem.findUniqueOrThrow({ where: { fingerprint: "tilda basmati rice" } });
    expect(rice.displayName).toBe("Tilda Basmati Rice");
    expect(rice.representativePhotoUrl).toBe("p/0.jpg");
    expect((await db.scan.findUniqueOrThrow({ where: { id: scan.id } })).status).toBe("FINALIZED");
  });

  it("re-flags a snoozed item that is still missing", async () => {
    const snoozed = await db.pantryItem.create({
      data: { fingerprint: "oregano", storageType: "DRY", displayName: "Oregano", status: "SNOOZED" },
    });
    const scan = await scanWithPhotos("DRY", 1);
    await processScan(db, scan.id, { readPhoto, detect: fakeDetect([[det("jif", 0.95)]]) });
    await finalizeScan(db, scan.id);
    expect((await db.pantryItem.findUniqueOrThrow({ where: { id: snoozed.id } })).status).toBe("NOT_SPOTTED");
  });
});
