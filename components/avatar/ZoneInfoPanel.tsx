"use client";

import Link from "next/link";

import { formatUSDFromCents } from "@/lib/format";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ZonePlacement {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  endsAt: string | null;
}

export interface ZoneDetail {
  id: string;
  key: string;
  label: string;
  anchor: { x: number; y: number; z: number };
  size: { width: number; height: number };
  displayOrder: number;
  tier: string;
  basePriceCents: number;
  status: string;
  viewCount: number;
  placement: ZonePlacement | null;
}

// ─── Tier badge styling ──────────────────────────────────────────────────────
const TIER_BADGE: Record<string, { className: string; icon: string }> = {
  signature: {
    className: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    icon: "★",
  },
  prime: {
    className: "bg-amber-600/15 text-amber-400 border-amber-600/30",
    icon: "◆",
  },
  featured: {
    className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    icon: "●",
  },
  standard: {
    className: "bg-zinc-600/10 text-zinc-400 border-zinc-600/20",
    icon: "○",
  },
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function ZoneInfoPanel({
  zone,
  onClose,
}: {
  zone: ZoneDetail | null;
  onClose: () => void;
}) {
  if (!zone) return null;

  const tier = TIER_BADGE[zone.tier] ?? TIER_BADGE.standard;
  const isOccupied = zone.status === "occupied" && zone.placement;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative ml-auto flex w-full max-w-sm flex-col border-l border-white/10 bg-zinc-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-amber-50">
            Spot {zone.displayOrder}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Tier badge */}
          <div className="mb-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tier.className}`}
            >
              {tier.icon} {zone.tier.charAt(0).toUpperCase() + zone.tier.slice(1)}
            </span>
          </div>

          {isOccupied && zone.placement ? (
            /* ── Occupied zone ── */
            <div className="flex flex-col gap-4">
              {/* Unambiguous Occupied Banner */}
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
                <span className="block font-mono text-xs font-bold uppercase tracking-wider text-red-400">
                  🔒 Spot Currently Taken
                </span>
                <p className="mt-1 text-[11px] text-zinc-400">
                  This position is actively claimed and unavailable for purchase.
                </p>
              </div>

              {/* Brand logo */}
              {zone.placement.brandLogoUrl && (
                <div className="flex justify-center my-1">
                  <img
                    src={zone.placement.brandLogoUrl}
                    alt={zone.placement.brandName}
                    className="h-16 w-16 rounded-xl object-contain border border-white/10 shadow-lg"
                  />
                </div>
              )}

              {/* Brand info */}
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm bg-zinc-950/40 rounded-lg p-3 border border-white/5">
                <span className="text-zinc-500">Brand</span>
                <span className="text-zinc-100 font-semibold">
                  {zone.placement.brandName}
                </span>

                {zone.placement.brandUrl && (
                  <>
                    <span className="text-zinc-500">Website</span>
                    <a
                      href={zone.placement.brandUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline truncate"
                    >
                      {zone.placement.brandUrl}
                    </a>
                  </>
                )}

                {zone.placement.endsAt && (
                  <>
                    <span className="text-zinc-500">Placement Ends</span>
                    <span className="text-zinc-300 font-mono text-xs">
                      {new Date(zone.placement.endsAt).toLocaleDateString()}
                    </span>
                  </>
                )}

                <span className="text-zinc-500">Impressions</span>
                <span className="text-zinc-300 font-mono">
                  {zone.viewCount.toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            /* ── Available zone ── */
            <div className="flex flex-col gap-4">
              {/* Price */}
              <div className="text-center">
                <span className="text-3xl font-serif font-bold text-amber-100">
                  {formatUSDFromCents(zone.basePriceCents)}
                </span>
                <span className="block mt-1 text-xs text-zinc-500">
                  per 30-day placement
                </span>
              </div>

              {/* Zone details */}
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <span className="text-zinc-500">Zone</span>
                <span className="text-zinc-100">Spot {zone.displayOrder}</span>

                <span className="text-zinc-500">Status</span>
                <span className="text-green-400 capitalize">{zone.status}</span>

                <span className="text-zinc-500">Views</span>
                <span className="text-zinc-300 font-mono">
                  {zone.viewCount.toLocaleString()}
                </span>
              </div>

              {/* Claim button */}
              <Link
                href={`/checkout/${zone.id}`}
                className="flex items-center justify-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400"
              >
                Claim this spot
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
