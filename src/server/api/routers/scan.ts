import { after } from "next/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { finalizeScan, processScan, reviewScan } from "~/server/services/scans";
import { photoUrl, readPhoto } from "~/server/services/storage";
import { detectItemsInPhoto } from "~/server/services/vision";

const storageType = z.enum(["REFRIGERATED", "DRY"]);

export const scanRouter = createTRPCRouter({
  /** Start a scan. Photos are uploaded to /api/scans/[scanId]/photos. */
  start: protectedProcedure
    .input(z.object({ storageType }))
    .mutation(({ ctx, input }) =>
      ctx.db.scan.create({
        data: { storageType: input.storageType, createdById: ctx.session.user.id },
      }),
    ),

  get: protectedProcedure.input(z.object({ scanId: z.string() })).query(async ({ ctx, input }) => {
    const scan = await ctx.db.scan.findUniqueOrThrow({
      where: { id: input.scanId },
      include: {
        photos: { orderBy: { createdAt: "asc" } },
        detections: {
          orderBy: { confidence: "asc" },
          include: { matchedItem: { select: { id: true, displayName: true } } },
        },
      },
    });
    return {
      ...scan,
      photos: scan.photos.map((p) => ({ ...p, src: photoUrl(p.url)! })),
    };
  }),

  /** Last finalized scan per storage type, for the home screen. */
  latest: protectedProcedure.query(async ({ ctx }) => {
    const [fridge, dry] = await Promise.all(
      (["REFRIGERATED", "DRY"] as const).map((t) =>
        ctx.db.scan.findFirst({
          where: { storageType: t, status: "FINALIZED" },
          orderBy: { finalizedAt: "desc" },
          select: { finalizedAt: true },
        }),
      ),
    );
    return { REFRIGERATED: fridge?.finalizedAt ?? null, DRY: dry?.finalizedAt ?? null };
  }),

  /** Queue the vision pipeline; the client polls `get` until status is REVIEW or FAILED. */
  process: protectedProcedure
    .input(z.object({ scanId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.scan.update({
        where: { id: input.scanId, status: { in: ["UPLOADING", "FAILED"] } },
        data: { status: "PROCESSING", error: null },
      });
      after(() =>
        processScan(ctx.db, input.scanId, { detect: detectItemsInPhoto, readPhoto }),
      );
      return { status: "PROCESSING" as const };
    }),

  review: protectedProcedure
    .input(
      z.object({
        scanId: z.string(),
        decisions: z.array(
          z.object({
            detectionId: z.string(),
            action: z.enum(["confirm", "reject"]),
            name: z.string().max(200).optional(),
          }),
        ),
      }),
    )
    .mutation(({ ctx, input }) => reviewScan(ctx.db, input.scanId, input.decisions)),

  /** Commit catalog updates and compute the "not spotted" list. */
  finalize: protectedProcedure
    .input(z.object({ scanId: z.string() }))
    .mutation(({ ctx, input }) => finalizeScan(ctx.db, input.scanId)),
});
