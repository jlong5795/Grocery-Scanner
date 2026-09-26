import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient } from "../../../generated/prisma";
import { bestMatch, normalizeFingerprint } from "~/server/domain/fingerprint";
import {
  type RawDetection,
  computeNotSpotted,
  dedupeAcrossPhotos,
  reviewBand,
} from "~/server/domain/inventory";
import type { PhotoInput } from "./vision";

/**
 * Scan pipeline (spec Flow A + sections 5 and 6):
 *   processScan  photos -> vision -> cross-photo dedup -> catalog match -> Detection rows
 *   reviewScan   user confirms / rejects / renames 0.70-0.85 confidence detections
 *   finalizeScan confirmed detections update the catalog; the missing-item rule runs
 */

export type DetectFn = (photo: PhotoInput, knownFingerprints: readonly string[]) => Promise<RawDetection[]>;
export type ReadPhotoFn = (key: string) => Promise<{ bytes: Buffer; contentType: string } | null>;

const VISION_CONCURRENCY = 4;

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export async function processScan(
  db: PrismaClient,
  scanId: string,
  deps: { detect: DetectFn; readPhoto: ReadPhotoFn },
) {
  const scan = await db.scan.findUniqueOrThrow({
    where: { id: scanId },
    include: { photos: { orderBy: { createdAt: "asc" } } },
  });

  try {
    if (scan.photos.length === 0) throw new Error("Take at least one photo before processing.");
    await db.scan.update({ where: { id: scanId }, data: { status: "PROCESSING", error: null } });
    await db.detection.deleteMany({ where: { scanId } });

    const catalog = await db.pantryItem.findMany({ select: { id: true, fingerprint: true } });
    const known = catalog.map((c) => c.fingerprint);

    const perPhoto = await mapConcurrent(
      scan.photos.map((p, index) => ({ p, index })),
      VISION_CONCURRENCY,
      async ({ p, index }) => {
        const file = await deps.readPhoto(p.url);
        if (!file) throw new Error(`Photo ${index + 1} could not be read from storage.`);
        const mediaType = file.contentType === "image/png" ? "image/png" : "image/jpeg";
        return deps.detect({ index, bytes: file.bytes, mediaType }, known);
      },
    );

    const kept = dedupeAcrossPhotos(
      perPhoto.flat().filter((d) => reviewBand(d.confidence) !== "drop"),
    );

    await db.detection.createMany({
      data: kept.map((d) => {
        const fingerprint = normalizeFingerprint(d.fingerprint);
        return {
          scanId,
          photoId: scan.photos[d.photoIndex]!.id,
          fingerprint,
          name: d.name,
          brand: d.brand,
          category: d.category,
          confidence: d.confidence,
          boundingBox: d.boundingBox,
          matchedItemId: bestMatch(fingerprint, catalog, (c) => c.fingerprint)?.item.id ?? null,
          status: reviewBand(d.confidence) === "accept" ? "CONFIRMED" : "PENDING_REVIEW",
        };
      }),
    });

    await db.scan.update({ where: { id: scanId }, data: { status: "REVIEW" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan processing failed.";
    console.error(`[scan ${scanId}]`, err);
    await db.scan.update({ where: { id: scanId }, data: { status: "FAILED", error: message } });
  }
}

export interface ReviewDecision {
  detectionId: string;
  action: "confirm" | "reject";
  /** Corrected product name; re-derives the fingerprint and catalog match. */
  name?: string;
}

export async function reviewScan(db: PrismaClient, scanId: string, decisions: ReviewDecision[]) {
  const scan = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
  if (scan.status !== "REVIEW") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This scan isn't awaiting review." });
  }
  const catalog = await db.pantryItem.findMany({ select: { id: true, fingerprint: true } });

  await db.$transaction(
    decisions.map((d) => {
      const data: Prisma.DetectionUpdateInput = {
        status: d.action === "confirm" ? "CONFIRMED" : "REJECTED",
      };
      const name = d.name?.trim();
      if (name) {
        const fingerprint = normalizeFingerprint(name);
        const match = bestMatch(fingerprint, catalog, (c) => c.fingerprint)?.item.id;
        data.name = name;
        data.fingerprint = fingerprint;
        data.matchedItem = match ? { connect: { id: match } } : { disconnect: true };
      }
      return db.detection.update({ where: { id: d.detectionId, scanId }, data });
    }),
  );
}

export async function finalizeScan(db: PrismaClient, scanId: string) {
  return db.$transaction(async (tx) => {
    const scan = await tx.scan.findUniqueOrThrow({
      where: { id: scanId },
      include: { detections: { include: { photo: true } } },
    });
    if (scan.status !== "REVIEW") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This scan isn't awaiting review." });
    }
    if (scan.detections.some((d) => d.status === "PENDING_REVIEW")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Confirm or reject every flagged item before saving.",
      });
    }

    const now = new Date();
    const seen = new Set<string>();
    let created = 0;
    const catalog = await tx.pantryItem.findMany({ select: { id: true, fingerprint: true } });

    for (const d of scan.detections.filter((x) => x.status === "CONFIRMED")) {
      // Re-match: the catalog may have changed since processing, or an earlier
      // detection in this loop may have just created the item.
      const itemId =
        d.matchedItemId ?? bestMatch(d.fingerprint, catalog, (c) => c.fingerprint)?.item.id;

      if (itemId) {
        if (!seen.has(itemId)) {
          await tx.pantryItem.update({
            where: { id: itemId },
            data: { lastSeenAt: now, status: "IN_STOCK", storageType: scan.storageType },
          });
        }
        seen.add(itemId);
        if (!d.matchedItemId) {
          await tx.detection.update({ where: { id: d.id }, data: { matchedItemId: itemId } });
        }
        continue;
      }

      const item = await tx.pantryItem.create({
        data: {
          fingerprint: d.fingerprint,
          storageType: scan.storageType,
          displayName: d.name,
          brand: d.brand,
          category: d.category,
          lastSeenAt: now,
          status: "IN_STOCK",
          representativePhotoUrl: d.photo.url,
        },
      });
      catalog.push({ id: item.id, fingerprint: item.fingerprint });
      seen.add(item.id);
      created++;
      await tx.detection.update({ where: { id: d.id }, data: { matchedItemId: item.id } });
    }

    const candidates = await tx.pantryItem.findMany({
      where: { storageType: scan.storageType },
      select: { id: true, storageType: true, ignored: true, status: true },
    });
    const notSpotted = computeNotSpotted(scan.storageType, candidates, seen);
    if (notSpotted.length > 0) {
      await tx.pantryItem.updateMany({
        where: { id: { in: notSpotted } },
        data: { status: "NOT_SPOTTED" },
      });
    }

    await tx.scan.update({
      where: { id: scanId },
      data: { status: "FINALIZED", finalizedAt: now },
    });

    return { seen: seen.size, created, notSpotted: notSpotted.length };
  });
}
