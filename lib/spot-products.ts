/**
 * Authoritative spot (ad_zone) → price → Dodo product mapping.
 *
 * This is the ONLY place that decides which Dodo product a spot uses. The
 * backend reads it; the frontend never does (product IDs and prices are
 * server-side only).
 *
 * Keys are the existing `ad_zones.key` identifiers from lib/db/seed.ts — do not
 * rename them, or every spot will stop resolving.
 *
 * Price intent:
 *   Chest $20 · Back $15 · Bum (lower back) $9 · Arms $10 · Front legs/thighs $6 · Lower body/calves $5
 *
 * `priceCents` is the server-authoritative amount recorded on the order. The
 * amount actually charged always comes from the Dodo product configured in the
 * matching env var (`envVar`), so the two must stay in sync when a product price
 * changes in Dodo.
 */
export interface SpotProductConfig {
  /** Server-authoritative price in cents (display + order record only). */
  priceCents: number;
  /** Server-side env var holding this spot's Dodo TEST MODE product ID. */
  envVar: string;
}

export const SPOT_PRODUCTS: Record<string, SpotProductConfig> = {
  chest_center: { priceCents: 2000, envVar: "DODO_PRODUCT_CHEST_CENTER" },

  back_upper: { priceCents: 1500, envVar: "DODO_PRODUCT_BACK_UPPER" },

  left_lower_back: { priceCents: 900, envVar: "DODO_PRODUCT_LEFT_LOWER_BACK" },
  right_lower_back: { priceCents: 900, envVar: "DODO_PRODUCT_RIGHT_LOWER_BACK" },

  left_shoulder: { priceCents: 1000, envVar: "DODO_PRODUCT_LEFT_SHOULDER" },
  right_shoulder: { priceCents: 1000, envVar: "DODO_PRODUCT_RIGHT_SHOULDER" },
  left_bicep: { priceCents: 1000, envVar: "DODO_PRODUCT_LEFT_BICEP" },
  right_bicep: { priceCents: 1000, envVar: "DODO_PRODUCT_RIGHT_BICEP" },
  left_forearm: { priceCents: 1000, envVar: "DODO_PRODUCT_LEFT_FOREARM" },
  right_forearm: { priceCents: 1000, envVar: "DODO_PRODUCT_RIGHT_FOREARM" },

  left_thigh_front: { priceCents: 600, envVar: "DODO_PRODUCT_LEFT_THIGH_FRONT" },
  right_thigh_front: { priceCents: 600, envVar: "DODO_PRODUCT_RIGHT_THIGH_FRONT" },

  left_calf: { priceCents: 500, envVar: "DODO_PRODUCT_LEFT_CALF" },
  right_calf: { priceCents: 500, envVar: "DODO_PRODUCT_RIGHT_CALF" },
  left_calf_back: { priceCents: 500, envVar: "DODO_PRODUCT_LEFT_CALF_BACK" },
  right_calf_back: { priceCents: 500, envVar: "DODO_PRODUCT_RIGHT_CALF_BACK" },
};

/** Pricing/config for a spot, or null when the key is not a purchasable spot. */
export function getSpotProductConfig(
  zoneKey: string
): SpotProductConfig | null {
  return SPOT_PRODUCTS[zoneKey] ?? null;
}

/** Every env var name this mapping depends on, in declaration order. */
export function getSpotProductEnvVars(): string[] {
  return Object.values(SPOT_PRODUCTS).map((config) => config.envVar);
}
