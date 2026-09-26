import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { ADAPTER_HELP, getAdapter } from "~/server/services/deals";

const adapterKey = z
  .string()
  .trim()
  .refine((k) => getAdapter(k) !== null, { message: ADAPTER_HELP });

export const storeRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.store.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] }),
  ),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100), adapterKey }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.db.store.aggregate({ _max: { priority: true } });
      return ctx.db.store.create({
        data: { ...input, priority: (last._max.priority ?? -1) + 1 },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        storeId: z.string(),
        name: z.string().trim().min(1).max(100).optional(),
        adapterKey: adapterKey.optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { storeId, ...data } = input;
      return ctx.db.store.update({ where: { id: storeId }, data });
    }),

  /** Move a store up or down the priority order (used to break price ties). */
  move: protectedProcedure
    .input(z.object({ storeId: z.string(), direction: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      const stores = await ctx.db.store.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] });
      const i = stores.findIndex((s) => s.id === input.storeId);
      if (i === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const j = input.direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= stores.length) return;
      [stores[i], stores[j]] = [stores[j]!, stores[i]!];
      await ctx.db.$transaction(
        stores.map((s, priority) => ctx.db.store.update({ where: { id: s.id }, data: { priority } })),
      );
    }),

  delete: protectedProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.store.delete({ where: { id: input.storeId } })),
});
