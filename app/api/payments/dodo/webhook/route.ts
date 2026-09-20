import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { PAYMENT_PROVIDER_DODO } from "@/lib/constants";
import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";
import { extractCheckoutSessionId, extractCurrency, extractEventType, extractOrderId, extractPaymentId, extractSpotId, extractTotalAmount, type DodoRawEvent } from "@/lib/dodo/types";
import { verifyDodoWebhook } from "@/lib/dodo/webhook";
import { fulfillPaidOrder } from "@/lib/services/fulfillment.service";
import { getOrderByExternalPaymentId, getOrderById, updateOrderStatus } from "@/lib/services/order.service";
import { createPayment, paymentAlreadyRecorded } from "@/lib/services/payment.service";

/**
 * Dodo webhook handler.
 *
 * Path: /api/payments/dodo/webhook  (matches the endpoint registered in the
 * Dodo dashboard — do NOT use /api/webhooks/dodo).
 *
 * The signature is computed over the exact raw request body, so we read it with
 * `request.text()` and never parse/restringify JSON first.
 */
export async function POST(request: Request) {
  try {
    // 1. Read raw body FIRST — the signature covers the exact bytes.
    const rawBody = await request.text();

    // 2. Extract the Standard Webhooks signature headers.
    const h = (name: string) => request.headers.get(name);
    const webhookId = h("webhook-id") ?? h("Webhook-Id") ?? h("WEBHOOK-ID");
    const webhookSignature =
      h("webhook-signature") ?? h("Webhook-Signature") ?? h("WEBHOOK-SIGNATURE");
    const webhookTimestamp =
      h("webhook-timestamp") ?? h("Webhook-Timestamp") ?? h("WEBHOOK-TIMESTAMP");

    if (!webhookId || !webhookSignature || !webhookTimestamp) {
      console.error("[dodo-webhook] missing signature headers");
      return NextResponse.json(
        { error: "Missing webhook signature headers" },
        { status: 400 }
      );
    }

    // 3. Verify — throws on invalid signature; we return 400 and stop.
    let event: DodoRawEvent;
    try {
      event = verifyDodoWebhook(rawBody, {
        "webhook-id": webhookId,
        "webhook-signature": webhookSignature,
        "webhook-timestamp": webhookTimestamp,
      });
    } catch (err) {
      console.error("[dodo-webhook] invalid signature:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Log the full raw event so the real field shape can be confirmed (step 8/9).
    console.log("[dodo-webhook] event:", JSON.stringify(event));

    const eventType = extractEventType(event);
    const orderId = extractOrderId(event);
    const providerPaymentId = extractPaymentId(event);
    const metadataSpotId = extractSpotId(event);
    const checkoutSessionId = extractCheckoutSessionId(event);
    const paidAmount = extractTotalAmount(event);
    const paidCurrency = extractCurrency(event);

    // 4/5. Resolve the order. Primary key is the metadata order_id we set at
    // checkout. If that is somehow missing, fall back to the checkout session id
    // we stored as `external_payment_id`. If still unknown, ack with 200 so Dodo
    // stops retrying.
    let order = orderId ? await getOrderById(orderId) : null;
    if (!order && checkoutSessionId) {
      order = await getOrderByExternalPaymentId(checkoutSessionId);
      if (order) {
        console.log(
          "[dodo-webhook] resolved order via checkout_session_id fallback",
          order.id
        );
      }
    }
    if (!order) {
      console.log(
        "[dodo-webhook] unknown order",
        orderId ?? checkoutSessionId ?? "(no reference in event)"
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Cross-check the metadata spot_id against the order's stored zone. The
    // order row remains authoritative; a mismatch is logged, never trusted.
    if (metadataSpotId && metadataSpotId !== order.zoneId) {
      console.error(
        "[dodo-webhook] metadata spot_id mismatch — using order.zoneId",
        { orderId: order.id, metadataSpotId, orderZoneId: order.zoneId }
      );
    }

    // 6. Switch on event type.
    switch (eventType) {
      case "payment.succeeded": {
        // 8. Claim via the shared fulfilment path — same code the return-URL
        // verification on /checkout/success runs, so the two can never diverge.
        // It is idempotent: a duplicate delivery (or an order already paid) is
        // skipped instead of re-claiming, and it logs an amount mismatch.
        const result = await fulfillPaidOrder({
          order,
          providerPaymentId,
          paidAmountCents: paidAmount,
          paidCurrency,
          rawEvent: event,
          source: "webhook",
        });

        if (!result.claimed) {
          console.log(
            "[dodo-webhook] payment.succeeded ignored for",
            order.id,
            result.reason,
            providerPaymentId ?? "(no payment id)"
          );
          return NextResponse.json(
            { received: true, deduplicated: true },
            { status: 200 }
          );
        }

        console.log(
          "[dodo-webhook] payment.succeeded processed for order",
          order.id
        );
        break;
      }

      case "payment.failed":
      case "payment.cancelled": {
        await updateOrderStatus(order.id, "failed");
        await db
          .update(adZones)
          .set({ status: "available" })
          .where(
            and(eq(adZones.id, order.zoneId), eq(adZones.status, "reserved"))
          );

        if (
          providerPaymentId &&
          !(await paymentAlreadyRecorded(order.id, providerPaymentId))
        ) {
          await createPayment({
            orderId: order.id,
            provider: PAYMENT_PROVIDER_DODO,
            providerPaymentId,
            amountCents: order.amountCents,
            currency: order.currency,
            status: "failed",
            rawEvent: event,
          });
        }

        console.log(
          "[dodo-webhook]",
          eventType,
          "processed for order",
          order.id
        );
        break;
      }

      case "payment.processing":
      default:
        // 7. No-op for processing / unknown events — just acknowledge.
        console.log("[dodo-webhook] no-op for event type:", eventType);
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Always return a structured response; log before responding.
    console.error("[dodo-webhook] unhandled error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}