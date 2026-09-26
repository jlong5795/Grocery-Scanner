/** Store adapter interface (spec section 7). One adapter per store or deals source. */

export interface StoreOffer {
  title: string;
  priceCents: number | null;
  wasPriceCents: number | null; // non-null implies a sale
  couponSummary: string | null;
  department: string | null; // if the source provides aisle/category
  sourceUrl: string | null;
}

export interface StoreAdapter {
  /** Stable key stored on Store.adapterKey, e.g. "flipp:Kroger". */
  key: string;
  search(query: string): Promise<StoreOffer[]>;
}
