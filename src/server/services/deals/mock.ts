import type { StoreAdapter, StoreOffer } from "./types";

/**
 * Deterministic fake offers for local development and tests, so the deal flow
 * can be exercised without network access. Adapter key: "mock".
 */
function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const DEPARTMENTS = ["Produce", "Dairy", "Pantry", "Frozen", "Snacks", "Household"];

export function mockAdapter(key = "mock"): StoreAdapter {
  return {
    key,
    async search(query: string): Promise<StoreOffer[]> {
      const h = hash(`${key}:${query.toLowerCase()}`);
      const priceCents = 149 + (h % 700);
      const onSale = h % 3 === 0;
      return [
        {
          title: query,
          priceCents,
          wasPriceCents: onSale ? priceCents + 50 + (h % 100) : null,
          couponSummary: h % 5 === 0 ? "$1 off with app coupon" : null,
          department: DEPARTMENTS[h % DEPARTMENTS.length]!,
          sourceUrl: null,
        },
      ];
    },
  };
}
