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

// ─── Platform constants ────────────────────────────────────────────────────────
// The ArenaPlatform base disc center is at Y=0.05, half-height=0.05 → top at Y=0.10.
// The glow disc sits at Y=0.102. We treat 0.102 as the "stand-on" surface.
const PLATFORM_TOP_Y = 0.102;

// ─── Arena Lighting ───────────────────────────────────────────────────────────
function ArenaLighting() {
  return (
    <>
      {/* Strong key light from upper-front — brightens avatar face/chest */}
      <directionalLight
        position={[0.5, 4.0, 3.5]}
        intensity={2.6}
        color="#d6eeff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={25}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={6}
        shadow-camera-bottom={-3}
      />
      {/* Warm fill from below-front to eliminate shadow under chin */}
      <directionalLight position={[0, -0.8, 3.0]} intensity={0.6} color="#ffffff" />
      {/* Ambient — lifted so no part of avatar is in full darkness */}
      <ambientLight color="#1a3a5c" intensity={1.4} />
      {/* Cyan rim from left */}
      <pointLight position={[-3.2, 2.5, -0.8]} color="#00d4ff" intensity={2.2} distance={10} />
      {/* Blue rim from right */}
      <pointLight position={[3.2, 2.5, -0.8]} color="#0088ff" intensity={1.8} distance={10} />
      {/* Under-glow from platform — reduced intensity to prevent trouser bleaching */}
      <pointLight position={[0, 0.22, 0]} color="#00bfff" intensity={0.8} distance={2.0} />
    </>
  );
}

// ─── Floor ────────────────────────────────────────────────────────────────────
function ArenaFloor() {
  const floorTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Darker base with stronger grid lines for visibility
    ctx.fillStyle = "#060f1c";
    ctx.fillRect(0, 0, size, size);

    // Outer subtle grid
    ctx.strokeStyle = "#0d2035";
    ctx.lineWidth = 1.5;
    const tileCount = 8;
    const tileSize = size / tileCount;
    for (let i = 0; i <= tileCount; i++) {
      ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(size, i * tileSize); ctx.stroke();
    }

    // Accent lines every other tile — slightly brighter
    ctx.strokeStyle = "#122840";
    ctx.lineWidth = 2;
    for (let i = 0; i <= tileCount; i += 2) {
      ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(size, i * tileSize); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    return tex;
  }, []);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial
          map={floorTexture ?? undefined}
          color="#07111e"
          metalness={0.4}
          roughness={0.7}
          emissive="#001830"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Central floor glow — subtle ground reflection only */}
      <pointLight position={[0, 0.05, 0]} color="#004488" intensity={0.8} distance={2.0} />
    </>
  );
}

// ─── HUD Platform ─────────────────────────────────────────────────────────────
function ArenaPlatform() {
  const scanRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (scanRef.current) {
      scanRef.current.rotation.y = clock.getElapsedTime() * 0.6;
    }
  });

  const glowTex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,200,255,0.55)");
    grad.addColorStop(0.45, "rgba(0,140,255,0.28)");
    grad.addColorStop(0.75, "rgba(0,80,200,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <group>
      {/* Base disc — center at Y=0.05, half-height=0.05 → top at Y=0.10 */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.72, 1.78, 0.10, 72]} />
        <meshStandardMaterial color="#0d1f30" metalness={0.92} roughness={0.12} />
      </mesh>
      {/* Top radial glow — at Y=PLATFORM_TOP_Y=0.102 */}
      {glowTex && (
        <mesh position={[0, PLATFORM_TOP_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.70, 72]} />
          <meshBasicMaterial map={glowTex} transparent depthWrite={false} opacity={0.95} />
        </mesh>
      )}
      {/* Outer bright edge ring */}
      <mesh position={[0, PLATFORM_TOP_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.74, 0.020, 8, 80]} />
        <meshBasicMaterial color="#00e5ff" />
      </mesh>
      {/* Inner HUD ring */}
      <mesh position={[0, 0.104, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.38, 0.009, 6, 64]} />
        <meshBasicMaterial color="#0099cc" />
      </mesh>
      {/* Rotating scan arc */}
      <mesh ref={scanRef} position={[0, 0.106, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.56, 0.005, 4, 32, Math.PI * 0.55]} />
        <meshBasicMaterial color="#7ff0ff" transparent opacity={0.75} />
      </mesh>
      <pointLight position={[0, 0.4, 0]} color="#00d4ff" intensity={0.6} distance={3.0} />
    </group>
  );
}

// ─── Neon Vertical Side Panels + Tunnel ───────────────────────────────────────
function NeonEnvironment() {
  const { primaryLines, depthLines } = useMemo(() => {
    const pPts: number[] = [];
    const dPts: number[] = [];

    function pushSeg(arr: number[], p1: [number, number, number], p2: [number, number, number]) {
      arr.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    }

    // ── LEFT & RIGHT Vertical Cyber Frame Pillars ──
    const sideXs = [-5.2, -3.8, -2.6, 2.6, 3.8, 5.2];
    for (const x of sideXs) {
      const isInner = Math.abs(x) < 3.0;
      const targetArr = isInner ? pPts : dPts;
      // Vertical pillars
      pushSeg(targetArr, [x, 0.02, -1.8], [x, 5.5, -1.8]);
      pushSeg(targetArr, [x, 0.02, -4.2], [x, 6.2, -4.2]);
      // Depth connectors between front and mid pillar
      pushSeg(targetArr, [x, 1.4, -1.8], [x, 1.4, -4.2]);
      pushSeg(targetArr, [x, 2.8, -1.8], [x, 2.8, -4.2]);
      pushSeg(targetArr, [x, 4.2, -1.8], [x, 4.2, -4.2]);
      pushSeg(targetArr, [x, 5.5, -1.8], [x, 6.2, -4.2]);
    }

    // Horizontal crossbars on side frames
    const sidePairs: [number, number][] = [[-5.2, -3.8], [-3.8, -2.6], [2.6, 3.8], [3.8, 5.2]];
    for (const [x1, x2] of sidePairs) {
      for (const y of [0.02, 1.4, 2.8, 4.2, 5.5]) {
        pushSeg(pPts, [x1, y, -1.8], [x2, y, -1.8]);
      }
      // Diagonal cross-bracing for cyber lattice aesthetic
      pushSeg(dPts, [x1, 1.4, -1.8], [x2, 2.8, -1.8]);
      pushSeg(dPts, [x1, 2.8, -1.8], [x2, 4.2, -1.8]);
      pushSeg(dPts, [x1, 4.2, -1.8], [x2, 5.5, -1.8]);
    }

    // ── Converging Tunnel Chamber Depths ──
    const tunnelDepths = [-2.0, -3.8, -6.2, -9.5, -13.5, -18.5];
    const tunnelWidths = [ 2.4,  3.4,  4.6,  6.0,   7.6,   9.4];
    const tunnelHeights = [3.2,  4.0,  5.0,  6.2,   7.5,   8.8];

    // Longitudinal rails connecting all depths
    for (let i = 0; i < tunnelDepths.length - 1; i++) {
      const z1 = tunnelDepths[i],   z2 = tunnelDepths[i + 1];
      const w1 = tunnelWidths[i],   w2 = tunnelWidths[i + 1];
      const h1 = tunnelHeights[i],  h2 = tunnelHeights[i + 1];

      // Left & right ceiling rails
      pushSeg(pPts, [-w1, h1, z1], [-w2, h2, z2]);
      pushSeg(pPts, [ w1, h1, z1], [ w2, h2, z2]);
      // Left & right mid-height perspective rails
      pushSeg(dPts, [-w1, h1 * 0.55, z1], [-w2, h2 * 0.55, z2]);
      pushSeg(dPts, [ w1, h1 * 0.55, z1], [ w2, h2 * 0.55, z2]);
      // Left & right floor perspective rails
      pushSeg(pPts, [-w1, 0.02, z1], [-w2, 0.02, z2]);
      pushSeg(pPts, [ w1, 0.02, z1], [ w2, 0.02, z2]);
      // Center ceiling spine
      pushSeg(dPts, [0, h1 * 1.08, z1], [0, h2 * 1.08, z2]);
    }

    // Arch rings at each depth
    for (let i = 0; i < tunnelDepths.length; i++) {
      const z = tunnelDepths[i];
      const w = tunnelWidths[i];
      const h = tunnelHeights[i];
      const targetArr = i <= 2 ? pPts : dPts;

      // Vertical side uprights
      pushSeg(targetArr, [-w, 0.02, z], [-w, h, z]);
      pushSeg(targetArr, [ w, 0.02, z], [ w, h, z]);
      // Top horizontal lintel / ceiling arch
      pushSeg(targetArr, [-w, h, z], [w, h, z]);
      // Mid-height crossbeam
      pushSeg(dPts, [-w, h * 0.55, z], [w, h * 0.55, z]);
      // Floor boundary threshold
      pushSeg(targetArr, [-w, 0.02, z], [w, 0.02, z]);
      // Angled ceiling rafters to center spine
      pushSeg(dPts, [-w, h, z], [0, h * 1.08, z]);
      pushSeg(dPts, [ w, h, z], [0, h * 1.08, z]);
    }

    const geoP = new THREE.BufferGeometry();
    geoP.setAttribute("position", new THREE.Float32BufferAttribute(pPts, 3));
    const geoD = new THREE.BufferGeometry();
    geoD.setAttribute("position", new THREE.Float32BufferAttribute(dPts, 3));

    return { primaryLines: geoP, depthLines: geoD };
  }, []);

  useEffect(() => {
    return () => {
      primaryLines.dispose();
      depthLines.dispose();
    };
  }, [primaryLines, depthLines]);

  return (
    <group>
      {/* Primary bright cyan structural lines */}
      <lineSegments geometry={primaryLines}>
        <lineBasicMaterial color="#00d4ff" transparent opacity={0.68} />
      </lineSegments>
      {/* Depth atmospheric perspective lines */}
      <lineSegments geometry={depthLines}>
        <lineBasicMaterial color="#005588" transparent opacity={0.42} />
      </lineSegments>

      {/* Atmospheric neon point lights */}
      <pointLight position={[-4.6, 5.0, -1.8]} color="#00c8ff" intensity={1.2} distance={4.5} />
      <pointLight position={[4.6, 5.0, -1.8]} color="#00c8ff" intensity={1.2} distance={4.5} />
      <pointLight position={[0, 4.0, -7.0]} color="#004488" intensity={2.2} distance={14.0} />
      <pointLight position={[0, 1.8, -12.0]} color="#002255" intensity={1.8} distance={10.0} />
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
      // ── VERIFICATION LOG: required proof ─────────────────────────────────
      const computedBaseY = PLATFORM_TOP_Y - dims.feetY;
      console.log("=== Avatar Vertical Positioning ===");
      console.log(
        `  Bounding box  min.y=${dims.feetY.toFixed(4)}  max.y=${(dims.feetY + dims.modelHeight).toFixed(4)}`
      );
      console.log(`  BBox full: height=${dims.modelHeight.toFixed(4)} width=${dims.modelWidth.toFixed(4)} depth=${dims.modelDepth.toFixed(4)}`);
      console.log(`  Platform top surface Y = ${PLATFORM_TOP_Y}`);
      console.log(`  avatarGroup.position.y (static base) = ${computedBaseY.toFixed(4)}`);
      console.log(`  (useFrame adds ±0.013 sin float on top)`);
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
  //   feetY is the model-local Y of the lowest vertex (negative if model origin is above floor)
  //   Example: feetY=-0.0149 → baseY = 0.102 - (-0.0149) = 0.1169
  //   This places model-local Y=feetY at world Y=PLATFORM_TOP_Y. ✓
  const baseY = PLATFORM_TOP_Y - dimensions.feetY;

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.y =
        baseY + 0.008 + (Math.sin(clock.getElapsedTime() * 0.85) * 0.5 + 0.5) * 0.015;

      // Capture group world matrix once after avatarScene is set.
      // We wait until avatarScene exists so the matrix is stable after first real position.
      if (avatarScene && !matrixCapturedRef.current) {
        matrixCapturedRef.current = true;
        // updateMatrixWorld ensures matrixWorld reflects current position
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const { size } = useThree();

  // Responsive camera framing:
  // Avatar height is ~1.89m, centered at Y ~0.95m.
  // To occupy ~75% of screen height: visible frustum height = 1.89 / 0.75 = 2.52m.
  // With vertical FOV = 40°, base distance = 2.52 / (2 * tan(20°)) ≈ 3.46m.
  // Increased to 3.85m to ensure legs are never clipped at closest zoom.
  // For mobile portrait viewports (aspect < 0.85), scale distance proportionally.
  const aspect = size.width / Math.max(1, size.height);
  const portraitScale = aspect < 0.85 ? Math.max(1.0, 0.85 / aspect) : 1.0;
  const defaultDist = +(3.85 * portraitScale).toFixed(2);

  // Apply default camera distance on load or resize
  useEffect(() => {
    if (controlsRef.current) {
      const controls = controlsRef.current;
      controls.object.position.set(0, 0.95, defaultDist);
      controls.target.set(0, 0.95, 0);
      controls.update();
    }
  }, [defaultDist]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__setAutoRotate = (val: boolean) => setAutoRotate(val);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__setCameraAngle = (preset: "front" | "side" | "back") => {
      setAutoRotate(false);
      if (!controlsRef.current) return;
      const controls = controlsRef.current;
      if (preset === "front") {
        controls.object.position.set(0, 0.95, defaultDist);
      } else if (preset === "side") {
        controls.object.position.set(defaultDist, 0.95, 0.0);
      } else if (preset === "back") {
        controls.object.position.set(0, 0.95, -defaultDist);
      }
      controls.target.set(0, 0.95, 0);
      controls.update();
    };
  }, [defaultDist]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 0.95, 0]}
      minPolarAngle={1.42}
      maxPolarAngle={1.42}
      minDistance={2.2}
      maxDistance={5.0}
      enablePan={false}
      enableZoom={true}
      autoRotate={autoRotate}
      autoRotateSpeed={-1.2}
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
      camera={{ position: [0, 0.95, 3.85], fov: 40, near: 0.1, far: 120 }}
      className="h-full w-full"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ background: "#050c1a" }}
    >
      <color attach="background" args={["#050c1a"]} />
      {/* Reduced fog density: 0.022 (was 0.035) — background tunnel structures now visible */}
      <fogExp2 attach="fog" args={["#050c1a", 0.022]} />

      <ArenaLighting />
      <ArenaFloor />
      <ArenaPlatform />
      <NeonEnvironment />

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
