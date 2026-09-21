"use client";

import React from "react";
import { useTheme } from "@/lib/theme-context";
import { playSoundFX } from "@/components/ui/AudioController";

interface BrandPlacement {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  endsAt: string | null;
}

export interface BrandSpotData {
  id: string;
  key: string;
  label: string;
  displayOrder: number;
  tier: string;
  viewCount: number;
  placement: BrandPlacement;
}

export default function BrandSpotCard({
  spot,
  onClose,
}: {
  spot: BrandSpotData;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const isRed = theme === "red";

  const handleClose = () => {
    playSoundFX("close");
    onClose();
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
      {/* Glassmorphism Container */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl shadow-2xl transition-all duration-300 w-80 md:w-96 ${
          isRed
            ? "border-rose-500/40 bg-rose-950/25 shadow-[0_0_35px_rgba(255,42,85,0.2)] text-rose-50"
            : "border-cyan-400/40 bg-cyan-950/25 shadow-[0_0_35px_rgba(0,212,255,0.2)] text-cyan-50"
        }`}
        style={{
          background: isRed
            ? "linear-gradient(135deg, rgba(35, 8, 14, 0.65) 0%, rgba(15, 3, 6, 0.85) 100%)"
            : "linear-gradient(135deg, rgba(8, 26, 45, 0.65) 0%, rgba(4, 12, 22, 0.85) 100%)",
        }}
      >
        {/* Subtle Ambient Radial Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full blur-3xl opacity-50"
          style={{
            background: isRed ? "#ff2a55" : "#00d4ff",
          }}
        />

        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-2 w-2 rounded-full animate-ping ${
                isRed ? "bg-rose-400" : "bg-cyan-400"
              }`}
            />
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
                isRed ? "text-rose-400" : "text-cyan-400"
              }`}
            >
              Spot {spot.displayOrder} · {spot.label}
            </span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs text-zinc-400 hover:border-white/30 hover:bg-white/10 hover:text-white transition-all"
            title="Close Brand Card"
          >
            ✕
          </button>
        </div>

        {/* Main Brand Profile */}
        <div className="mt-4 flex items-center gap-4">
          {spot.placement.brandLogoUrl ? (
            <div className="relative flex-shrink-0">
              <img
                src={spot.placement.brandLogoUrl}
                alt={spot.placement.brandName}
                className={`h-16 w-16 rounded-xl object-contain border p-1 shadow-md ${
                  isRed
                    ? "border-rose-500/30 bg-black/60 shadow-[0_0_15px_rgba(255,42,85,0.2)]"
                    : "border-cyan-400/30 bg-black/60 shadow-[0_0_15px_rgba(0,212,255,0.2)]"
                }`}
              />
              <span
                className={`absolute -bottom-1 -right-1 rounded-full p-0.5 text-[9px] ${
                  isRed ? "bg-rose-500 text-white" : "bg-cyan-400 text-black"
                }`}
                title="Verified Sponsor"
              >
                ✓
              </span>
            </div>
          ) : (
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 font-bold text-lg text-zinc-300">
              {spot.placement.brandName.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-serif text-lg font-bold text-white">
                {spot.placement.brandName}
              </h3>
            </div>

            <span
              className={`inline-block mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-mono uppercase font-medium border ${
                isRed
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
              }`}
            >
              {spot.tier} Partner
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-white/5 bg-black/30 p-2.5 font-mono text-xs">
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Impressions</span>
            <span className={`text-sm font-bold ${isRed ? "text-rose-300" : "text-cyan-300"}`}>
              {spot.viewCount.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Campaign Status</span>
            <span className="text-sm font-bold text-green-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Active
            </span>
          </div>
        </div>

        {/* Action Link / Website */}
        {spot.placement.brandUrl && (
          <div className="mt-4">
            <a
              href={spot.placement.brandUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 w-full rounded-xl py-2.5 px-4 font-mono text-xs font-semibold transition-all duration-300 ${
                isRed
                  ? "bg-rose-500 text-white hover:bg-rose-400 shadow-[0_0_20px_rgba(255,42,85,0.4)]"
                  : "bg-cyan-400 text-black hover:bg-cyan-300 shadow-[0_0_20px_rgba(0,212,255,0.4)]"
              }`}
            >
              <span>Visit Official Website</span>
              <span className="text-xs">↗</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
