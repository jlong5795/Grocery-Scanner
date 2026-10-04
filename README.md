# Pantry Scanner

A mobile-first web app for one household: scan the fridge and the pantry with your phone, find out what's run out, keep a shared shopping list, and shop it against your stores' current deals.

The feature spec lives in Claude Docs: **Pantry Scanner — Feature Spec**. This repo implements its MVP milestone.

## What's in the MVP

- **Scanning** (Flow A). Pick *Refrigerated* (fridge + freezer) or *Dry goods* (pantry + cabinets), take a burst of photos, and Claude identifies the groceries in each one. Detections at 0.40–0.85 confidence are flagged for a quick yes / rename / not-it; anything above 0.85 is accepted automatically.
- **Catalog.** Every product ever seen, deduplicated by fingerprint (`src/server/domain/fingerprint.ts`). Items can be marked *Don't restock* (`ignored`) so they're never flagged as missing.
- **Not spotted review** (Flow B). An item is missing if it's in the catalog, was in stock, isn't ignored, and wasn't seen in today's scan of its storage type. Nothing changes without a tap: *Gone, add to list* / *Still have it* / *Ask next scan* / *Don't restock*.
- **Shared shopping list** (Flow C). At most one list is open at a time, and anyone in the household can add to it whenever they like. Adding the first item creates it. Every item records who added it; duplicates are caught.
- **Shopping** (Flow D). *Start shopping* searches each store for deals and groups the list by store, then by department. Check items off (catalog items go back in stock with no rescan), ask whoever added an item whether a substitute is OK (web push to their phone), and *Finish trip* to archive the list and carry unchecked items forward.
- **Stores.** One adapter wired end to end: Flipp weekly ads (`flipp:<store name>`), plus a `mock` adapter with fake prices for development. A per-item store pin exists in the data model and list editor; standing pins from the catalog are wired in the API for V2.

## Stack

Next.js 15 (App Router) · tRPC 11 · Prisma 6 + Postgres · NextAuth 5 (Google, invite-only allowlist) · Tailwind 4 · Anthropic SDK (Claude vision with structured output) · Web Push (`web-push`) · Vercel Blob (private) for photos · Vitest.

## Running locally

```bash
npm install
cp .env.example .env         # then fill it in; see below
./start-database.sh           # or point DATABASE_URL at any Postgres 14+
npx prisma migrate deploy
npm run dev
```

For local development without Google OAuth, set `AUTH_DEV_LOGIN="true"` and sign in with any address listed in `HOUSEHOLD_EMAILS`.

Minimum `.env` for a local run: `DATABASE_URL`, `HOUSEHOLD_EMAILS`, `AUTH_DEV_LOGIN="true"`. Add `ANTHROPIC_API_KEY` to identify items in photos, VAPID keys (`npx web-push generate-vapid-keys`) for push, and `HOUSEHOLD_POSTAL_CODE` for Flipp deals. In Settings, add a store with source `mock` to try the shopping flow without Flipp.

Push notifications need HTTPS (localhost is exempt). On iPhone they only work once the app is added to the Home Screen (iOS 16.4+).

## Tests

```bash
npm test
```

Unit tests cover the pure rules in `src/server/domain`. Service tests in `src/server/services` run against a real Postgres database, `TEST_DATABASE_URL` (default `postgresql://postgres@localhost:5432/pantry_test`); migrations are applied automatically and tables are truncated between tests.

## Layout

```
prisma/schema.prisma          data model (spec section 4)
src/server/domain/            pure rules: fingerprint matching, confidence bands,
                              missing-item rule, store choice
src/server/services/          scans (vision pipeline), lists, deals + adapters,
                              push, photo storage, Claude vision call
src/server/api/routers/       tRPC routers (spec section 10)
src/app/(app)/                screens: home, scan, review, list, history, settings
public/sw.js                  service worker for push notifications
```

## Deploying (Vercel)

1. Create a Postgres database (Neon, Supabase or Vercel Postgres) and set `DATABASE_URL`.
2. Create a Vercel Blob store; `BLOB_READ_WRITE_TOKEN` is added automatically.
3. Set the remaining variables from `.env.example`. Leave `AUTH_DEV_LOGIN` unset.
4. Run `npx prisma migrate deploy` against the production database (or add it to the build command).

Scan processing and deal search run after the response via Next's `after()`. On Vercel that is bounded by the function's max duration, so give `/api/trpc` enough headroom for a large scan (roughly 5–20 photos at a few seconds each, four at a time).
