import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pushEnabled, sendToUser } from "~/server/services/push";

export const pushRouter = createTRPCRouter({
  status: protectedProcedure.query(() => ({ enabled: pushEnabled() })),

  /** Upsert this device's subscription for the caller. */
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        p256dh: z.string(),
        auth: z.string(),
        userAgent: z.string().max(200).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: { ...input, userId: ctx.session.user.id },
        update: { ...input, userId: ctx.session.user.id },
      }),
    ),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.pushSubscription.deleteMany({
        where: { endpoint: input.endpoint, userId: ctx.session.user.id },
      }),
    ),

  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db.pushSubscription.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastUsedAt: true },
    }),
  ),

  test: protectedProcedure.mutation(async ({ ctx }) => ({
    delivered: await sendToUser(ctx.session.user.id, {
      title: "Pantry Scanner",
      body: "Notifications are working on this device.",
      url: "/settings",
    }),
  })),
});
