"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { Html } from "@react-three/drei";
import { formatUSDFromCents } from "@/lib/format";
import type { ZoneData } from "./ZoneRectangle";

// ─── Tier colour palette ──────────────────────────────────────────────────────
const TIER_COLORS = {
  signature: { fill: 0xffc107, border: 0xffe57a, emissive: 0x7a4400, scale: 1.2 },
  prime:     { fill: 0x00b4d8, border: 0x90e0ef, emissive: 0x003244, scale: 1.0 },
  featured:  { fill: 0x4cc9f0, border: 0xa8dadc, emissive: 0x003244, scale: 1.0 },
  standard:  { fill: 0x7209b7, border: 0xb5179e, emissive: 0x1a0030, scale: 0.85 },
} as const;
type TierKey = keyof typeof TIER_COLORS;

// ─── Internal result type ─────────────────────────────────────────────────────
interface ZoneGeoResult {
  type: "decal" | "fallback";
  geometry: THREE.BufferGeometry;
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
      skinned.boundingBox = null;

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

    let newGeo: THREE.BufferGeometry;
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

      // DecalGeometry (Approach A): projects geometry onto actual mesh surface.
      // Temporarily set matrixWorld to identity so DecalGeometry operates in local space.
      const savedMW = hit.mesh.matrixWorld.clone();
      const savedNM = new THREE.Matrix3().copy(hit.mesh.normalMatrix);
      hit.mesh.matrixWorld.identity();
      hit.mesh.normalMatrix.identity();

      try {
        newGeo = new DecalGeometry(
          hit.mesh,
          hit.point,
          orientation,
          new THREE.Vector3(w * tier.scale, h * tier.scale, 0.04) // projector depth
        );
        if (!newGeo.attributes.position || newGeo.attributes.position.count === 0) {
          throw new Error("DecalGeometry produced empty buffer");
        }
      } catch (err) {
        // DecalGeometry can throw on degenerate meshes — fall back to oriented plane at surface hit point
        console.warn(`[${zone.key}] DecalGeometry threw:`, err, '— using surface-aligned flat plane fallback');
        newGeo = new THREE.PlaneGeometry(w * tier.scale, h * tier.scale);
        newGeo.applyEuler(orientation);
        newGeo.translate(hit.point.x, hit.point.y, hit.point.z);
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
    }

    // Dispose previous geometry to free GPU memory
    if (prevGeoRef.current) {
      prevGeoRef.current.dispose();
    }
    prevGeoRef.current = newGeo;

    setResult({ type: hit ? "decal" : "fallback", geometry: newGeo, hitPoint, hitNormal });
  }, [
    avatarScene,
    groupWorldMatrix,
    zone.id,
    zone.anchor.x, zone.anchor.y, zone.anchor.z,
    zone.normal?.x, zone.normal?.y, zone.normal?.z,
    zone.size.width, zone.size.height,
    zone.key,
    tier.scale,
    w, h,
  ]);

  // Dispose on unmount
  useEffect(() => {
    return () => {
      prevGeoRef.current?.dispose();
      prevGeoRef.current = null;
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
    if (zone.anchor.z < -0.05 || zone.key === "back_upper") return [0, Math.PI, 0];
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
      {/* Clickable decal surface */}
      <mesh
        geometry={result.geometry}
        position={isFallback ? fallbackPos : undefined}
        rotation={isFallback ? fallbackRot : undefined}
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

      {/* Dashed border outline — for available/unclaimed zones only */}
      {/* Contrast-adaptive: light borders on dark clothing, dark borders on light clothing */}
      {!isOccupied && (() => {
        // Determine if zone sits on dark or light clothing
        const darkClothingZones = [
          'chest_center', 'back_upper',
          'left_thigh_front', 'right_thigh_front',
          'left_calf', 'right_calf',
        ];
        const onDarkClothing = darkClothingZones.includes(zone.key);
        const borderColor = hovered
          ? (onDarkClothing ? '#38bdf8' : '#38bdf8') // hover: always bright cyan
          : (onDarkClothing ? '#e2e8f0' : '#0f172a'); // rest: light on dark, dark on light
        const borderOpacity = hovered ? 1.0 : (onDarkClothing ? 0.85 : 0.90);

        return (
          <line
            ref={(lineObj: any) => lineObj?.computeLineDistances()}
            geometry={borderGeo}
            position={borderPos}
            rotation={borderRot}
          >
            <lineDashedMaterial
              color={borderColor}
              dashSize={0.014}
              gapSize={0.009}
              depthWrite={false}
              transparent
              opacity={borderOpacity}
            />
          </line>
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
