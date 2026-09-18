import * as THREE from 'three';

const GLIDER_ALTITUDE = 25;
const FREEFALL_ACCEL = 20;
const FREEFALL_TERMINAL = -38;
const GLIDE_DESCENT = -4;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

function buildGliderMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, side: THREE.DoubleSide, roughness: 0.6 });
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 4, 1, true), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.rotation.z = Math.PI / 4;
  mesh.castShadow = true;
  return mesh;
}

// Phase 3: freefall with mouse look + WASD drift, then an auto-deployed
// glider at a fixed altitude that slows the descent until landfall, at
// which point the match hands off to the combat phase.
export class SkydiveManager {
  constructor(player, terrain) {
    this.player = player;
    this.terrain = terrain;
    this.velocity = new THREE.Vector3();
    this.gliderOpen = false;

    this.gliderMesh = buildGliderMesh();
    this.gliderMesh.visible = false;
    this.gliderMesh.position.set(0, 1.05, -0.15);
    player.mesh.add(this.gliderMesh);
  }

  start(position, initialVelocity) {
    this.player.setPosition(position.x, position.y, position.z);
    this.velocity.copy(initialVelocity);
    this.gliderOpen = false;
    this.gliderMesh.visible = false;
  }

  // Returns true once the player has landed (combat phase should start).
  update(dt) {
    const player = this.player;
    player.applyLook(dt);

    const input = player.input;
    _fwd.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    _right.set(_fwd.z, 0, -_fwd.x);
    _move.set(0, 0, 0);
    if (input.isDown('KeyW')) _move.add(_fwd);
    if (input.isDown('KeyS')) _move.sub(_fwd);
    if (input.isDown('KeyD')) _move.add(_right);
    if (input.isDown('KeyA')) _move.sub(_right);
    if (_move.lengthSq() > 0) _move.normalize();

    const driftAccel = this.gliderOpen ? 14 : 6;
    this.velocity.x += _move.x * driftAccel * dt;
    this.velocity.z += _move.z * driftAccel * dt;
    const drag = this.gliderOpen ? 0.9 : 0.985;
    const dragFactor = Math.pow(drag, dt * 60);
    this.velocity.x *= dragFactor;
    this.velocity.z *= dragFactor;

    if (!this.gliderOpen) {
      this.velocity.y = Math.max(this.velocity.y - FREEFALL_ACCEL * dt, FREEFALL_TERMINAL);
      if (player.position.y <= GLIDER_ALTITUDE) {
        this.gliderOpen = true;
        this.gliderMesh.visible = true;
      }
    } else {
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, GLIDE_DESCENT, Math.min(1, dt * 2));
    }

    player.position.addScaledVector(this.velocity, dt);
    player.syncMeshToPosition();
    player.refreshCamera();

    const groundY = this.terrain.getHeightAt(player.position.x, player.position.z);
    if (player.position.y <= groundY) {
      player.position.y = groundY;
      player.velocity.set(0, 0, 0);
      player.syncMeshToPosition();
      this.gliderMesh.visible = false;
      return true;
    }
    return false;
  }

  dispose() {
    this.player.mesh.remove(this.gliderMesh);
    this.gliderMesh.geometry.dispose();
    this.gliderMesh.material.dispose();
  }
}
