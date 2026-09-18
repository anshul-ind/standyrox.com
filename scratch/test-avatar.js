global.self = global;
global.window = global;
const fs = require('fs');
const path = require('path');
const THREE = require('three');
const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');

const glbPath = path.join(__dirname, '../public/models/avatar-v1.glb');
const buffer = fs.readFileSync(glbPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  scene.traverse((obj) => {
    if (obj.isMesh) {
      const pos = obj.geometry.attributes.position;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < min) min = y;
        if (y > max) max = y;
      }
      console.log(`Mesh: ${obj.name} -> min Y: ${min.toFixed(4)}, max Y: ${max.toFixed(4)}`);
    }
  });
});
