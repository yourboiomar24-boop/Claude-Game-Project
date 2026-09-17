import * as THREE from 'three';
import { buildCharacterModel } from './CharacterModel.js';
import { WEAPONS, rollLootWeapon } from '../combat/Weapons.js';
import { mulberry32 } from '../utils/Noise.js';

const SPEED = 4.4;
const ACCEL = 20;
const GRAVITY = -26;
const STEP_HEIGHT = 0.65;
const RADIUS = 0.36;
const SIGHT_RANGE = 46;
const ENGAGE_RANGE = 34;
const TURN_SPEED = 3.2;

const NAMES = [
  'Falcon', 'Vortex', 'Ranger', 'Cobra', 'Nomad', 'Ember', 'Talon', 'Raven',
  'Drift', 'Havoc', 'Sable', 'Onyx', 'Rogue', 'Blitz', 'Ghost', 'Fable',
  'Static', 'Wren', 'Ash', 'Cinder', 'Rune', 'Vex', 'Halo', 'Jinx', 'Nova',
  'Slate', 'Wraith', 'Kite', 'Bramble', 'Quill',
];

let nameCursor = 0;
function nextName(rand) {
  const n = NAMES[nameCursor % NAMES.length];
  nameCursor++;
  return `${n}-${Math.floor(rand() * 90 + 10)}`;
}

const _tmpDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

export class Bot {
  constructor({ scene, skin, world, combatSystem, seed }) {
    this.scene = scene;
    this.world = world;
    this.combatSystem = combatSystem;
    const rand = mulberry32(seed);
    this._rand = rand;
    this.name = nextName(rand);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = rand() * Math.PI * 2;
    this.onGround = false;

    this.health = 100;
    this.maxHealth = 100;
    this.shield = Math.floor(rand() * 60);
    this.maxShield = 100;
    this.isDead = false;

    const weaponId = rollLootWeapon(rand);
    const def = WEAPONS[weaponId];
    this.weapon = { ...def, mag: def.magSize, reserve: def.magSize * 3 };

    this.state = 'roam';
    this.roamTarget = null;
    this.roamTimer = 0;
    this.fireCooldown = rand() * 0.5;
    this.strafeDir = rand() > 0.5 ? 1 : -1;
    this.strafeTimer = 2 + rand() * 2;

    this.mesh = buildCharacterModel(skin);
    scene.add(this.mesh);
    this._tagHitboxes();
  }

  _tagHitboxes() {
    const parts = this.mesh.userData.parts;
    const headMesh = parts.head.children[0];
    headMesh.userData.owner = this;
    headMesh.userData.headshot = true;
    parts.torso.userData.owner = this;
    parts.torso.userData.headshot = false;
  }

  getDamageMeshes() {
    const parts = this.mesh.userData.parts;
    return [parts.head.children[0], parts.torso];
  }

  spawnAt(x, z) {
    const y = this.world.buildSystem.getSupportCandidates(x, z).reduce((a, b) => Math.max(a, b), -Infinity);
    this.position.set(x, y, z);
  }

  takeDamage(amount, meta = {}) {
    if (this.isDead) return;
    if (meta.from) this.lastDamagedBy = meta.from;
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
    }
  }

  remove() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  _hasLineOfSight(targetPos) {
    const from = this.position.clone();
    from.y += 1.5;
    const to = targetPos.clone();
    to.y += 1.4;
    _tmpDir.subVectors(to, from);
    const dist = _tmpDir.length();
    _tmpDir.normalize();
    _raycaster.set(from, _tmpDir);
    _raycaster.far = dist - 0.5;
    const hits = _raycaster.intersectObjects(this.world.buildSystem.getStructureMeshes(), false);
    return hits.length === 0;
  }

  _findTarget(characters) {
    let best = null;
    let bestDist = SIGHT_RANGE;
    for (const c of characters) {
      if (c === this || c.isDead) continue;
      const d = this.position.distanceTo(c.position);
      if (d < bestDist && this._hasLineOfSight(c.position)) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  _pickRoamTarget() {
    const storm = this.world.storm;
    const rand = this._rand;
    const ang = rand() * Math.PI * 2;
    const dist = rand() * Math.max(5, storm.radius * 0.85);
    const x = storm.center.x + Math.cos(ang) * dist;
    const z = storm.center.y + Math.sin(ang) * dist;
    this.roamTarget = new THREE.Vector2(x, z);
    this.roamTimer = 6 + rand() * 5;
  }

  _moveToward(targetX, targetZ, dt, speedMul = 1) {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) return;
    const nx = dx / len, nz = dz / len;
    const desiredVX = nx * SPEED * speedMul;
    const desiredVZ = nz * SPEED * speedMul;
    this.velocity.x += (desiredVX - this.velocity.x) * Math.min(1, ACCEL * dt);
    this.velocity.z += (desiredVZ - this.velocity.z) * Math.min(1, ACCEL * dt);
  }

  _resolveWallCollisions() {
    const boxes = this.world.buildSystem.getWallBoxes();
    const feetY = this.position.y;
    const headY = feetY + 1.8;
    for (const box of boxes) {
      if (box.max.y < feetY + 0.05 || box.min.y > headY) continue;
      if (Math.abs(box.min.x - this.position.x) > 8 && Math.abs(box.max.x - this.position.x) > 8) continue;
      const cx = THREE.MathUtils.clamp(this.position.x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(this.position.z, box.min.z, box.max.z);
      const dx = this.position.x - cx;
      const dz = this.position.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < RADIUS * RADIUS && distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        const push = (RADIUS - dist) / dist;
        this.position.x += dx * push;
        this.position.z += dz * push;
      }
    }
  }

  _resolveVertical(dt) {
    this.velocity.y += GRAVITY * dt;
    const predictedY = this.position.y + this.velocity.y * dt;
    const candidates = this.world.buildSystem.getSupportCandidates(this.position.x, this.position.z);
    let support = -Infinity;
    for (const c of candidates) if (c <= this.position.y + STEP_HEIGHT && c > support) support = c;
    if (support === -Infinity) support = Math.min(...candidates);
    if (predictedY <= support) {
      this.position.y = support;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.position.y = predictedY;
      this.onGround = false;
    }
  }

  update(dt, characters) {
    if (this.isDead) return;

    const storm = this.world.storm;
    const outside = storm.isOutside(this.position.x, this.position.z);
    if (outside) this.takeDamage(storm.damagePerSecond * dt, {});
    if (this.isDead) return;

    const target = this._findTarget(characters);

    if (outside && (!target || this.position.distanceTo(new THREE.Vector3(storm.center.x, this.position.y, storm.center.y)) > 6)) {
      this.state = 'flee_storm';
    } else if (target) {
      this.state = 'combat';
    } else {
      this.state = 'roam';
    }

    if (this.state === 'flee_storm') {
      this._moveToward(storm.center.x, storm.center.y, dt, 1.15);
      this._faceToward(storm.center.x, storm.center.y, dt);
    } else if (this.state === 'combat') {
      this._combatBehavior(target, dt);
    } else {
      this.roamTimer -= dt;
      if (!this.roamTarget || this.roamTimer <= 0) this._pickRoamTarget();
      this._moveToward(this.roamTarget.x, this.roamTarget.y, dt, 0.65);
      this._faceToward(this.roamTarget.x, this.roamTarget.y, dt);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._resolveWallCollisions();
    this._resolveVertical(dt);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    this._animate(dt);

    this.fireCooldown -= dt;
  }

  _faceToward(x, z, dt) {
    const targetYaw = Math.atan2(x - this.position.x, z - this.position.z);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = TURN_SPEED * dt;
    this.yaw += THREE.MathUtils.clamp(diff, -maxStep, maxStep);
  }

  _combatBehavior(target, dt) {
    const dist = this.position.distanceTo(target.position);
    this._faceToward(target.position.x, target.position.z, dt);

    const preferred = this.weapon.kind === 'shotgun' ? 8 : this.weapon.id === 'sniper' ? 26 : 16;
    let speedMul = 0;
    if (dist > preferred + 3) {
      this._moveToward(target.position.x, target.position.z, dt, 0.9);
    } else if (dist < preferred - 3) {
      this._moveToward(2 * this.position.x - target.position.x, 2 * this.position.z - target.position.z, dt, 0.7);
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 1.5 + this._rand() * 2; }
      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      const perpX = -dz, perpZ = dx;
      const len = Math.hypot(perpX, perpZ) || 1;
      this._moveToward(
        this.position.x + (perpX / len) * this.strafeDir * 3,
        this.position.z + (perpZ / len) * this.strafeDir * 3,
        dt, 0.6
      );
    }

    if (dist <= (this.weapon.range || 40) && this.fireCooldown <= 0 && this._hasLineOfSight(target.position)) {
      this._shoot(target);
      this.fireCooldown = 1 / this.weapon.fireRate * (0.9 + this._rand() * 0.5);
    }
  }

  _shoot(target) {
    if (this.weapon.mag <= 0) {
      const need = this.weapon.magSize - this.weapon.mag;
      const take = Math.min(need, this.weapon.reserve);
      this.weapon.mag += take;
      this.weapon.reserve -= take;
      return;
    }
    this.weapon.mag -= 1;
    const origin = this.position.clone();
    origin.y += 1.5;
    const dir = new THREE.Vector3().subVectors(target.position.clone().setY(target.position.y + 1.3), origin).normalize();
    const inaccurateWeapon = { ...this.weapon, spread: (this.weapon.spread || 0.02) + 0.025 };
    this.combatSystem.fireWeapon(this, origin, dir, inaccurateWeapon);
  }

  _animate(dt) {
    const parts = this.mesh.userData.parts;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this._animT = (this._animT || 0) + dt * 8;
    if (speed > 0.3) {
      const s = Math.sin(this._animT) * 0.5;
      parts.legL.hip.rotation.x = s;
      parts.legR.hip.rotation.x = -s;
    } else {
      parts.legL.hip.rotation.x = THREE.MathUtils.lerp(parts.legL.hip.rotation.x, 0, dt * 8);
      parts.legR.hip.rotation.x = THREE.MathUtils.lerp(parts.legR.hip.rotation.x, 0, dt * 8);
    }
  }
}
