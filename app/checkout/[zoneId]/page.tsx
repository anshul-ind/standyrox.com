import { notFound } from "next/navigation";

import { getZoneById } from "@/lib/services/zone.service";
import { formatUSDFromCents } from "@/lib/format";
import LogoUploadForm from "@/components/checkout/LogoUploadForm";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ zoneId: string }>;
}) {
  const { zoneId } = await params;

  const zone = await getZoneById(zoneId);

  if (!zone) {
    notFound();
  }

  if (zone.status !== "available") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-amber-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-2xl font-bold text-amber-100 mb-4">
            Zone No Longer Available
          </h1>
          <p className="text-zinc-400 mb-6">
            The &ldquo;{zone.label}&rdquo; zone ({zone.tier}) is currently{" "}
            <span className="text-amber-400">{zone.status}</span> and cannot be
            claimed right now.
          </p>
          <a
            href="/"
            className="inline-flex items-center rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
          >
            ← Back to marketplace
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-amber-50">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <a
          href="/"
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back to marketplace
        </a>
      </header>

      <div className="flex flex-1 items-start justify-center p-6 pt-12">
        <div className="w-full max-w-lg">
          {/* Zone summary */}
          <div className="mb-8 rounded-xl border border-white/10 bg-zinc-900/60 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="font-serif text-2xl font-bold text-amber-100">
                  {zone.label}
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {zone.key} · {zone.tier}
                </p>
              </div>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                {zone.tier.charAt(0).toUpperCase() + zone.tier.slice(1)}
              </span>
            </div>

            <div className="border-t border-white/10 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-400">Price</span>
                <span className="text-2xl font-serif font-bold text-amber-100">
                  {formatUSDFromCents(zone.basePriceCents)}
                </span>
              </div>
              <p className="mt-1 text-right text-xs text-zinc-500">
                per 30-day placement
              </p>
            </div>
          </div>

          {/* Upload form */}
          <LogoUploadForm zoneId={zone.id} />
        </div>
      </div>
    </main>
  );
}
