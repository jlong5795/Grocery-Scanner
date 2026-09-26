/**
 * Pure inventory rules from the spec (sections 5 and 6). No database access, so
 * they can be unit tested directly.
 */
import { bestMatch } from "./fingerprint";

/** The vision agent is told to omit anything below this. */
export const MIN_CONFIDENCE = 0.7;
/** Above this, detections are accepted without review. */
export const AUTO_ACCEPT_CONFIDENCE = 0.85;

export type ReviewBand = "drop" | "review" | "accept";

export function reviewBand(confidence: number): ReviewBand {
  if (confidence < MIN_CONFIDENCE) return "drop";
  if (confidence <= AUTO_ACCEPT_CONFIDENCE) return "review";
  return "accept";
}

export interface RawDetection {
  photoIndex: number;
  fingerprint: string;
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  boundingBox: { xMin: number; yMin: number; xMax: number; yMax: number };
}

/**
 * Collapse the same product seen in several photos of one scan into one
 * detection, keeping the most confident sighting. Runs before catalog matching.
 */
export function dedupeAcrossPhotos(detections: RawDetection[]): RawDetection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: RawDetection[] = [];
  for (const d of sorted) {
    if (!bestMatch(d.fingerprint, kept, (k) => k.fingerprint)) kept.push(d);
  }
  return kept;
}

export interface CatalogCandidate {
  id: string;
  storageType: "REFRIGERATED" | "DRY";
  ignored: boolean;
  status: "IN_STOCK" | "NOT_SPOTTED" | "SNOOZED" | "OUT";
}

/**
 * The missing-item rule: an item is missing if it is in the catalog, was in
 * stock (or snoozed), isn't ignored, lives in the storage type just scanned,
 * and wasn't seen today. No miss counters or time windows; the Flow B review
 * step catches bad photo angles.
 */
export function computeNotSpotted(
  scannedType: CatalogCandidate["storageType"],
  catalog: readonly CatalogCandidate[],
  seenItemIds: ReadonlySet<string>,
): string[] {
  return catalog
    .filter(
      (item) =>
        item.storageType === scannedType &&
        !item.ignored &&
        (item.status === "IN_STOCK" || item.status === "SNOOZED") &&
        !seenItemIds.has(item.id),
    )
    .map((item) => item.id);
}
