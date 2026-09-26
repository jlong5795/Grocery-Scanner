import { describe, expect, it } from "vitest";

import {
  type CatalogCandidate,
  type RawDetection,
  computeNotSpotted,
  dedupeAcrossPhotos,
  reviewBand,
} from "./inventory";

describe("reviewBand", () => {
  it("drops below 0.70, reviews 0.70-0.85, accepts above 0.85", () => {
    expect(reviewBand(0.69)).toBe("drop");
    expect(reviewBand(0.7)).toBe("review");
    expect(reviewBand(0.85)).toBe("review");
    expect(reviewBand(0.86)).toBe("accept");
  });
});

describe("dedupeAcrossPhotos", () => {
  const det = (photoIndex: number, fingerprint: string, confidence: number): RawDetection => ({
    photoIndex,
    fingerprint,
    name: fingerprint,
    brand: null,
    category: null,
    confidence,
    boundingBox: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
  });

  it("keeps the most confident sighting of the same product", () => {
    const out = dedupeAcrossPhotos([
      det(0, "jif peanut butter", 0.8),
      det(1, "peanut butter jif", 0.95),
      det(2, "whole milk", 0.9),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((d) => d.fingerprint.includes("jif"))?.photoIndex).toBe(1);
  });
});

describe("computeNotSpotted", () => {
  const item = (id: string, over: Partial<CatalogCandidate> = {}): CatalogCandidate => ({
    id,
    storageType: "DRY",
    ignored: false,
    status: "IN_STOCK",
    ...over,
  });

  it("flags in-stock and snoozed items of the scanned type that weren't seen", () => {
    const catalog = [
      item("seen"),
      item("missing"),
      item("snoozed", { status: "SNOOZED" }),
      item("ignored", { ignored: true }),
      item("already-out", { status: "OUT" }),
      item("pending", { status: "NOT_SPOTTED" }),
      item("fridge", { storageType: "REFRIGERATED" }),
    ];
    expect(computeNotSpotted("DRY", catalog, new Set(["seen"]))).toEqual([
      "missing",
      "snoozed",
    ]);
  });
});
