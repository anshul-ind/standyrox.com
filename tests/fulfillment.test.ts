import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../lib/db";
import { adZones, orders, payments, placements } from "../lib/db/schema";
import { fulfillPaidOrder } from "../lib/services/fulfillment.service";
import { createOrder } from "../lib/services/order.service";
import { getZoneById } from "../lib/services/zone.service";

/**
 * Guards the claim path that makes a paid logo actually render on the avatar.
 *
 * Regression: `createActivePlacement` used to INSERT ... ON CONFLICT DO NOTHING
 * against the UNIQUE placements.zone_id. The first claim created a placement,
 * so every later claim of that same spot was silently skipped — the zone still
 * flipped to `occupied`, but the placement row kept pointing at the old order
 * and the logo never appeared. Re-claiming must now replace the row.
 *
 * Also covers idempotency: a replayed webhook or a second return-URL visit must
 * not claim twice or record a second payment.
 */
async function runFulfillmentTest() {
  console.log("🧪 Testing paid-order fulfilment (claim + idempotency)...\n");

  const [zone] = await db
    .select()
    .from(adZones)
    .where(eq(adZones.status, "available"))
    .limit(1);
  assert.ok(zone, "Must have an available zone for the test");
  console.log(`1️⃣ Using test zone: ${zone.key} (${zone.id})`);

  const createdOrderIds: string[] = [];

  try {
    await db
      .update(adZones)
      .set({ status: "reserved" })
      .where(eq(adZones.id, zone.id));

    // ── First claim ─────────────────────────────────────────────────────────
    const orderA = await createOrder({
      zoneId: zone.id,
      buyerEmail: "fulfilment-test-a@example.com",
      brandName: "Acme Test Brand",
      brandLogoUrl: "https://example.com/logo-a.png",
      amountCents: zone.basePriceCents,
    });
    createdOrderIds.push(orderA.id);

    const first = await fulfillPaidOrder({
      order: orderA,
      providerPaymentId: "pay_test_a",
      paidAmountCents: orderA.amountCents,
      source: "webhook",
    });
    assert.equal(first.claimed, true, "First claim must claim the order");
    console.log("2️⃣ First claim recorded");

    const afterFirst = await getZoneById(zone.id);
    assert.ok(afterFirst, "Zone must still exist");
    assert.equal(afterFirst.status, "occupied", "Zone must be occupied");
    assert.ok(afterFirst.placement, "Zone must expose a placement");
    assert.equal(afterFirst.placement.brandName, "Acme Test Brand");
    assert.equal(
      afterFirst.placement.brandLogoUrl,
      "https://example.com/logo-a.png",
      "The logo the 3D scene renders must round-trip through /api/zones"
    );
    console.log("   ✅ Zone occupied and its placement (logo) is served to the scene");

    // ── Duplicate delivery must be a no-op ──────────────────────────────────
    const replay = await fulfillPaidOrder({
      order: orderA,
      providerPaymentId: "pay_test_a",
      paidAmountCents: orderA.amountCents,
      source: "return_url",
    });
    assert.equal(replay.claimed, false, "A replay must not claim again");
    assert.equal(replay.reason, "duplicate_payment");

    const paymentRows = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orderId, orderA.id));
    assert.equal(paymentRows.length, 1, "A replay must not record a second payment");
    console.log("   ✅ Webhook + return-URL paths cannot double-claim");

    // ── Re-claim of the SAME spot must replace the placement ────────────────
    // (this is the regression: the old code silently skipped this insert)
    const orderB = await createOrder({
      zoneId: zone.id,
      buyerEmail: "fulfilment-test-b@example.com",
      brandName: "Beta Test Brand",
      brandLogoUrl: "https://example.com/logo-b.png",
      amountCents: zone.basePriceCents,
    });
    createdOrderIds.push(orderB.id);

    const second = await fulfillPaidOrder({
      order: orderB,
      providerPaymentId: "pay_test_b",
      paidAmountCents: orderB.amountCents,
      source: "webhook",
    });
    assert.equal(second.claimed, true, "A later purchase of the same spot must claim");

    const afterSecond = await getZoneById(zone.id);
    assert.equal(
      afterSecond?.placement?.brandName,
      "Beta Test Brand",
      "The placement must move to the newest paid order instead of staying stale"
    );
    assert.equal(
      afterSecond?.placement?.brandLogoUrl,
      "https://example.com/logo-b.png"
    );

    const placementRows = await db
      .select({ id: placements.id })
      .from(placements)
      .where(eq(placements.zoneId, zone.id));
    assert.equal(placementRows.length, 1, "A zone holds exactly one placement row");
    console.log("   ✅ Re-claiming a spot replaces the stale placement (logo updates)");

    console.log("\n🎉 Fulfilment tests passed!\n");
  } finally {
    // Restore the zone and remove everything this test created.
    if (createdOrderIds.length > 0) {
      await db.delete(payments).where(inArray(payments.orderId, createdOrderIds));
      await db.delete(placements).where(inArray(placements.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    await db
      .update(adZones)
      .set({ status: "available" })
      .where(and(eq(adZones.id, zone.id), eq(adZones.status, "occupied")));
    console.log(`🧹 Cleaned up test data for zone ${zone.key}\n`);
  }
}

runFulfillmentTest().catch((err) => {
  console.error("\n❌ Fulfilment test failed:", err);
  process.exit(1);
});
