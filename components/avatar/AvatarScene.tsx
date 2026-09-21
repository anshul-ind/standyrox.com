"use client";

import { Suspense, useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import AvatarModel, { type ModelDimensions } from "./AvatarModel";
import DecalZone from "./DecalZone";
import { useTheme } from "@/lib/theme-context";
import { playSoundFX } from "@/components/ui/AudioController";

// Re-export ZoneData from ZoneRectangle so callers keep the same import path
export type { ZoneData } from "./ZoneRectangle";
import type { ZoneData } from "./ZoneRectangle";

import TunnelPortalBackground from "./TunnelPortalBackground";

// ─── Platform & Grounding constants ──────────────────────────────────────────
const PLATFORM_TOP_Y = 0.07;
// Single source of truth: Platform top (0.070) - feetY (-0.0071) + 0.010 clearance
export const AVATAR_GROUND_BASE_Y = 0.0871;

// ─── Arena Lighting (Theme-reactive) ──────────────────────────────────────────
function ArenaLighting() {
  const { colors } = useTheme();

  return (
    <>
      {/* Front Key Light from upper front */}
      <directionalLight
        position={[0.2, 4.2, 3.6]}
        intensity={2.6}
        color="#f0f7ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={25}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={5}
        shadow-camera-bottom={-2}
      />
      {/* Front Mid Fill */}
      <directionalLight position={[0, 1.5, 3.2]} intensity={0.8} color="#dbeafe" />

      {/* Front Lower Shoe / Floor Fill Light — balanced for white sneaker crispness */}
      <directionalLight position={[0, 0.45, 2.6]} intensity={0.65} color="#f0f9ff" />

      {/* Back Key Light — mirrored to provide equal lighting on rear view */}
      <directionalLight
        position={[-0.2, 4.0, -3.6]}
        intensity={2.4}
        color="#f0f7ff"
      />
      {/* Back Mid Fill */}
      <directionalLight position={[0, 1.5, -3.2]} intensity={0.75} color="#dbeafe" />

      {/* Back Lower Shoe / Floor Fill Light */}
      <directionalLight position={[0, 0.45, -2.6]} intensity={0.55} color="#f0f9ff" />

      {/* Dedicated Shoe / Foot Rim Point Lights — defines shoe profile and laces */}
      <pointLight position={[0, 0.28, 1.4]} color="#ffffff" intensity={0.70} distance={3.2} />
      <pointLight position={[0, 0.28, -1.4]} color="#ffffff" intensity={0.60} distance={3.2} />

      {/* Forward Floor Accent Light — produces the sleek forward cyber glow seen in Reference Image 2 */}
      <pointLight position={[0, 0.08, 0.55]} color={colors.primaryHex} intensity={0.9} distance={2.5} />

      {/* Room ambient light */}
      <ambientLight color="#0c1828" intensity={1.10} />

      {/* 360° Rim Point Lights (Theme-Reactive Neon) */}
      <pointLight position={[-3.2, 2.0, 0.2]} color={colors.primaryHex} intensity={2.0} distance={10} />
      <pointLight position={[3.2, 2.0, 0.2]} color={colors.primaryHex} intensity={2.0} distance={10} />
      <pointLight position={[-2.4, 2.2, -2.4]} color={colors.primaryHex} intensity={1.6} distance={8} />
      <pointLight position={[2.4, 2.2, -2.4]} color={colors.primaryHex} intensity={1.6} distance={8} />

      {/* Platform ground under-glow — positioned at podium base */}
      <pointLight position={[0, 0.015, 0]} color={colors.primaryHex} intensity={0.8} distance={2.2} />
    </>
  );
}

// ─── Sleek Platform Ring (Theme-reactive — Matching Reference Image 2) ────────
function ArenaPlatform() {
  const { colors } = useTheme();

  return (
    <group>
      {/* Base cylinder — center at Y=0.035, top at Y=0.07, radius 1.22m (Sleek dark metallic cyber finish) */}
      <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.22, 1.25, 0.07, 64]} />
        <meshStandardMaterial color="#06101e" metalness={0.42} roughness={0.40} />
      </mesh>

      {/* Outer bright edge ring (Theme Colored) */}
      <mesh position={[0, PLATFORM_TOP_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.23, 0.012, 8, 64]} />
        <meshBasicMaterial color={colors.primaryHex} />
      </mesh>
    </group>
  );
}

// ─── Floating Avatar + Parented DecalZones ────────────────────────────────────
function FloatingAvatarGroup({
  zones,
  onSelectZone,
  showDebugLabel,
  onDimensionsMeasured,
  onBaseYReady,
}: {
  zones: ZoneData[];
  onSelectZone: (zoneId: string) => void;
  showDebugLabel?: boolean;
  onDimensionsMeasured?: (dims: ModelDimensions) => void;
  onBaseYReady?: (baseY: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [avatarScene, setAvatarScene] = useState<THREE.Group | null>(null);

  // Deterministic ground elevation: single source of truth across all refreshes
  const baseY = AVATAR_GROUND_BASE_Y;

  // Compute groupWorldMatrix deterministically as a pure translation.
  // The avatar group never rotates or scales, so its world matrix is completely
  // constant. This eliminates any frame settle delay, race condition, or async
  // state update across page loads, refreshes, and texture suspense events.
  const groupWorldMatrix = useMemo(
    () => new THREE.Matrix4().makeTranslation(0, baseY, 0),
    [baseY]
  );

  const handleMeasured = useCallback(
    (dims: ModelDimensions) => {
      onDimensionsMeasured?.(dims);
    },
    [onDimensionsMeasured]
  );

  const handleSceneReady = useCallback((scene: THREE.Group) => {
    setAvatarScene(scene);
  }, []);

  useEffect(() => {
    onBaseYReady?.(baseY);
  }, [baseY, onBaseYReady]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.y = baseY;
  });

  return (
    <>
      {/* Avatar body — positioned at baseY on the platform */}
      <group ref={groupRef} position={[0, baseY, 0]}>
        <AvatarModel
          onDimensionsMeasured={handleMeasured}
          onSceneReady={handleSceneReady}
        />
      </group>

      {/* DecalZones are siblings at scene root — their geometry is baked in WORLD
          space (using worldPoint from the SkinnedMesh raycast), so they must NOT
          be children of the avatar group or they would be double-offset by baseY. */}
      {zones.map((zone) => (
        <DecalZone
          key={zone.id}
          zone={zone}
          avatarScene={avatarScene}
          groupWorldMatrix={groupWorldMatrix}
          onSelect={onSelectZone}
          showDebugLabel={showDebugLabel}
        />
      ))}
    </>
  );
}

// ─── Scene Camera Controls (Horizontal-Only + Spot Focus Zoom) ────────────────
function SceneCameraControls({
  selectedZone,
  baseY,
}: {
  selectedZone: ZoneData | null;
  baseY: number;
}) {
  const controlsRef = useRef<any>(null);
  const { size } = useThree();

  const aspect = size.width / Math.max(1, size.height);
  const portraitScale = aspect < 0.85 ? Math.max(1.0, 0.85 / aspect) : 1.0;
  const defaultDist = +(3.95 * portraitScale).toFixed(2);

  // Target values for smooth interpolation (Y = 1.02 perfectly centers the full avatar body & platform)
  const targetLookAt = useRef(new THREE.Vector3(0, 1.02, 0));
  const targetCamPos = useRef(new THREE.Vector3(0, 1.02, defaultDist));
  const isTransitioningRef = useRef(false);
  const isInitialMountRef = useRef(true);
  const prevSelectedZoneIdRef = useRef<string | null>(null);

  // Default camera setup on initial load
  useEffect(() => {
    if (controlsRef.current && isInitialMountRef.current) {
      isInitialMountRef.current = false;
      const controls = controlsRef.current;
      controls.object.position.set(0, 1.02, defaultDist);
      controls.target.set(0, 1.02, 0);
      controls.update();
    }
  }, [defaultDist]);

  // Update desired camera focus only when selectedZone actually changes
  useEffect(() => {
    const prevId = prevSelectedZoneIdRef.current;
    const currentId = selectedZone ? selectedZone.id : null;

    if (currentId === prevId) {
      // No change in selected zone (e.g. background baseY/logo updates), do not interrupt rotation
      return;
    }
    prevSelectedZoneIdRef.current = currentId;

    if (selectedZone) {
      isTransitioningRef.current = true;
      playSoundFX("focus");

      // World position of the zone
      const anchor = selectedZone.anchor;
      const normal = selectedZone.normal ?? { x: 0, y: 0, z: 1 };
      const normVec = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
      if (normVec.lengthSq() < 1e-4) normVec.set(0, 0, 1);

      // Target to look at: exact spot center in world space
      const spotWorldPos = new THREE.Vector3(anchor.x, anchor.y + baseY, anchor.z);
      targetLookAt.current.copy(spotWorldPos);

      // Focus distance (comfortably zoomed in on the spot)
      const focusDistance = 1.75;
      const desiredCameraPos = spotWorldPos.clone().addScaledVector(normVec, focusDistance);

      // Ensure camera maintains standard eye-level elevation relative to spot
      desiredCameraPos.y = spotWorldPos.y + 0.05;
      targetCamPos.current.copy(desiredCameraPos);
    } else if (prevId !== null) {
      // Returning to full body overview ONLY if a zone was actively selected before:
      // Preserve current horizontal angle and smoothly zoom out along the current angle
      if (controlsRef.current) {
        const controls = controlsRef.current;
        const currentCam = controls.object.position as THREE.Vector3;
        const center = new THREE.Vector3(0, 1.02, 0);

        // Direction vector in the horizontal X-Z plane
        const dir = new THREE.Vector3(currentCam.x - center.x, 0, currentCam.z - center.z);
        if (dir.lengthSq() < 1e-4) {
          dir.set(0, 0, 1);
        } else {
          dir.normalize();
        }

        // Smooth target position keeping current viewing angle at full-body overview distance
        targetLookAt.current.set(0, 1.02, 0);
        targetCamPos.current.set(
          dir.x * defaultDist,
          1.02,
          dir.z * defaultDist
        );
        isTransitioningRef.current = true;
      }
    }
  }, [selectedZone, baseY, defaultDist]);

  // Smooth camera frame interpolation (damped lerp) and per-frame auto-rotation update
  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    if (isTransitioningRef.current) {
      const lerpFactor = Math.min(1, delta * 5.0);

      controls.target.lerp(targetLookAt.current, lerpFactor);
      controls.object.position.lerp(targetCamPos.current, lerpFactor);
      controls.update();

      // Check if settled
      if (
        controls.target.distanceTo(targetLookAt.current) < 0.005 &&
        controls.object.position.distanceTo(targetCamPos.current) < 0.005
      ) {
        controls.target.copy(targetLookAt.current);
        controls.object.position.copy(targetCamPos.current);
        controls.update();
        isTransitioningRef.current = false;
      }
    } else {
      // Continuous update ensures autoRotate spins automatically right on application load without clicks
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 1.02, 0]}
      // Pure horizontal rotation in 2D plane: lock polar angle to horizontal
      minPolarAngle={Math.PI / 2}
      maxPolarAngle={Math.PI / 2}
      minAzimuthAngle={-Infinity}
      maxAzimuthAngle={Infinity}
      minDistance={1.3}
      maxDistance={4.8}
      enablePan={false}
      enableZoom={true}
      autoRotate={!selectedZone}
      autoRotateSpeed={-0.45}
      dampingFactor={0.07}
      onStart={() => {
        // User manual drag takes immediate priority over automatic transition
        isTransitioningRef.current = false;
      }}
      makeDefault
    />
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────────────
export default function AvatarScene({
  zones,
  onSelectZone,
  selectedZone = null,
  showDebugLabel = false,
  onDimensionsMeasured,
}: {
  zones: ZoneData[];
  onSelectZone: (zoneId: string) => void;
  selectedZone?: ZoneData | null;
  showDebugLabel?: boolean;
  onDimensionsMeasured?: (dims: ModelDimensions) => void;
}) {
  const { colors } = useTheme();
  const [baseY, setBaseY] = useState(AVATAR_GROUND_BASE_Y);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.02, 3.95], fov: 40, near: 0.1, far: 120 }}
      className="h-full w-full"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[colors.bgDark]} />

      <TunnelPortalBackground />
      <ArenaLighting />
      <ArenaPlatform />

      <Suspense fallback={null}>
        <FloatingAvatarGroup
          zones={zones}
          onSelectZone={onSelectZone}
          showDebugLabel={showDebugLabel}
          onDimensionsMeasured={onDimensionsMeasured}
          onBaseYReady={setBaseY}
        />
      </Suspense>

      <SceneCameraControls selectedZone={selectedZone} baseY={baseY} />
    </Canvas>
  );
}
