import { env } from "~/env";

import { flippAdapter } from "./flipp";
import { mockAdapter } from "./mock";
import type { StoreAdapter } from "./types";

export type { StoreAdapter, StoreOffer } from "./types";

/** Resolve a Store.adapterKey to an adapter, or null if the key is unknown. */
export function getAdapter(adapterKey: string): StoreAdapter | null {
  if (adapterKey === "mock" || adapterKey.startsWith("mock:")) return mockAdapter(adapterKey);
  if (adapterKey.startsWith("flipp:")) return flippAdapter(adapterKey, env.HOUSEHOLD_POSTAL_CODE);
  return null;
}

export const ADAPTER_HELP =
  'Use "flipp:<store name as it appears on Flipp>" (e.g. "flipp:Kroger"), or "mock" for fake prices while testing.';
