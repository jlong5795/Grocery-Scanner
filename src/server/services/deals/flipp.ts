import { z } from "zod";

import type { StoreAdapter, StoreOffer } from "./types";

/**
 * Flipp weekly-ad search. Flipp aggregates current flyers for many US and
 * Canadian grocery chains. This uses Flipp's public web search endpoint, which
 * is unofficial and undocumented, so responses are parsed defensively and any
 * failure yields no offers rather than an error.
 *
 * Adapter key: "flipp:<merchant name>", e.g. "flipp:Kroger". One search returns
 * every merchant's flyer items; results are filtered to the named merchant.
 */

const FLIPP_SEARCH_URL = "https://backflipp.wishabi.com/flipp/items/search";

const flippItem = z
  .object({
    name: z.string().nullish(),
    merchant_name: z.string().nullish(),
    current_price: z.coerce.number().nullish(),
    original_price: z.coerce.number().nullish(),
    sale_story: z.string().nullish(),
    pre_price_text: z.string().nullish(),
    post_price_text: z.string().nullish(),
    _L2: z.string().nullish(),
  })
  .passthrough();

const flippResponse = z
  .object({
    items: z.array(flippItem).default([]),
    ecom_items: z.array(flippItem).default([]),
  })
  .passthrough();

type FlippItem = z.infer<typeof flippItem>;

const toCents = (dollars: number | null | undefined) =>
  dollars != null && Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;

function toOffer(item: FlippItem): StoreOffer | null {
  if (!item.name) return null;
  const priceCents = toCents(item.current_price);
  const wasPriceCents = toCents(item.original_price);
  const story = [item.pre_price_text, item.sale_story, item.post_price_text]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    title: item.name,
    priceCents,
    wasPriceCents: wasPriceCents && priceCents && wasPriceCents > priceCents ? wasPriceCents : null,
    couponSummary: story || null,
    department: item._L2 ?? null,
    sourceUrl: null,
  };
}

/** Shared across adapters in one process so N Flipp stores cost one request per query. */
const cache = new Map<string, { at: number; items: FlippItem[] }>();
const CACHE_MS = 30 * 60 * 1000;

async function searchFlipp(query: string, postalCode: string): Promise<FlippItem[]> {
  const cacheKey = `${postalCode}:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const url = new URL(FLIPP_SEARCH_URL);
  url.searchParams.set("locale", "en-us");
  url.searchParams.set("postal_code", postalCode);
  url.searchParams.set("q", query);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[flipp] ${res.status} for "${query}"`);
      return [];
    }
    const parsed = flippResponse.safeParse(await res.json());
    if (!parsed.success) {
      console.warn("[flipp] unexpected response shape", parsed.error.message);
      return [];
    }
    const items = [...parsed.data.items, ...parsed.data.ecom_items];
    cache.set(cacheKey, { at: Date.now(), items });
    return items;
  } catch (err) {
    console.warn(`[flipp] request failed for "${query}"`, err);
    return [];
  }
}

export function flippAdapter(key: string, postalCode: string | undefined): StoreAdapter {
  const merchant = key.slice("flipp:".length).trim().toLowerCase();
  return {
    key,
    async search(query) {
      if (!postalCode) {
        console.warn("[flipp] HOUSEHOLD_POSTAL_CODE is not set; skipping deal search.");
        return [];
      }
      const items = await searchFlipp(query, postalCode);
      return items
        .filter((i) => !merchant || (i.merchant_name ?? "").toLowerCase().includes(merchant))
        .map(toOffer)
        .filter((o): o is StoreOffer => o !== null);
    },
  };
}
