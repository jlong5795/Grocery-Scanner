import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getAdapter } from "~/server/services/deals";
import { getFinalList, searchDeals } from "~/server/services/deals/search";
import { addItem, finishTrip, getOpenList, setChecked } from "~/server/services/lists";

const person = { select: { id: true, name: true, email: true } } as const;

export const groceryListRouter = createTRPCRouter({
  /** The OPEN or SHOPPING list with its items, or null if none is open. */
  getOpen: protectedProcedure.query(async ({ ctx }) => {
    const open = await getOpenList(ctx.db);
    if (!open) return null;
    return ctx.db.groceryList.findUnique({
      where: { id: open.id },
      include: {
        items: {
          orderBy: [{ checkedAt: { sort: "asc", nulls: "first" } }, { position: "asc" }],
          include: { addedBy: person, pinnedStore: { select: { id: true, name: true } } },
        },
      },
    });
  }),

  /** Completed trips, newest first. */
  history: protectedProcedure.query(async ({ ctx }) => {
    const lists = await ctx.db.groceryList.findMany({
      where: { status: "COMPLETE" },
      orderBy: { completedAt: "desc" },
      take: 50,
      include: {
        items: { select: { checkedAt: true, checkedBy: { select: { name: true } } } },
      },
    });
    return lists.map((l) => {
      const shoppers = [
        ...new Set(l.items.map((i) => i.checkedBy?.name).filter((n): n is string => !!n)),
      ];
      return {
        id: l.id,
        completedAt: l.completedAt,
        total: l.items.length,
        checked: l.items.filter((i) => i.checkedAt).length,
        shoppers,
      };
    });
  }),

  get: protectedProcedure.input(z.object({ listId: z.string() })).query(({ ctx, input }) =>
    ctx.db.groceryList.findUniqueOrThrow({
      where: { id: input.listId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { addedBy: person, checkedBy: { select: { name: true } } },
        },
      },
    }),
  ),

  /** Catalog items and past list labels matching `query`, for fast re-add. */
  suggestions: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (q.length < 2) return [];
      const [catalog, past] = await Promise.all([
        ctx.db.pantryItem.findMany({
          where: { displayName: { contains: q, mode: "insensitive" } },
          take: 8,
          orderBy: { lastSeenAt: "desc" },
          select: { id: true, displayName: true },
        }),
        ctx.db.groceryListItem.findMany({
          where: { label: { contains: q, mode: "insensitive" }, sourceItemId: null },
          distinct: ["label"],
          take: 8,
          orderBy: { createdAt: "desc" },
          select: { label: true },
        }),
      ]);
      const seen = new Set<string>();
      const out: { label: string; sourceItemId: string | null }[] = [];
      for (const c of catalog) {
        seen.add(c.displayName.toLowerCase());
        out.push({ label: c.displayName, sourceItemId: c.id });
      }
      for (const p of past) {
        if (seen.has(p.label.toLowerCase())) continue;
        seen.add(p.label.toLowerCase());
        out.push({ label: p.label, sourceItemId: null });
      }
      return out.slice(0, 10);
    }),

  /** Anyone, anytime: adds to the open list, creating one if none is open. */
  addItem: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(200),
        quantity: z.string().max(50).optional(),
        notes: z.string().max(500).optional(),
        sourceItemId: z.string().optional(),
        pinnedStoreId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await addItem(ctx.db, { ...input, addedById: ctx.session.user.id });
      // Mid-trip additions get a deal search for just that item.
      const list = await ctx.db.groceryList.findUnique({ where: { id: result.item.listId } });
      if (!result.duplicate && list?.status === "SHOPPING") {
        after(() => searchDeals(ctx.db, list.id, getAdapter, [result.item.id]));
      }
      return result;
    }),

  removeItem: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.groceryListItem.delete({ where: { id: input.itemId } });
      // Removed before being bought: the catalog item goes back to in stock,
      // and the next scan decides whether it's missing.
      if (item.sourceItemId) {
        await ctx.db.pantryItem.updateMany({
          where: { id: item.sourceItemId, status: "OUT" },
          data: { status: "IN_STOCK" },
        });
      }
      return item;
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        label: z.string().min(1).max(200).optional(),
        quantity: z.string().max(50).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        pinnedStoreId: z.string().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { itemId, ...data } = input;
      return ctx.db.groceryListItem.update({ where: { id: itemId }, data });
    }),

  /** Start the trip: SHOPPING, and search every store for deals in the background. */
  startShopping: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.db.groceryList.findUniqueOrThrow({ where: { id: input.listId } });
      if (list.status === "COMPLETE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That trip is already finished." });
      }
      await ctx.db.groceryList.update({ where: { id: list.id }, data: { status: "SHOPPING" } });
      after(() => searchDeals(ctx.db, list.id, getAdapter));
      return { status: "SHOPPING" as const };
    }),

  /** The shopping view, grouped store -> department. */
  shoppingView: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(({ ctx, input }) => getFinalList(ctx.db, input.listId)),

  /** Re-run the deal search (e.g. after adding a store). */
  refreshDeals: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(({ ctx, input }) => searchDeals(ctx.db, input.listId, getAdapter)),

  checkItem: protectedProcedure
    .input(z.object({ itemId: z.string(), checked: z.boolean() }))
    .mutation(({ ctx, input }) =>
      setChecked(ctx.db, input.itemId, ctx.session.user.id, input.checked),
    ),

  finishTrip: protectedProcedure
    .input(z.object({ listId: z.string(), carryOver: z.array(z.string()) }))
    .mutation(({ ctx, input }) => finishTrip(ctx.db, input.listId, input.carryOver)),
});
