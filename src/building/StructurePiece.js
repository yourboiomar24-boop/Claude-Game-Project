import * as THREE from 'three';
import { TILE, WALL_THICKNESS, SEG, MATERIAL_TIERS } from './BuildConfig.js';

let pieceIdCounter = 1;

function tierMaterial(tier) {
  const def = MATERIAL_TIERS[tier];
  return new THREE.MeshStandardMaterial({ color: def.color, roughness: tier === 'metal' ? 0.35 : 0.85, metalness: tier === 'metal' ? 0.6 : 0.05 });
}

// Builds a right-triangular wedge (ramp) geometry: rises from y=0 at
// z=-half to y=height at z=+half, spanning `width` on X.
function buildRampGeometry(width, depth, height) {
  const hw = width / 2, hd = depth / 2;
  const positions = new Float32Array([
    // bottom face (2 tris)
    -hw, 0, -hd,   hw, 0, -hd,   hw, 0, hd,
    -hw, 0, -hd,   hw, 0, hd,   -hw, 0, hd,
    // slope face
    -hw, 0, -hd,   -hw, height, hd,   hw, height, hd,
    -hw, 0, -hd,   hw, height, hd,   hw, 0, -hd,
    // back vertical face (high edge)
    -hw, 0, hd,   hw, 0, hd,   hw, height, hd,
    -hw, 0, hd,   hw, height, hd,   -hw, height, hd,
    // left triangle
    -hw, 0, -hd,  -hw, 0, hd,  -hw, height, hd,
    // right triangle
    hw, 0, -hd,  hw, height, hd,  hw, 0, hd,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export class StructurePiece {
  constructor({ type, tier, ix, iy, iz, face = null, facing = 0 }) {
    this.id = pieceIdCounter++;
    this.type = type; // 'wall' | 'floor' | 'ramp' | 'roof'
    this.tier = tier;
    this.ix = ix; this.iy = iy; this.iz = iz;
    this.face = face; // for walls: 'N'|'S'|'E'|'W'
    this.facing = facing; // for ramps/roof: 0,90,180,270
    this.maxHp = MATERIAL_TIERS[tier].hp;
    this.hp = this.maxHp;
    this.destroyed = false;
    this.editable = type === 'wall' || type === 'floor';
    this.openSegments = new Set(); // indices 0-8 that are removed (open)
    this.onDestroyed = null;

    this.group = new THREE.Group();
    this.group.name = `piece_${type}_${this.id}`;
    this.segmentMeshes = [];
    this._buildGeometry();
    this._positionGroup();
  }

  _buildGeometry() {
    const mat = tierMaterial(this.tier);
    this.material = mat;

    if (this.type === 'wall' || this.type === 'floor') {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const idx = row * 3 + col;
          const geo = this.type === 'wall'
            ? new THREE.BoxGeometry(SEG, SEG, WALL_THICKNESS)
            : new THREE.BoxGeometry(SEG, WALL_THICKNESS, SEG);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const ox = (col - 1) * SEG;
          if (this.type === 'wall') {
            const oy = (row - 1) * SEG;
            mesh.position.set(ox, oy, 0);
          } else {
            const oz = (row - 1) * SEG;
            mesh.position.set(ox, 0, oz);
          }
          mesh.userData.structurePiece = this;
          mesh.userData.segIndex = idx;
          this.group.add(mesh);
          this.segmentMeshes[idx] = mesh;
        }
      }
    } else if (this.type === 'ramp') {
      const geo = buildRampGeometry(TILE, TILE, TILE);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.structurePiece = this;
      this.group.add(mesh);
      this.mainMesh = mesh;
    } else if (this.type === 'roof') {
      const geo = new THREE.ConeGeometry(TILE * 0.72, TILE * 0.85, 4);
      geo.rotateY(Math.PI / 4);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -TILE / 2 + (TILE * 0.85) / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.structurePiece = this;
      this.group.add(mesh);
      this.mainMesh = mesh;
    }
  }

  _positionGroup() {
    const cx = this.ix * TILE;
    const cz = this.iz * TILE;
    const baseY = this.iy * TILE;

    if (this.type === 'floor') {
      this.group.position.set(cx, baseY, cz);
    } else if (this.type === 'wall') {
      const half = TILE / 2;
      let ox = 0, oz = 0, rotY = 0;
      switch (this.face) {
        case 'N': oz = -half; rotY = 0; break;
        case 'S': oz = half; rotY = 0; break;
        case 'E': ox = half; rotY = Math.PI / 2; break;
        case 'W': ox = -half; rotY = Math.PI / 2; break;
      }
      this.group.position.set(cx + ox, baseY + half, cz + oz);
      this.group.rotation.y = rotY;
    } else if (this.type === 'ramp' || this.type === 'roof') {
      this.group.position.set(cx, baseY, cz);
      this.group.rotation.y = THREE.MathUtils.degToRad(this.facing);
    }
  }

  gridKey() {
    if (this.type === 'wall') return `wall:${this.ix},${this.iy},${this.iz},${this.face}`;
    return `${this.type}:${this.ix},${this.iy},${this.iz}`;
  }

  // ---- Editing (3x3 segment grid) ----
  setSegmentOpen(idx, open) {
    if (!this.editable) return;
    const mesh = this.segmentMeshes[idx];
    if (!mesh) return;
    if (open) this.openSegments.add(idx); else this.openSegments.delete(idx);
    mesh.visible = !open;
  }

  toggleSegment(idx) {
    this.setSegmentOpen(idx, !this.openSegments.has(idx));
  }

  applyPreset(preset) {
    if (!this.editable) return;
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    if (preset === 'full') all.forEach((i) => this.setSegmentOpen(i, false));
    else if (preset === 'clear') all.forEach((i) => this.setSegmentOpen(i, true));
    else if (preset === 'door') { all.forEach((i) => this.setSegmentOpen(i, false)); [1, 4].forEach((i) => this.setSegmentOpen(i, true)); }
    else if (preset === 'window') { all.forEach((i) => this.setSegmentOpen(i, false)); [3, 4, 5].forEach((i) => this.setSegmentOpen(i, true)); }
    else if (preset === 'hole') { all.forEach((i) => this.setSegmentOpen(i, false)); this.setSegmentOpen(4, true); }
  }

  isSegmentSolid(idx) {
    return !this.openSegments.has(idx);
  }

  // World-space AABB for each still-solid segment (used for collision).
  getSolidSegmentBoxes(target = []) {
    if (!this.editable) return target;
    this.group.updateMatrixWorld();
    for (let idx = 0; idx < 9; idx++) {
      if (this.openSegments.has(idx)) continue;
      const mesh = this.segmentMeshes[idx];
      const box = new THREE.Box3().setFromObject(mesh);
      target.push(box);
    }
    return target;
  }

  damage(amount) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (this.hp <= 0) this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.onDestroyed) this.onDestroyed(this);
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    if (this.material) this.material.dispose();
  }
}
