"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import AvatarModel from "./AvatarModel";
import ZoneHotspot from "./ZoneHotspot";
import type { ZoneData } from "./ZoneHotspot";

// Re-export ZoneData so consumers don't need a second import
export type { ZoneData } from "./ZoneHotspot";

// ─── Camera defaults ─────────────────────────────────────────────────────────
const CAMERA_POS: [number, number, number] = [0, 1.4, 3];
const CAMERA_FOV = 40;

// ─── Lighting (reused from old NoteStage.tsx) ────────────────────────────────
function Lights() {
  return (
    <>
      {/* Ambient — dim warm studio fill */}
      <ambientLight intensity={0.22} color="#ffe8c0" />
      {/* Key — cool white from top-left */}
      <directionalLight
        position={[-2.8, 4.5, 2.5]}
        intensity={1.7}
        color="#dce8ff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      {/* Gold rim — back-right */}
      <directionalLight
        position={[3.5, 1.2, -3.5]}
        intensity={2.4}
        color="#ffd060"
      />
      {/* Warm fill from below-front */}
      <pointLight position={[0, -1.5, 1.5]} intensity={0.35} color="#2a4a20" />
    </>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────────
export default function AvatarScene({
  zones,
  onSelectZone,
  showDebugLabel = false,
}: {
  zones: ZoneData[];
  onSelectZone: (zoneId: string) => void;
  showDebugLabel?: boolean;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: CAMERA_POS, fov: CAMERA_FOV }}
      className="h-full w-full"
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <Lights />

      <Suspense fallback={null}>
        <AvatarModel position={[0, 0, 0]} scale={1} />

        {/* Zone hotspots */}
        {zones.map((zone) => (
          <ZoneHotspot
            key={zone.id}
            zone={zone}
            onSelect={onSelectZone}
            showDebugLabel={showDebugLabel}
          />
        ))}
      </Suspense>

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
        enableZoom
        minDistance={1.5}
        maxDistance={8}
        enablePan={false}
        target={[0, 1, 0]}
        makeDefault
      />
    </Canvas>
  );
}
