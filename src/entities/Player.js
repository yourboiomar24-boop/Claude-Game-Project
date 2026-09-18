import * as THREE from 'three';
import { buildCharacterModel } from './CharacterModel.js';
import { WEAPONS } from '../combat/Weapons.js';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 32;
const FRICTION = 14;
const GRAVITY = -26;
const JUMP_SPEED = 8.4;
const STEP_HEIGHT = 0.65;
const PLAYER_RADIUS = 0.36;
const MOUSE_SENS = 0.0022;
const CAM_DISTANCE = 4.4;
const CAM_HEIGHT = 1.55;
const CAM_ADS_DISTANCE = 2.6;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _camRayOrigin = new THREE.Vector3();
const _camRayDir = new THREE.Vector3();
const _camRaycaster = new THREE.Raycaster();
const _desiredCamPos = new THREE.Vector3();

export class Player {
  constructor({ scene, camera, input, skin, world, combatSystem }) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.world = world; // { terrain, buildSystem, storm }
    this.combatSystem = combatSystem;

    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.crouching = false;

    this.yaw = 0;
    this.pitch = -0.12;

    this.health = 100;
    this.maxHealth = 100;
    this.shield = 50;
    this.maxShield = 100;
    this.isDead = false;
    this.kills = 0;

    this.inventory = { wood: 50, stone: 50, metal: 20 };

    this.weaponSlots = [{ ...WEAPONS.pickaxe }, null, null, null, null];
    this.activeSlot = 0;
    this.mode = 'combat'; // 'combat' | 'build'
    this.buildType = 'wall';
    this.editMode = false;
    this.editTarget = null;

    this._fireCooldown = 0;
    this._reloadTimer = 0;
    this._reloading = false;
    this._aiming = false;
    this._animT = 0;

    this.onToast = null;
    this.onKillFeed = null;
    this.onDeath = null;
    this.onFire = null;
    this.onEditEnter = null; // (piece) => void — called when edit mode opens
    this.onEditExit = null; // (piece) => void — called on commit, before clearing target

    this.mesh = buildCharacterModel(skin);
    this.mesh.visible = true; // third-person: player sees their own body
    scene.add(this.mesh);
    this._tagHitboxes();

    this._nearChest = null;
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

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.mesh.position.copy(this.position);
  }

  // Thin passthroughs so phase managers (lobby/bus/skydive) can reuse the
  // player's own look/camera code without duplicating it.
  applyLook(dt) { this._handleLook(dt); }
  refreshCamera() { this._updateCamera(); }
  syncMeshToPosition() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }

  // Phase 1 (lobby): free look + flat-ground walking only — no weapons,
  // no building, no damage.
  updateLobby(dt, lobbyManager) {
    this._handleLook(dt);
    const input = this.input;
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(_fwd.z, 0, -_fwd.x);
    _move.set(0, 0, 0);
    if (input.isDown('KeyW')) _move.add(_fwd);
    if (input.isDown('KeyS')) _move.sub(_fwd);
    if (input.isDown('KeyD')) _move.add(_right);
    if (input.isDown('KeyA')) _move.sub(_right);
    if (_move.lengthSq() > 0) _move.normalize();
    this.position.addScaledVector(_move, WALK_SPEED * dt);
    this.position.y = lobbyManager.getSurfaceY();
    lobbyManager.clampPosition(this.position);
    this._speed2D = _move.length() * WALK_SPEED;
    this._moving = _move.lengthSq() > 0;
    this._sprinting = false;
    this.syncMeshToPosition();
    this._animate(dt);
    this._updateCamera();
  }

  // Phase 2 (battle bus): walking is disabled, but mouse look is fully free
  // (no pitch/yaw lock) so the player can scan the map before jumping. The
  // player rides at the bus's current world position each frame.
  updateBusRide(dt, busPosition) {
    this._handleLook(dt);
    this.position.copy(busPosition);
    this.velocity.set(0, 0, 0);
    this.syncMeshToPosition();
    this._updateCamera();
  }

  currentWeapon() {
    return this.weaponSlots[this.activeSlot];
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
    if (this.onFire) this.onFire('damaged', meta);
    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      if (this.onDeath) this.onDeath(meta);
    }
  }

  addMaterials(type, amount) {
    this.inventory[type] = Math.min(500, (this.inventory[type] || 0) + amount);
  }

  // Accepts a concrete weapon instance (see createWeaponInstance) so the
  // rolled rarity's damage/spread come along with the pickup.
  pickupWeapon(weaponInstance) {
    const emptyIdx = this.weaponSlots.findIndex((s, i) => i > 0 && !s);
    const dupIdx = this.weaponSlots.findIndex((s) => s && s.id === weaponInstance.id);
    if (dupIdx > 0) {
      this.weaponSlots[dupIdx].reserve = Math.min(999, this.weaponSlots[dupIdx].reserve + weaponInstance.magSize * 2);
      return true;
    }
    if (emptyIdx === -1) return false;
    this.weaponSlots[emptyIdx] = weaponInstance;
    return true;
  }

  addAmmo(ammoType, amount) {
    for (const slot of this.weaponSlots) {
      if (slot && slot.ammoType === ammoType) slot.reserve = Math.min(999, slot.reserve + amount);
    }
  }

  selectSlot(i) {
    if (!this.weaponSlots[i] && i !== 0) return;
    if (i !== this.activeSlot) {
      this.activeSlot = i;
      this._reloading = false;
    }
    this.mode = 'combat';
  }

  selectBuild(type) {
    this.world.buildSystem.setPieceType(type);
    this.buildType = type;
    this.mode = 'build';
  }

  _handleLook(dt) {
    if (this.editMode) return; // orientation frozen while editing a piece
    const dx = this.input.mouseDelta.x;
    const dy = this.input.mouseDelta.y;
    this.yaw -= dx * MOUSE_SENS;
    this.pitch -= dy * MOUSE_SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.3, 1.35);
  }

  _handleHotkeys() {
    const input = this.input;
    if (this.editMode) {
      if (input.wasPressed('KeyF')) this._exitEditMode();
      return;
    }

    if (input.wasPressed('Digit1')) this.selectSlot(0);
    if (input.wasPressed('Digit2')) this.selectSlot(1);
    if (input.wasPressed('Digit3')) this.selectSlot(2);
    if (input.wasPressed('Digit4')) this.selectSlot(3);
    if (input.wasPressed('Digit5')) this.selectSlot(4);
    if (input.wasPressed('Digit6')) this.selectBuild('wall');
    if (input.wasPressed('Digit7')) this.selectBuild('floor');
    if (input.wasPressed('Digit8')) this.selectBuild('ramp');
    if (input.wasPressed('KeyT')) this.world.buildSystem.cycleTier();
    if (input.wasPressed('KeyR') && this.mode === 'combat') this._startReload();

    if (input.wasPressed('KeyF')) {
      const target = this.world.buildSystem.raycastEditable(this.camera, 9);
      if (target) this._enterEditMode(target);
    }
  }

  _enterEditMode(target) {
    this.editMode = true;
    this.editTarget = target;
    this.velocity.set(0, this.velocity.y, 0);
    document.exitPointerLock?.();
    if (this.onEditEnter) this.onEditEnter(target.piece);
  }

  _exitEditMode() {
    const piece = this.editTarget?.piece;
    if (this.onEditExit) this.onEditExit(piece);
    this.editMode = false;
    this.editTarget = null;
    this.input.dom.requestPointerLock?.();
  }

  _startReload() {
    const w = this.currentWeapon();
    if (!w || w.isPickaxe || this._reloading) return;
    if (w.mag >= w.magSize || w.reserve <= 0) return;
    this._reloading = true;
    this._reloadTimer = w.reloadTime;
  }

  _handleMovement(dt) {
    if (this.editMode) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this._speed2D = 0;
      this._moving = false;
      this._sprinting = false;
      return;
    }
    const input = this.input;
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(_fwd.z, 0, -_fwd.x);
    _move.set(0, 0, 0);
    if (input.isDown('KeyW')) _move.add(_fwd);
    if (input.isDown('KeyS')) _move.sub(_fwd);
    if (input.isDown('KeyD')) _move.add(_right);
    if (input.isDown('KeyA')) _move.sub(_right);
    if (_move.lengthSq() > 0) _move.normalize();

    this.crouching = input.isDown('KeyC');
    const forwardAmount = _move.dot(_fwd);
    const sprinting = input.isDown('ShiftLeft') && !this.crouching && forwardAmount > 0.5;
    const targetSpeed = this.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;

    const desiredVX = _move.x * targetSpeed;
    const desiredVZ = _move.z * targetSpeed;
    const accel = _move.lengthSq() > 0 ? ACCEL : FRICTION;
    this.velocity.x += (desiredVX - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (desiredVZ - this.velocity.z) * Math.min(1, accel * dt);

    if (input.wasPressed('Space') && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    this._speed2D = Math.hypot(this.velocity.x, this.velocity.z);
    this._moving = _move.lengthSq() > 0;
    this._sprinting = sprinting;
  }

  _resolveWallCollisions() {
    const boxes = this.world.buildSystem.getWallBoxes();
    const feetY = this.position.y;
    const headY = feetY + (this.crouching ? 1.1 : 1.8);
    for (const box of boxes) {
      if (box.max.y < feetY + 0.05 || box.min.y > headY) continue;
      const cx = THREE.MathUtils.clamp(this.position.x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(this.position.z, box.min.z, box.max.z);
      const dx = this.position.x - cx;
      const dz = this.position.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS && distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        const push = (PLAYER_RADIUS - dist) / dist;
        this.position.x += dx * push;
        this.position.z += dz * push;
      } else if (distSq <= 1e-8) {
        // center inside box: push out along smallest penetration axis
        const penX = Math.min(this.position.x - box.min.x, box.max.x - this.position.x);
        const penZ = Math.min(this.position.z - box.min.z, box.max.z - this.position.z);
        if (penX < penZ) this.position.x += (this.position.x < (box.min.x + box.max.x) / 2 ? -1 : 1) * (penX + 0.01);
        else this.position.z += (this.position.z < (box.min.z + box.max.z) / 2 ? -1 : 1) * (penZ + 0.01);
      }
    }
  }

  _resolveVertical(dt) {
    this.velocity.y += GRAVITY * dt;
    const predictedY = this.position.y + this.velocity.y * dt;

    const candidates = this.world.buildSystem.getSupportCandidates(this.position.x, this.position.z);
    let support = -Infinity;
    for (const c of candidates) {
      if (c <= this.position.y + STEP_HEIGHT && c > support) support = c;
    }
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

  _updateCamera() {
    const headPos = this.position.clone();
    headPos.y += this.crouching ? 1.25 : 1.65;

    _fwd.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    const dist = this._aiming ? CAM_ADS_DISTANCE : CAM_DISTANCE;
    _desiredCamPos.copy(headPos).addScaledVector(_fwd, -dist);
    _desiredCamPos.y += CAM_HEIGHT * 0.3;

    _camRayOrigin.copy(headPos);
    _camRayDir.subVectors(_desiredCamPos, headPos).normalize();
    const fullDist = headPos.distanceTo(_desiredCamPos);
    _camRaycaster.set(_camRayOrigin, _camRayDir);
    _camRaycaster.far = fullDist;
    const hits = _camRaycaster.intersectObjects(this.world.buildSystem.getCollidableMeshes(), false);
    let finalDist = fullDist;
    if (hits.length) finalDist = Math.max(0.4, hits[0].distance - 0.25);

    this.camera.position.copy(headPos).addScaledVector(_camRayDir, finalDist);
    this.camera.lookAt(headPos.clone().addScaledVector(_fwd, 6));
    this.camera.fov = this._aiming && this.currentWeapon()?.scoped ? 30 : this._aiming ? 55 : 70;
    this.camera.updateProjectionMatrix();
  }

  _animate(dt) {
    const parts = this.mesh.userData.parts;
    this._animT += dt * (this._sprinting ? 10 : 7);
    if (this._speed2D > 0.3 && this.onGround) {
      const s = Math.sin(this._animT) * Math.min(1, this._speed2D / SPRINT_SPEED) * 0.6;
      parts.legL.hip.rotation.x = s;
      parts.legR.hip.rotation.x = -s;
      parts.armL.shoulder.rotation.x = -s * 0.8;
      parts.armR.shoulder.rotation.x = s * 0.8;
    } else {
      parts.legL.hip.rotation.x = THREE.MathUtils.lerp(parts.legL.hip.rotation.x, 0, dt * 8);
      parts.legR.hip.rotation.x = THREE.MathUtils.lerp(parts.legR.hip.rotation.x, 0, dt * 8);
      parts.armL.shoulder.rotation.x = THREE.MathUtils.lerp(parts.armL.shoulder.rotation.x, 0, dt * 8);
      parts.armR.shoulder.rotation.x = THREE.MathUtils.lerp(parts.armR.shoulder.rotation.x, 0, dt * 8);
    }
    parts.hips.position.y = this.crouching ? 0.65 : 1.0;
    parts.head.rotation.x = THREE.MathUtils.clamp(this.pitch, -0.9, 0.9);
  }

  _handleFire(dt) {
    this._fireCooldown -= dt;
    if (this._reloading) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) {
        const w = this.currentWeapon();
        const need = w.magSize - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this._reloading = false;
      }
    }

    if (this.editMode) return; // all actions frozen; the edit overlay handles its own clicks

    this._aiming = this.input.mouseButtons.has(2) && this.mode === 'combat';

    const firing = this.input.mouseButtons.has(0);
    const firingEdge = this.input.wasMousePressed(0);
    if (!firing) return;

    if (this.mode === 'build') {
      if (firingEdge) {
        const piece = this.world.buildSystem.place(this.inventory);
        if (!piece && this.onToast) this.onToast('Not enough materials');
      }
      return;
    }

    const weapon = this.currentWeapon();
    if (!weapon) return;

    if (weapon.isPickaxe) {
      if (this._fireCooldown <= 0) {
        this._swingPickaxe(weapon);
        this._fireCooldown = 1 / weapon.fireRate;
      }
      return;
    }

    if (this._reloading) return;
    if (weapon.mag <= 0) {
      if (firingEdge) this._startReload();
      return;
    }
    const canShoot = weapon.auto ? this._fireCooldown <= 0 : this._fireCooldown <= 0 && firingEdge;
    if (canShoot) {
      this._fireWeapon(weapon);
      this._fireCooldown = 1 / weapon.fireRate;
    }
  }

  _muzzleOrigin() {
    return this.camera.position.clone();
  }

  _cameraForward() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  _swingPickaxe(weapon) {
    const origin = this._muzzleOrigin();
    const dir = this._cameraForward();
    const result = this.combatSystem.meleeSwing(this, origin, dir, weapon);
    if (result?.type === 'resource') {
      this.addMaterials(result.resourceType, result.amount);
      if (this.onToast) this.onToast(`+${result.amount} ${result.resourceType}`);
    } else if (result?.type === 'character') {
      if (this.onFire) this.onFire('hit', {});
    }
  }

  _fireWeapon(weapon) {
    weapon.mag -= 1;
    const origin = this._muzzleOrigin();
    const dir = this._cameraForward();
    const results = this.combatSystem.fireWeapon(this, origin, dir, weapon);
    for (const r of results) {
      if (r?.type === 'character' && this.onFire) this.onFire('hit', { headshot: r.headshot });
    }
    if (this.onFire) this.onFire('shot', { weapon: weapon.id });
  }

  applyStormDamage(dps, dt) {
    if (this.isDead) return;
    this.takeDamage(dps * dt, { storm: true });
  }

  update(dt) {
    if (this.isDead) return;
    this._handleLook(dt);
    this._handleHotkeys();
    this._handleMovement(dt);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._resolveWallCollisions();
    this._resolveVertical(dt);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    this._animate(dt);

    this.world.buildSystem.updateGhost(this.camera, this.mode === 'build' && !this.editMode);

    this._handleFire(dt);
    this._updateCamera();
  }
}
