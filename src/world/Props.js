import * as THREE from 'three';
import { mulberry32 } from '../utils/Noise.js';

const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f5d2f, roughness: 0.9 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d21, roughness: 0.95 });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x777a7d, roughness: 0.85, flatShading: true });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.4, metalness: 0.7 });
const chestMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.6 });
const chestGlowMat = new THREE.MeshStandardMaterial({ color: 0xffd94a, emissive: 0xffd94a, emissiveIntensity: 0.8 });

function buildTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 7), trunkMat);
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.4 - i * 0.3, 1.7, 8), treeMat);
    foliage.position.y = 2.6 + i * 1.1;
    foliage.castShadow = true;
    g.add(foliage);
  }
  return g;
}

function buildRock(scale = 1) {
  const geo = new THREE.IcosahedronGeometry(0.9 * scale, 0);
  const rock = new THREE.Mesh(geo, rockMat);
  rock.scale.y = 0.7;
  rock.castShadow = true;
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  return rock;
}

function buildMetalCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), metalMat);
  box.position.y = 0.7;
  box.castShadow = true;
  g.add(box);
  return g;
}

function buildChest() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.75), chestMat);
  base.position.y = 0.3;
  base.castShadow = true;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.25, 0.78), chestMat);
  lid.position.y = 0.72;
  lid.castShadow = true;
  const glow = new THREE.PointLight(0xffd94a, 1.2, 6);
  glow.position.y = 1.2;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.1), chestGlowMat);
  lock.position.set(0, 0.45, 0.4);
  g.add(base, lid, glow, lock);
  g.userData.lid = lid;
  return g;
}

export class ResourceNode {
  constructor(mesh, type, position, hp) {
    this.mesh = mesh;
    this.type = type; // 'wood' | 'stone' | 'metal'
    this.hp = hp;
    this.maxHp = hp;
    this.alive = true;
    this.mesh.position.copy(position);
    this.mesh.userData.resourceNode = this;
    this.collisionRadius = type === 'wood' ? 0.4 : type === 'metal' ? 1.0 : 0.9;
  }

  hit(amount) {
    if (!this.alive) return 0;
    const dealt = Math.min(this.hp, amount);
    this.hp -= dealt;
    const shrink = Math.max(0.15, this.hp / this.maxHp);
    this.mesh.scale.setScalar(shrink);
    if (this.hp <= 0) {
      this.alive = false;
      this.mesh.visible = false;
    }
    return dealt; // resource gained == damage dealt (1:1)
  }
}

export class Chest {
  constructor(mesh, position) {
    this.mesh = mesh;
    this.mesh.position.copy(position);
    this.opened = false;
    this.mesh.userData.chest = this;
  }
  open() {
    if (this.opened) return;
    this.opened = true;
    this.mesh.userData.lid.rotation.x = -Math.PI * 0.55;
  }
}

// Scatters trees/rocks/crates/chests across the island, avoiding water and
// keeping a minimum spacing via simple rejection sampling.
export function generateProps(terrain, { seed = 99, count = 260, chests = 40 } = {}) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'Props';
  const resourceNodes = [];
  const chestList = [];
  const placed = [];
  const R = terrain.radius * 0.85;

  function tryPlace(minDist) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ang = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * R;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      const y = terrain.getHeightAt(x, z);
      if (y < 0.4) continue; // avoid water/shore
      let ok = true;
      for (const p of placed) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < minDist * minDist) { ok = false; break; }
      }
      if (ok) {
        placed.push({ x, z });
        return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  for (let i = 0; i < count; i++) {
    const roll = rand();
    const pos = tryPlace(3.2);
    if (!pos) continue;
    if (roll < 0.55) {
      const mesh = buildTree();
      mesh.scale.setScalar(0.85 + rand() * 0.4);
      group.add(mesh);
      resourceNodes.push(new ResourceNode(mesh, 'wood', pos, 120));
    } else if (roll < 0.88) {
      const mesh = buildRock(0.7 + rand() * 0.7);
      group.add(mesh);
      resourceNodes.push(new ResourceNode(mesh, 'stone', pos, 150));
    } else {
      const mesh = buildMetalCrate();
      group.add(mesh);
      resourceNodes.push(new ResourceNode(mesh, 'metal', pos, 180));
    }
  }

  for (let i = 0; i < chests; i++) {
    const pos = tryPlace(8);
    if (!pos) continue;
    const mesh = buildChest();
    group.add(mesh);
    chestList.push(new Chest(mesh, pos));
  }

  return { group, resourceNodes, chests: chestList };
}
