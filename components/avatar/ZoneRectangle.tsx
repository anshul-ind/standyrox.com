"use client";

import { useMemo, useState, useRef } from "react";
import * as THREE from "three";
import { Html, useTexture } from "@react-three/drei";
import { formatUSDFromCents } from "@/lib/format";

export interface ZonePlacement {
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
  displayOrder: number;
  tier: string;
  basePriceCents: number;
  status: string;
  viewCount: number;
  placement: ZonePlacement | null;
  normal?: { x: number; y: number; z: number };
}

// Tier visual styles — matching reference image 2 coloring (vivid opaque patches)
const TIER_COLORS: Record<
  string,
  { fillHex: number; borderHex: number; emissiveHex: number; scale: number }
> = {
  signature: {
    fillHex: 0xffc107,   // gold
    borderHex: 0xffe57a,
    emissiveHex: 0x7a4400,
    scale: 1.2,
  },
  prime: {
    fillHex: 0x00b4d8,   // cyan-blue
    borderHex: 0x90e0ef,
    emissiveHex: 0x003244,
    scale: 1.0,
  },
  featured: {
    fillHex: 0x4cc9f0,
    borderHex: 0xa8dadc,
    emissiveHex: 0x003244,
    scale: 1.0,
  },
  standard: {
    fillHex: 0x7209b7,   // purple
    borderHex: 0xb5179e,
    emissiveHex: 0x1a0030,
    scale: 0.85,
  },
};

function LogoPlane({ url, width, height }: { url: string; width: number; height: number }) {
  const texture = useTexture(url);
  return (
    <mesh position={[0, 0, 0.002]}>
      <planeGeometry args={[width * 0.85, height * 0.85]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function ZoneRectangle({
  zone,
  onSelect,
  showDebugLabel = false,
}: {
  zone: ZoneData;
  onSelect: (zoneId: string) => void;
  showDebugLabel?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  const tier = TIER_COLORS[zone.tier] ?? TIER_COLORS.standard;
  const isOccupied = zone.status === "occupied" && zone.placement;

  const w = zone.size.width || 0.16;
  const h = zone.size.height || 0.16;

  const planeGeo = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(planeGeo), [planeGeo]);

  // Rotation: back-facing zones flip 180°, side zones angle slightly
  const rotation = useMemo<[number, number, number]>(() => {
    if (zone.anchor.z < -0.05 || zone.key === "back_upper") return [0, Math.PI, 0];
    if (zone.anchor.x > 0.25) return [0, Math.PI * 0.18, 0];
    if (zone.anchor.x < -0.25) return [0, -Math.PI * 0.18, 0];
    return [0, 0, 0];
  }, [zone.anchor.x, zone.anchor.z, zone.key]);

  const fillColor = isOccupied ? 0x22c55e : tier.fillHex;
  const borderColor = isOccupied ? 0x4ade80 : tier.borderHex;
  // Opaque sticker fill: ~0.70 base, brighter on hover
  const fillOpacity = hovered ? 0.88 : isOccupied ? 0.80 : 0.68;
  const scale = (hovered ? 1.06 : 1.0) * tier.scale;

  return (
    <group
      ref={groupRef}
      position={[zone.anchor.x, zone.anchor.y, zone.anchor.z]}
      rotation={rotation}
      scale={[scale, scale, scale]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(zone.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
    >
      {/* Solid sticker fill — emissive so it glows in dark environment */}
      <mesh geometry={planeGeo}>
        <meshStandardMaterial
          color={fillColor}
          emissive={isOccupied ? 0x113300 : tier.emissiveHex}
          emissiveIntensity={hovered ? 0.9 : 0.5}
          transparent
          opacity={fillOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Bright glowing border */}
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color={borderColor} />
      </lineSegments>

      {/* Occupied: brand logo on top */}
      {isOccupied && zone.placement?.brandLogoUrl && (
        <LogoPlane url={zone.placement.brandLogoUrl} width={w} height={h} />
      )}

      {/* Debug coordinate label — only visible when showDebugLabel is ON */}
      {showDebugLabel && (
        <Html
          center
          distanceFactor={3.5}
          position={[0, h * 0.55 + 0.03, 0.02]}
          style={{ pointerEvents: "none" }}
        >
          <div className="flex flex-col items-center gap-0.5 whitespace-nowrap select-none">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium shadow-lg bg-zinc-900/95 text-amber-200 border border-amber-400/40">
              {isOccupied
                ? `${zone.label} · ${zone.placement?.brandName}`
                : `${zone.label} · ${formatUSDFromCents(zone.basePriceCents)}`}
            </span>
            <span className="bg-black/90 text-zinc-400 text-[9px] font-mono px-1 rounded border border-white/10">
              [{zone.anchor.x.toFixed(2)}, {zone.anchor.y.toFixed(2)}, {zone.anchor.z.toFixed(2)}]
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

