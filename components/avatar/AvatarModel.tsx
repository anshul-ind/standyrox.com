"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Group } from "three";

export const GLB_PATH = "/models/avatar-v1.glb";

useGLTF.preload(GLB_PATH);

export interface ModelDimensions {
  modelHeight: number;
  modelWidth: number;
  modelDepth: number;
  feetY: number;
  centerX: number;
}

export default function AvatarModel({
  position = [0, 0, 0],
  scale = 1,
  onDimensionsMeasured,
  onSceneReady,
}: {
  position?: [number, number, number];
  scale?: number;
  onDimensionsMeasured?: (dims: ModelDimensions) => void;
  /** Fired once after GLB is cloned and ready — pass the scene to raycast against */
  onSceneReady?: (scene: THREE.Group) => void;
}) {
  const { scene } = useGLTF(GLB_PATH) as { scene: Group };
  const measuredRef = useRef(false);
  const sceneReadyFiredRef = useRef(false);

  // Use SkeletonUtils.clone to re-bind cloned SkinnedMeshes to cloned bones
  const model = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene]);

  // Fire onSceneReady once the clone is available.
  // We ensure vertex normals are computed on every mesh so DecalGeometry works.
  useEffect(() => {
    if (sceneReadyFiredRef.current) return;
    sceneReadyFiredRef.current = true;

    // Find all meshes
    const meshes: THREE.Mesh[] = [];
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        meshes.push(mesh);
        if (!mesh.geometry.attributes.normal) {
          mesh.geometry.computeVertexNormals();
        }
      }
    });

    console.log("Avatar meshes found:", meshes.map(m => `${m.name} (${m.type})`));
    onSceneReady?.(model);
  }, [model, onSceneReady]);

  // Measure actual bounding box
  useEffect(() => {
    if (measuredRef.current) return;
    const box = new THREE.Box3().setFromObject(model);
    const dims: ModelDimensions = {
      modelHeight: +(box.max.y - box.min.y).toFixed(4),
      modelWidth: +(box.max.x - box.min.x).toFixed(4),
      modelDepth: +(box.max.z - box.min.z).toFixed(4),
      feetY: +box.min.y.toFixed(4),
      centerX: +((box.max.x + box.min.x) / 2).toFixed(4),
    };
    measuredRef.current = true;
    console.log("=== Real Measured Avatar Dimensions ===");
    console.log("modelHeight:", dims.modelHeight);
    console.log("modelWidth:", dims.modelWidth);
    console.log("modelDepth:", dims.modelDepth);
    console.log("feetY:", dims.feetY);
    console.log("centerX:", dims.centerX);
    console.log("=======================================");
    onDimensionsMeasured?.(dims);
  }, [model, onDimensionsMeasured]);

  // Dispose clone on unmount to prevent GPU buffer leaks
  useEffect(() => {
    return () => {
      model.traverse((obj) => {
        const mesh = obj as unknown as {
          geometry?: { dispose?: () => void };
          material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
        };
        mesh.geometry?.dispose?.();
        if (Array.isArray(mesh.material)) {
          for (const m of mesh.material) m?.dispose?.();
        } else {
          mesh.material?.dispose?.();
        }
      });
    };
  }, [model]);

  return (
    <primitive
      object={model}
      position={position}
      scale={scale}
      castShadow
      receiveShadow
    />
  );
}
