import { groceryListRouter } from "~/server/api/routers/groceryList";
import { householdRouter } from "~/server/api/routers/household";
import { pantryItemRouter } from "~/server/api/routers/pantryItem";
import { pushRouter } from "~/server/api/routers/push";
import { scanRouter } from "~/server/api/routers/scan";
import { storeRouter } from "~/server/api/routers/store";
import { substitutionRouter } from "~/server/api/routers/substitution";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  scan: scanRouter,
  pantryItem: pantryItemRouter,
  groceryList: groceryListRouter,
  substitution: substitutionRouter,
  push: pushRouter,
  store: storeRouter,
  household: householdRouter,
});

export type AppRouter = typeof appRouter;

/** Server-side caller, used by React Server Components and tests. */
export const createCaller = createCallerFactory(appRouter);
