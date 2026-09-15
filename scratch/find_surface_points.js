const fs = require('fs');

const buf = fs.readFileSync('public/models/avatar-v1.glb');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
const binStart = 20 + jsonLen + 8;

function getVertices(meshIndex) {
  const mesh = gltf.meshes[meshIndex];
  const prim = mesh.primitives[0];
  const acc = gltf.accessors[prim.attributes.POSITION];
  const bv = gltf.bufferViews[acc.bufferView];
  const start = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count;
  const vertices = [];
  for (let i = 0; i < count; i++) {
    const x = buf.readFloatLE(start + i * 12);
    const y = buf.readFloatLE(start + i * 12 + 4);
    const z = buf.readFloatLE(start + i * 12 + 8);
    vertices.push([x, y, z]);
  }
  return vertices;
}

// Read body and clothing vertices
const bodyVerts = getVertices(0);
const lookVerts = getVertices(3);
const allVerts = [...bodyVerts, ...lookVerts];
console.log('Total vertices to analyze:', allVerts.length);

function findRegionSurface(name, filterFn, selectFn) {
  const matched = allVerts.filter(filterFn);
  if (matched.length === 0) {
    console.log(name, ': no vertices found');
    return null;
  }
  const sorted = [...matched].sort(selectFn);
  const best = sorted[0];
  console.log(name, `(from ${matched.length} candidates):`, best.map(n => +n.toFixed(4)));
  return best;
}

console.log('\n--- Real Surface Analysis ---');

// 1. Chest Center: around y = 1.25 - 1.35, x within [-0.08, 0.08], maximize z
findRegionSurface(
  'chest_center (front surface max Z)',
  ([x, y, z]) => Math.abs(x) < 0.08 && y >= 1.25 && y <= 1.35,
  (a, b) => b[2] - a[2]
);

// 2. Back Upper: around y = 1.35 - 1.45, x within [-0.08, 0.08], minimize z
findRegionSurface(
  'back_upper (back surface min Z)',
  ([x, y, z]) => Math.abs(x) < 0.08 && y >= 1.35 && y <= 1.45,
  (a, b) => a[2] - b[2]
);

// 3. Left Shoulder: around y = 1.42 - 1.50, x > 0.15, max X and Z
findRegionSurface(
  'left_shoulder (outer deltoid)',
  ([x, y, z]) => x > 0.15 && x < 0.28 && y >= 1.42 && y <= 1.50,
  (a, b) => (b[0] + b[2]*0.5) - (a[0] + a[2]*0.5)
);

// 4. Right Shoulder: around y = 1.42 - 1.50, x < -0.15
findRegionSurface(
  'right_shoulder (outer deltoid)',
  ([x, y, z]) => x < -0.15 && x > -0.28 && y >= 1.42 && y <= 1.50,
  (a, b) => (a[0] - a[2]*0.5) - (b[0] - b[2]*0.5)
);

// 5. Left Bicep: around y = 1.20 - 1.30, find arm center and outer surface
const leftArmSlice = allVerts.filter(([x, y]) => x > 0.18 && x < 0.40 && y >= 1.20 && y <= 1.28);
console.log('leftArmSlice count:', leftArmSlice.length);
if (leftArmSlice.length > 0) {
  const xs = leftArmSlice.map(v => v[0]);
  const ys = leftArmSlice.map(v => v[1]);
  const zs = leftArmSlice.map(v => v[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const armCenterX = (minX + maxX) / 2;
  const armCenterZ = (minZ + maxZ) / 2;
  const armRadiusX = (maxX - minX) / 2;
  const armRadiusZ = (maxZ - minZ) / 2;
  console.log('Left bicep arm centerline:', +armCenterX.toFixed(4), +armCenterZ.toFixed(4), 'thickness X:', +(maxX - minX).toFixed(4), 'thickness Z:', +(maxZ - minZ).toFixed(4));
  // Front-outer surface: x = armCenterX + armRadiusX * 0.7, z = armCenterZ + armRadiusZ * 0.7
  findRegionSurface('left_bicep outer surface', ([x, y, z]) => x > armCenterX && y >= 1.20 && y <= 1.28 && z > armCenterZ, (a, b) => (b[0] + b[2]) - (a[0] + a[2]));
}

// 6. Right Bicep:
const rightArmSlice = allVerts.filter(([x, y]) => x < -0.18 && x > -0.40 && y >= 1.20 && y <= 1.28);
if (rightArmSlice.length > 0) {
  const xs = rightArmSlice.map(v => v[0]);
  const zs = rightArmSlice.map(v => v[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const armCenterX = (minX + maxX) / 2;
  const armCenterZ = (minZ + maxZ) / 2;
  console.log('Right bicep arm centerline:', +armCenterX.toFixed(4), +armCenterZ.toFixed(4), 'thickness X:', +(maxX - minX).toFixed(4), 'thickness Z:', +(maxZ - minZ).toFixed(4));
  findRegionSurface('right_bicep outer surface', ([x, y, z]) => x < armCenterX && y >= 1.20 && y <= 1.28 && z > armCenterZ, (a, b) => (-b[0] + b[2]) - (-a[0] + a[2]));
}

// 7. Left Forearm: around y = 0.95 - 1.08
const leftForearmSlice = allVerts.filter(([x, y]) => x > 0.20 && x < 0.45 && y >= 0.95 && y <= 1.08);
if (leftForearmSlice.length > 0) {
  const xs = leftForearmSlice.map(v => v[0]);
  const zs = leftForearmSlice.map(v => v[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const armCenterX = (minX + maxX) / 2;
  const armCenterZ = (minZ + maxZ) / 2;
  console.log('Left forearm centerline:', +armCenterX.toFixed(4), +armCenterZ.toFixed(4), 'thickness X:', +(maxX - minX).toFixed(4), 'thickness Z:', +(maxZ - minZ).toFixed(4));
  findRegionSurface('left_forearm outer surface', ([x, y, z]) => x > armCenterX && y >= 0.95 && y <= 1.08 && z > armCenterZ, (a, b) => (b[0] + b[2]) - (a[0] + a[2]));
}

// 8. Right Forearm: around y = 0.95 - 1.08
const rightForearmSlice = allVerts.filter(([x, y]) => x < -0.20 && x > -0.45 && y >= 0.95 && y <= 1.08);
if (rightForearmSlice.length > 0) {
  const xs = rightForearmSlice.map(v => v[0]);
  const zs = rightForearmSlice.map(v => v[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const armCenterX = (minX + maxX) / 2;
  const armCenterZ = (minZ + maxZ) / 2;
  console.log('Right forearm centerline:', +armCenterX.toFixed(4), +armCenterZ.toFixed(4), 'thickness X:', +(maxX - minX).toFixed(4), 'thickness Z:', +(maxZ - minZ).toFixed(4));
  findRegionSurface('right_forearm outer surface', ([x, y, z]) => x < armCenterX && y >= 0.95 && y <= 1.08 && z > armCenterZ, (a, b) => (-b[0] + b[2]) - (-a[0] + a[2]));
}
