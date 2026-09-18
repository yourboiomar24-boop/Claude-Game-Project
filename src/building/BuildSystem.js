import * as THREE from 'three';
import { StructurePiece } from './StructurePiece.js';
import { TILE, MATERIAL_TIERS, RESOURCE_FOR_TIER, PIECE_COST } from './BuildConfig.js';

const PLACEMENT_RANGE = 8;
const PLACEMENT_FALLBACK = 5.2;

const _fwd = new THREE.Vector3();
const _target = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

export function cardinalFace(fwdXZ) {
  if (Math.abs(fwdXZ.x) > Math.abs(fwdXZ.z)) return fwdXZ.x > 0 ? 'E' : 'W';
  return fwdXZ.z > 0 ? 'S' : 'N';
}

export function cardinalAngle(fwdXZ) {
  const raw = THREE.MathUtils.radToDeg(Math.atan2(fwdXZ.x, fwdXZ.z));
  return Math.round(raw / 90) * 90;
}

export function worldToCell(x, y, z) {
  return { ix: Math.round(x / TILE), iy: Math.round(y / TILE), iz: Math.round(z / TILE) };
}

export class BuildSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.pieceType = 'wall'; // wall | floor | ramp
    this.tier = 'wood';
    this.pieces = new Map(); // gridKey -> StructurePiece
    this.pieceList = [];
    this.cellOccupancy = new Map(); // "ix,iy,iz" -> count of pieces in that cell
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
    }

    const valid = this._isValidTarget(this.currentTarget);
    this.ghostValid = valid;
    mesh.material = valid ? this.ghostMats.valid : this.ghostMats.invalid;
  }

  _keyFor(type, t) {
    if (type === 'wall') return `wall:${t.ix},${t.iy},${t.iz},${t.face}`;
    return `${type}:${t.ix},${t.iy},${t.iz}`;
  }

  _cellKey(ix, iy, iz) {
    return `${ix},${iy},${iz}`;
  }

  _hasPieceInCell(ix, iy, iz) {
    return (this.cellOccupancy.get(this._cellKey(ix, iy, iz)) || 0) > 0;
  }

  // A placement is only allowed if it rests on the terrain or touches an
  // already-placed piece — no arbitrary floating structures.
  _isGrounded(t) {
    const cx = t.ix * TILE, cz = t.iz * TILE;
    const groundY = this.terrain.getHeightAt(cx, cz);
    const baseY = t.iy * TILE;
    if (baseY <= groundY + TILE * 0.6 && baseY >= groundY - TILE * 1.5) return true;

    const neighbors = [
      [t.ix, t.iy - 1, t.iz], [t.ix, t.iy + 1, t.iz],
      [t.ix - 1, t.iy, t.iz], [t.ix + 1, t.iy, t.iz],
      [t.ix, t.iy, t.iz - 1], [t.ix, t.iy, t.iz + 1],
      [t.ix, t.iy, t.iz],
    ];
    return neighbors.some(([ix, iy, iz]) => this._hasPieceInCell(ix, iy, iz));
  }

  _isValidTarget(t, type = this.pieceType) {
    if (!t) return false;
    const key = this._keyFor(type, t);
    if (this.pieces.has(key)) return false;
    if (!this._isGrounded(t)) return false;
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
    return this._commitPlacement({ type: this.pieceType, tier: this.tier, ...this.currentTarget }, inventory);
  }

  // Explicit-target placement used by bots (no camera/ghost involved): they
  // compute their own target cell (e.g. facing an incoming shot) and call
  // this directly. Runs the same grounding/overlap/cost checks as place().
  placeAt({ type, tier, ix, iy, iz, face = null, facing = 0 }, inventory) {
    const t = { ix, iy, iz, face, facing };
    if (!this._isValidTarget(t, type)) return null;
    const resType = RESOURCE_FOR_TIER[tier];
    if ((inventory[resType] || 0) < PIECE_COST) return null;
    return this._commitPlacement({ type, tier, ix, iy, iz, face, facing }, inventory);
  }

  _commitPlacement({ type, tier, ix, iy, iz, face, facing }, inventory) {
    const resType = RESOURCE_FOR_TIER[tier];
    const piece = new StructurePiece({ type, tier, ix, iy, iz, face, facing });
    inventory[resType] -= PIECE_COST;

    piece.onDestroyed = (p) => this._removePiece(p);
    this.scene.add(piece.group);
    this.pieces.set(piece.gridKey(), piece);
    this.pieceList.push(piece);
    const ck = this._cellKey(piece.ix, piece.iy, piece.iz);
    this.cellOccupancy.set(ck, (this.cellOccupancy.get(ck) || 0) + 1);
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
    const ck = this._cellKey(piece.ix, piece.iy, piece.iz);
    const count = (this.cellOccupancy.get(ck) || 1) - 1;
    if (count <= 0) this.cellOccupancy.delete(ck); else this.cellOccupancy.set(ck, count);
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
