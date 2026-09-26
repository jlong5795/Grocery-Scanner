import { execSync } from "node:child_process";

import { PrismaClient } from "../../generated/prisma";

/**
 * Integration tests run against a real Postgres database (TEST_DATABASE_URL,
 * default: a local "pantry_test" database). Migrations are applied once and
 * every table is truncated between tests.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/pantry_test";

let migrated = false;

export function testDb() {
  if (!migrated) {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "ignore",
    });
    migrated = true;
  }
  return new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
}

export async function resetDb(db: PrismaClient) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`,
  );
}

export async function makeUser(db: PrismaClient, name: string) {
  return db.user.create({ data: { name, email: `${name.toLowerCase()}@example.com` } });
}
