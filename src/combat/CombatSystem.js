import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _tmpDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

// Handles hitscan/shotgun ray tests against terrain, structures, and
// character hitboxes, applies damage, and spawns lightweight tracer/impact
// visuals. One instance is shared by the player and every bot.
export class CombatSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.tracers = [];
    this.impacts = [];

    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.9 });
    this.impactGeo = new THREE.SphereGeometry(0.06, 6, 6);
  }

  _collectTargets(excludeEntity) {
    const meshes = [];
    if (this.world.terrainMesh) meshes.push(this.world.terrainMesh);
    for (const m of this.world.getStructureMeshes()) meshes.push(m);
    for (const c of this.world.getCharacters()) {
      if (c === excludeEntity || c.isDead) continue;
      for (const hm of c.getDamageMeshes()) meshes.push(hm);
    }
    for (const n of this.world.getResourceMeshes ? this.world.getResourceMeshes() : []) meshes.push(n);
    return meshes;
  }

  _resolveHit(hit) {
    let obj = hit.object;
    while (obj && !obj.userData.owner && !obj.userData.resourceNode && !obj.userData.structurePiece && obj !== this.world.terrainMesh) {
      obj = obj.parent;
    }
    return obj;
  }

  fireRay(shooter, origin, direction, { damage, range, headMultiplier = 1.8 }) {
    _raycaster.set(origin, direction);
    _raycaster.far = range;
    const targets = this._collectTargets(shooter);
    const hits = _raycaster.intersectObjects(targets, false);
    this._spawnTracer(origin, direction, range, hits[0]?.distance ?? range);
    if (!hits.length) return null;
    const hit = hits[0];
    const obj = this._resolveHit(hit);
    this._spawnImpact(hit.point);

    if (obj && obj.userData.owner) {
      const owner = obj.userData.owner;
      const dmg = damage * (obj.userData.headshot ? headMultiplier : 1);
      owner.takeDamage(dmg, { headshot: !!obj.userData.headshot, from: shooter });
      return { type: 'character', entity: owner, headshot: !!obj.userData.headshot, point: hit.point };
    }
    if (obj && obj.userData.resourceNode) {
      return { type: 'resource', node: obj.userData.resourceNode, point: hit.point };
    }
    if (obj && obj.userData.structurePiece) {
      obj.userData.structurePiece.damage(damage);
      return { type: 'structure', piece: obj.userData.structurePiece, point: hit.point };
    }
    return { type: 'terrain', point: hit.point };
  }

  fireWeapon(shooter, origin, forward, weapon) {
    const results = [];
    if (weapon.kind === 'shotgun') {
      for (let i = 0; i < weapon.pellets; i++) {
        const dir = this._spreadDirection(forward, weapon.spread * 1.6);
        results.push(this.fireRay(shooter, origin, dir, weapon));
      }
    } else {
      const dir = this._spreadDirection(forward, weapon.spread || 0);
      results.push(this.fireRay(shooter, origin, dir, weapon));
    }
    return results;
  }

  meleeSwing(shooter, origin, forward, weapon) {
    _raycaster.set(origin, forward);
    _raycaster.far = weapon.range;
    const targets = this._collectTargets(shooter);
    const hits = _raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const obj = this._resolveHit(hit);
    this._spawnImpact(hit.point);
    if (obj && obj.userData.resourceNode) {
      const gained = obj.userData.resourceNode.hit(weapon.harvest);
      return { type: 'resource', resourceType: obj.userData.resourceNode.type, amount: gained };
    }
    if (obj && obj.userData.owner) {
      obj.userData.owner.takeDamage(weapon.damage, { from: shooter, headshot: !!obj.userData.headshot });
      return { type: 'character', entity: obj.userData.owner };
    }
    if (obj && obj.userData.structurePiece) {
      obj.userData.structurePiece.damage(weapon.damage);
      return { type: 'structure', piece: obj.userData.structurePiece };
    }
    return null;
  }

  _spreadDirection(forward, spread) {
    if (!spread) return forward.clone();
    _tmpDir.copy(forward).normalize();
    _up.set(0, 1, 0);
    _right.crossVectors(_tmpDir, _up).normalize();
    const upVec = new THREE.Vector3().crossVectors(_right, _tmpDir).normalize();
    const a = (Math.random() * 2 - 1) * spread;
    const b = (Math.random() * 2 - 1) * spread;
    return _tmpDir.clone().addScaledVector(_right, a).addScaledVector(upVec, b).normalize();
  }

  _spawnTracer(origin, direction, range, distance) {
    const end = origin.clone().addScaledVector(direction, Math.min(distance, range));
    const geo = new THREE.BufferGeometry().setFromPoints([origin.clone(), end]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    this.scene.add(line);
    this.tracers.push({ mesh: line, life: 0.06 });
  }

  _spawnImpact(point) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
    const sphere = new THREE.Mesh(this.impactGeo, mat);
    sphere.position.copy(point);
    this.scene.add(sphere);
    this.impacts.push({ mesh: sphere, life: 0.15 });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.06) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      im.life -= dt;
      im.mesh.scale.setScalar(1 + (0.15 - im.life) * 6);
      im.mesh.material.opacity = im.life / 0.15;
      im.mesh.material.transparent = true;
      if (im.life <= 0) {
        this.scene.remove(im.mesh);
        im.mesh.material.dispose();
        this.impacts.splice(i, 1);
      }
    }
  }
}
