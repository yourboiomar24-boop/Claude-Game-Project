import { SKINS, RARITY_COLORS } from '../skins/skins.js';

const STORAGE_KEY = 'br-selected-skin';

export class MainMenu {
  constructor(container, onPlay) {
    this.container = container;
    this.onPlay = onPlay;
    this.selectedSkinId = localStorage.getItem(STORAGE_KEY) || SKINS[0].id;
    this.botCount = 19;
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'main-menu';
    root.innerHTML = `
      <h1>Battle Island</h1>
      <div class="subtitle">A browser battle royale — build, edit, loot, survive the storm.</div>
      <div class="menu-panel">
        <div class="skin-picker">
          <h2>Choose Your Skin</h2>
          <div class="skin-grid" id="skin-grid"></div>
        </div>
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
      <div id="loading-tip">Click "Drop In" then click the game to lock your mouse.</div>
    `;
    this.container.appendChild(root);
    this.root = root;

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
        localStorage.setItem(STORAGE_KEY, skin.id);
        grid.querySelectorAll('.skin-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
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
      this.hide();
      this.onPlay({ skinId: this.selectedSkinId, botCount: this.botCount });
    });
  }

  show() { this.root.style.display = 'flex'; }
  hide() { this.root.style.display = 'none'; }
}
