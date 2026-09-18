import * as THREE from 'three';
import { buildCharacterModel } from './CharacterModel.js';
import { rollLootItem, createWeaponInstance } from '../combat/Weapons.js';
import { worldToCell, cardinalFace } from '../building/BuildSystem.js';
import { mulberry32 } from '../utils/Noise.js';

const SPEED = 4.4;
const ACCEL = 20;
const GRAVITY = -26;
const STEP_HEIGHT = 0.65;
const RADIUS = 0.36;
const SIGHT_RANGE = 46;
const TURN_SPEED = 3.2;
const CHEST_HOLD_TIME = 1.5;
const CHEST_INTERACT_RANGE = 1.6;
const PICKUP_RANGE = 1.4;
const DEFENSIVE_BUILD_BUDGET = 1.8;

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

// Bot AI: a small finite-state machine modeling a realistic battle royale
// competitor rather than an instant-aggro turret.
//   LANDING (handled by startDrop/updateDrop, driven from main.js)
//     -> LOOTING (default; hunts chests/ground pickups, gathers materials)
//     -> COMBAT (only once armed AND the global scavenge window has expired,
//                or immediately if the bot has already been shot at)
//     -> DEFENSIVE_BUILD (interrupts anything, triggered by taking damage)
//     -> FLEE_STORM (overrides looting/combat when outside the safe zone)
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
    this.shield = Math.floor(rand() * 40);
    this.maxShield = 100;
    this.isDead = false;

    // Bots start unarmed and must loot a real weapon before they can fight,
    // per the "secure a weapon before engaging" rule.
    this.weapon = null;
    this.inventory = {
      wood: 15 + Math.floor(rand() * 45),
      stone: 5 + Math.floor(rand() * 25),
      metal: Math.floor(rand() * 10),
    };

    this.state = 'looting';
    this.lootTarget = null; // { kind: 'chest'|'pickup', ref }
    this.chestHoldTimer = 0;
    this.roamTarget = null;
    this.roamTimer = 0;
    this.fireCooldown = rand() * 0.5;
    this.strafeDir = rand() > 0.5 ? 1 : -1;
    this.strafeTimer = 2 + rand() * 2;

    // Full target-acquisition scans (O(characters) line-of-sight raycasts)
    // are throttled and staggered per-bot rather than run every frame.
    this._scanTimer = rand() * 0.25;
    this._lastSpotted = null;

    this.hasBeenDamaged = false;
    this.reactionTarget = null;
    this.reactionTimer = 0;
    this.engagedTarget = null;
    this.reloading = false;
    this.reloadTimer = 0;

    this.defensiveTimer = 0;
    this.defenseDir = new THREE.Vector3();
    this.wallsPlacedThisDefense = 0;
    this.postDefenseState = 'looting';

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

  // ---- Phase 3 (skydive): simplified autonomous drop, biased toward a POI ----
  startDrop(startPos, terrain, rand, pois) {
    let lx, lz;
    if (pois && pois.length) {
      const poi = pois[Math.floor(rand() * pois.length)];
      const ang = rand() * Math.PI * 2;
      const dist = rand() * poi.radius * 1.4;
      lx = poi.x + Math.cos(ang) * dist;
      lz = poi.z + Math.sin(ang) * dist;
    } else {
      const ang = rand() * Math.PI * 2;
      const dist = rand() * terrain.radius * 0.8;
      lx = Math.cos(ang) * dist;
      lz = Math.sin(ang) * dist;
    }
    this._dropStart = startPos.clone();
    this._dropEnd = new THREE.Vector3(lx, terrain.getHeightAt(lx, lz), lz);
    this._dropT = 0;
    this._dropDuration = 13 + rand() * 6;
    this.position.copy(this._dropStart);
  }

  updateDrop(dt) {
    this._dropT = Math.min(1, this._dropT + dt / this._dropDuration);
    const eased = this._dropT < 0.5 ? 2 * this._dropT * this._dropT : 1 - Math.pow(-2 * this._dropT + 2, 2) / 2;
    this.position.lerpVectors(this._dropStart, this._dropEnd, eased);
    const dir = this._dropEnd.clone().sub(this._dropStart);
    if (dir.lengthSq() > 0.001) this.yaw = Math.atan2(dir.x, dir.z);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    return this._dropT >= 1;
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
      return;
    }
    // Being shot (not storm/self) is the one thing allowed to interrupt
    // anything and force defensive building, regardless of scavenge window.
    if (meta.from && meta.from !== this && !meta.storm) {
      this.hasBeenDamaged = true;
      if (this.state !== 'defensive_build') this._enterDefensiveBuild(meta.from.position);
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
    const targets = this.world.getStructureMeshes();
    if (this.world.terrainMesh) targets.push(this.world.terrainMesh);
    const hits = _raycaster.intersectObjects(targets, false);
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

  _faceToward(x, z, dt) {
    const targetYaw = Math.atan2(x - this.position.x, z - this.position.z);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = TURN_SPEED * dt;
    this.yaw += THREE.MathUtils.clamp(diff, -maxStep, maxStep);
  }

  // ---- Looting ----
  _updateLooting(dt) {
    if (this.lootTarget) {
      const stale = this.lootTarget.kind === 'chest' ? this.lootTarget.ref.opened : this.lootTarget.ref.collected;
      if (stale) this.lootTarget = null;
    }

    if (!this.lootTarget) this.lootTarget = this._findNearestLoot();

    if (!this.lootTarget) {
      this.roamTimer -= dt;
      if (!this.roamTarget || this.roamTimer <= 0) this._pickRoamTarget();
      this._moveToward(this.roamTarget.x, this.roamTarget.y, dt, 0.6);
      this._faceToward(this.roamTarget.x, this.roamTarget.y, dt);
      return;
    }

    const targetPos = this.lootTarget.ref.mesh.position;
    const dist = this.position.distanceTo(targetPos);
    this._faceToward(targetPos.x, targetPos.z, dt);

    if (this.lootTarget.kind === 'chest') {
      const range = CHEST_INTERACT_RANGE;
      if (dist > range) {
        this._moveToward(targetPos.x, targetPos.z, dt, 0.85);
        this.chestHoldTimer = 0;
      } else {
        this.velocity.x *= 0.7; this.velocity.z *= 0.7;
        this.chestHoldTimer += dt;
        if (this.chestHoldTimer >= CHEST_HOLD_TIME) {
          this._openChest(this.lootTarget.ref);
          this.lootTarget = null;
        }
      }
    } else {
      if (dist > PICKUP_RANGE) {
        this._moveToward(targetPos.x, targetPos.z, dt, 0.95);
      } else {
        this._collectPickup(this.lootTarget.ref);
        this.lootTarget = null;
      }
    }
  }

  _findNearestLoot() {
    let best = null, bestDist = 90;
    const chests = this.world.getChests ? this.world.getChests() : [];
    for (const chest of chests) {
      if (chest.opened) continue;
      const d = this.position.distanceTo(chest.mesh.position);
      if (d < bestDist) { bestDist = d; best = { kind: 'chest', ref: chest }; }
    }
    const pickups = this.world.getPickups ? this.world.getPickups() : [];
    for (const pk of pickups) {
      if (pk.collected) continue;
      const d = this.position.distanceTo(pk.mesh.position);
      if (d < bestDist) { bestDist = d; best = { kind: 'pickup', ref: pk }; }
    }
    return best;
  }

  _openChest(chest) {
    chest.open();
    const { weaponId, rarity } = rollLootItem(this._rand);
    const rolled = createWeaponInstance(weaponId, rarity);
    if (!this.weapon) {
      this.weapon = rolled;
    } else if (this.weapon.ammoType === rolled.ammoType) {
      this.weapon.reserve = Math.min(999, this.weapon.reserve + this.weapon.magSize * 2);
    }
    const matType = ['wood', 'stone', 'metal'][Math.floor(this._rand() * 3)];
    this.inventory[matType] = Math.min(300, this.inventory[matType] + 15 + Math.floor(this._rand() * 20));
    this.shield = Math.min(this.maxShield, this.shield + 15);
  }

  _collectPickup(pickup) {
    if (pickup.kind === 'weapon') {
      if (!this.weapon) this.weapon = pickup.payload;
      else this.weapon.reserve = Math.min(999, this.weapon.reserve + pickup.payload.magSize);
    } else if (pickup.kind === 'ammo') {
      if (this.weapon && this.weapon.ammoType === pickup.payload.ammoType) {
        this.weapon.reserve = Math.min(999, this.weapon.reserve + pickup.payload.amount);
      }
    } else if (pickup.kind === 'shield') {
      this.shield = Math.min(this.maxShield, this.shield + pickup.payload.amount);
    }
    if (this.world.removePickup) this.world.removePickup(pickup);
  }

  // ---- Defensive building (triggered by taking damage) ----
  _enterDefensiveBuild(attackerPos) {
    this.postDefenseState = this.state === 'combat' ? 'combat' : 'looting';
    this.state = 'defensive_build';
    this.defensiveTimer = DEFENSIVE_BUILD_BUDGET;
    this.wallsPlacedThisDefense = 0;
    this.defenseDir = new THREE.Vector3(attackerPos.x - this.position.x, 0, attackerPos.z - this.position.z);
    if (this.defenseDir.lengthSq() < 0.001) this.defenseDir.set(0, 0, 1);
    this.defenseDir.normalize();
  }

  _updateDefensiveBuild(dt) {
    this.defensiveTimer -= dt;
    this._faceToward(this.position.x + this.defenseDir.x, this.position.z + this.defenseDir.z, dt);
    this.velocity.x *= 0.8; this.velocity.z *= 0.8;

    if (this.wallsPlacedThisDefense < 2 && this.defensiveTimer > 0.3) {
      const buildSystem = this.world.buildSystem;
      const cellPos = this.position.clone().addScaledVector(this.defenseDir, 2.2);
      const cell = worldToCell(cellPos.x, this.position.y, cellPos.z);
      const face = cardinalFace({ x: this.defenseDir.x, z: this.defenseDir.z });
      const tier = this.inventory.wood >= 10 ? 'wood' : this.inventory.stone >= 10 ? 'brick' : this.inventory.metal >= 10 ? 'metal' : null;
      if (tier) {
        const placed = buildSystem.placeAt({ type: 'wall', tier, ix: cell.ix, iy: cell.iy, iz: cell.iz, face }, this.inventory);
        if (placed) this.wallsPlacedThisDefense++;
        else this.defensiveTimer -= 0.4; // avoid hammering an invalid spot every frame
      } else {
        this.defensiveTimer = 0; // no materials — nothing more to do here
      }
    }

    if (this.defensiveTimer <= 0) {
      if (this.reloading) { this.state = this.postDefenseState; return; }
      if (this.weapon && this.weapon.mag <= 0 && this.weapon.reserve > 0) {
        this.reloading = true;
        this.reloadTimer = this.weapon.reloadTime;
      }
      this.state = this.weapon ? 'combat' : this.postDefenseState;
    }
  }

  // ---- Combat ----
  _combatBehavior(target, dt) {
    const dist = this.position.distanceTo(target.position);
    this._faceToward(target.position.x, target.position.z, dt);

    const preferred = this.weapon.kind === 'shotgun' ? 8 : this.weapon.id === 'sniper' ? 26 : 16;
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

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        const need = this.weapon.magSize - this.weapon.mag;
        const take = Math.min(need, this.weapon.reserve);
        this.weapon.mag += take;
        this.weapon.reserve -= take;
      }
      return;
    }

    if (this.weapon.mag <= 0) {
      if (this.weapon.reserve > 0) { this.reloading = true; this.reloadTimer = this.weapon.reloadTime; }
      return;
    }

    if (dist <= (this.weapon.range || 40) && this.fireCooldown <= 0 && this._hasLineOfSight(target.position)) {
      this._shoot(target);
      this.fireCooldown = 1 / this.weapon.fireRate * (0.9 + this._rand() * 0.5);
    }
  }

  _shoot(target) {
    this.weapon.mag -= 1;
    const origin = this.position.clone();
    origin.y += 1.5;
    const dir = new THREE.Vector3().subVectors(target.position.clone().setY(target.position.y + 1.3), origin).normalize();
    const inaccurateWeapon = { ...this.weapon, spread: (this.weapon.spread || 0.02) + 0.025 };
    this.combatSystem.fireWeapon(this, origin, dir, inaccurateWeapon);
  }

  update(dt, characters, scavengeWindowExpired) {
    if (this.isDead) return;

    const storm = this.world.storm;
    const outside = storm.isOutside(this.position.x, this.position.z);
    if (outside) this.takeDamage(storm.damagePerSecond * dt, { storm: true });
    if (this.isDead) return;

    // Target acquisition with a human-like reaction delay before engaging.
    // The expensive O(characters) line-of-sight scan itself is throttled;
    // an already-engaged target is still re-checked every frame elsewhere.
    this._scanTimer -= dt;
    if (this._scanTimer <= 0) {
      this._lastSpotted = this._findTarget(characters);
      this._scanTimer = 0.2 + this._rand() * 0.1;
    }
    let spotted = this._lastSpotted;
    if (spotted && spotted.isDead) { spotted = null; this._lastSpotted = null; }
    if (spotted) {
      if (this.reactionTarget !== spotted) {
        this.reactionTarget = spotted;
        this.reactionTimer = 0.3 + this._rand() * 0.4;
      } else {
        this.reactionTimer -= dt;
      }
    } else {
      this.reactionTarget = null;
      this.engagedTarget = null;
    }

    const canEngage = this.weapon && (scavengeWindowExpired || this.hasBeenDamaged);
    if (spotted && canEngage && this.reactionTimer <= 0) {
      this.engagedTarget = spotted;
    }

    if (this.state !== 'defensive_build') {
      if (outside && (!this.engagedTarget || this.position.distanceTo(new THREE.Vector3(storm.center.x, this.position.y, storm.center.y)) > 6)) {
        this.state = 'flee_storm';
      } else if (this.engagedTarget) {
        this.state = 'combat';
      } else if (this.state !== 'looting') {
        this.state = 'looting';
      }
    }

    if (this.state === 'flee_storm') {
      this._moveToward(storm.center.x, storm.center.y, dt, 1.15);
      this._faceToward(storm.center.x, storm.center.y, dt);
    } else if (this.state === 'combat') {
      this._combatBehavior(this.engagedTarget, dt);
    } else if (this.state === 'defensive_build') {
      this._updateDefensiveBuild(dt);
    } else {
      this._updateLooting(dt);
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
