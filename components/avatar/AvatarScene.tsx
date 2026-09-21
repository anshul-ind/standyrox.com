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

// ─── Platform constants ────────────────────────────────────────────────────────
const PLATFORM_TOP_Y = 0.102;

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
      {/* Front Lower Fill */}
      <directionalLight position={[0, 0.2, 3.2]} intensity={0.65} color="#dbeafe" />

      {/* Back Key Light — mirrored to provide equal lighting on rear view */}
      <directionalLight
        position={[-0.2, 4.0, -3.6]}
        intensity={2.4}
        color="#f0f7ff"
      />
      {/* Back Lower Fill */}
      <directionalLight position={[0, 0.2, -3.2]} intensity={0.65} color="#dbeafe" />

      {/* Room ambient light */}
      <ambientLight color="#0c1828" intensity={1.35} />

      {/* 360° Rim Point Lights (Theme-Reactive Neon) */}
      <pointLight position={[-3.2, 2.0, 0.2]} color={colors.primaryHex} intensity={2.0} distance={10} />
      <pointLight position={[3.2, 2.0, 0.2]} color={colors.primaryHex} intensity={2.0} distance={10} />
      <pointLight position={[-2.4, 2.2, -2.4]} color={colors.primaryHex} intensity={1.6} distance={8} />
      <pointLight position={[2.4, 2.2, -2.4]} color={colors.primaryHex} intensity={1.6} distance={8} />

      {/* Platform ground under-glow */}
      <pointLight position={[0, 0.18, 0]} color={colors.primaryHex} intensity={0.65} distance={2.0} />
    </>
  );
}

// ─── Sleek Platform Ring (Theme-reactive) ─────────────────────────────────────
function ArenaPlatform() {
  const { theme, colors } = useTheme();
  const isRed = theme === "red";

  const glowTex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    if (isRed) {
      grad.addColorStop(0, "rgba(255,42,85,0.45)");
      grad.addColorStop(0.45, "rgba(220,20,60,0.20)");
      grad.addColorStop(0.8, "rgba(180,10,30,0.06)");
    } else {
      grad.addColorStop(0, "rgba(0,210,255,0.45)");
      grad.addColorStop(0.45, "rgba(0,140,240,0.20)");
      grad.addColorStop(0.8, "rgba(0,60,180,0.06)");
    }
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  }, [isRed]);

  return (
    <group>
      {/* Base disc — center at Y=0.05, top at Y=0.10, radius 1.25m */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.25, 1.28, 0.10, 64]} />
        <meshStandardMaterial color="#050d18" metalness={0.92} roughness={0.15} />
      </mesh>
      {/* Top radial glow disc — at Y=PLATFORM_TOP_Y=0.102 */}
      {glowTex && (
        <mesh position={[0, PLATFORM_TOP_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.24, 64]} />
          <meshBasicMaterial map={glowTex} transparent depthWrite={false} opacity={0.9} />
        </mesh>
      )}
      {/* Outer bright edge ring (Theme Colored) */}
      <mesh position={[0, PLATFORM_TOP_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.26, 0.014, 8, 64]} />
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
  const [groupWorldMatrix, setGroupWorldMatrix] = useState<THREE.Matrix4 | null>(null);
  const matrixCapturedRef = useRef(false);

  const [dimensions, setDimensions] = useState<ModelDimensions>({
    modelHeight: 1.8899,
    modelWidth:  1.827,
    modelDepth:  0.3848,
    feetY:       -0.0149,
    centerX:     0,
  });

  const handleMeasured = useCallback(
    (dims: ModelDimensions) => {
      setDimensions(dims);
      onDimensionsMeasured?.(dims);
    },
    [onDimensionsMeasured]
  );

  const handleSceneReady = useCallback((scene: THREE.Group) => {
    setAvatarScene(scene);
  }, []);

  const baseY = PLATFORM_TOP_Y - dimensions.feetY;

  useEffect(() => {
    onBaseYReady?.(baseY);
  }, [baseY, onBaseYReady]);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.y = baseY;

      if (avatarScene && !matrixCapturedRef.current) {
        matrixCapturedRef.current = true;
        groupRef.current.updateMatrixWorld(true);
        setGroupWorldMatrix(groupRef.current.matrixWorld.clone());
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, baseY, 0]}>
      <AvatarModel
        onDimensionsMeasured={handleMeasured}
        onSceneReady={handleSceneReady}
      />
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
    </group>
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
  const defaultDist = +(3.75 * portraitScale).toFixed(2);

  // Target values for smooth interpolation (Y = 0.88 aligns with horizontal eye level)
  const targetLookAt = useRef(new THREE.Vector3(0, 0.88, 0));
  const targetCamPos = useRef(new THREE.Vector3(0, 0.88, defaultDist));
  const isTransitioningRef = useRef(false);
  const isInitialMountRef = useRef(true);
  const prevSelectedZoneIdRef = useRef<string | null>(null);

  // Default camera setup on initial load
  useEffect(() => {
    if (controlsRef.current && isInitialMountRef.current) {
      isInitialMountRef.current = false;
      const controls = controlsRef.current;
      controls.object.position.set(0, 0.88, defaultDist);
      controls.target.set(0, 0.88, 0);
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
        const center = new THREE.Vector3(0, 0.88, 0);

        // Direction vector in the horizontal X-Z plane
        const dir = new THREE.Vector3(currentCam.x - center.x, 0, currentCam.z - center.z);
        if (dir.lengthSq() < 1e-4) {
          dir.set(0, 0, 1);
        } else {
          dir.normalize();
        }

        // Smooth target position keeping current viewing angle at full-body overview distance
        targetLookAt.current.set(0, 0.88, 0);
        targetCamPos.current.set(
          dir.x * defaultDist,
          0.88,
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
      target={[0, 0.88, 0]}
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
      autoRotateSpeed={-1.2}
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
  const [baseY, setBaseY] = useState(0.1169);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.88, 3.75], fov: 40, near: 0.1, far: 120 }}
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
