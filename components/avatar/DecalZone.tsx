"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { Html, useTexture } from "@react-three/drei";
import { formatUSDFromCents } from "@/lib/format";
import type { ZoneData } from "./ZoneRectangle";
import { useTheme } from "@/lib/theme-context";
import { playSoundFX } from "@/components/ui/AudioController";
import { AVATAR_GROUND_BASE_Y } from "./AvatarScene";

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
const LOGO_INSET = 1.0;

// ─── Tier colour palette ──────────────────────────────────────────────────────
const TIER_COLORS = {
  signature: { fill: 0xffc107, border: 0xffe57a, emissive: 0x7a4400, scale: 1.2 },
  prime:     { fill: 0x00b4d8, border: 0x90e0ef, emissive: 0x003244, scale: 1.0 },
  featured:  { fill: 0x4cc9f0, border: 0xa8dadc, emissive: 0x003244, scale: 1.0 },
  standard:  { fill: 0x7209b7, border: 0xb5179e, emissive: 0x1a0030, scale: 0.85 },
} as const;
type TierKey = keyof typeof TIER_COLORS;

/**
 * Return the anatomical body curvature radius (in meters) for a zone key
 * so that rectangular spot planes wrap flush against the avatar body.
 */
function getZoneCurvatureRadius(zoneKey: string): number {
  if (zoneKey.includes("chest") || zoneKey.includes("back")) {
    return 0.22; // Chest/back torso radius
  }
  if (zoneKey.includes("bicep") || zoneKey.includes("forearm")) {
    return 0.08; // Arm cylinder radius
  }
  if (zoneKey.includes("thigh") || zoneKey.includes("calf")) {
    return 0.10; // Leg cylinder radius
  }
  if (zoneKey.includes("shoulder")) {
    return 0.14; // Shoulder curvature radius
  }
  return 0.20;
}

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
  const { theme, colors } = useTheme();
  const groupRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const isRed = theme === "red";
  const primaryGlow = isRed ? "#ff2a55" : "#00d4ff";
  const primaryRing = isRed ? "#ff4069" : "#00f0ff";

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
          color={primaryGlow}
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
          color={primaryRing}
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
        <meshBasicMaterial color={primaryGlow} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.003]} raycast={NO_RAYCAST}>
        <planeGeometry args={[0.016, 0.003]} />
        <meshBasicMaterial color={primaryGlow} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Brand logo texture fitting ──────────────────────────────────────────────
/**
 * Calculate full-cover image dimensions that completely cover the maxWidth × maxHeight box
 * without leaving empty transparent margins. Equivalent to CSS `object-fit: cover`.
 */
function calcCoverSize(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number,
): { drawW: number; drawH: number } {
  if (
    !isFinite(imgW) || imgW <= 0 ||
    !isFinite(imgH) || imgH <= 0 ||
    !isFinite(maxW) || maxW <= 0 ||
    !isFinite(maxH) || maxH <= 0
  ) {
    return { drawW: Math.max(maxW, 0.01), drawH: Math.max(maxH, 0.01) };
  }

  const imgAspect = imgW / imgH;
  const zoneAspect = maxW / maxH;

  if (imgAspect > zoneAspect) {
    // Image is wider than zone -> scale height to fill, center width
    return { drawW: maxH * imgAspect, drawH: maxH };
  } else {
    // Image is taller than zone -> scale width to fill, center height
    return { drawW: maxW, drawH: maxW / imgAspect };
  }
}

/**
 * Draw an image onto a canvas using object-fit:cover logic.
 * Returns a THREE.CanvasTexture whose aspect ratio matches the advertising
 * zone, with the source image filling the entire area (0% transparent borders).
 */
function buildCoverTexture(
  img: CanvasImageSource & { width: number; height: number },
  zoneW: number,
  zoneH: number,
  originalTexture: THREE.Texture,
): THREE.Texture {
  if (
    typeof document === "undefined" ||
    !img.width || !img.height ||
    !isFinite(zoneW) || zoneW <= 0 ||
    !isFinite(zoneH) || zoneH <= 0
  ) {
    return originalTexture;
  }

  const zoneAspect = zoneW / zoneH;

  // Canvas resolution: cap at 1024 px on the longest side for GPU memory
  const MAX_CANVAS = 1024;
  let canvasW: number;
  let canvasH: number;
  if (zoneAspect >= 1) {
    canvasW = MAX_CANVAS;
    canvasH = Math.round(MAX_CANVAS / zoneAspect);
  } else {
    canvasH = MAX_CANVAS;
    canvasW = Math.round(MAX_CANVAS * zoneAspect);
  }
  canvasW = Math.max(canvasW, 1);
  canvasH = Math.max(canvasH, 1);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return originalTexture;

  ctx.clearRect(0, 0, canvasW, canvasH);

  const { drawW, drawH } = calcCoverSize(
    img.width, img.height,
    canvasW, canvasH,
  );

  const x = (canvasW - drawW) / 2;
  const y = (canvasH - drawH) / 2;

  try {
    ctx.drawImage(img, x, y, drawW, drawH);
  } catch {
    return originalTexture;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ─── Brand logo projected onto a claimed spot ────────────────────────────────
function ZoneLogoDecal({
  url,
  geometry,
  position,
  rotation,
  zoneWidth,
  zoneHeight,
}: {
  url: string;
  geometry: THREE.BufferGeometry;
  /** Only needed for the flat-plane fallback, when no surface was hit. */
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Effective advertising-zone dimensions (3-D units) the logo must fit inside. */
  zoneWidth: number;
  zoneHeight: number;
}) {
  const rawTexture = useTexture(url);

  // Build a full-cover canvas texture once per (url × zone dims) so the image fills the rectangle.
  const coveredTexture = useMemo<THREE.Texture>(() => {
    const img = rawTexture?.image as
      | (CanvasImageSource & { width: number; height: number })
      | undefined;
    if (!img || !img.width || !img.height) return rawTexture;
    return buildCoverTexture(img, zoneWidth, zoneHeight, rawTexture);
  }, [rawTexture, zoneWidth, zoneHeight]);

  // Dispose the canvas texture we created
  useEffect(() => {
    return () => {
      if (coveredTexture !== rawTexture) {
        coveredTexture.dispose();
      }
    };
  }, [coveredTexture, rawTexture]);

  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={rotation}
      renderOrder={2}
    >
      <meshBasicMaterial
        map={coveredTexture}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
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
 * Raycast against avatar meshes, returning hit data in BOTH world space AND
 * FloatingAvatarGroup LOCAL coordinate space.
 *
 * worldPoint is required for DecalGeometry on SkinnedMesh: DecalGeometry clips
 * against vertex positions as they exist in the coordinate space implied by the
 * mesh's matrixWorld. For a SkinnedMesh with bones applied, those positions are
 * in world space. Passing a local-space point to DecalGeometry with a real
 * matrixWorld causes a mismatch — the projector box misses the surface.
 */
function raycastLocalSpace(
  meshes: THREE.Mesh[],
  rayOrigin: THREE.Vector3,
  rayDir: THREE.Vector3,
  groupWorldMatrix: THREE.Matrix4
): { mesh: THREE.Mesh; point: THREE.Vector3; worldPoint: THREE.Vector3; faceNormal: THREE.Vector3; distance: number } | null {
  const MAX_DIST = 4.0;
  let best: { dist: number; mesh: THREE.Mesh; point: THREE.Vector3; worldPoint: THREE.Vector3; faceNormal: THREE.Vector3 } | null = null;

  // World-space ray (for SkinnedMesh whose raycast() uses matrixWorld internally)
  const worldOrigin = rayOrigin.clone().applyMatrix4(groupWorldMatrix);
  const worldDir    = rayDir.clone().transformDirection(groupWorldMatrix).normalize();
  const worldRaycaster = new THREE.Raycaster(worldOrigin, worldDir, 0, MAX_DIST);

  // Local-space ray (for regular Mesh with identity matrixWorld trick)
  const localRaycaster = new THREE.Raycaster(rayOrigin.clone(), rayDir.clone().normalize(), 0, MAX_DIST);

  // Inverse group world matrix — convert world-space hit back to local space
  const invGroupMatrix = groupWorldMatrix.clone().invert();

  for (const mesh of meshes) {
    const isSkinnedMesh = (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh === true;

    if (isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh;
      skinned.skeleton?.update();
      skinned.updateMatrixWorld(true);
      if (!skinned.boundingSphere || skinned.boundingSphere.radius < 2.5) {
        skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9 + AVATAR_GROUND_BASE_Y, 0), 3.5);
      }
      (skinned as unknown as { boundingBox: THREE.Box3 | null }).boundingBox = null;

      const hits = worldRaycaster.intersectObject(mesh, false);
      if (hits.length > 0) {
        const h = hits[0];
        // h.point is in WORLD space. Store both for downstream use.
        const worldPoint = h.point.clone();
        const localPoint = worldPoint.clone().applyMatrix4(invGroupMatrix);
        const rawNormal = h.normal ?? h.face?.normal ?? new THREE.Vector3(0, 0, 1);
        const worldNormal = rawNormal.clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
          .normalize();
        const localNormal = worldNormal.clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(invGroupMatrix))
          .normalize();
        if (!best || h.distance < best.dist) {
          best = { dist: h.distance, mesh, point: localPoint, worldPoint, faceNormal: localNormal };
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
        const localPt = h.point.clone(); // already local (identity trick)
        const worldPt = localPt.clone().applyMatrix4(groupWorldMatrix);
        if (!best || h.distance < best.dist) {
          best = {
            dist: h.distance,
            mesh,
            point: localPt,
            worldPoint: worldPt,
            faceNormal: h.face!.normal.clone().normalize(),
          };
        }
      }
    }
  }

  if (!best) return null;
  return { mesh: best.mesh, point: best.point, worldPoint: best.worldPoint, faceNormal: best.faceNormal, distance: best.dist };
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

    // Ensure avatarScene has its world matrix updated with the ground base elevation
    avatarScene.position.set(0, AVATAR_GROUND_BASE_Y, 0);
    avatarScene.updateMatrixWorld(true);

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

      // Orientation derived from the raycast face normal — correct per-zone surface direction.
      const orientation = normalToEuler(hit.faceNormal);

      // Body-conforming curved rectangular plane at the local hit point.
      const SURFACE_OFFSET = 0.003;
      const R = getZoneCurvatureRadius(zone.key);

      const buildCurvedPlane = (factor: number, extraNormalOffset = 0): THREE.BufferGeometry => {
        const widthVal = w * tier.scale * factor;
        const heightVal = h * tier.scale * factor;
        const geo = new THREE.PlaneGeometry(widthVal, heightVal, 24, 2);
        const posAttr = geo.attributes.position as THREE.BufferAttribute;

        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          // Cylindrical curvature along X: curve backwards in -Z so edges hug the body
          const deltaZ = -(R - Math.sqrt(Math.max(0, R * R - vx * vx)));
          posAttr.setZ(i, deltaZ);
        }
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();

        geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(orientation));
        const offsetPt = hit.point.clone().addScaledVector(hit.faceNormal, SURFACE_OFFSET + extraNormalOffset);
        geo.translate(offsetPt.x, offsetPt.y, offsetPt.z);
        return geo;
      };

      newGeo = buildCurvedPlane(1, 0);
      if (needsLogo) {
        newLogoGeo = buildCurvedPlane(LOGO_INSET, 0.001);
      }

      hitPoint  = hit.point;
      hitNormal = hit.faceNormal;
    } else {
      // ── Fallback: flat plane at estimated anchor ──
      console.warn(
        `[${zone.key}] RAYCAST MISS — reason: no surface intersection found along ray from origin (${rayOrigin.toArray().map(v=>v.toFixed(2)).join(",")}) dir (${rayDir.toArray().map(v=>v.toFixed(2)).join(",")}) — using estimated fallback`
      );

      const FALLBACK_OFFSET = 0.003;
      const fallbackOrientation = normalToEuler(aimNorm);
      const R_fb = getZoneCurvatureRadius(zone.key);

      const buildFallbackPlane = (factor: number): THREE.BufferGeometry => {
        const widthVal = w * tier.scale * factor;
        const heightVal = h * tier.scale * factor;
        const geo = new THREE.PlaneGeometry(widthVal, heightVal, 24, 2);
        const posAttr = geo.attributes.position as THREE.BufferAttribute;

        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const deltaZ = -(R_fb - Math.sqrt(Math.max(0, R_fb * R_fb - vx * vx)));
          posAttr.setZ(i, deltaZ);
        }
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();

        geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(fallbackOrientation));
        const anchor = aimPt.clone().addScaledVector(aimNorm, FALLBACK_OFFSET);
        geo.translate(anchor.x, anchor.y, anchor.z);
        return geo;
      };

      newGeo = buildFallbackPlane(1);
      if (needsLogo) {
        newLogoGeo = buildFallbackPlane(LOGO_INSET);
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

  // ── Dashed border geometry for unclaimed zones (body-curved) ────────────────
  const borderGeo = useMemo(() => {
    const hw = (w * tier.scale) / 2;
    const hh = (h * tier.scale) / 2;
    const R_border = getZoneCurvatureRadius(zone.key);
    const numSegs = 16;
    const pts: THREE.Vector3[] = [];

    const curveZ = (x: number) => -(R_border - Math.sqrt(Math.max(0, R_border * R_border - x * x)));

    // Top edge: -hw to +hw
    for (let i = 0; i <= numSegs; i++) {
      const x = -hw + (2 * hw * i) / numSegs;
      pts.push(new THREE.Vector3(x, hh, curveZ(x)));
    }
    // Right edge: hh to -hh
    pts.push(new THREE.Vector3(hw, -hh, curveZ(hw)));
    // Bottom edge: +hw to -hw
    for (let i = 0; i <= numSegs; i++) {
      const x = hw - (2 * hw * i) / numSegs;
      pts.push(new THREE.Vector3(x, -hh, curveZ(x)));
    }
    // Left edge: -hh to hh
    pts.push(new THREE.Vector3(-hw, hh, curveZ(-hw)));

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineDistances = [0];
    for (let i = 1; i < pts.length; i++) {
      lineDistances[i] = lineDistances[i - 1] + pts[i - 1].distanceTo(pts[i]);
    }
    geo.setAttribute("lineDistance", new THREE.Float32BufferAttribute(lineDistances, 1));
    return geo;
  }, [w, h, tier.scale, zone.key]);

  useEffect(() => {
    return () => {
      borderGeo.dispose();
    };
  }, [borderGeo]);

  // ── Rendering ───────────────────────────────────────────────────────────────
  if (!result) return null; // decal not ready yet — no flash

  const { theme, colors } = useTheme();
  const isRed = theme === "red";

  // Visual styling:
  // - Unclaimed: transparent faint fill (0.04) + neutral dark dashed border
  // - Occupied with logo: clean full-cover brand logo without green border bleed
  // - Occupied without logo: solid full-opacity placement fill
  const hasLogo = Boolean(isOccupied && zone.placement?.brandLogoUrl);
  const fillColor = isOccupied ? (hasLogo ? 0x050c18 : 0x22c55e) : 0x050c18;
  const fillOpacity = isOccupied ? (hasLogo ? 0.0 : 0.95) : (hovered ? 0.12 : 0.04);
  const emissiveColor = isOccupied ? (hasLogo ? 0x000000 : 0x113300) : (hovered ? colors.primaryHex : 0x000000);
  const emissiveIntensity = isOccupied ? (hasLogo ? 0.0 : 0.6) : (hovered ? 0.25 : 0.0);

  // DecalGeometry vertices carry their own local position — no extra transform needed.
  // Fallback plane geometry is already positioned/rotated by buildFallbackPlane.
  // In both cases the mesh gets NO position/rotation props (they are baked into the geometry).
  const isFallback = result.type === "fallback";

  // Dashed border position/orientation: flush on surface with 2mm normal offset.
  // For fallback (no hit), use the anchor pushed outward along the zone normal.
  const rawNormFB = zone.normal ?? { x: 0, y: 0, z: 1 };
  const aimNormFB = new THREE.Vector3(rawNormFB.x, rawNormFB.y, rawNormFB.z).normalize();

  const borderPos: [number, number, number] = result.hitPoint && result.hitNormal
    ? [
        result.hitPoint.x + result.hitNormal.x * 0.002,
        result.hitPoint.y + result.hitNormal.y * 0.002,
        result.hitPoint.z + result.hitNormal.z * 0.002,
      ]
    : [
        zone.anchor.x + aimNormFB.x * 0.003,
        zone.anchor.y + aimNormFB.y * 0.003,
        zone.anchor.z + aimNormFB.z * 0.003,
      ];

  // Border rotation from hit normal (accurate) or zone DB normal (fallback).
  const borderRot: [number, number, number] = (() => {
    const n = result.hitNormal ?? aimNormFB;
    const e = normalToEuler(n);
    return [e.x, e.y, e.z];
  })();

  // Debug label position: just above the hit/fallback point
  const labelPos: [number, number, number] = result.hitPoint
    ? [result.hitPoint.x, result.hitPoint.y + h * 0.5 + 0.05, result.hitPoint.z + 0.03]
    : [zone.anchor.x, zone.anchor.y + h * 0.5 + 0.05, zone.anchor.z + 0.03];

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        playSoundFX("select");
        onSelect(zone.id);
      }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      {/* Clickable decal surface — drawn before the logo so the logo layers on top.
          Both decal and fallback geometries have position/rotation baked in, so
          no mesh-level position/rotation prop is needed in either case. */}
      <mesh
        geometry={result.geometry}
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
        <Suspense fallback={null}>
          <ZoneLogoDecal
            url={zone.placement.brandLogoUrl}
            geometry={result.logoGeometry}
            zoneWidth={w * tier.scale * LOGO_INSET}
            zoneHeight={h * tier.scale * LOGO_INSET}
          />
        </Suspense>
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
        const hoverColor = isRed ? '#f43f5e' : '#38bdf8';
        const borderColor = hovered
          ? hoverColor // hover: theme-matched neon color
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
