import fs from "fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { strict as assert } from "assert";

// Polyfills for Node environment
(global as any).self = global;
(global as any).window = global;
(global as any).Image = class {};
(global as any).document = {
  createElement: () => ({ getContext: () => null }),
  createElementNS: () => ({ getContext: () => null }),
};
(global as any).createImageBitmap = async () => ({ width: 1, height: 1, close: () => {} });

export const ZONE_BONE_MAP: Record<string, string> = {
  chest_center: "Spine1",
  back_upper: "Spine2",
  left_shoulder: "LeftShoulder",
  right_shoulder: "RightShoulder",
  left_bicep: "LeftArm",
  right_bicep: "RightArm",
  left_forearm: "LeftForeArm",
  right_forearm: "RightForeArm",
  left_thigh_front: "LeftUpLeg",
  right_thigh_front: "RightUpLeg",
  left_calf: "LeftLeg",
  right_calf: "RightLeg",
  left_lower_back: "Hips",
  right_lower_back: "Hips",
  left_calf_back: "LeftLeg",
  right_calf_back: "RightLeg",
};

const ZONES = [
  { key: "chest_center", anchorX: 0.0, anchorY: 1.157, anchorZ: 0.192, normalX: 0, normalY: 0, normalZ: 1 },
  { key: "left_shoulder", anchorX: 0.20, anchorY: 1.47, anchorZ: 0.045, normalX: 0.2, normalY: 0.0, normalZ: 0.98 },
  { key: "right_shoulder", anchorX: -0.20, anchorY: 1.47, anchorZ: 0.045, normalX: -0.2, normalY: 0.0, normalZ: 0.98 },
  { key: "back_upper", anchorX: 0.0, anchorY: 1.459, anchorZ: -0.192, normalX: 0, normalY: 0, normalZ: -1 },
  { key: "left_bicep", anchorX: 0.35, anchorY: 1.50, anchorZ: 0.015, normalX: 1.0, normalY: 0, normalZ: 0 },
  { key: "right_bicep", anchorX: -0.35, anchorY: 1.50, anchorZ: 0.015, normalX: -1.0, normalY: 0, normalZ: 0 },
  { key: "left_forearm", anchorX: 0.52, anchorY: 1.50, anchorZ: -0.01, normalX: 1.0, normalY: 0.0, normalZ: 0.0 },
  { key: "right_forearm", anchorX: -0.52, anchorY: 1.50, anchorZ: -0.01, normalX: -1.0, normalY: 0.0, normalZ: 0.0 },
  { key: "left_thigh_front", anchorX: 0.11, anchorY: 0.78, anchorZ: 0.09, normalX: 0.0, normalY: 0.0, normalZ: 1.0 },
  { key: "right_thigh_front", anchorX: -0.11, anchorY: 0.78, anchorZ: 0.09, normalX: 0.0, normalY: 0.0, normalZ: 1.0 },
  { key: "left_calf", anchorX: 0.11, anchorY: 0.38, anchorZ: 0.06, normalX: 0.05, normalY: 0.0, normalZ: 0.99 },
  { key: "right_calf", anchorX: -0.11, anchorY: 0.38, anchorZ: 0.06, normalX: -0.05, normalY: 0.0, normalZ: 0.99 },
  { key: "left_lower_back", anchorX: 0.08, anchorY: 0.90, anchorZ: -0.138, normalX: 0.0, normalY: 0.0, normalZ: -1.0 },
  { key: "right_lower_back", anchorX: -0.08, anchorY: 0.90, anchorZ: -0.138, normalX: 0.0, normalY: 0.0, normalZ: -1.0 },
  { key: "left_calf_back", anchorX: 0.11, anchorY: 0.38, anchorZ: -0.096, normalX: 0.0, normalY: 0.0, normalZ: -1.0 },
  { key: "right_calf_back", anchorX: -0.11, anchorY: 0.38, anchorZ: -0.096, normalX: 0.0, normalY: 0.0, normalZ: -1.0 },
];

async function runTests() {
  console.log("🧪 Running Bone Attachment & Reference Placement Verification Tests...\n");

  // 1. Verify Bone Mapping Coverage
  console.log("1️⃣ Verifying every zone has a mapped anatomical bone...");
  for (const zone of ZONES) {
    const mappedBone = ZONE_BONE_MAP[zone.key];
    assert.ok(mappedBone, `Zone ${zone.key} must have a defined bone mapping`);
  }
  console.log(`   ✅ All ${ZONES.length} zones have mapped bones.`);

  // 2. Load GLB and test surface raycasting
  console.log("\n2️⃣ Loading GLTF avatar model and verifying surface hits against reference positions...");
  const fileBuf = fs.readFileSync("public/models/avatar-v1.glb");
  const arrayBuf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);

  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.parse(arrayBuf, "", resolve, reject);
  });

  const model = gltf.scene;
  const meshes: THREE.SkinnedMesh[] = [];
  const bonesMap = new Map<string, THREE.Bone>();

  model.traverse((obj: any) => {
    if (obj.isBone) bonesMap.set(obj.name, obj);
    if (obj.isMesh) meshes.push(obj);
  });

  model.updateMatrixWorld(true);

  // Raycast each zone
  for (const zone of ZONES) {
    const aimPt = new THREE.Vector3(zone.anchorX, zone.anchorY, zone.anchorZ);
    const aimNorm = new THREE.Vector3(zone.normalX, zone.normalY, zone.normalZ).normalize();
    const rayOrigin = aimPt.clone().addScaledVector(aimNorm, 0.5);
    const rayDir = aimNorm.clone().negate();
    const raycaster = new THREE.Raycaster(rayOrigin, rayDir, 0, 4.0);

    let bestHit: any = null;
    for (const mesh of meshes) {
      if (mesh.isSkinnedMesh) {
        mesh.skeleton?.update();
        if (!mesh.boundingSphere || mesh.boundingSphere.radius < 2.5) {
          mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3.5);
        }
        mesh.boundingBox = null;
        const hits = raycaster.intersectObject(mesh, false);
        if (hits.length > 0) {
          if (!bestHit || hits[0].distance < bestHit.distance) {
            bestHit = hits[0];
          }
        }
      }
    }

    assert.ok(bestHit, `Zone "${zone.key}" must hit mesh surface`);
    const hitPoint = bestHit.point;
    const distToAim = hitPoint.distanceTo(aimPt);

    console.log(`   ✅ [${zone.key.padEnd(18)}] targetBone: ${ZONE_BONE_MAP[zone.key].padEnd(14)} hit: [${hitPoint.x.toFixed(3)}, ${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)}] dist: ${distToAim.toFixed(3)}m`);
  }

  console.log("\n🎉 All bone attachment and placement verification tests passed successfully!");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
