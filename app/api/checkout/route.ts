import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";
import { createCheckoutSession } from "@/lib/dodo/checkout";
import { createOrder, setOrderExternalPaymentId, updateOrderStatus } from "@/lib/services/order.service";
import { getZoneById } from "@/lib/services/zone.service";
import { checkoutRequestSchema } from "@/lib/validations/checkout";

export async function POST(request: Request) {
  // 1. Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { zoneId, brandName, brandUrl, buyerEmail, logoUrl } = parsed.data;

  // 2. Fetch zone
  const zone = await getZoneById(zoneId);

  // 3. Not found
  if (!zone) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  // 4. Not available
  if (zone.status !== "available") {
    return NextResponse.json(
      { error: "Zone already taken" },
      { status: 409 }
    );
  }

  try {
    // 5. Atomically reserve the zone to prevent race conditions / double bookings
    const [reservedZone] = await db
      .update(adZones)
      .set({ status: "reserved" })
      .where(and(eq(adZones.id, zone.id), eq(adZones.status, "available")))
      .returning({ id: adZones.id });

    if (!reservedZone) {
      return NextResponse.json(
        { error: "Zone already taken" },
        { status: 409 }
      );
    }

    // 6. Insert order — server-authoritative price; never trust client amount.
    const order = await createOrder({
      zoneId: zone.id,
      buyerEmail,
      brandName,
      brandUrl: brandUrl || null,
      brandLogoUrl: logoUrl,
      amountCents: zone.basePriceCents,
    });

    // 7. Create the Dodo checkout session
    let session;
    try {
      session = await createCheckoutSession({
        orderId: order.id,
        email: buyerEmail,
        name: null,
      });
    } catch (err) {
      // Rollback: release the reservation so the zone is not stuck reserved.
      await db
        .update(adZones)
        .set({ status: "available" })
        .where(eq(adZones.id, zone.id));
      // This order never reached Dodo — don't leave an orphaned "pending" row.
      try {
        await updateOrderStatus(order.id, "cancelled");
      } catch {
        /* best-effort */
      }
      console.error(
        "Checkout session creation failed; reservation rolled back:",
        err
      );
      throw err;
    }

    // 8. Stash the Dodo session id on the order
    await setOrderExternalPaymentId(order.id, session.sessionId);

    // 9. Return the hosted checkout URL
    return NextResponse.json({
      checkoutUrl: session.checkoutUrl,
      orderId: order.id,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Failed to process checkout" },
      { status: 500 }
    );
  }
}
