import Link from "next/link";

import { formatUSDFromCents } from "@/lib/format";
import { getOrderByExternalPaymentId, getOrderById, type OrderRow } from "@/lib/services/order.service";
import { getZoneById } from "@/lib/services/zone.service";

interface SearchParams {
  [key: string]: string | string[] | undefined;
}

/**
 * Success page shown after Dodo redirects the buyer back with `?session_id=...`.
 * We look the order up by the Dodo session id (stored as external_payment_id at
 * checkout) — a reference we control — and show only user-facing details.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;
  const orderRef = typeof sp.order_id === "string" ? sp.order_id : null;

  let order: OrderRow | null = null;
  if (sessionId) order = await getOrderByExternalPaymentId(sessionId);
  if (!order && orderRef) order = await getOrderById(orderRef);
  if (!order && orderRef) order = await getOrderByExternalPaymentId(orderRef);

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-amber-50 p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-2xl">
          ✓
        </div>
        <h1 className="font-serif text-2xl font-bold text-amber-100 mb-1">
          Payment received
        </h1>
        <p className="text-sm text-zinc-500 mb-8">
          Your ad placement is being activated.
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