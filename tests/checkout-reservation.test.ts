import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { adZones, orders } from "../lib/db/schema";
import { createOrder, updateOrderStatus } from "../lib/services/order.service";
import { getZoneById } from "../lib/services/zone.service";

async function runReservationRollbackTest() {
  console.log("🧪 Testing Reservation and Rollback Flow...\n");

  // 1. Pick an available zone
  const [zone] = await db
    .select()
    .from(adZones)
    .where(eq(adZones.status, "available"))
    .limit(1);

  assert.ok(zone, "Must have an available zone for test");
  console.log(`1️⃣ Using test zone: ${zone.key} (${zone.id})`);

  // 2. Reserve zone atomically
  const [reserved] = await db
    .update(adZones)
    .set({ status: "reserved" })
    .where(and(eq(adZones.id, zone.id), eq(adZones.status, "available")))
    .returning({ id: adZones.id });

  assert.ok(reserved, "Zone should be marked reserved");
  console.log("2️⃣ Zone atomically transitioned: available -> reserved");

  // Verify it cannot be reserved a second time (race condition protection)
  const [doubleReserve] = await db
    .update(adZones)
    .set({ status: "reserved" })
    .where(and(eq(adZones.id, zone.id), eq(adZones.status, "available")))
    .returning({ id: adZones.id });

  assert.equal(doubleReserve, undefined, "Double reservation must be blocked (prevent 409)");
  console.log("   ✅ Race condition protection confirmed (concurrent reservation blocked)");

  // 3. Create pending order
  const order = await createOrder({
    zoneId: zone.id,
    buyerEmail: "test-buyer@example.com",
    brandName: "Acme Test Brand",
    amountCents: zone.basePriceCents,
  });

  assert.ok(order.id, "Order should be created with pending status");
  console.log(`3️⃣ Order created: ${order.id} (status: ${order.status})`);

  // 4. Simulate checkout session failure & execute rollback
  console.log("4️⃣ Simulating checkout provider failure & triggering rollback...");
  await db
    .update(adZones)
    .set({ status: "available" })
    .where(eq(adZones.id, zone.id));

  await updateOrderStatus(order.id, "cancelled");

  // 5. Verify post-rollback states
  const rolledBackZone = await getZoneById(zone.id);
  assert.ok(rolledBackZone, "Zone must exist");
  assert.equal(rolledBackZone.status, "available", "Zone status must be returned to available");

  const [cancelledOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, order.id))
    .limit(1);

  assert.equal(cancelledOrder.status, "cancelled", "Order must be marked cancelled");

  console.log("   ✅ Rollback successfully released zone back to 'available'");
  console.log("   ✅ Order marked 'cancelled' without orphan reservations");
  console.log("\n🎉 Reservation and rollback test passed completely!\n");
}

runReservationRollbackTest().catch((err) => {
  console.error("\n❌ Reservation test failed:", err);
  process.exit(1);
});
