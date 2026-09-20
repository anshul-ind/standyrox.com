/**
 * Read-only price-consistency verification for Standyrox.
 *
 * Checks, for every spot in the authoritative mapping:
 *   1. its Dodo product env var is set,
 *   2. the Dodo product exists (in TEST MODE by default),
 *   3. the Dodo product price equals the mapping price,
 *   4. the DB `ad_zones.base_price_cents` equals the mapping price.
 *
 * It creates nothing, charges nothing, and prints no secrets. Run:
 *
 *   npx tsx --env-file=.env.local scripts/verify-dodo-products.ts
 */
import { eq } from "drizzle-orm";

import { db } from "../lib/db";
import { adZones } from "../lib/db/schema";
import { resolveDodoEnvironment } from "../lib/dodo/client";
import {
  getDodoProductIdForSpot,
  getSpotProductEnvVar,
} from "../lib/env";
import { SPOT_PRODUCTS } from "../lib/spot-products";
import DodoPayments from "dodopayments";

function priceFromProduct(product: {
  price: { type: string; price?: number; fixed_price?: number; currency?: string };
}): { cents: number | null; currency: string | null } {
  const p = product.price;
  const cents =
    p.type === "usage_based_price"
      ? (p.fixed_price ?? null)
      : (p.price ?? null);
  return { cents, currency: p.currency ?? null };
}

function dollars(cents: number | null): string {
  return cents === null ? "?" : `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const environment = resolveDodoEnvironment();
  console.log(`\n🔎 Verifying spot → product → price consistency (${environment})\n`);

  const apiKey = (process.env.DODO_PAYMENTS_API_KEY ?? "").trim();
  const client = apiKey
    ? new DodoPayments({ bearerToken: apiKey, environment })
    : null;
  if (!client) console.warn("⚠️  No Dodo API key — skipping Dodo product checks.\n");

  // DB prices for cross-check.
  const zoneRows = await db
    .select({ key: adZones.key, basePriceCents: adZones.basePriceCents })
    .from(adZones);
  const dbPriceByKey = new Map(zoneRows.map((z) => [z.key, z.basePriceCents]));

  let failures = 0;

  for (const [key, config] of Object.entries(SPOT_PRODUCTS)) {
    const problems: string[] = [];

    const envVar = getSpotProductEnvVar(key) ?? "?";
    const productId = getDodoProductIdForSpot(key);
    const dbCents = dbPriceByKey.get(key);

    if (!productId) problems.push(`env ${envVar} is unset`);

    if (dbCents === undefined) {
      problems.push("no DB row");
    } else if (dbCents !== config.priceCents) {
      problems.push(
        `DB price ${dollars(dbCents)} != mapping ${dollars(config.priceCents)} (run npm run db:seed)`
      );
    }

    let dodoCents: number | null = null;
    if (client && productId) {
      try {
        const product = await client.products.retrieve(productId);
        const parsed = priceFromProduct(
          product as unknown as {
            price: { type: string; price?: number; fixed_price?: number; currency?: string };
          }
        );
        dodoCents = parsed.cents;
        if (dodoCents !== config.priceCents) {
          problems.push(
            `Dodo product ${dollars(dodoCents)} != mapping ${dollars(config.priceCents)}`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        problems.push(`Dodo retrieve failed (${msg.slice(0, 80)})`);
      }
    }

    const ok = problems.length === 0;
    if (!ok) failures++;
    console.log(
      `${ok ? "✅" : "❌"} ${key.padEnd(20)} ` +
        `mapping=${dollars(config.priceCents).padEnd(7)} ` +
        `db=${dollars(dbCents ?? null).padEnd(7)} ` +
        `dodo=${dollars(dodoCents).padEnd(7)} ` +
        `product=${productId ? "set" : "MISSING"}`
    );
    for (const p of problems) console.log(`     ↳ ${p}`);
  }

  console.log(
    failures === 0
      ? "\n🎉 All spots consistent: env + Dodo product price + DB price.\n"
      : `\n⚠️  ${failures} spot(s) inconsistent — see above.\n`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exitCode = 1;
});
