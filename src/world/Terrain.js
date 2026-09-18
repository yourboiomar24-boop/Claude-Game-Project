import * as THREE from 'three';
import { Noise2D } from '../utils/Noise.js';

// A circular island: rolling hills toward the middle, sloping down to a
// shoreline, with flat water beyond. Exposes getHeightAt(x,z) so every
// other system (player, bots, props, storm) reads the exact same surface
// the mesh renders.
export class Terrain {
  constructor({ radius = 150, segments = 180, seed = 2024 } = {}) {
    this.radius = radius;
    this.noise = new Noise2D(seed);
    this.waterLevel = 0;

    this.group = new THREE.Group();
    this.group.name = 'Terrain';

    this._buildGround(segments);
    this._buildWater();
  }

  getHeightAt(x, z) {
    const d = Math.sqrt(x * x + z * z);
    const edge = this.radius;
    const shoreStart = edge * 0.78;
    let h = this.noise.fbm(x * 0.015, z * 0.015, 5, 2.05, 0.5) * 10;
    h += this.noise.fbm(x * 0.05, z * 0.05, 3, 2.1, 0.5) * 2.2;

    // Push height up near the center a bit, and taper to below water past the shore.
    const centerBoost = Math.max(0, 1 - d / (edge * 0.5)) * 3.0;
    h += centerBoost;

    if (d > shoreStart) {
      const t = Math.min(1, (d - shoreStart) / (edge - shoreStart));
      const falloff = 1 - t * t * (3 - 2 * t); // smoothstep down
      h = h * falloff - t * 6;
    }
    if (d > edge) {
      h -= (d - edge) * 0.8;
    }
    return h;
  }

  _buildGround(segments) {
    const size = this.radius * 2.6; // extra so the seabed extends past the island
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grassColor = new THREE.Color(0x4c7a34);
    const rockColor = new THREE.Color(0x8a8272);
    const sandColor = new THREE.Color(0xcbb27a);
    const snowColor = new THREE.Color(0xe8f0f5);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeightAt(x, z);
      pos.setY(i, h);

      const d = Math.sqrt(x * x + z * z);
      let c;
      if (d > this.radius * 0.9) c = sandColor;
      else if (h > 9) c = snowColor;
      else if (h > 5.5) c = rockColor;
      else c = grassColor;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    this.mesh = mesh;
    this.group.add(mesh);
  }

  _buildWater() {
    const geo = new THREE.CircleGeometry(this.radius * 1.6, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2f6fa3,
      transparent: true,
      opacity: 0.75,
      roughness: 0.3,
      metalness: 0.1,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = this.waterLevel;
    water.name = 'water';
    this.group.add(water);
    this.water = water;
  }
}
