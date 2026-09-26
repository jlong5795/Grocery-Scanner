import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { env } from "~/env";

export const householdRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) =>
    ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { id: true, name: true, email: true },
    }),
  ),

  /** Allowlisted emails and whether each has signed in yet. */
  members: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { email: { in: env.HOUSEHOLD_EMAILS } },
      select: { id: true, name: true, email: true, image: true },
    });
    return env.HOUSEHOLD_EMAILS.map((email) => ({
      email,
      user: users.find((u) => u.email?.toLowerCase() === email) ?? null,
    }));
  }),
});
