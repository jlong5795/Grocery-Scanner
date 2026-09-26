/**
 * Choosing where a list item "belongs" (spec section 7): the trip pin, then the
 * standing pin (already copied onto the list item when it was added), then the
 * best price/deal, ties broken by store priority.
 */

export interface OfferForChoice {
  storeId: string;
  priceCents: number | null;
  couponSummary: string | null;
}

export interface StoreForChoice {
  id: string;
  priority: number;
}

export function chooseStore(
  pinnedStoreId: string | null,
  offers: readonly OfferForChoice[],
  stores: readonly StoreForChoice[],
): string | null {
  if (pinnedStoreId) return pinnedStoreId;

  const priority = new Map(stores.map((s) => [s.id, s.priority]));
  const priced = offers.filter((o) => o.priceCents != null);
  if (priced.length === 0) {
    // No prices anywhere: a coupon is still a reason to pick a store.
    const withCoupon = offers.find((o) => o.couponSummary);
    return withCoupon?.storeId ?? null;
  }
  const best = [...priced].sort(
    (a, b) =>
      a.priceCents! - b.priceCents! ||
      (priority.get(a.storeId) ?? Infinity) - (priority.get(b.storeId) ?? Infinity),
  )[0]!;
  return best.storeId;
}

/** Default department order when a store has none configured (spec section 8). */
export const DEFAULT_DEPARTMENT_ORDER = [
  "Produce",
  "Bakery",
  "Deli",
  "Dairy",
  "Meat & Seafood",
  "Frozen",
  "Pantry",
  "Snacks",
  "Beverages",
  "Household",
  "Other",
];

export function departmentRank(name: string | null | undefined): number {
  const i = DEFAULT_DEPARTMENT_ORDER.findIndex(
    (d) => d.toLowerCase() === (name ?? "").toLowerCase(),
  );
  return i === -1 ? DEFAULT_DEPARTMENT_ORDER.length : i;
}
