-- At most one shopping list may be open (OPEN or SHOPPING) at a time.
-- Prisma can't express partial unique indexes, so this lives in raw SQL.
CREATE UNIQUE INDEX "GroceryList_single_open" ON "GroceryList" ((true)) WHERE "status" IN ('OPEN', 'SHOPPING');
