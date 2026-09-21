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

    // Find all meshes and calibrate materials for proper diffuse and specular lighting
    const meshes: THREE.Mesh[] = [];
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        meshes.push(mesh);
        if (mesh.geometry && !mesh.geometry.attributes.normal) {
          mesh.geometry.computeVertexNormals();
        }

        if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) {
          (mesh as THREE.SkinnedMesh).skeleton?.update();
        }

        // Prevent PBR metalness blackout (Avaturn GLTF defaults metalness to 1.0 on shoes/body)
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (mat && "metalness" in mat) {
            const stdMat = mat as THREE.MeshStandardMaterial;
            stdMat.metalness = 0.05;
            stdMat.roughness = 0.65;
            stdMat.needsUpdate = true;
          }
        });
      }
    });

    model.updateMatrixWorld(true);
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
