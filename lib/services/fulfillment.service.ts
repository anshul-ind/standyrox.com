/**
 * Claim a paid order for its spot.
 *
 * Shared by BOTH confirmation paths so they can never diverge:
 *   - the Dodo webhook (`payment.succeeded`) — authoritative in production;
 *   - the return-URL verification on /checkout/success — covers a missed or
 *     delayed webhook, and is the only path that works in local development,
 *     where Dodo's servers cannot reach `localhost` to deliver a webhook.
 *
 * Idempotent: a re-delivered webhook or a second return-URL visit for an order
 * that is already claimed returns without touching anything, so the caller can
 * safely answer 200 / re-render.
 */
import { eq } from "drizzle-orm";

import { PAYMENT_PROVIDER_DODO } from "@/lib/constants";
import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";
import { updateOrderStatus, type OrderRow } from "./order.service";
import { createPayment, paymentAlreadyRecorded } from "./payment.service";
import { createActivePlacement } from "./placement.service";

export type FulfillmentSource = "webhook" | "return_url";

export interface FulfillPaidOrderInput {
  order: OrderRow;
  /** Provider payment id, used as the idempotency key when known. */
  providerPaymentId: string | null;
  /** Amount the provider reports as charged (smallest currency unit), if known. */
  paidAmountCents?: number | null;
  paidCurrency?: string | null;
  /** Raw provider payload, stored on the payment row when available. */
  rawEvent?: unknown;
  source: FulfillmentSource;
}

export interface FulfillPaidOrderResult {
  claimed: boolean;
  reason: "claimed" | "already_paid" | "duplicate_payment";
}

export async function fulfillPaidOrder(
  input: FulfillPaidOrderInput
): Promise<FulfillPaidOrderResult> {
  const { order } = input;

  // Idempotency — a duplicate delivery OR an order already marked paid must not
  // re-claim, even when the provider payment id is absent.
  if (
    input.providerPaymentId &&
    (await paymentAlreadyRecorded(order.id, input.providerPaymentId))
  ) {
    return { claimed: false, reason: "duplicate_payment" };
  }
  if (order.status === "paid") {
    return { claimed: false, reason: "already_paid" };
  }

  // The order amount is server-authoritative (resolved from the spot → product
  // mapping). A different charged amount means the wrong product/price was
  // bought — alert loudly, but still fulfil the order we know about.
  if (
    input.paidAmountCents !== undefined &&
    input.paidAmountCents !== null &&
    input.paidAmountCents !== order.amountCents
  ) {
    console.error(
      `[fulfillment] AMOUNT MISMATCH source=${input.source} order=${order.id} ` +
        `expected=${order.amountCents} paid=${input.paidAmountCents} ` +
        `${input.paidCurrency ?? ""} paymentId=${input.providerPaymentId ?? "?"}`
    );
  }

  await createPayment({
    orderId: order.id,
    provider: PAYMENT_PROVIDER_DODO,
    providerPaymentId: input.providerPaymentId,
    amountCents: order.amountCents,
    currency: order.currency,
    status: "succeeded",
    rawEvent:
      input.rawEvent === undefined
        ? { source: input.source, verified_at: new Date().toISOString() }
        : input.rawEvent,
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
    `[fulfillment] order ${order.id} claimed zone ${order.zoneId} via ${input.source}`
  );

  return { claimed: true, reason: "claimed" };
}
