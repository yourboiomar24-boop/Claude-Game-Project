import * as THREE from 'three';
import { mulberry32 } from '../utils/Noise.js';

// Classic shrinking-circle storm: alternates "shrinking" phases with brief
// calm phases, each phase's safe zone nested inside the previous one and
// randomly offset. Anything outside the current safe radius takes damage
// per second that increases each phase.
export class Storm {
  constructor({ mapRadius = 150, seed = 7 } = {}) {
    this.mapRadius = mapRadius;
    const rand = mulberry32(seed);
    this.center = new THREE.Vector2(0, 0);
    this.radius = mapRadius * 0.98;
    this.nextCenter = this.center.clone();
    this.nextRadius = this.radius;
    this.phase = 0;
    this.state = 'calm'; // 'calm' | 'shrinking' | 'final'
    this.damagePerSecond = 1;
    this._rand = rand;

    this.phases = [
      { calm: 20, shrink: 40, shrinkTo: 0.62, dps: 1 },
      { calm: 16, shrink: 35, shrinkTo: 0.42, dps: 2 },
      { calm: 14, shrink: 30, shrinkTo: 0.24, dps: 4 },
      { calm: 12, shrink: 25, shrinkTo: 0.12, dps: 7 },
      { calm: 10, shrink: 20, shrinkTo: 0.0, dps: 12 },
    ];

    this._queueNextPhase();
    this.timeInPhase = 0;
  }

  _queueNextPhase() {
    const def = this.phases[Math.min(this.phase, this.phases.length - 1)];
    const rand = this._rand;
    const maxOffset = Math.max(0, this.radius - def.shrinkTo * this.radius);
    const ang = rand() * Math.PI * 2;
    const dist = rand() * maxOffset * 0.6;
    const cx = THREE.MathUtils.clamp(this.center.x + Math.cos(ang) * dist, -this.mapRadius * 0.5, this.mapRadius * 0.5);
    const cy = THREE.MathUtils.clamp(this.center.y + Math.sin(ang) * dist, -this.mapRadius * 0.5, this.mapRadius * 0.5);
    this.nextCenter = new THREE.Vector2(cx, cy);
    this.nextRadius = Math.max(2, this.radius * def.shrinkTo);
    this.currentDef = def;
  }

  update(dt) {
    this.timeInPhase += dt;
    if (this.state === 'calm') {
      if (this.timeInPhase >= this.currentDef.calm) {
        this.state = 'shrinking';
        this.timeInPhase = 0;
        this.startCenter = this.center.clone();
        this.startRadius = this.radius;
      }
    } else if (this.state === 'shrinking') {
      const t = Math.min(1, this.timeInPhase / this.currentDef.shrink);
      this.center.lerpVectors(this.startCenter, this.nextCenter, t);
      this.radius = THREE.MathUtils.lerp(this.startRadius, this.nextRadius, t);
      this.damagePerSecond = this.currentDef.dps;
      if (t >= 1) {
        this.phase++;
        this.timeInPhase = 0;
        if (this.phase < this.phases.length) {
          this.state = 'calm';
          this._queueNextPhase();
        } else {
          this.state = 'final';
        }
      }
    }
    this.damagePerSecond = this.currentDef ? this.currentDef.dps : 1;
  }

  isOutside(x, z) {
    const dx = x - this.center.x;
    const dz = z - this.center.y;
    return Math.sqrt(dx * dx + dz * dz) > this.radius;
  }

  timeUntilShrink() {
    if (this.state !== 'calm') return 0;
    return Math.max(0, this.currentDef.calm - this.timeInPhase);
  }
}

// Visual ring showing current + next safe zone, plus a translucent storm wall.
export function buildStormVisual(mapRadius) {
  const group = new THREE.Group();
  group.name = 'StormVisual';

  const wallGeo = new THREE.CylinderGeometry(1, 1, 60, 64, 1, true);
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x7a3bff,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 25;
  group.add(wall);

  const ringGeo = new THREE.RingGeometry(0.97, 1, 128);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x53d8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const nextRing = new THREE.Mesh(ringGeo, ringMat);
  nextRing.rotation.x = -Math.PI / 2;
  nextRing.position.y = 0.2;
  group.add(nextRing);

  return { group, wall, nextRing };
}
