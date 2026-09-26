import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { addItem } from "~/server/services/lists";
import { photoUrl } from "~/server/services/storage";

const storageType = z.enum(["REFRIGERATED", "DRY"]);
const itemId = z.object({ itemId: z.string() });

export const pantryItemRouter = createTRPCRouter({
  /** The catalog, for Settings. */
  list: protectedProcedure
    .input(
      z.object({
        storageType: storageType.optional(),
        ignored: z.boolean().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.pantryItem.findMany({
        where: {
          storageType: input.storageType,
          ignored: input.ignored,
          displayName: input.search ? { contains: input.search, mode: "insensitive" } : undefined,
        },
        orderBy: { displayName: "asc" },
        include: { preferredStore: { select: { id: true, name: true } } },
      });
      return items.map((i) => ({ ...i, photoSrc: photoUrl(i.representativePhotoUrl) }));
    }),

  /** Items awaiting the Flow B review, newest-seen first. */
  notSpotted: protectedProcedure
    .input(z.object({ storageType: storageType.optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.pantryItem.findMany({
        where: { status: "NOT_SPOTTED", ignored: false, storageType: input.storageType },
        orderBy: { lastSeenAt: "desc" },
      });
      return items.map((i) => ({ ...i, photoSrc: photoUrl(i.representativePhotoUrl) }));
    }),

  notSpottedCounts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.pantryItem.groupBy({
      by: ["storageType"],
      where: { status: "NOT_SPOTTED", ignored: false },
      _count: true,
    });
    return {
      REFRIGERATED: rows.find((r) => r.storageType === "REFRIGERATED")?._count ?? 0,
      DRY: rows.find((r) => r.storageType === "DRY")?._count ?? 0,
    };
  }),

  /** Confirm gone: OUT, and onto the open shopping list (created if needed). */
  confirmMissing: protectedProcedure.input(itemId).mutation(async ({ ctx, input }) => {
    const item = await ctx.db.pantryItem.update({
      where: { id: input.itemId },
      data: { status: "OUT" },
    });
    return addItem(ctx.db, {
      label: item.displayName,
      sourceItemId: item.id,
      addedById: ctx.session.user.id,
    });
  }),

  /** Still have it. */
  dismissMissing: protectedProcedure.input(itemId).mutation(({ ctx, input }) =>
    ctx.db.pantryItem.update({ where: { id: input.itemId }, data: { status: "IN_STOCK" } }),
  ),

  /** Ask again at the next scan of this storage type. */
  snooze: protectedProcedure.input(itemId).mutation(({ ctx, input }) =>
    ctx.db.pantryItem.update({ where: { id: input.itemId }, data: { status: "SNOOZED" } }),
  ),

  /** "Don't restock" (ignored = true) or un-ignore from Settings. */
  setIgnored: protectedProcedure
    .input(z.object({ itemId: z.string(), ignored: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // An ignored item is never "not spotted", so it leaves the review queue.
      // Items already OUT stay OUT; they're on a shopping list.
      if (input.ignored) {
        await ctx.db.pantryItem.updateMany({
          where: { id: input.itemId, status: { in: ["NOT_SPOTTED", "SNOOZED"] } },
          data: { status: "IN_STOCK" },
        });
      }
      return ctx.db.pantryItem.update({
        where: { id: input.itemId },
        data: { ignored: input.ignored },
      });
    }),

  setPreferredStore: protectedProcedure
    .input(z.object({ itemId: z.string(), storeId: z.string().nullable() }))
    .mutation(({ ctx, input }) =>
      ctx.db.pantryItem.update({
        where: { id: input.itemId },
        data: { preferredStoreId: input.storeId },
      }),
    ),
});
