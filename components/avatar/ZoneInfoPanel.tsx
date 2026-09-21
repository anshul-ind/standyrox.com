"use client";

import React from "react";
import Link from "next/link";
import { formatUSDFromCents } from "@/lib/format";
import { useTheme } from "@/lib/theme-context";
import { playSoundFX } from "@/components/ui/AudioController";
import BrandSpotCard from "./BrandSpotCard";

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
  const { theme } = useTheme();
  if (!zone) return null;

  const isRed = theme === "red";
  const tier = TIER_BADGE[zone.tier] ?? TIER_BADGE.standard;
  const isOccupied = zone.status === "occupied" && zone.placement;

  const handleClose = () => {
    playSoundFX("close");
    onClose();
  };

  // For occupied spots, show the dedicated floating Brand Glass Card
  if (isOccupied && zone.placement) {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center p-4">
        <BrandSpotCard
          spot={{
            id: zone.id,
            key: zone.key,
            label: zone.label,
            displayOrder: zone.displayOrder,
            tier: zone.tier,
            viewCount: zone.viewCount,
            placement: zone.placement,
          }}
          onClose={handleClose}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`relative ml-auto flex w-full max-w-sm flex-col border-l shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          isRed
            ? "border-rose-500/30 bg-[#120407]/90 text-rose-50"
            : "border-cyan-500/30 bg-[#06101e]/90 text-cyan-50"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isRed ? "bg-rose-400 animate-ping" : "bg-cyan-400 animate-ping"
              }`}
            />
            <h2 className="font-serif text-lg font-semibold text-white">
              Spot {zone.displayOrder} · {zone.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
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
              {tier.icon} {zone.tier.charAt(0).toUpperCase() + zone.tier.slice(1)} Tier
            </span>
          </div>

          {/* Available zone */}
          <div className="flex flex-col gap-4">
            {/* Price */}
            <div
              className={`rounded-xl border p-4 text-center ${
                isRed
                  ? "border-rose-500/20 bg-rose-950/20"
                  : "border-cyan-500/20 bg-cyan-950/20"
              }`}
            >
              <span className="text-3xl font-serif font-bold text-white">
                {formatUSDFromCents(zone.basePriceCents)}
              </span>
              <span className="block mt-1 text-xs text-zinc-400 font-mono">
                per 30-day placement
              </span>
            </div>

            {/* Zone details */}
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm bg-black/40 rounded-xl p-3.5 border border-white/5 font-mono">
              <span className="text-zinc-500">Location</span>
              <span className="text-zinc-200">{zone.label}</span>

              <span className="text-zinc-500">Status</span>
              <span className="text-green-400 font-semibold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" /> Available
              </span>

              <span className="text-zinc-500">Views</span>
              <span className="text-zinc-300">
                {zone.viewCount.toLocaleString()}
              </span>
            </div>

            {/* Claim CTA Button */}
            <Link
              href={`/checkout/${zone.id}`}
              className={`flex items-center justify-center rounded-xl py-3 px-4 font-mono text-sm font-bold tracking-wider transition-all duration-300 uppercase shadow-lg ${
                isRed
                  ? "bg-rose-500 text-white hover:bg-rose-400 shadow-[0_0_25px_rgba(255,42,85,0.4)]"
                  : "bg-cyan-400 text-black hover:bg-cyan-300 shadow-[0_0_25px_rgba(0,212,255,0.4)]"
              }`}
            >
              Claim This Spot
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
