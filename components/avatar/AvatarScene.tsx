"use client";

import { Suspense, useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import AvatarModel, { type ModelDimensions } from "./AvatarModel";
import DecalZone from "./DecalZone";

// Re-export ZoneData from ZoneRectangle so callers keep the same import path
export type { ZoneData } from "./ZoneRectangle";
import type { ZoneData } from "./ZoneRectangle";

import TunnelPortalBackground from "./TunnelPortalBackground";

// ─── Platform constants ────────────────────────────────────────────────────────
// The ArenaPlatform base disc center is at Y=0.05, half-height=0.05 → top at Y=0.10.
// The glow disc sits at Y=0.102. We treat 0.102 as the "stand-on" surface.
const PLATFORM_TOP_Y = 0.102;

// ─── Arena Lighting (360° Studio & Backside Parity) ───────────────────────────
function ArenaLighting() {
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

      {/* 360° Rim Point Lights for equal contour separation from all angles */}
      <pointLight position={[-3.2, 2.0, 0.2]} color="#00d4ff" intensity={1.8} distance={10} />
      <pointLight position={[3.2, 2.0, 0.2]} color="#0099ff" intensity={1.8} distance={10} />
      <pointLight position={[-2.4, 2.2, -2.4]} color="#00e5ff" intensity={1.5} distance={8} />
      <pointLight position={[2.4, 2.2, -2.4]} color="#00a8e8" intensity={1.5} distance={8} />

      {/* Platform ground under-glow */}
      <pointLight position={[0, 0.18, 0]} color="#00e5ff" intensity={0.5} distance={2.0} />
    </>
  );
}

// ─── Sleek Platform Ring ──────────────────────────────────────────────────────
function ArenaPlatform() {
  const glowTex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,210,255,0.45)");
    grad.addColorStop(0.45, "rgba(0,140,240,0.20)");
    grad.addColorStop(0.8, "rgba(0,60,180,0.06)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  }, []);

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
      {/* Outer bright cyan edge ring */}
      <mesh position={[0, PLATFORM_TOP_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.26, 0.014, 8, 64]} />
        <meshBasicMaterial color="#00e5ff" />
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
}: {
  zones: ZoneData[];
  onSelectZone: (zoneId: string) => void;
  showDebugLabel?: boolean;
  onDimensionsMeasured?: (dims: ModelDimensions) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // ── Avatar scene ref for raycasting ──────────────────────────────────────
  const [avatarScene, setAvatarScene] = useState<THREE.Group | null>(null);

  // ── Group world matrix — captured once after first frame so it's correct ─
  // DecalZone needs this to convert SkinnedMesh world-space hits → local space.
  const [groupWorldMatrix, setGroupWorldMatrix] = useState<THREE.Matrix4 | null>(null);
  const matrixCapturedRef = useRef(false);

  // ── Dimensions state (updated once real mesh is measured) ────────────────
  const [dimensions, setDimensions] = useState<ModelDimensions>({
    modelHeight: 1.8899,
    modelWidth:  1.827,
    modelDepth:  0.3848,
    feetY:       -0.0149, // default — will be overwritten by real measurement
    centerX:     0,
  });

  const handleMeasured = useCallback(
    (dims: ModelDimensions) => {
      const computedBaseY = PLATFORM_TOP_Y - dims.feetY;
      console.log("=== Avatar Vertical Positioning ===");
      console.log(
        `  Bounding box  min.y=${dims.feetY.toFixed(4)}  max.y=${(dims.feetY + dims.modelHeight).toFixed(4)}`
      );
      console.log(`  BBox full: height=${dims.modelHeight.toFixed(4)} width=${dims.modelWidth.toFixed(4)} depth=${dims.modelDepth.toFixed(4)}`);
      console.log(`  Platform top surface Y = ${PLATFORM_TOP_Y}`);
      console.log(`  avatarGroup.position.y (grounded base) = ${computedBaseY.toFixed(4)}`);
      console.log("===================================");

      setDimensions(dims);
      onDimensionsMeasured?.(dims);
    },
    [onDimensionsMeasured]
  );

  const handleSceneReady = useCallback((scene: THREE.Group) => {
    setAvatarScene(scene);
  }, []);

  // ── baseY: feet land exactly on platform top surface ─────────────────────
  // Formula: PLATFORM_TOP_Y - feetY
  //   feetY is the model-local Y of the lowest vertex (shoes_0: -0.0149)
  //   Example: baseY = 0.102 - (-0.0149) = 0.1169
  //   This places shoes exactly on top of PLATFORM_TOP_Y with 0 clipping.
  const baseY = PLATFORM_TOP_Y - dimensions.feetY;

  useFrame(() => {
    if (groupRef.current) {
      // Ground avatar firmly on platform surface — feet touching ring surface
      groupRef.current.position.y = baseY;

      // Capture group world matrix once after avatarScene is set.
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
      {/* DecalZones — use real raycasting against the avatar mesh */}
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

// ─── Scene Camera Controls ───────────────────────────────────────────────────
function SceneCameraControls() {
  const controlsRef = useRef<any>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const { size } = useThree();

  // Responsive camera framing:
  // Avatar height is ~1.89m, centered at Y ~0.95m.
  // With vertical FOV = 40°, camera target at [0, 0.88, 0] and dist ~3.75m,
  // the entire body from head to shoes on the platform is completely visible.
  const aspect = size.width / Math.max(1, size.height);
  const portraitScale = aspect < 0.85 ? Math.max(1.0, 0.85 / aspect) : 1.0;
  const defaultDist = +(3.75 * portraitScale).toFixed(2);

  // Apply default camera distance and comfortable viewing angle
  useEffect(() => {
    if (controlsRef.current) {
      const controls = controlsRef.current;
      controls.object.position.set(0, 1.05, defaultDist);
      controls.target.set(0, 0.88, 0);
      controls.update();
    }
  }, [defaultDist]);

  useEffect(() => {
    (window as any).__setAutoRotate = (val: boolean) => setAutoRotate(val);
    (window as any).__setCameraAngle = (preset: "front" | "side" | "back") => {
      setAutoRotate(false);
      if (!controlsRef.current) return;
      const controls = controlsRef.current;
      if (preset === "front") {
        controls.object.position.set(0, 1.05, defaultDist);
      } else if (preset === "side") {
        controls.object.position.set(defaultDist, 1.05, 0.0);
      } else if (preset === "back") {
        controls.object.position.set(0, 1.05, -defaultDist);
      }
      controls.target.set(0, 0.88, 0);
      controls.update();
    };
  }, [defaultDist]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 0.88, 0]}
      minPolarAngle={0.90}
      maxPolarAngle={1.52}
      minDistance={2.0}
      maxDistance={5.2}
      enablePan={false}
      enableZoom={true}
      autoRotate={autoRotate}
      autoRotateSpeed={-1.0}
      dampingFactor={0.07}
      makeDefault
    />
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────────────
export default function AvatarScene({
  zones,
  onSelectZone,
  showDebugLabel = false,
  onDimensionsMeasured,
}: {
  zones: ZoneData[];
  onSelectZone: (zoneId: string) => void;
  showDebugLabel?: boolean;
  onDimensionsMeasured?: (dims: ModelDimensions) => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.05, 3.75], fov: 40, near: 0.1, far: 120 }}
      className="h-full w-full"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#040911"]} />

      <TunnelPortalBackground />
      <ArenaLighting />
      <ArenaPlatform />

      <Suspense fallback={null}>
        <FloatingAvatarGroup
          zones={zones}
          onSelectZone={onSelectZone}
          showDebugLabel={showDebugLabel}
          onDimensionsMeasured={onDimensionsMeasured}
        />
      </Suspense>

      <SceneCameraControls />
    </Canvas>
  );
}


