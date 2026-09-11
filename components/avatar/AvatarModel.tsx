"use client";

import { useGLTF } from "@react-three/drei";
import type { Group } from "three";

const GLB_PATH = "/models/avatar-v1.glb";

useGLTF.preload(GLB_PATH);

export default function AvatarModel({
  position = [0, 0, 0],
  scale = 1,
}: {
  position?: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(GLB_PATH) as { scene: Group };

  return (
    <primitive
      object={scene}
      position={position}
      scale={scale}
    />
  );
}
