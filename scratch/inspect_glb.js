const fs = require('fs');
const path = require('path');

const buf = fs.readFileSync('public/models/avatar-v1.glb');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

console.log('Nodes in GLB:');
gltf.nodes.forEach((n, idx) => {
  console.log(`Node ${idx}: ${n.name}, mesh: ${n.mesh}, skin: ${n.skin}, children: ${JSON.stringify(n.children)}`);
});

console.log('\nMeshes in GLB:');
gltf.meshes.forEach((m, idx) => {
  console.log(`Mesh ${idx}: ${m.name}, primitives:`, m.primitives.map(p => ({
    mode: p.mode,
    material: p.material !== undefined ? gltf.materials[p.material]?.name : undefined,
    attributes: Object.keys(p.attributes)
  })));
});

console.log('\nMaterials in GLB:');
gltf.materials.forEach((m, idx) => {
  console.log(`Material ${idx}: ${m.name}, alphaMode: ${m.alphaMode}`);
});
