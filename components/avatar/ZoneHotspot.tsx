"use client";

import { Html } from "@react-three/drei";

import { formatUSDFromCents } from "@/lib/format";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ZonePlacement {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  endsAt: string | null;
}

export interface ZoneData {
  id: string;
  key: string;
  label: string;
  anchor: { x: number; y: number; z: number };
  size: { width: number; height: number };
  tier: string;
  basePriceCents: number;
  status: string;
  viewCount: number;
  placement: ZonePlacement | null;
}

// ─── Tier visual config ──────────────────────────────────────────────────────
const TIER_CONFIG: Record<
  string,
  { size: string; glow: string; ringColor: string; label: string }
> = {
  signature: {
    size: "w-10 h-10",
    glow: "shadow-[0_0_18px_4px_rgba(251,191,36,0.5)]",
    ringColor: "border-amber-300",
    label: "★ Signature",
  },
  prime: {
    size: "w-9 h-9",
    glow: "shadow-[0_0_14px_3px_rgba(251,191,36,0.35)]",
    ringColor: "border-amber-400",
    label: "◆ Prime",
  },
  featured: {
    size: "w-8 h-8",
    glow: "shadow-[0_0_10px_2px_rgba(161,161,170,0.3)]",
    ringColor: "border-zinc-400",
    label: "● Featured",
  },
  standard: {
    size: "w-6 h-6",
    glow: "",
    ringColor: "border-zinc-500",
    label: "○ Standard",
  },
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function ZoneHotspot({
  zone,
  onSelect,
  showDebugLabel = false,
}: {
  zone: ZoneData;
  onSelect: (zoneId: string) => void;
  showDebugLabel?: boolean;
}) {
  const tier = TIER_CONFIG[zone.tier] ?? TIER_CONFIG.standard;
  const isOccupied = zone.status === "occupied" && zone.placement;

  return (
    <Html
      position={[zone.anchor.x, zone.anchor.y, zone.anchor.z]}
      center
      distanceFactor={3}
      style={{ pointerEvents: "auto" }}
    >
      <button
        type="button"
        onClick={() => onSelect(zone.id)}
        className={`
          relative flex items-center justify-center rounded-full
          border-2 ${tier.ringColor} ${tier.size}
          transition-all duration-200 cursor-pointer
          hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white
          ${isOccupied ? "bg-amber-500/90" : "bg-zinc-800/80"}
          ${!isOccupied ? tier.glow : ""}
        `}
        title={`${zone.label} — ${zone.tier} — ${formatUSDFromCents(zone.basePriceCents)}`}
      >
        {isOccupied && zone.placement?.brandLogoUrl ? (
          <img
            src={zone.placement.brandLogoUrl}
            alt={zone.placement.brandName}
            className="w-full h-full rounded-full object-cover"
          />
        ) : isOccupied ? (
          <span className="text-[10px] font-bold text-amber-950">
            {zone.placement?.brandName?.charAt(0) ?? "?"}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-zinc-300">
            {zone.tier === "signature" ? "★" : zone.tier === "prime" ? "◆" : zone.tier === "featured" ? "●" : "○"}
          </span>
        )}

        {/* Pulsing ring for available zones */}
        {!isOccupied && (
          <span
            className={`
              absolute inset-0 rounded-full border ${tier.ringColor}
              animate-ping opacity-30
            `}
          />
        )}
      </button>

      {/* Debug label */}
      {showDebugLabel && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-black/90 text-white text-[9px] font-mono rounded whitespace-nowrap pointer-events-none">
          {zone.key} [{zone.anchor.x.toFixed(2)}, {zone.anchor.y.toFixed(2)}, {zone.anchor.z.toFixed(2)}]
        </div>
      )}

      {/* Hover label */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-zinc-900/95 border border-white/10 text-white text-[10px] font-mono rounded whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
        {zone.label}
      </div>
    </Html>
  );
}
