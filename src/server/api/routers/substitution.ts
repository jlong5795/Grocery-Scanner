import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sendToUser } from "~/server/services/push";

const REASON_TEXT = {
  OUT_OF_STOCK: "is out of stock",
  AMBIGUOUS: "has a few options",
  OTHER: "needs a decision",
} as const;

export const substitutionRouter = createTRPCRouter({
  /** Shopper asks whoever added the item. Pushes a notification to their devices. */
  ask: protectedProcedure
    .input(
      z.object({
        groceryItemId: z.string(),
        reason: z.enum(["OUT_OF_STOCK", "AMBIGUOUS", "OTHER"]),
        proposal: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.groceryListItem.findUniqueOrThrow({
        where: { id: input.groceryItemId },
      });
      const request = await ctx.db.substitutionRequest.create({
        data: {
          groceryItemId: item.id,
          askedById: ctx.session.user.id,
          askedToId: item.addedById,
          reason: input.reason,
          proposal: input.proposal?.trim() || null,
        },
      });
      const shopper = ctx.session.user.name ?? "The shopper";
      const delivered =
        item.addedById === ctx.session.user.id
          ? 0
          : await sendToUser(item.addedById, {
              title: `${item.label} ${REASON_TEXT[input.reason]}`,
              body: request.proposal
                ? `${shopper} asks: ${request.proposal}`
                : `${shopper} is asking what you'd like instead.`,
              url: `/sub/${request.id}`,
              tag: `sub-${request.id}`,
            });
      return { request, delivered };
    }),

  answer: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        approved: z.boolean(),
        reply: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.substitutionRequest.findUniqueOrThrow({
        where: { id: input.requestId },
        include: { groceryItem: true },
      });
      if (request.askedToId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This question was for someone else." });
      }
      const updated = await ctx.db.substitutionRequest.update({
        where: { id: request.id },
        data: {
          status: input.approved ? "APPROVED" : "DECLINED",
          reply: input.reply?.trim() || null,
          answeredAt: new Date(),
        },
      });
      await sendToUser(request.askedById, {
        title: `${request.groceryItem.label}: ${input.approved ? "yes" : "no"}`,
        body: updated.reply ?? (input.approved ? "Go ahead." : "Skip it."),
        url: "/list",
        tag: `sub-${request.id}`,
      });
      return updated;
    }),

  get: protectedProcedure.input(z.object({ requestId: z.string() })).query(({ ctx, input }) =>
    ctx.db.substitutionRequest.findUniqueOrThrow({
      where: { id: input.requestId },
      include: {
        groceryItem: { select: { label: true, quantity: true, notes: true } },
        askedBy: { select: { name: true } },
        askedTo: { select: { id: true, name: true } },
      },
    }),
  ),

  pendingForMe: protectedProcedure.query(({ ctx }) =>
    ctx.db.substitutionRequest.findMany({
      where: { askedToId: ctx.session.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        groceryItem: { select: { label: true } },
        askedBy: { select: { name: true } },
      },
    }),
  ),
});
