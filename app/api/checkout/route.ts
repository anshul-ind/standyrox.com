import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";
import { DodoConfigError, getDodoDiagnostics } from "@/lib/dodo/client";
import { createCheckoutSession, DodoAuthError } from "@/lib/dodo/checkout";
import { createOrder, setOrderExternalPaymentId, updateOrderStatus } from "@/lib/services/order.service";
import { getZoneById } from "@/lib/services/zone.service";
import { checkoutRequestSchema } from "@/lib/validations/checkout";

/** Narrow an unknown throw to a safe status/code/message — never leaks secrets. */
function toCheckoutErrorPayload(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (err instanceof DodoAuthError) {
    return {
      status: 502,
      code: err.code,
      message:
        "Payment provider authentication failed (Dodo 401). The server's Dodo " +
        `credentials were rejected in ${err.dodoEnvironment}. ` +
        "This is a server configuration issue, not your input — " +
        "the reservation was released, please try again later.",
    };
  }
  if (err instanceof DodoConfigError) {
    return {
      status: 503,
      code: err.code,
      message:
        "Payments are temporarily unavailable (server configuration incomplete). " +
        "The reservation was released, please try again later.",
    };
  }
  return {
    status: 502,
    code: "DODO_CHECKOUT_FAILED",
    message: "Failed to start the payment session. The reservation was released.",
  };
}

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
      // Sanitized server diagnostics — boolean/class/environment only, never the key.
      const diag = getDodoDiagnostics();
      const payload = toCheckoutErrorPayload(err);
      console.error(
        `[checkout] Dodo session failed code=${payload.code} ` +
          `environment=${diag.environment} baseUrl=${diag.baseUrl} ` +
          `keyConfigured=${diag.keyConfigured} keyClass=${diag.keyClass} ` +
          `source=${diag.envVarSource} orderId=${order.id} zoneId=${zone.id}:`,
        err instanceof Error ? err.message : err
      );
      return NextResponse.json(
        { error: payload.message, code: payload.code },
        { status: payload.status }
      );
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
