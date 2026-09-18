import * as THREE from 'three';
import { RARITY_TIERS } from '../combat/Rarity.js';
import { createWeaponInstance, rollLootItem } from '../combat/Weapons.js';

const AMMO_BY_TYPE = { light: 60, medium: 60, heavy: 20, shell: 16 };

function buildWeaponPickupMesh(rarity) {
  const color = RARITY_TIERS[rarity].color;
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18), mat);
  mesh.castShadow = true;
  return mesh;
}

function buildAmmoPickupMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.6 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.3), mat);
  mesh.castShadow = true;
  return mesh;
}

function buildShieldPickupMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x53d8ff, emissive: 0x53d8ff, emissiveIntensity: 0.6, roughness: 0.25, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mat);
  mesh.castShadow = true;
  return mesh;
}

// A single floating, auto-collectible ground item dropped from a chest.
export class Pickup {
  constructor(kind, payload, position) {
    this.kind = kind; // 'weapon' | 'ammo' | 'shield'
    this.payload = payload;
    this.collected = false;
    this.baseY = position.y + 0.5;
    this._bob = Math.random() * Math.PI * 2;

    // Glow comes from each mesh's own emissive material — no real-time
    // PointLight per pickup, which added up fast (dozens on the ground at once).
    this.mesh = kind === 'weapon' ? buildWeaponPickupMesh(payload.rarity)
      : kind === 'ammo' ? buildAmmoPickupMesh()
      : buildShieldPickupMesh();
    this.mesh.position.copy(position);
    this.mesh.position.y = this.baseY;
  }

  update(dt) {
    this._bob += dt * 2.2;
    this.mesh.position.y = this.baseY + Math.sin(this._bob) * 0.09;
    this.mesh.rotation.y += dt * 1.6;
  }
}

// Spawns the 3 required drops (weapon, ammo, shield potion) scattered
// around a just-opened chest.
export function spawnChestLoot(position, rand = Math.random) {
  const { weaponId, rarity } = rollLootItem(rand);
  const weapon = createWeaponInstance(weaponId, rarity);

  const items = [
    { kind: 'weapon', payload: weapon },
    { kind: 'ammo', payload: { ammoType: weapon.ammoType, amount: AMMO_BY_TYPE[weapon.ammoType] || 40 } },
    { kind: 'shield', payload: { amount: 50 } },
  ];

  return items.map((item, i) => {
    const angle = (i / items.length) * Math.PI * 2 + rand() * 0.6;
    const dist = 0.9 + rand() * 0.4;
    const pos = position.clone().add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
    return new Pickup(item.kind, item.payload, pos);
  });
}
