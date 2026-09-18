import { MATERIAL_TIERS } from '../building/BuildConfig.js';

const WEAPON_LABELS = {
  pickaxe: 'PICK',
  pistol: 'PSTL',
  smg: 'SMG',
  shotgun: 'SHTG',
  ar: 'AR',
  sniper: 'SNPR',
};

const BUILD_LABELS = { wall: 'WALL', floor: 'FLOOR', ramp: 'RAMP', roof: 'ROOF' };

export class HUD {
  constructor(container) {
    this.container = container;
    this._build();
    this._killFeedTimers = [];
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'hud';
    root.className = 'ui-layer';
    root.innerHTML = `
      <div class="crosshair"></div>
      <div class="damage-vignette" id="dmg-vignette"></div>
      <div class="hit-marker" id="hit-marker"></div>

      <div class="bar-group">
        <div class="bar-label">HEALTH</div>
        <div class="bar"><div class="bar-fill health" id="bar-health" style="width:100%"></div></div>
        <div class="bar-label">SHIELD</div>
        <div class="bar"><div class="bar-fill shield" id="bar-shield" style="width:0%"></div></div>
      </div>

      <div class="materials-row" id="materials-row"></div>
      <div class="weapon-hotbar" id="weapon-hotbar"></div>
      <div class="build-hotbar" id="build-hotbar"></div>

      <div class="right-panel">
        <div class="players-left" id="players-left">Players: 20</div>
        <div class="storm-timer" id="storm-timer">Storm closing in 20s</div>
      </div>

      <div id="minimap"><canvas id="minimap-canvas" width="168" height="168"></canvas></div>
      <div class="kill-feed" id="kill-feed"></div>
      <div class="pickup-toast" id="pickup-toast"></div>
      <div class="interact-hint" id="interact-hint"></div>
    `;
    this.container.appendChild(root);
    this.root = root;

    this.els = {
      health: root.querySelector('#bar-health'),
      shield: root.querySelector('#bar-shield'),
      materials: root.querySelector('#materials-row'),
      weaponBar: root.querySelector('#weapon-hotbar'),
      buildBar: root.querySelector('#build-hotbar'),
      playersLeft: root.querySelector('#players-left'),
      stormTimer: root.querySelector('#storm-timer'),
      minimapCanvas: root.querySelector('#minimap-canvas'),
      killFeed: root.querySelector('#kill-feed'),
      hitMarker: root.querySelector('#hit-marker'),
      dmgVignette: root.querySelector('#dmg-vignette'),
      pickupToast: root.querySelector('#pickup-toast'),
      interactHint: root.querySelector('#interact-hint'),
    };
    this.mmCtx = this.els.minimapCanvas.getContext('2d');

    for (const [type, def] of Object.entries(MATERIAL_TIERS)) {
      const chip = document.createElement('div');
      chip.className = 'mat-chip';
      chip.dataset.tier = type;
      chip.innerHTML = `<div class="mat-swatch" style="background:#${def.color.toString(16).padStart(6, '0')}"></div><span class="mat-value">0</span>`;
      this.els.materials.appendChild(chip);
    }
  }

  setHealthShield(health, maxHealth, shield, maxShield) {
    this.els.health.style.width = `${Math.max(0, (health / maxHealth) * 100)}%`;
    this.els.shield.style.width = `${Math.max(0, (shield / maxShield) * 100)}%`;
  }

  setMaterials(inv, activeTier) {
    for (const chip of this.els.materials.querySelectorAll('.mat-chip')) {
      const tier = chip.dataset.tier;
      const resType = { wood: 'wood', brick: 'stone', metal: 'metal' }[tier];
      chip.querySelector('.mat-value').textContent = inv[resType] ?? 0;
      chip.classList.toggle('active', tier === activeTier);
    }
  }

  setWeaponSlots(slots, activeIndex) {
    this.els.weaponBar.innerHTML = '';
    slots.forEach((slot, i) => {
      const el = document.createElement('div');
      el.className = 'hotbar-slot' + (i === activeIndex ? ' active' : '');
      const label = slot ? WEAPON_LABELS[slot.id] : '';
      const ammo = slot && !slot.isPickaxe ? (slot.mag ?? 0) : '';
      el.innerHTML = `<span class="key">${i + 1}</span><span class="icon">${label}</span>${slot && !slot.isPickaxe ? `<span class="ammo">${ammo}</span>` : ''}`;
      this.els.weaponBar.appendChild(el);
    });
  }

  setBuildSlots(types, activeType, key0 = 6) {
    this.els.buildBar.innerHTML = '';
    types.forEach((type, i) => {
      const el = document.createElement('div');
      el.className = 'hotbar-slot' + (type === activeType ? ' active' : '');
      el.innerHTML = `<span class="key">${key0 + i}</span><span class="icon">${BUILD_LABELS[type]}</span>`;
      this.els.buildBar.appendChild(el);
    });
  }

  setPlayersLeft(n) { this.els.playersLeft.textContent = `Players: ${n}`; }
  setStormTimer(text) { this.els.stormTimer.textContent = text; }

  showHitMarker() {
    this.els.hitMarker.classList.add('show');
    clearTimeout(this._hitMarkerTimer);
    this._hitMarkerTimer = setTimeout(() => this.els.hitMarker.classList.remove('show'), 140);
  }

  flashDamage(intensity = 1) {
    this.els.dmgVignette.style.boxShadow = `inset 0 0 ${140 * intensity}px rgba(255,0,0,${0.5 * intensity})`;
    clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => { this.els.dmgVignette.style.boxShadow = 'inset 0 0 0 rgba(255,0,0,0)'; }, 220);
  }

  showToast(text) {
    this.els.pickupToast.textContent = text;
    this.els.pickupToast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.els.pickupToast.classList.remove('show'), 1600);
  }

  setInteractHint(text) {
    if (!text) {
      this.els.interactHint.classList.remove('show');
      return;
    }
    this.els.interactHint.textContent = text;
    this.els.interactHint.classList.add('show');
  }

  addKillFeed(text) {
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.textContent = text;
    this.els.killFeed.prepend(entry);
    const timer = setTimeout(() => {
      entry.style.opacity = '0';
      setTimeout(() => entry.remove(), 400);
    }, 5000);
    this._killFeedTimers.push(timer);
    while (this.els.killFeed.children.length > 6) {
      this.els.killFeed.lastChild.remove();
    }
  }

  drawMinimap({ playerPos, mapRadius, storm, safeRadius }) {
    const ctx = this.mmCtx;
    const size = 168;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0f1522';
    ctx.fillRect(0, 0, size, size);

    const scale = (size * 0.46) / mapRadius;
    const cx = size / 2, cy = size / 2;

    // Island outline
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, mapRadius * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Storm safe zone
    if (storm) {
      ctx.strokeStyle = '#53d8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + storm.center.x * scale, cy + storm.center.y * scale, storm.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      if (storm.nextRadius !== undefined && storm.state === 'calm') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx + storm.nextCenter.x * scale, cy + storm.nextCenter.y * scale, storm.nextRadius * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Player marker
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.arc(cx + playerPos.x * scale, cy + playerPos.z * scale, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
