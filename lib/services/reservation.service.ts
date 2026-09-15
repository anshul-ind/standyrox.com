import { and, eq, lt } from "drizzle-orm";

import { RESERVATION_TTL_MS } from "@/lib/constants";
import { db } from "@/lib/db";
import { adZones, orders } from "@/lib/db/schema";

/**
 * Expire reservations whose order is still `pending` past the TTL.
 *
 * Finds each `reserved` zone whose latest pending order is older than
 * RESERVATION_TTL_MS, then in the SAME pass expires the order and releases the
 * zone back to `available`. Running this before returning zone status means a
 * stale reservation is corrected on the first read (not the second).
 */
export async function releaseExpiredReservations(): Promise<void> {
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS);

  const stale = await db
    .select({ orderId: orders.id, zoneId: adZones.id })
    .from(orders)
    .innerJoin(adZones, eq(orders.zoneId, adZones.id))
    .where(
      and(
        eq(orders.status, "pending"),
        lt(orders.createdAt, cutoff),
        eq(adZones.status, "reserved")
      )
    );

  for (const row of stale) {
    await db
      .update(orders)
      .set({ status: "expired" })
      .where(eq(orders.id, row.orderId));

    // Only release the zone if it is still reserved (guards the window where a
    // newer order may have re-reserved it concurrently).
    await db
      .update(adZones)
      .set({ status: "available" })
      .where(
        and(eq(adZones.id, row.zoneId), eq(adZones.status, "reserved"))
      );
  }
}
