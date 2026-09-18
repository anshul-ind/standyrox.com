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

const allVerts = [];
for (let m = 0; m < gltf.meshes.length; m++) {
  allVerts.push(...getVertices(m));
}

function findRearSurface(name, xMin, xMax, yMin, yMax) {
  const matched = allVerts.filter(([x, y, z]) => x >= xMin && x <= xMax && y >= yMin && y <= yMax);
  if (matched.length === 0) {
    console.log(name, ': no vertices found');
    return null;
  }
  // Rear surface has minimum Z (most negative Z)
  matched.sort((a, b) => a[2] - b[2]);
  const best = matched[0];
  console.log(name, `anchor: [${best[0].toFixed(3)}, ${best[1].toFixed(3)}, ${best[2].toFixed(3)}]`);
  return best;
}

console.log('--- REAR SPOTS EXACT SURFACE SEARCH ---');
findRearSurface('Left Rear Calf (a)', 0.06, 0.16, 0.32, 0.44);
findRearSurface('Right Rear Calf (b)', -0.16, -0.06, 0.32, 0.44);
findRearSurface('Left Lower Back / Glute (c)', 0.06, 0.16, 0.82, 0.94);
findRearSurface('Right Lower Back / Glute (d)', -0.16, -0.06, 0.82, 0.94);
findRearSurface('Upper Back (existing)', -0.08, 0.08, 1.35, 1.48);
