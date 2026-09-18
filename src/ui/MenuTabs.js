import * as THREE from 'three';
import { buildCharacterModel } from '../entities/CharacterModel.js';
import { SKINS, RARITY_COLORS, getSkinById } from '../skins/skins.js';
import { BattlePass } from '../progression/BattlePass.js';

const SKIN_STORAGE_KEY = 'br-selected-skin';
const STATS_KEY = 'br-stats-v1';

// Landmark layout mirrors POIManager.js exactly so the MAP tab preview
// matches what actually generates in-match.
const POI_PREVIEW = [
  { name: 'Tilted Towers', angle: Math.PI * 0.15, distFrac: 0.42 },
  { name: 'Salty Springs', angle: Math.PI * 1.05, distFrac: 0.48 },
  { name: 'Retail Row', angle: Math.PI * 1.75, distFrac: 0.4 },
];

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { matches: 0, kills: 0, wins: 0 };
}

export class MenuTabs {
  constructor(container, { onPlay, audioManager }) {
    this.container = container;
    this.onPlay = onPlay;
    this.audioManager = audioManager;
    this.battlePass = new BattlePass();
    this.selectedSkinId = localStorage.getItem(SKIN_STORAGE_KEY) || SKINS[0].id;
    this.botCount = 19;
    this.stats = loadStats();
    this._activeTab = 'lobby';
    this._menuVisible = true;
    this._audioUnlocked = false;

    this._build();
    this._initLockerPreview();
    this._renderBattlePass();
    this._renderMap();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'main-menu';
    root.innerHTML = `
      <div class="menu-navbar">
        <div class="menu-brand">BATTLE ISLAND</div>
        <div class="menu-tabs">
          <button class="menu-tab-btn" data-tab="lobby">LOBBY</button>
          <button class="menu-tab-btn" data-tab="battlepass">BATTLE PASS</button>
          <button class="menu-tab-btn" data-tab="locker">LOCKER</button>
          <button class="menu-tab-btn" data-tab="map">MAP</button>
          <button class="menu-tab-btn" data-tab="play">PLAY</button>
        </div>
      </div>

      <div class="menu-tab-content" data-panel="lobby">
        <h1>Battle Island</h1>
        <div class="subtitle">A browser battle royale — build, edit, loot, survive the storm.</div>
        <div class="lobby-stats">
          <div class="stat-card"><div class="stat-value" id="stat-matches">0</div><div class="stat-label">Matches Played</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-wins">0</div><div class="stat-label">Victory Royales</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-kills">0</div><div class="stat-label">Total Eliminations</div></div>
        </div>
        <div class="menu-hint">Use the tabs above to check your Battle Pass, change your Locker skin, preview the Map, then head to Play to drop in.</div>
      </div>

      <div class="menu-tab-content tab-hidden" data-panel="battlepass">
        <h2 class="panel-title">Battle Pass</h2>
        <div class="bp-xp-row">
          <div class="bp-xp-bar"><div class="bp-xp-fill" id="bp-xp-fill"></div></div>
          <div class="bp-xp-label" id="bp-xp-label">0 / 500 XP</div>
        </div>
        <div class="bp-track" id="bp-track"></div>
      </div>

      <div class="menu-tab-content tab-hidden" data-panel="locker">
        <h2 class="panel-title">Locker</h2>
        <div class="locker-layout">
          <div class="skin-grid" id="skin-grid"></div>
          <div class="locker-preview">
            <canvas id="locker-canvas"></canvas>
            <div class="locker-preview-name" id="locker-preview-name"></div>
          </div>
        </div>
      </div>

      <div class="menu-tab-content tab-hidden" data-panel="map">
        <h2 class="panel-title">Map</h2>
        <canvas id="map-canvas" width="420" height="420"></canvas>
      </div>

      <div class="menu-tab-content tab-hidden" data-panel="play">
        <h2 class="panel-title">Play</h2>
        <div class="play-panel">
          <div class="bot-count-row">
            <span>Opponents:</span>
            <input type="range" id="bot-count" min="5" max="29" step="2" value="${this.botCount}" />
            <span id="bot-count-label">${this.botCount}</span>
          </div>
          <button id="play-btn">Drop In</button>
          <div class="menu-hint">
            Lobby → Battle Bus → Skydive → Combat<br/>
            WASD move · Space jump/drop · Shift sprint · Mouse look/shoot<br/>
            1 Pickaxe · 2-5 Weapons · 6-8 Build (Wall/Floor/Ramp)<br/>
            T switch material · F edit structure · E open chest · R reload
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(root);
    this.root = root;

    for (const btn of root.querySelectorAll('.menu-tab-btn')) {
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
    }
    this._switchTab('lobby');

    root.addEventListener('click', () => this._unlockAudio(), { once: true });

    const grid = root.querySelector('#skin-grid');
    for (const skin of SKINS) {
      const card = document.createElement('div');
      card.className = 'skin-card' + (skin.id === this.selectedSkinId ? ' selected' : '');
      card.innerHTML = `
        <div class="skin-swatch" style="background:#${skin.body.toString(16).padStart(6, '0')}"></div>
        <div class="name">${skin.name}</div>
        <div class="rarity" style="color:${RARITY_COLORS[skin.rarity]}">${skin.rarity}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedSkinId = skin.id;
        localStorage.setItem(SKIN_STORAGE_KEY, skin.id);
        grid.querySelectorAll('.skin-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this._setLockerModel(skin.id);
      });
      grid.appendChild(card);
    }

    const botSlider = root.querySelector('#bot-count');
    const botLabel = root.querySelector('#bot-count-label');
    botSlider.addEventListener('input', () => {
      this.botCount = parseInt(botSlider.value, 10);
      botLabel.textContent = this.botCount;
    });

    root.querySelector('#play-btn').addEventListener('click', () => {
      this._unlockAudio();
      this.hide();
      this.onPlay({ skinId: this.selectedSkinId, botCount: this.botCount });
    });

    this._refreshStats();
  }

  _unlockAudio() {
    if (this._audioUnlocked || !this.audioManager) return;
    this._audioUnlocked = true;
    this.audioManager.unlock();
    this.audioManager.playMenuMusic();
  }

  _switchTab(tab) {
    this._activeTab = tab;
    for (const btn of this.root.querySelectorAll('.menu-tab-btn')) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    for (const panel of this.root.querySelectorAll('.menu-tab-content')) {
      panel.classList.toggle('tab-hidden', panel.dataset.panel !== tab);
    }
  }

  _refreshStats() {
    this.root.querySelector('#stat-matches').textContent = this.stats.matches;
    this.root.querySelector('#stat-wins').textContent = this.stats.wins;
    this.root.querySelector('#stat-kills').textContent = this.stats.kills;
  }

  // Called by main.js after a match ends, so the Lobby/Battle Pass tabs
  // reflect the just-finished match next time the menu is shown.
  recordMatchResult({ kills, won }) {
    this.stats.matches += 1;
    this.stats.kills += kills;
    if (won) this.stats.wins += 1;
    try { localStorage.setItem(STATS_KEY, JSON.stringify(this.stats)); } catch { /* ignore */ }
    this._refreshStats();
    this._renderBattlePass();
  }

  addBattlePassXp(amount) {
    this.battlePass.addXp(amount);
    this._renderBattlePass();
  }

  _renderBattlePass() {
    const track = this.root.querySelector('#bp-track');
    const tiers = this.battlePass.getTiers();
    track.innerHTML = '';
    for (const t of tiers) {
      const card = document.createElement('div');
      card.className = 'bp-tier' + (t.unlocked ? ' unlocked' : '');
      card.innerHTML = `
        <div class="bp-tier-num">${t.tier}</div>
        <div class="bp-tier-reward">${t.reward}</div>
      `;
      track.appendChild(card);
    }
    const fill = this.root.querySelector('#bp-xp-fill');
    const label = this.root.querySelector('#bp-xp-label');
    const pct = (this.battlePass.xpIntoTier / this.battlePass.xpForNextTier) * 100;
    fill.style.width = `${Math.min(100, pct)}%`;
    label.textContent = this.battlePass.tier >= 10
      ? `MAX TIER — ${this.battlePass.totalXp} XP total`
      : `${this.battlePass.xpIntoTier} / ${this.battlePass.xpForNextTier} XP — Tier ${this.battlePass.tier + 1}`;
  }

  _renderMap() {
    const canvas = this.root.querySelector('#map-canvas');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2, cy = size / 2;
    const radius = size * 0.42;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#345c2a';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const poi of POI_PREVIEW) {
      const x = cx + Math.cos(poi.angle) * radius * poi.distFrac;
      const y = cy + Math.sin(poi.angle) * radius * poi.distFrac;
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eef2f5';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(poi.name, x, y - 12);
    }
  }

  _initLockerPreview() {
    const canvas = this.root.querySelector('#locker-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 1.3, 4.2);
    camera.lookAt(0, 1.0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 4, 3);
    scene.add(dir);

    this._lockerScene = scene;
    this._lockerRenderer = renderer;
    this._lockerModel = null;
    this._setLockerModel(this.selectedSkinId);

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const s = Math.max(140, Math.min(rect.width, 320));
      renderer.setSize(s, s, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      requestAnimationFrame(animate);
      if (!this._menuVisible || this._activeTab !== 'locker' || !this._lockerModel) return;
      this._lockerModel.rotation.y += 0.012;
      renderer.render(scene, camera);
    };
    animate();
  }

  _setLockerModel(skinId) {
    if (this._lockerModel) {
      this._lockerScene.remove(this._lockerModel);
      this._lockerModel.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const skin = getSkinById(skinId);
    const model = buildCharacterModel(skin);
    model.position.y = -1.05;
    this._lockerScene.add(model);
    this._lockerModel = model;
    this.root.querySelector('#locker-preview-name').textContent = skin.name;
  }

  show() {
    this._menuVisible = true;
    this.root.style.display = 'flex';
    this._refreshStats();
    this._renderBattlePass();
  }

  hide() {
    this._menuVisible = false;
    this.root.style.display = 'none';
  }
}
