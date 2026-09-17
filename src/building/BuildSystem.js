import * as THREE from 'three';
import { StructurePiece } from './StructurePiece.js';
import { TILE, MATERIAL_TIERS, RESOURCE_FOR_TIER, PIECE_COST } from './BuildConfig.js';

const PLACEMENT_RANGE = 8;
const PLACEMENT_FALLBACK = 5.2;

const _fwd = new THREE.Vector3();
const _target = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function cardinalFace(fwdXZ) {
  if (Math.abs(fwdXZ.x) > Math.abs(fwdXZ.z)) return fwdXZ.x > 0 ? 'E' : 'W';
  return fwdXZ.z > 0 ? 'S' : 'N';
}

function cardinalAngle(fwdXZ) {
  const raw = THREE.MathUtils.radToDeg(Math.atan2(fwdXZ.x, fwdXZ.z));
  return Math.round(raw / 90) * 90;
}

export class BuildSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.pieceType = 'wall'; // wall | floor | ramp | roof
    this.tier = 'wood';
    this.pieces = new Map(); // gridKey -> StructurePiece
    this.pieceList = [];
    this._collisionDirty = true;
    this._wallBoxesCache = [];

    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = 'BuildGhost';
    this.ghostValid = false;
    this._buildGhostMeshes();
    scene.add(this.ghostGroup);

    this.currentTarget = null; // {ix,iy,iz,face,facing}

    this.onPiecePlaced = null;
    this.onPieceDestroyed = null;
  }

  _buildGhostMeshes() {
    const validMat = new THREE.MeshBasicMaterial({ color: 0x62ff8a, transparent: true, opacity: 0.45, depthWrite: false });
    const invalidMat = new THREE.MeshBasicMaterial({ color: 0xff5b5b, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostMats = { valid: validMat, invalid: invalidMat };

    this.ghostShapes = {
      wall: new THREE.Mesh(new THREE.BoxGeometry(TILE, TILE, 0.3), validMat),
      floor: new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.3, TILE), validMat),
      ramp: new THREE.Mesh(new THREE.BoxGeometry(TILE, TILE, TILE), validMat),
      roof: new THREE.Mesh(new THREE.ConeGeometry(TILE * 0.72, TILE * 0.85, 4), validMat),
    };
    for (const key of Object.keys(this.ghostShapes)) {
      const m = this.ghostShapes[key];
      m.visible = false;
      this.ghostGroup.add(m);
    }
  }

  setPieceType(type) {
    if (!this.ghostShapes[type]) return;
    this.pieceType = type;
  }

  setTier(tier) {
    if (MATERIAL_TIERS[tier]) this.tier = tier;
  }

  cycleTier() {
    const order = ['wood', 'brick', 'metal'];
    this.tier = order[(order.indexOf(this.tier) + 1) % order.length];
  }

  getCollidableMeshes(excludeSet) {
    const meshes = [this.terrain.mesh];
    for (const p of this.pieceList) {
      if (excludeSet && excludeSet.has(p)) continue;
      if (p.type === 'wall' || p.type === 'floor') {
        for (const m of p.segmentMeshes) if (m.visible) meshes.push(m);
      } else if (p.mainMesh) meshes.push(p.mainMesh);
    }
    return meshes;
  }

  // Called every frame with the active camera to update the ghost preview.
  updateGhost(camera, buildModeActive) {
    if (!buildModeActive) {
      for (const k of Object.keys(this.ghostShapes)) this.ghostShapes[k].visible = false;
      this.currentTarget = null;
      return;
    }

    camera.getWorldDirection(_fwd);
    const fwdXZLen = Math.hypot(_fwd.x, _fwd.z) || 1;
    const fwdXZ = { x: _fwd.x / fwdXZLen, z: _fwd.z / fwdXZLen };

    _raycaster.set(camera.position, _fwd);
    _raycaster.far = PLACEMENT_RANGE;
    const hits = _raycaster.intersectObjects(this.getCollidableMeshes(), false);
    if (hits.length) {
      _target.copy(hits[0].point).addScaledVector(_fwd, -0.15);
    } else {
      _target.copy(camera.position).addScaledVector(_fwd, PLACEMENT_FALLBACK);
    }

    const ix = Math.round(_target.x / TILE);
    const iz = Math.round(_target.z / TILE);
    const iy = Math.round(_target.y / TILE);
    const face = cardinalFace(fwdXZ);
    const facing = cardinalAngle(fwdXZ);

    this.currentTarget = { ix, iy, iz, face, facing };

    for (const k of Object.keys(this.ghostShapes)) this.ghostShapes[k].visible = k === this.pieceType;
    const mesh = this.ghostShapes[this.pieceType];

    const cx = ix * TILE, cz = iz * TILE, baseY = iy * TILE;
    if (this.pieceType === 'floor') {
      mesh.position.set(cx, baseY, cz);
      mesh.rotation.set(0, 0, 0);
    } else if (this.pieceType === 'wall') {
      const half = TILE / 2;
      let ox = 0, oz = 0, rotY = 0;
      switch (face) {
        case 'N': oz = -half; break;
        case 'S': oz = half; break;
        case 'E': ox = half; rotY = Math.PI / 2; break;
        case 'W': ox = -half; rotY = Math.PI / 2; break;
      }
      mesh.position.set(cx + ox, baseY + half, cz + oz);
      mesh.rotation.set(0, rotY, 0);
    } else {
      mesh.position.set(cx, baseY, cz);
      mesh.rotation.set(0, THREE.MathUtils.degToRad(facing), 0);
      if (this.pieceType === 'roof') mesh.position.y = baseY;
    }

    const valid = this._isValidTarget(this.currentTarget);
    this.ghostValid = valid;
    mesh.material = valid ? this.ghostMats.valid : this.ghostMats.invalid;
  }

  _keyFor(type, t) {
    if (type === 'wall') return `wall:${t.ix},${t.iy},${t.iz},${t.face}`;
    return `${type}:${t.ix},${t.iy},${t.iz}`;
  }

  _isValidTarget(t) {
    if (!t) return false;
    const key = this._keyFor(this.pieceType, t);
    if (this.pieces.has(key)) return false;
    return true;
  }

  canAfford(inventory) {
    const resType = RESOURCE_FOR_TIER[this.tier];
    return (inventory[resType] || 0) >= PIECE_COST;
  }

  // Attempts to place the currently-targeted ghost piece, deducting from
  // `inventory` ({wood, stone, metal}). Returns the placed piece or null.
  place(inventory) {
    if (!this.currentTarget || !this.ghostValid) return null;
    const resType = RESOURCE_FOR_TIER[this.tier];
    if ((inventory[resType] || 0) < PIECE_COST) return null;

    const t = this.currentTarget;
    const piece = new StructurePiece({
      type: this.pieceType,
      tier: this.tier,
      ix: t.ix, iy: t.iy, iz: t.iz,
      face: t.face,
      facing: t.facing,
    });
    inventory[resType] -= PIECE_COST;

    piece.onDestroyed = (p) => this._removePiece(p);
    this.scene.add(piece.group);
    this.pieces.set(piece.gridKey(), piece);
    this.pieceList.push(piece);
    this._collisionDirty = true;
    if (this.onPiecePlaced) this.onPiecePlaced(piece);
    return piece;
  }

  _removePiece(piece) {
    this.scene.remove(piece.group);
    piece.dispose();
    this.pieces.delete(piece.gridKey());
    const idx = this.pieceList.indexOf(piece);
    if (idx >= 0) this.pieceList.splice(idx, 1);
    this._collisionDirty = true;
    if (this.onPieceDestroyed) this.onPieceDestroyed(piece);
  }

  // Finds the nearest editable piece (wall/floor) the given ray hits, within range.
  raycastEditable(camera, range = 6) {
    camera.getWorldDirection(_fwd);
    _raycaster.set(camera.position, _fwd);
    _raycaster.far = range;
    const meshes = [];
    for (const p of this.pieceList) {
      if (!p.editable) continue;
      for (const m of p.segmentMeshes) if (m.visible) meshes.push(m);
    }
    const hits = _raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const mesh = hits[0].object;
    return { piece: mesh.userData.structurePiece, segIndex: mesh.userData.segIndex, point: hits[0].point };
  }

  getStructureMeshes() {
    const arr = [];
    for (const p of this.pieceList) {
      if (p.type === 'wall' || p.type === 'floor') {
        for (const m of p.segmentMeshes) if (m.visible) arr.push(m);
      } else if (p.mainMesh) arr.push(p.mainMesh);
    }
    return arr;
  }

  _rebuildCollisionCache() {
    this._wallBoxesCache = [];
    for (const p of this.pieceList) {
      if (p.type !== 'wall') continue;
      p.getSolidSegmentBoxes(this._wallBoxesCache);
    }
    this._collisionDirty = false;
  }

  getWallBoxes() {
    if (this._collisionDirty) this._rebuildCollisionCache();
    return this._wallBoxesCache;
  }

  // Highest supporting surface(s) at world (x,z): terrain + floors + ramps.
  getSupportCandidates(x, z, out = []) {
    out.length = 0;
    out.push(this.terrain.getHeightAt(x, z));
    const half = TILE / 2;
    for (const p of this.pieceList) {
      const dx = x - p.ix * TILE;
      const dz = z - p.iz * TILE;
      if (p.type === 'floor') {
        if (Math.abs(dx) <= half && Math.abs(dz) <= half && p.isSegmentSolid(4)) {
          out.push(p.iy * TILE);
        }
      } else if (p.type === 'ramp') {
        if (Math.abs(dx) <= half && Math.abs(dz) <= half) {
          const rad = THREE.MathUtils.degToRad(p.facing);
          const cos = Math.cos(-rad), sin = Math.sin(-rad);
          const lz = dx * sin + dz * cos; // inverse rotate
          const t = THREE.MathUtils.clamp((lz + half) / TILE, 0, 1);
          out.push(p.iy * TILE + t * TILE);
        }
      }
    }
    return out;
  }
}
