import * as THREE from 'three';

const LOBBY_RADIUS = 22;
export const LOBBY_COUNTDOWN = 15;

// Placed far from the main battle island so the two never visually or
// physically overlap, even though both exist in the scene simultaneously.
export const LOBBY_CENTER = new THREE.Vector3(0, 0, -650);

// Phase 1: a small, isolated pre-game island. Player and bots spawn here
// while a countdown runs; weapons/storm are inert during this phase (main.js
// simply never calls combat/storm updates while phase === 'lobby').
export class LobbyManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Lobby';
    this.group.position.copy(LOBBY_CENTER);
    this.countdown = LOBBY_COUNTDOWN;
    this._buildIsland();
    scene.add(this.group);
  }

  _buildIsland() {
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x4c7a34, roughness: 0.9 });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(LOBBY_RADIUS, LOBBY_RADIUS + 2.5, 2, 48), platformMat);
    platform.position.y = -1;
    platform.receiveShadow = true;
    this.group.add(platform);

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2d4a22, roughness: 1 });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(LOBBY_RADIUS - 0.5, 0.5, 10, 56), edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.05;
    this.group.add(edge);

    // A ring of glowing spawn pads so it's visually obvious this is a lobby.
    const padMat = new THREE.MeshStandardMaterial({ color: 0x53d8ff, emissive: 0x53d8ff, emissiveIntensity: 0.5, roughness: 0.4 });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), padMat);
      pad.position.set(Math.cos(angle) * LOBBY_RADIUS * 0.55, 0.06, Math.sin(angle) * LOBBY_RADIUS * 0.55);
      this.group.add(pad);
    }
  }

  getSurfaceY() {
    return LOBBY_CENTER.y;
  }

  getSpawnPoint(index, total) {
    const angle = (index / Math.max(1, total)) * Math.PI * 2;
    const dist = LOBBY_RADIUS * 0.55;
    return LOBBY_CENTER.clone().add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
  }

  // Keeps a position within the island's edge so players can't wander off
  // into the void (no gravity/fall handling during this phase).
  clampPosition(pos) {
    const dx = pos.x - LOBBY_CENTER.x;
    const dz = pos.z - LOBBY_CENTER.z;
    const dist = Math.hypot(dx, dz);
    const maxDist = LOBBY_RADIUS - 1.5;
    if (dist > maxDist) {
      const scale = maxDist / dist;
      pos.x = LOBBY_CENTER.x + dx * scale;
      pos.z = LOBBY_CENTER.z + dz * scale;
    }
  }

  // Returns true once the countdown has elapsed and the bus phase should start.
  update(dt) {
    this.countdown = Math.max(0, this.countdown - dt);
    return this.countdown <= 0;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
