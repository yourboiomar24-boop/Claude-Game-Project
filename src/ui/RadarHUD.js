import * as THREE from 'three';

const RADAR_SIZE = 168;
const RADAR_RANGE_SCALE = 0.46; // fraction of radar radius the full map radius maps to
const BOT_DETECT_RANGE = 70; // bots beyond this are not shown (radar isn't a full wallhack)

// Circular overhead radar: island outline, the shrinking purple storm ring,
// nearby bot blips, and the player's position + facing arrow.
export class MinimapRadar {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.id = 'radar-minimap';
    this.root.innerHTML = `<canvas id="radar-canvas" width="${RADAR_SIZE}" height="${RADAR_SIZE}"></canvas>`;
    container.appendChild(this.root);
    this.canvas = this.root.querySelector('#radar-canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  update({ playerPos, playerYaw, mapRadius, storm, bots }) {
    const ctx = this.ctx;
    const size = RADAR_SIZE;
    const cx = size / 2, cy = size / 2;
    const scale = (size * RADAR_RANGE_SCALE) / mapRadius;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0c1220';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, mapRadius * scale, 0, Math.PI * 2);
    ctx.stroke();

    if (storm) {
      ctx.save();
      ctx.shadowColor = '#b452ff';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#b452ff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx + storm.center.x * scale, cy + storm.center.y * scale, storm.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (storm.state === 'calm' && storm.nextRadius !== undefined) {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx + storm.nextCenter.x * scale, cy + storm.nextCenter.y * scale, storm.nextRadius * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (bots) {
      ctx.fillStyle = '#ff4d4d';
      for (const bot of bots) {
        const dx = bot.position.x - playerPos.x;
        const dz = bot.position.z - playerPos.z;
        if (dx * dx + dz * dz > BOT_DETECT_RANGE * BOT_DETECT_RANGE) continue;
        ctx.beginPath();
        ctx.arc(cx + bot.position.x * scale, cy + bot.position.z * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player facing arrow
    ctx.save();
    ctx.translate(cx + playerPos.x * scale, cy + playerPos.z * scale);
    ctx.rotate(playerYaw);
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

const _fwd = new THREE.Vector3();
const COMPASS_DIRS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const PX_PER_DEG = 4;

// A sliding horizontal compass strip, like a typical FPS HUD compass.
export class CompassBar {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.id = 'compass-bar';
    this.root.innerHTML = `
      <div class="compass-window">
        <div class="compass-strip" id="compass-strip"></div>
        <div class="compass-marker"></div>
      </div>
      <div class="compass-degree" id="compass-degree">000°</div>
    `;
    container.appendChild(this.root);
    this.strip = this.root.querySelector('#compass-strip');
    this.degreeEl = this.root.querySelector('#compass-degree');
    this._buildStrip();
  }

  _buildStrip() {
    let html = '';
    for (let deg = -360; deg <= 720; deg += 15) {
      const norm = ((deg % 360) + 360) % 360;
      const label = COMPASS_DIRS[norm];
      const left = (deg + 360) * PX_PER_DEG;
      html += `<div class="compass-tick" style="left:${left}px">${label ? `<span>${label}</span>` : ''}</div>`;
    }
    this.strip.innerHTML = html;
  }

  updateFromCamera(camera) {
    camera.getWorldDirection(_fwd);
    const bearing = (THREE.MathUtils.radToDeg(Math.atan2(_fwd.x, _fwd.z)) + 360) % 360;
    this.update(bearing);
  }

  update(bearingDeg) {
    const norm = ((bearingDeg % 360) + 360) % 360;
    const offsetPx = (norm + 360) * PX_PER_DEG;
    this.strip.style.transform = `translateX(calc(50% - ${offsetPx}px))`;
    this.degreeEl.textContent = `${Math.round(norm).toString().padStart(3, '0')}°`;
  }
}
