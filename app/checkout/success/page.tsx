import Link from "next/link";

import PaymentStatusPoller from "@/components/checkout/PaymentStatusPoller";
import { getDodoClient, sanitizeErrorMessage } from "@/lib/dodo/client";
import { formatUSDFromCents } from "@/lib/format";
import { fulfillPaidOrder } from "@/lib/services/fulfillment.service";
import { getOrderByExternalPaymentId, getOrderById, type OrderRow } from "@/lib/services/order.service";
import { getZoneById } from "@/lib/services/zone.service";

interface SearchParams {
  [key: string]: string | string[] | undefined;
}

// Confirmation state is per-visit — never serve this page from a cache.
export const dynamic = "force-dynamic";

/**
 * Success page shown after Dodo redirects the buyer back.
 *
 * Dodo APPENDS query parameters to the `return_url` — `payment_id`,
 * `status`, `email`, (and `license_key` when applicable). It does NOT send our
 * session id. The previous implementation only looked for `?session_id=`, which
 * never arrives, so a real payment always fell through to the generic
 * "we received your checkout" branch and the spot was never claimed from this
 * page — in development AND in production.
 *
 * We therefore resolve the order from, in order:
 *   1. `order_id`  — we put our own order id in the return_url, so this is the
 *      normal case and needs no provider call at all;
 *   2. `session_id` — kept for links created by an older build (stored as
 *      `external_payment_id` at checkout);
 *   3. the payment's `metadata.order_id` — set on the checkout session, so it
 *      survives even if the query string is rewritten.
 *
 * The redirect is NOT proof of payment (anyone can open this URL), so we ask
 * Dodo for the truth before claiming anything: `payment_id` → `payments.retrieve`
 * (or `session_id` → `checkoutSessions.retrieve`). Only a `succeeded` status
 * claims.
 *
 * This is what makes a paid spot render in LOCAL DEVELOPMENT: Dodo's servers
 * cannot reach `localhost` to deliver the webhook, so the webhook never fires —
 * but this call is outbound from the dev server, so it does work. In production
 * it is a backup for a missed/delayed webhook, and `fulfillPaidOrder` is
 * idempotent, so the two paths cannot double-claim.
 */
interface ProviderConfirmation {
  paymentId: string | null;
  /** Amount the provider reports as charged, in the smallest currency unit. */
  amountCents: number | null;
  currency: string | null;
  /** `metadata.order_id` from the payment, when the provider exposes it. */
  metadataOrderId: string | null;
}

function param(sp: SearchParams, ...names: string[]): string | null {
  for (const name of names) {
    const value = sp[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * Ask Dodo whether the reference in the return URL has been paid.
 * Returns null while it is still processing, and also when the provider or its
 * credentials are unavailable — the caller falls back to the webhook and the
 * page keeps polling. Provider/config failures never break the page.
 */
async function verifyReturnParams({
  paymentId,
  sessionId,
}: {
  paymentId: string | null;
  sessionId: string | null;
}): Promise<ProviderConfirmation | null> {
  if (!paymentId && !sessionId) return null;

  try {
    const client = getDodoClient();

    if (paymentId) {
      const payment = await client.payments.retrieve(paymentId);
      if (payment.status !== "succeeded") {
        console.log(
          `[checkout/success] payment ${paymentId} not succeeded yet (status=${payment.status ?? "null"})`
        );
        return null;
      }
      return {
        paymentId: payment.payment_id ?? paymentId,
        amountCents: payment.total_amount ?? null,
        currency: payment.currency ?? null,
        metadataOrderId:
          payment.metadata && payment.metadata.order_id !== undefined
            ? String(payment.metadata.order_id)
            : null,
      };
    }

    // Older links carry only the session id.
    const session = await client.checkoutSessions.retrieve(sessionId!);
    if (session.payment_status !== "succeeded") {
      console.log(
        `[checkout/success] session ${sessionId} not succeeded yet ` +
          `(payment_status=${session.payment_status ?? "null"})`
      );
      return null;
    }

    let amountCents: number | null = null;
    let currency: string | null = null;
    let metadataOrderId: string | null = null;
    if (session.payment_id) {
      const payment = await client.payments.retrieve(session.payment_id);
      amountCents = payment.total_amount ?? null;
      currency = payment.currency ?? null;
      metadataOrderId =
        payment.metadata && payment.metadata.order_id !== undefined
          ? String(payment.metadata.order_id)
          : null;
    }

    return {
      paymentId: session.payment_id ?? null,
      amountCents,
      currency,
      metadataOrderId,
    };
  } catch (err) {
    console.error(
      "[checkout/success] Dodo verification failed:",
      sanitizeErrorMessage(err)
    );
    return null;
  }
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sessionId = param(sp, "session_id", "sessionId");
  const paymentId = param(sp, "payment_id", "paymentId");
  const orderRef = param(sp, "order_id", "orderId");
  const providerStatus = param(sp, "status");

  const confirmation = await verifyReturnParams({ paymentId, sessionId });

  // Locate the order: our own id first, then the session id we stored, then the
  // provider's metadata mapping.
  let order: OrderRow | null = null;
  if (orderRef) order = await getOrderById(orderRef);
  if (!order && sessionId) order = await getOrderByExternalPaymentId(sessionId);
  if (!order && orderRef) order = await getOrderByExternalPaymentId(orderRef);
  if (!order && confirmation?.metadataOrderId) {
    order = await getOrderById(confirmation.metadataOrderId);
  }

  // Claim the spot when the provider confirms the charge and the order is not
  // already paid. Idempotent, so the webhook and this path cannot both claim.
  if (order && confirmation && order.status !== "paid") {
    const result = await fulfillPaidOrder({
      order,
      providerPaymentId: confirmation.paymentId,
      paidAmountCents: confirmation.amountCents,
      paidCurrency: confirmation.currency,
      source: "return_url",
    });
    console.log(
      `[checkout/success] order ${order.id} ${result.claimed ? "claimed" : `not claimed (${result.reason})`}` +
        `${providerStatus ? ` [provider status=${providerStatus}]` : ""}`
    );
    order = (await getOrderById(order.id)) ?? order;
  } else if (!order) {
    console.warn(
      `[checkout/success] could not resolve an order from the return URL ` +
        `(order_id=${orderRef ?? "-"} session_id=${sessionId ?? "-"} payment_id=${paymentId ?? "-"})`
    );
  }

  if (!order) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-amber-50 p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-2xl">
            ✓
          </div>
          <h1 className="font-serif text-2xl font-bold text-amber-100 mb-3">
            Thank you
          </h1>
          <p className="text-zinc-400 mb-8">
            We&rsquo;ve received your checkout. If your payment completed, your
            ad will appear on the avatar shortly.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-400 transition-colors"
          >
            ← Back to marketplace
          </Link>
        </div>
      </main>
    );
  }

  const zone = await getZoneById(order.zoneId);

  // STATUS IS INFORMATIONAL ONLY: the browser redirect is never proof of
  // payment. The spot is only claimed by a verified Dodo confirmation — either
  // the webhook or the session check above.
  const isPaid = order.status === "paid";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-amber-50 p-6">
      <PaymentStatusPoller active={!isPaid} />
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-2xl">
          ✓
        </div>
        <h1 className="font-serif text-2xl font-bold text-amber-100 mb-1">
          {isPaid ? "Payment confirmed" : "Payment processing"}
        </h1>
        <p className="text-sm text-zinc-500 mb-8">
          {isPaid
            ? "Your logo is now live on the avatar."
            : "We’re confirming your payment with Dodo — your spot will be claimed as soon as it clears. This page updates on its own."}
        </p>

        <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-6 text-left">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-zinc-500">Zone</dt>
            <dd className="text-zinc-100 font-medium">
              {zone?.label ?? order.zoneId}
            </dd>

            <dt className="text-zinc-500">Brand</dt>
            <dd className="text-zinc-100 font-medium">{order.brandName}</dd>

            <dt className="text-zinc-500">Amount paid</dt>
            <dd className="text-amber-300 font-semibold">
              {formatUSDFromCents(order.amountCents, order.currency)}
            </dd>
          </dl>
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-400 transition-colors"
        >
          ← Back to marketplace
        </Link>
      </div>
    </main>
  );
}