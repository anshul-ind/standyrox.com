import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";
import { DodoConfigError, getDodoDiagnostics } from "@/lib/dodo/client";
import { createCheckoutSession, DodoAuthError } from "@/lib/dodo/checkout";
import {
  getDodoProductIdForSpot,
  getSpotProductEnvVar,
} from "@/lib/env";
import { createOrder, setOrderExternalPaymentId, updateOrderStatus } from "@/lib/services/order.service";
import { getZoneById } from "@/lib/services/zone.service";
import { getSpotProductConfig } from "@/lib/spot-products";
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
  // 1. Parse + validate body. Unknown keys (price/productId) are stripped by
  //    the schema and can never influence the charge.
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

  const { brandName, brandUrl, buyerEmail, logoUrl } = parsed.data;
  const spotId = parsed.data.spotId ?? parsed.data.zoneId;
  if (!spotId) {
    return NextResponse.json({ error: "spotId is required" }, { status: 400 });
  }

  // 2. Fetch the spot.
  const zone = await getZoneById(spotId);

  // 3. Not found.
  if (!zone) {
    return NextResponse.json({ error: "Spot not found" }, { status: 404 });
  }

  // 4. Not available.
  if (zone.status !== "available") {
    return NextResponse.json({ error: "Spot already taken" }, { status: 409 });
  }

  // 5. Resolve the authoritative price + Dodo product for THIS spot. The client
  //    cannot supply either. If either is missing we fail loudly — we never
  //    silently create a checkout with another spot's product.
  const pricing = getSpotProductConfig(zone.key);
  if (!pricing) {
    return NextResponse.json(
      {
        error: "This spot is not purchasable.",
        code: "SPOT_NOT_PURCHASABLE",
      },
      { status: 422 }
    );
  }

  // Price-mismatch protection. The DB price (what the UI/checkout page shows)
  // must equal the mapping price (what the order is recorded at and the Dodo
  // product should charge). The mapping stays authoritative; a mismatch means
  // the DB was not re-seeded and is logged loudly instead of failing silently.
  if (zone.basePriceCents !== pricing.priceCents) {
    console.error(
      `[checkout] PRICE MISMATCH for spot ${zone.key}: db=${zone.basePriceCents} ` +
        `mapping=${pricing.priceCents}. Using mapping (authoritative) — run "npm run db:seed" to sync the DB.`
    );
  }

  const productId = getDodoProductIdForSpot(zone.key);
  if (!productId) {
    const envVar = getSpotProductEnvVar(zone.key);
    console.error(
      `[checkout] Missing Dodo product ID for spot key=${zone.key} ` +
        `(env ${envVar ?? "?"}). Refusing to create checkout.`
    );
    return NextResponse.json(
      {
        error:
          "This spot is temporarily unavailable for purchase (payment product " +
          `not configured${envVar ? `: ${envVar}` : ""}).`,
        code: "DODO_PRODUCT_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  // Tracks whether we hold the reservation, so an unexpected failure after
  // this point cannot leave the spot stuck in `reserved`.
  let reservationHeld = false;

  try {
    // 6. Atomically reserve the spot to prevent race conditions / double bookings.
    const [reservedZone] = await db
      .update(adZones)
      .set({ status: "reserved" })
      .where(and(eq(adZones.id, zone.id), eq(adZones.status, "available")))
      .returning({ id: adZones.id });

    if (!reservedZone) {
      return NextResponse.json(
        { error: "Spot already taken" },
        { status: 409 }
      );
    }
    reservationHeld = true;

    // 7. Insert order — server-authoritative price from the spot mapping.
    const order = await createOrder({
      zoneId: zone.id,
      buyerEmail,
      brandName,
      brandUrl: brandUrl || null,
      brandLogoUrl: logoUrl,
      amountCents: pricing.priceCents,
    });

    // 8. Create the Dodo checkout session with the validated product ID.
    let session;
    try {
      session = await createCheckoutSession({
        productId,
        orderId: order.id,
        spotId: zone.id,
        email: buyerEmail,
        name: null,
      });
    } catch (err) {
      // Rollback: release the reservation so the spot is not stuck reserved.
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
          `source=${diag.envVarSource} orderId=${order.id} zoneId=${zone.id} ` +
          `spotKey=${zone.key}:`,
        err instanceof Error ? err.message : err
      );
      return NextResponse.json(
        { error: payload.message, code: payload.code },
        { status: payload.status }
      );
    }

    // 9. Stash the Dodo session id on the order.
    await setOrderExternalPaymentId(order.id, session.sessionId);

    // The order is now associated with a Dodo session; the webhook owns
    // claiming from here. Stop tracking the reservation for rollback.
    reservationHeld = false;

    // 10. Return the hosted checkout URL.
    return NextResponse.json({
      checkoutUrl: session.checkoutUrl,
      orderId: order.id,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    // Never leave the spot stuck reserved after an unexpected failure.
    if (reservationHeld) {
      try {
        await db
          .update(adZones)
          .set({ status: "available" })
          .where(and(eq(adZones.id, zone.id), eq(adZones.status, "reserved")));
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json(
      { error: "Failed to process checkout" },
      { status: 500 }
    );
  }
}
