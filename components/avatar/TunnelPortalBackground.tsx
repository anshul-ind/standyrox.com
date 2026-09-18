/**
 * TunnelPortalBackground.tsx
 *
 * Drop-in R3F background replacing the old spotlight-beam rig.
 * Render this as a sibling inside your <Canvas>, alongside the avatar group —
 * do NOT nest it under the avatar or camera, so it stays fixed in world space
 * and never rotates with OrbitControls or the avatar's own transform.
 */

import * as React from "react";
import { useMemo } from "react";
import * as THREE from "three";

// ---------- shared colors ----------
const SKY_EDGE = new THREE.Color(0x040911);
const SKY_MID = new THREE.Color(0x0a1420);
const CYAN = 0x25c9e8;
const GRID_CYAN = 0x1bb8d6;
const PILLAR_COLOR = 0x050708;
const PANEL_FILL = 0x081119;

// ---------- glow-line helpers (fake neon: core + additive halo, no post-fx needed) ----------
function addGlowSegment(
  group: THREE.Group,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  coreRadius: number,
  color: number
) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 1e-5) return;
  dir.normalize();

  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir
  );
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(coreRadius, coreRadius, len, 6, 1, true),
    new THREE.MeshBasicMaterial({ color })
  );
  core.quaternion.copy(quat);
  core.position.copy(mid);
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(coreRadius * 3.2, coreRadius * 3.2, len, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.quaternion.copy(quat);
  glow.position.copy(mid);
  group.add(glow);
}

function addGlowJoint(group: THREE.Group, p: THREE.Vector3, coreRadius: number, color: number) {
  const sph = new THREE.Mesh(
    new THREE.SphereGeometry(coreRadius, 8, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  sph.position.copy(p);
  group.add(sph);
}

function addGlowPolyline(
  group: THREE.Group,
  points: THREE.Vector3[],
  coreRadius: number,
  color: number,
  closed: boolean
) {
  for (let i = 0; i < points.length - 1; i++) {
    addGlowSegment(group, points[i], points[i + 1], coreRadius, color);
    addGlowJoint(group, points[i], coreRadius, color);
  }
  addGlowJoint(group, points[points.length - 1], coreRadius, color);
  if (closed) addGlowSegment(group, points[points.length - 1], points[0], coreRadius, color);
}

function octagonGatePoints(w: number, h: number, chamfer: number): THREE.Vector3[] {
  const hw = w / 2;
  return [
    new THREE.Vector3(-hw, 0, 0),
    new THREE.Vector3(-hw, h - chamfer, 0),
    new THREE.Vector3(-hw + chamfer, h, 0),
    new THREE.Vector3(hw - chamfer, h, 0),
    new THREE.Vector3(hw, h - chamfer, 0),
    new THREE.Vector3(hw, 0, 0),
  ];
}

// ---------- 1. Gradient sky ----------
function GradientSky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          colorEdge: { value: SKY_EDGE },
          colorMid: { value: SKY_MID },
          radius: { value: 90 },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 colorEdge;
          uniform vec3 colorMid;
          uniform float radius;
          varying vec3 vPos;
          void main() {
            float t = 1.0 - clamp(abs(vPos.y) / radius, 0.0, 1.0);
            float s = smoothstep(0.0, 1.0, t);
            gl_FragColor = vec4(mix(colorEdge, colorMid, s), 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    []
  );

  return (
    <mesh material={material}>
      <sphereGeometry args={[90, 32, 32]} />
    </mesh>
  );
}

// ---------- background particles ----------
function BackgroundParticles({ count = 220 }: { count?: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const seed = ((i * 9301 + 49297) % 233280) / 233280;
      const seed2 = ((i * 49297 + 9301) % 233280) / 233280;
      const seed3 = ((i * 12345 + 6789) % 233280) / 233280;
      const r = 30 + seed * 55;
      const theta = seed2 * Math.PI * 2;
      const phi = Math.acos(seed3 * 1.6 - 0.8);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 2.0;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color={0xffffff}
        size={0.14}
        transparent
        opacity={0.2}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ---------- 2. Floor grid ----------
function FloorGrid() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(60, 60, GRID_CYAN, GRID_CYAN);
    const mats = Array.isArray(g.material) ? g.material : [g.material];
    mats.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.28;
    });
    return g;
  }, []);

  return <primitive object={grid} position={[0, 0, 0]} />;
}

// ---------- 3. Pillars ----------
const PILLAR_DATA = [
  { x: -2.6, z: 1.0, h: 3.0 },
  { x: -3.3, z: -0.8, h: 3.8 },
  { x: -4.1, z: -2.6, h: 4.6 },
  { x: -4.9, z: -4.6, h: 5.8 },
  { x: -5.7, z: -6.8, h: 7.2 },
  { x: -6.5, z: -9.2, h: 6.4 },
  { x: -7.3, z: -12.0, h: 8.4 },
];
const PILLAR_W = 0.55;
const PILLAR_D = 0.55;

function Pillars() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const pillarMat = new THREE.MeshBasicMaterial({ color: PILLAR_COLOR });

    PILLAR_DATA.forEach((p) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(PILLAR_W, p.h, PILLAR_D),
        pillarMat
      );
      mesh.position.set(p.x, p.h / 2, p.z);
      g.add(mesh);

      const ex = p.x - PILLAR_W / 2;
      const ez = p.z + PILLAR_D / 2;
      addGlowPolyline(
        g,
        [new THREE.Vector3(ex, 0, ez), new THREE.Vector3(ex, p.h, ez)],
        0.018,
        CYAN,
        false
      );
    });

    return g;
  }, []);

  return <primitive object={group} />;
}

// ---------- 4. Nested tunnel arch rings ----------
const RING_CONFIGS = [
  { z: -3.0, scale: 1.0 },
  { z: -6.0, scale: 0.82 },
  { z: -9.0, scale: 0.66 },
  { z: -12.5, scale: 0.5 },
];
const BASE_W = 6.2;
const BASE_H = 7.2;
const BASE_CHAMFER = 1.7;

function TunnelRings() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    RING_CONFIGS.forEach((cfg) => {
      const pts2D = octagonGatePoints(
        BASE_W * cfg.scale,
        BASE_H * cfg.scale,
        BASE_CHAMFER * cfg.scale
      );
      const pts = pts2D.map((v) => new THREE.Vector3(v.x, v.y, cfg.z));
      addGlowPolyline(g, pts, 0.03, CYAN, false);
    });
    return g;
  }, []);

  // scene-root child (not parented to avatar/camera) => stays fixed during orbit
  return <primitive object={group} />;
}

// ---------- 5. Floating screen panel (placeholder, static in world space) ----------
function FloatingScreenPanel() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const panelW = 1.9;
    const panelH = 2.5;
    const center = new THREE.Vector3(0, 2.6, -6.5);

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(panelW, panelH),
      new THREE.MeshBasicMaterial({ color: PANEL_FILL, transparent: true, opacity: 0.85 })
    );
    fill.position.copy(center);
    g.add(fill);

    const hw = panelW / 2;
    const hh = panelH / 2;
    const corner = 0.14;
    const borderPts = [
      new THREE.Vector3(center.x - hw + corner, center.y - hh, center.z),
      new THREE.Vector3(center.x + hw - corner, center.y - hh, center.z),
      new THREE.Vector3(center.x + hw, center.y - hh + corner, center.z),
      new THREE.Vector3(center.x + hw, center.y + hh - corner, center.z),
      new THREE.Vector3(center.x + hw - corner, center.y + hh, center.z),
      new THREE.Vector3(center.x - hw + corner, center.y + hh, center.z),
      new THREE.Vector3(center.x - hw, center.y + hh - corner, center.z),
      new THREE.Vector3(center.x - hw, center.y - hh + corner, center.z),
    ];
    addGlowPolyline(g, borderPts, 0.014, CYAN, true);

    return g;
  }, []);

  return <primitive object={group} />;
}

// ---------- main export ----------
export default function TunnelPortalBackground() {
  return (
    <group>
      <fog attach="fog" args={[0x040911, 14, 46]} />
      <GradientSky />
      <BackgroundParticles />
      <FloorGrid />
      <Pillars />
      <TunnelRings />
      <FloatingScreenPanel />
    </group>
  );
}
