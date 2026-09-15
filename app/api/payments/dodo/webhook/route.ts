import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { PAYMENT_PROVIDER_DODO } from "@/lib/constants";
import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";
import { extractEventType, extractOrderId, extractPaymentId, type DodoRawEvent } from "@/lib/dodo/types";
import { verifyDodoWebhook } from "@/lib/dodo/webhook";
import { getOrderById, updateOrderStatus } from "@/lib/services/order.service";
import { createActivePlacement } from "@/lib/services/placement.service";
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

    // 4/5. Resolve the order; if unknown, ack with 200 so Dodo stops retrying.
    if (!orderId) {
      console.log("[dodo-webhook] no order_id in event", JSON.stringify(event));
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      console.log("[dodo-webhook] unknown order", orderId);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 6. Switch on event type.
    switch (eventType) {
      case "payment.succeeded": {
        // 8. Idempotency — skip if we already recorded this provider payment.
        if (
          providerPaymentId &&
          (await paymentAlreadyRecorded(order.id, providerPaymentId))
        ) {
          console.log(
            "[dodo-webhook] duplicate payment.succeeded for",
            order.id,
            providerPaymentId,
            "— skipping"
          );
          return NextResponse.json(
            { received: true, deduplicated: true },
            { status: 200 }
          );
        }

        await createPayment({
          orderId: order.id,
          provider: PAYMENT_PROVIDER_DODO,
          providerPaymentId,
          amountCents: order.amountCents,
          currency: order.currency,
          status: "succeeded",
          rawEvent: event,
        });
        await updateOrderStatus(order.id, "paid");
        await createActivePlacement({
          zoneId: order.zoneId,
          orderId: order.id,
          brandName: order.brandName,
          brandUrl: order.brandUrl,
          brandLogoUrl: order.brandLogoUrl,
        });
        await db
          .update(adZones)
          .set({ status: "occupied" })
          .where(eq(adZones.id, order.zoneId));

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