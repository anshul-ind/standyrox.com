"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { Html, useTexture } from "@react-three/drei";
import { formatUSDFromCents } from "@/lib/format";
import type { ZoneData } from "./ZoneRectangle";

// ─── Raycast opt-out ─────────────────────────────────────────────────────────
//
// Only the decal surface itself should respond to a click — it is the spot.
// Purely decorative children (dashed border outline, pulsing beacon) must NOT
// be pickable: three.js raycasts `Line` objects with a default
// `raycaster.params.Line.threshold = 1` WORLD UNIT, so a 16 cm dashed rectangle
// silently swallows every click within a ~1 m tube around it. That made clicks
// all over the body open a random spot's config modal. A no-op raycast removes
// them from hit-testing entirely without changing how they render.
const NO_RAYCAST = () => null;

/**
 * Brand logo size as a fraction of its spot's patch, so the logo sits inside the
 * patch instead of covering it edge to edge. Used both as the projector scale
 * for the logo decal and as the plane size in the no-surface fallback.
 */
const LOGO_INSET = 0.94;

// ─── Tier colour palette ──────────────────────────────────────────────────────
const TIER_COLORS = {
  signature: { fill: 0xffc107, border: 0xffe57a, emissive: 0x7a4400, scale: 1.2 },
  prime:     { fill: 0x00b4d8, border: 0x90e0ef, emissive: 0x003244, scale: 1.0 },
  featured:  { fill: 0x4cc9f0, border: 0xa8dadc, emissive: 0x003244, scale: 1.0 },
  standard:  { fill: 0x7209b7, border: 0xb5179e, emissive: 0x1a0030, scale: 0.85 },
} as const;
type TierKey = keyof typeof TIER_COLORS;

// ─── Pulsing Glow Marker for Empty Ad Zones ──────────────────────────────────
function PulsingZoneMarker({
  position,
  rotation,
  tierKey,
  hovered,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  tierKey: TierKey;
  hovered: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Animated breathing pulse via useFrame (~1.5s period)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const cycle = (t / 1.5) * Math.PI * 2;
    const pulse = 0.5 + 0.5 * Math.sin(cycle); // 0.0 to 1.0

    if (groupRef.current) {
      const baseScale = hovered ? 1.3 : 1.0;
      const s = baseScale * (0.92 + 0.16 * pulse);
      groupRef.current.scale.set(s, s, s);
    }

    if (ringMatRef.current) {
      ringMatRef.current.opacity = hovered ? 0.95 : (0.45 + 0.5 * pulse);
    }
    if (coreMatRef.current) {
      coreMatRef.current.opacity = hovered ? 1.0 : (0.7 + 0.3 * pulse);
    }
    if (glowMatRef.current) {
      glowMatRef.current.opacity = hovered ? 0.45 : (0.15 + 0.28 * pulse);
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Outer soft ambient radial glow disc */}
      <mesh position={[0, 0, 0.001]} raycast={NO_RAYCAST}>
        <circleGeometry args={[0.042, 32]} />
        <meshBasicMaterial
          ref={glowMatRef}
          color="#00d4ff"
          transparent
          depthWrite={false}
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Vibrant glowing placement ring */}
      <mesh position={[0, 0, 0.002]} raycast={NO_RAYCAST}>
        <ringGeometry args={[0.024, 0.034, 32]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color="#00f0ff"
          transparent
          depthWrite={false}
          opacity={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Core emissive beacon dot */}
      <mesh position={[0, 0, 0.003]} raycast={NO_RAYCAST}>
        <circleGeometry args={[0.012, 24]} />
        <meshBasicMaterial
          ref={coreMatRef}
          color="#ffffff"
          transparent
          depthWrite={false}
          opacity={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Precision target crosshair lines */}
      <mesh position={[0, 0, 0.003]} raycast={NO_RAYCAST}>
        <planeGeometry args={[0.003, 0.016]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.003]} raycast={NO_RAYCAST}>
        <planeGeometry args={[0.016, 0.003]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Brand logo projected onto a claimed spot ────────────────────────────────────
// Isolated so the `useTexture` hook is never called conditionally.
//
// The logo renders on a projected DecalGeometry — the same surface-hugging
// geometry as the patch beneath it — instead of a flat billboard, so it wraps
// the body and cannot float off a curved arm or thigh. DecalGeometry writes its
// UVs from the projector box (`uv = 0.5 + position / size`, then clipped to the
// box), so a texture applied to that geometry lands exactly on the projected
// spot with no extra mapping work.
function ZoneLogoDecal({
  url,
  geometry,
  position,
  rotation,
}: {
  url: string;
  geometry: THREE.BufferGeometry;
  /** Only needed for the flat-plane fallback, when no surface was hit. */
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const texture = useTexture(url);
  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={rotation}
      renderOrder={2}
    >
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
        // The logo and the patch under it are coplanar by construction; pull the
        // logo in front of the patch it sits on.
        polygonOffset
        polygonOffsetFactor={-8}
        polygonOffsetUnits={-8}
      />
    </mesh>
  );
}

// ─── Internal result type ─────────────────────────────────────────────────────
interface ZoneGeoResult {
  type: "decal" | "fallback";
  geometry: THREE.BufferGeometry;
  /**
   * Patch the brand logo renders on. Always uses the same transform convention
   * as `geometry`: a decal carries its own transform, the fallback plane is
   * positioned/rotated by the mesh. Null while the spot has no logo.
   */
  logoGeometry: THREE.BufferGeometry | null;
  hitPoint: THREE.Vector3 | null;
  hitNormal: THREE.Vector3 | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a world-space-agnostic Euler from a surface normal vector */
function normalToEuler(normal: THREE.Vector3): THREE.Euler {
  const up =
    Math.abs(normal.y) < 0.95
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const correctedUp = new THREE.Vector3().crossVectors(normal, right);
  const mat = new THREE.Matrix4().makeBasis(right, correctedUp, normal);
  return new THREE.Euler().setFromRotationMatrix(mat);
}

/**
 * Raycast against avatar meshes, returning a hit point in the
 * FloatingAvatarGroup's LOCAL coordinate space (same space the zone anchors live in).
 *
 * Two strategies are used:
 *  - Regular Mesh: set matrixWorld=identity so the raycaster operates in local space directly.
 *  - SkinnedMesh: SkinnedMesh.raycast() uses matrixWorld and applies bone transforms per-vertex.
 *    We must pass a WORLD-SPACE ray, then convert the hit back to local space.
 *
 * @param meshes   - All meshes collected from the avatar scene clone
 * @param rayOrigin - Ray origin in FloatingAvatarGroup LOCAL space
 * @param rayDir   - Ray direction in LOCAL space (will be negated-normal, unit vector)
 * @param groupWorldMatrix - The FloatingAvatarGroup's world matrix (to convert hit back to local)
 */
function raycastLocalSpace(
  meshes: THREE.Mesh[],
  rayOrigin: THREE.Vector3,
  rayDir: THREE.Vector3,
  groupWorldMatrix: THREE.Matrix4
): { mesh: THREE.Mesh; point: THREE.Vector3; faceNormal: THREE.Vector3; distance: number } | null {
  const MAX_DIST = 4.0; // generous: arm depth ~ 0.12 units, but bones shift things
  let best: { dist: number; mesh: THREE.Mesh; point: THREE.Vector3; faceNormal: THREE.Vector3 } | null = null;

  // World-space equivalents (for SkinnedMesh)
  const worldOrigin = rayOrigin.clone().applyMatrix4(groupWorldMatrix);
  const worldDir    = rayDir.clone().transformDirection(groupWorldMatrix).normalize();
  const worldRaycaster = new THREE.Raycaster(worldOrigin, worldDir, 0, MAX_DIST);

  // Local-space raycaster (for regular Mesh with identity matrixWorld trick)
  const localRaycaster = new THREE.Raycaster(rayOrigin.clone(), rayDir.clone().normalize(), 0, MAX_DIST);

  // Inverse group world matrix — convert world-space hit back to local space
  const invGroupMatrix = groupWorldMatrix.clone().invert();

  for (const mesh of meshes) {
    const isSkinnedMesh = (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh === true;

    if (isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh;
      skinned.skeleton?.update();
      if (!skinned.boundingSphere || skinned.boundingSphere.radius < 2.5) {
        skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3.5);
      }
      (skinned as unknown as { boundingBox: THREE.Box3 | null }).boundingBox = null;

      const hits = worldRaycaster.intersectObject(mesh, false);
      if (hits.length > 0) {
        const h = hits[0];
        // Convert hit point from world → local space
        const localPoint = h.point.clone().applyMatrix4(invGroupMatrix);
        const rawNormal = h.normal ?? h.face?.normal ?? new THREE.Vector3(0, 0, 1);
        const worldNormal = rawNormal.clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
          .normalize();
        const localNormal = worldNormal.clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(invGroupMatrix))
          .normalize();
        if (!best || h.distance < best.dist) {
          best = { dist: h.distance, mesh, point: localPoint, faceNormal: localNormal };
        }
      }
    } else {
      // Regular Mesh: identity-matrixWorld trick — raycaster already in local space
      const savedMW = mesh.matrixWorld.clone();
      const savedNM = new THREE.Matrix3().copy(mesh.normalMatrix);
      mesh.matrixWorld.identity();
      mesh.normalMatrix.identity();

      const hits = localRaycaster.intersectObject(mesh, false);

      mesh.matrixWorld.copy(savedMW);
      mesh.normalMatrix.copy(savedNM);

      if (hits.length > 0) {
        const h = hits[0];
        if (!best || h.distance < best.dist) {
          best = {
            dist: h.distance,
            mesh,
            point: h.point.clone(),         // already in local space
            faceNormal: h.face!.normal.clone().normalize(),
          };
        }
      }
    }
  }

  if (!best) return null;
  return { mesh: best.mesh, point: best.point, faceNormal: best.faceNormal, distance: best.dist };
}


// ─── Main component ───────────────────────────────────────────────────────────
export default function DecalZone({
  zone,
  avatarScene,
  groupWorldMatrix,
  onSelect,
  showDebugLabel = false,
}: {
  zone: ZoneData;
  avatarScene: THREE.Group | null;
  /** World matrix of FloatingAvatarGroup — required to convert SkinnedMesh world-space hits back to local space */
  groupWorldMatrix: THREE.Matrix4 | null;
  onSelect: (zoneId: string) => void;
  showDebugLabel?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [result, setResult] = useState<ZoneGeoResult | null>(null);
  const prevGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const prevLogoGeoRef = useRef<THREE.BufferGeometry | null>(null);

  const tierKey = (zone.tier in TIER_COLORS ? zone.tier : "standard") as TierKey;
  const tier = TIER_COLORS[tierKey];
  const isOccupied = zone.status === "occupied" && zone.placement;
  const w = zone.size.width  || 0.16;
  const h = zone.size.height || 0.16;

  // ── Raycasting + geometry creation ─────────────────────────────────────────
  // Runs ONCE after avatarScene is ready, and again if the aim point/normal changes
  // (ZoneTuner slider updates). Never runs per-frame.
  useEffect(() => {
    if (!avatarScene) return;
    if (!groupWorldMatrix) return; // wait until group has been mounted and matrix is ready

    // Collect all renderable meshes
    const meshes: THREE.Mesh[] = [];
    avatarScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        meshes.push(obj as THREE.Mesh);
      }
    });

    if (meshes.length === 0) {
      console.warn(`[DecalZone] "${zone.key}": no meshes found in avatarScene`);
      return;
    }

    // Build aim ray in model LOCAL space
    const aimPt = new THREE.Vector3(zone.anchor.x, zone.anchor.y, zone.anchor.z);
    const rawNorm = zone.normal ?? { x: 0, y: 0, z: 1 };
    const aimNorm = new THREE.Vector3(rawNorm.x, rawNorm.y, rawNorm.z);
    if (aimNorm.lengthSq() < 1e-6) aimNorm.set(0, 0, 1);
    aimNorm.normalize();

    // Shoot from 0.5 units OUTSIDE the body, TOWARD it
    const rayOrigin = aimPt.clone().addScaledVector(aimNorm, 0.5);
    const rayDir    = aimNorm.clone().negate();

    const hit = raycastLocalSpace(meshes, rayOrigin, rayDir, groupWorldMatrix);

    // A claimed spot projects a second, slightly smaller decal for its logo.
    const needsLogo = Boolean(isOccupied && zone.placement?.brandLogoUrl);

    let newGeo: THREE.BufferGeometry;
    let newLogoGeo: THREE.BufferGeometry | null = null;
    let hitPoint: THREE.Vector3 | null = null;
    let hitNormal: THREE.Vector3 | null = null;

    if (hit) {
      // ── Exact log format as required ──
      console.log(
        `[${zone.key}] hit at (${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)}),` +
        ` normal (${hit.faceNormal.x.toFixed(2)}, ${hit.faceNormal.y.toFixed(2)}, ${hit.faceNormal.z.toFixed(2)}),` +
        ` distance from aim point: ${hit.distance.toFixed(2)}`
      );

      const orientation = normalToEuler(hit.faceNormal);

      // Project a decal patch onto the real mesh surface at `factor` × the zone
      // size. Returns null when the projection produces nothing usable.
      const projectDecal = (factor: number): THREE.BufferGeometry | null => {
        try {
          const geo = new DecalGeometry(
            hit.mesh,
            hit.point,
            orientation,
            new THREE.Vector3(w * tier.scale * factor, h * tier.scale * factor, 0.04) // projector depth
          );
          if (!geo.attributes.position || geo.attributes.position.count === 0) {
            geo.dispose();
            return null;
          }
          return geo;
        } catch (err) {
          console.warn(`[${zone.key}] DecalGeometry (scale ${factor}) threw:`, err);
          return null;
        }
      };

      /** Surface-aligned flat plane at the hit point, used when projection fails. */
      const surfacePlane = (factor: number): THREE.BufferGeometry => {
        const geo = new THREE.PlaneGeometry(
          w * tier.scale * factor,
          h * tier.scale * factor
        );
        geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(orientation));
        geo.translate(hit.point.x, hit.point.y, hit.point.z);
        return geo;
      };

      // DecalGeometry (Approach A): projects geometry onto actual mesh surface.
      // Temporarily set matrixWorld to identity so DecalGeometry operates in local space.
      const savedMW = hit.mesh.matrixWorld.clone();
      const savedNM = new THREE.Matrix3().copy(hit.mesh.normalMatrix);
      hit.mesh.matrixWorld.identity();
      hit.mesh.normalMatrix.identity();

      const fillGeo = projectDecal(1);
      if (fillGeo) {
        newGeo = fillGeo;
        // The logo is inset (LOGO_INSET) so it sits inside the patch rather than
        // covering it edge to edge. If the smaller projection yields nothing,
        // the un-inset patch is a better result than no logo at all.
        if (needsLogo) newLogoGeo = projectDecal(LOGO_INSET) ?? fillGeo;
      } else {
        // DecalGeometry can throw on degenerate meshes — use an oriented plane.
        console.warn(
          `[${zone.key}] DecalGeometry unavailable — using surface-aligned flat plane fallback`
        );
        newGeo = surfacePlane(1);
        if (needsLogo) newLogoGeo = surfacePlane(LOGO_INSET);
      }

      hit.mesh.matrixWorld.copy(savedMW);
      hit.mesh.normalMatrix.copy(savedNM);

      hitPoint  = hit.point;
      hitNormal = hit.faceNormal;
    } else {
      // ── Fallback: flat plane at estimated anchor ──
      // Explicit format requested: [zone_key] RAYCAST MISS — reason: ...
      console.warn(
        `[${zone.key}] RAYCAST MISS — reason: no surface intersection found along ray from origin (${rayOrigin.toArray().map(v=>v.toFixed(2)).join(",")}) dir (${rayDir.toArray().map(v=>v.toFixed(2)).join(",")}) — using estimated fallback`
      );
      newGeo = new THREE.PlaneGeometry(w * tier.scale, h * tier.scale);
      if (needsLogo) {
        newLogoGeo = new THREE.PlaneGeometry(
          w * tier.scale * LOGO_INSET,
          h * tier.scale * LOGO_INSET
        );
      }
    }

    // Dispose previous geometry to free GPU memory. The logo shares the patch
    // geometry when its own projection failed, so guard against a double dispose.
    const prevGeo = prevGeoRef.current;
    prevGeo?.dispose();
    if (prevLogoGeoRef.current && prevLogoGeoRef.current !== prevGeo) {
      prevLogoGeoRef.current.dispose();
    }
    prevGeoRef.current = newGeo;
    prevLogoGeoRef.current = newLogoGeo;

    setResult({
      type: hit ? "decal" : "fallback",
      geometry: newGeo,
      logoGeometry: newLogoGeo,
      hitPoint,
      hitNormal,
    });
  }, [
    avatarScene,
    groupWorldMatrix,
    zone.id,
    zone.anchor.x, zone.anchor.y, zone.anchor.z,
    zone.normal?.x, zone.normal?.y, zone.normal?.z,
    zone.size.width, zone.size.height,
    zone.key,
    isOccupied,
    zone.placement?.brandLogoUrl,
    tier.scale,
    w, h,
  ]);

  // Dispose on unmount
  useEffect(() => {
    return () => {
      const geo = prevGeoRef.current;
      geo?.dispose();
      if (prevLogoGeoRef.current && prevLogoGeoRef.current !== geo) {
        prevLogoGeoRef.current.dispose();
      }
      prevGeoRef.current = null;
      prevLogoGeoRef.current = null;
    };
  }, []);

  // ── Dashed border geometry for unclaimed zones ──────────────────────────────
  const borderGeo = useMemo(() => {
    const hw = (w * tier.scale) / 2;
    const hh = (h * tier.scale) / 2;
    const pts = [
      new THREE.Vector3(-hw,  hh, 0),
      new THREE.Vector3( hw,  hh, 0),
      new THREE.Vector3( hw, -hh, 0),
      new THREE.Vector3(-hw, -hh, 0),
      new THREE.Vector3(-hw,  hh, 0),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineDistances = [0];
    for (let i = 1; i < pts.length; i++) {
      lineDistances[i] = lineDistances[i - 1] + pts[i - 1].distanceTo(pts[i]);
    }
    geo.setAttribute("lineDistance", new THREE.Float32BufferAttribute(lineDistances, 1));
    return geo;
  }, [w, h, tier.scale]);

  useEffect(() => {
    return () => {
      borderGeo.dispose();
    };
  }, [borderGeo]);

  // ── Rendering ───────────────────────────────────────────────────────────────
  if (!result) return null; // decal not ready yet — no flash

  // Visual styling:
  // - Unclaimed: transparent faint fill (0.04) + neutral dark dashed border
  // - Occupied: solid full-opacity logo/placement fill, no dashed border
  const fillColor = isOccupied ? 0x22c55e : 0x050c18;
  const fillOpacity = isOccupied ? 0.95 : (hovered ? 0.12 : 0.04);
  const emissiveColor = isOccupied ? 0x113300 : (hovered ? 0x00d4ff : 0x000000);
  const emissiveIntensity = isOccupied ? 0.6 : (hovered ? 0.25 : 0.0);

  // DecalGeometry vertices ARE the position — no extra group position/rotation needed.
  // Fallback plane uses the original anchor + heuristic rotation.
  const isFallback = result.type === "fallback";
  const fallbackPos: [number, number, number] = [zone.anchor.x, zone.anchor.y, zone.anchor.z];
  const fallbackRot: [number, number, number] = (() => {
    if (
      zone.anchor.z < -0.05 ||
      zone.key.includes("back") ||
      zone.key.includes("rear") ||
      zone.key.includes("glute")
    ) {
      return [0, Math.PI, 0];
    }
    if (zone.anchor.x > 0.25)  return [0,  Math.PI * 0.18, 0];
    if (zone.anchor.x < -0.25) return [0, -Math.PI * 0.18, 0];
    return [0, 0, 0];
  })();

  // Dashed border position/orientation: flush on surface with 2mm normal offset
  const borderPos: [number, number, number] = result.hitPoint && result.hitNormal
    ? [
        result.hitPoint.x + result.hitNormal.x * 0.002,
        result.hitPoint.y + result.hitNormal.y * 0.002,
        result.hitPoint.z + result.hitNormal.z * 0.002,
      ]
    : fallbackPos;

  const borderRot: [number, number, number] = result.hitNormal
    ? (() => {
        const e = normalToEuler(result.hitNormal);
        return [e.x, e.y, e.z];
      })()
    : fallbackRot;

  // Debug label position: just above the hit/fallback point
  const labelPos: [number, number, number] = result.hitPoint
    ? [result.hitPoint.x, result.hitPoint.y + h * 0.5 + 0.05, result.hitPoint.z + 0.03]
    : [zone.anchor.x, zone.anchor.y + h * 0.5 + 0.05, zone.anchor.z + 0.03];

  return (
    <group
      onClick={(e) => { e.stopPropagation(); onSelect(zone.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      {/* Clickable decal surface — drawn before the logo so the logo layers on top */}
      <mesh
        geometry={result.geometry}
        position={isFallback ? fallbackPos : undefined}
        rotation={isFallback ? fallbackRot : undefined}
        renderOrder={1}
      >
        <meshStandardMaterial
          color={fillColor}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={fillOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Claimed spot: the purchased logo, projected onto the same surface as the patch */}
      {isOccupied && zone.placement?.brandLogoUrl && result.logoGeometry && (
        <ZoneLogoDecal
          url={zone.placement.brandLogoUrl}
          geometry={result.logoGeometry}
          position={isFallback ? fallbackPos : undefined}
          rotation={isFallback ? fallbackRot : undefined}
        />
      )}

      {/* Pulsing glow marker beacon at zone center — empty / unclaimed zones only */}
      {!isOccupied && (
        <PulsingZoneMarker
          position={borderPos}
          rotation={borderRot}
          tierKey={tierKey}
          hovered={hovered}
        />
      )}

      {/* Dashed border outline — for available/unclaimed zones only */}
      {/* Contrast-adaptive: light borders on dark clothing, dark borders on light clothing */}
      {!isOccupied && (() => {
        // Determine if zone sits on dark or light clothing
        const darkClothingZones = [
          'chest_center', 'back_upper',
          'left_thigh_front', 'right_thigh_front',
          'left_calf', 'right_calf',
          'left_lower_back', 'right_lower_back',
          'left_calf_back', 'right_calf_back',
        ];
        const onDarkClothing = darkClothingZones.includes(zone.key);
        const borderColor = hovered
          ? (onDarkClothing ? '#38bdf8' : '#38bdf8') // hover: always bright cyan
          : (onDarkClothing ? '#e2e8f0' : '#0f172a'); // rest: light on dark, dark on light
        const borderOpacity = hovered ? 1.0 : (onDarkClothing ? 0.85 : 0.90);

        return (
          <primitive
            // Block body (not a concise arrow): React 19 treats a value
            // returned from a ref callback as a cleanup function, and
            // computeLineDistances() returns the Line itself — which raised
            // "_fiber.refCleanup is not a function" in the R3F reconciler.
            ref={(lineObj: any) => {
              lineObj?.computeLineDistances();
              // Belt-and-braces: also opt out of hit-testing imperatively, so the
              // border can never become clickable even if R3F skips re-applying
              // this prop on a re-render. See NO_RAYCAST above.
              if (lineObj) lineObj.raycast = NO_RAYCAST;
            }}
            // Decorative only — see NO_RAYCAST above. Without this, the Line's
            // default 1-unit raycast threshold makes the whole surrounding body
            // clickable for this spot.
            raycast={NO_RAYCAST}
            object={new (THREE as any).Line(borderGeo, new THREE.LineDashedMaterial({ color: borderColor, dashSize: 0.014, gapSize: 0.009, depthWrite: false, transparent: true, opacity: borderOpacity }))}
            position={borderPos}
            rotation={borderRot}
          />
        );
      })()}

      {/* Debug labels — only when Ctrl+D is active */}
      {showDebugLabel && (
        <Html
          center
          distanceFactor={3.5}
          position={labelPos}
          style={{ pointerEvents: "none" }}
        >
          <div className="flex flex-col items-center gap-0.5 whitespace-nowrap select-none">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium shadow-lg ${
                result.type === "decal"
                  ? "bg-green-950/90 text-green-300 border border-green-500/40"
                  : "bg-red-950/90 text-red-300 border border-red-500/40"
              }`}
            >
              {result.type === "decal" ? "✓ Surface hit" : "⚠ Fallback"} · {zone.label}
            </span>
            {result.hitPoint && (
              <span className="bg-black/90 text-zinc-400 text-[9px] font-mono px-1 rounded border border-white/10">
                hit:[{result.hitPoint.x.toFixed(2)},{result.hitPoint.y.toFixed(2)},{result.hitPoint.z.toFixed(2)}]
              </span>
            )}
            <span className="bg-black/90 text-zinc-500 text-[9px] font-mono px-1 rounded border border-white/10">
              aim:[{zone.anchor.x.toFixed(2)},{zone.anchor.y.toFixed(2)},{zone.anchor.z.toFixed(2)}]
              {zone.normal && ` n:[${zone.normal.x.toFixed(1)},${zone.normal.y.toFixed(1)},${zone.normal.z.toFixed(1)}]`}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

export type { ZoneData };
