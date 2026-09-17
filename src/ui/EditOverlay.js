// On-screen 3x3 segment editor for the structure piece currently targeted
// while the player holds edit mode (F). Mirrors Fortnite-style piece
// editing: click segments to toggle them open/closed, or use presets.
export class EditOverlay {
  constructor(container) {
    const root = document.createElement('div');
    root.id = 'edit-overlay';
    root.innerHTML = `
      <div class="edit-grid" id="edit-grid"></div>
      <div class="edit-presets">
        <button data-preset="full">Full</button>
        <button data-preset="window">Window</button>
        <button data-preset="door">Door</button>
        <button data-preset="clear">Clear</button>
      </div>
    `;
    container.appendChild(root);
    this.root = root;
    this.grid = root.querySelector('#edit-grid');
    this.cells = [];
    // Build top-to-bottom visually (row2=top .. row0=bottom) but keep
    // segment indices row-major bottom-to-top to match StructurePiece.
    for (let visualRow = 0; visualRow < 3; visualRow++) {
      for (let col = 0; col < 3; col++) {
        const row = 2 - visualRow;
        const idx = row * 3 + col;
        const cell = document.createElement('div');
        cell.className = 'edit-cell';
        cell.dataset.idx = String(idx);
        cell.addEventListener('click', () => {
          if (this.piece) {
            this.piece.toggleSegment(idx);
            this._refresh();
          }
        });
        this.grid.appendChild(cell);
        this.cells.push(cell);
      }
    }
    root.querySelectorAll('.edit-presets button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.piece) {
          this.piece.applyPreset(btn.dataset.preset);
          this._refresh();
        }
      });
    });

    this.piece = null;
  }

  setTarget(piece) {
    if (this.piece === piece) {
      if (piece) this._refresh();
      return;
    }
    this.piece = piece;
    this._refresh();
  }

  _refresh() {
    const active = !!this.piece;
    this.root.classList.toggle('active', active);
    if (!active) return;
    for (const cell of this.cells) {
      const idx = parseInt(cell.dataset.idx, 10);
      cell.classList.toggle('open', !this.piece.isSegmentSolid(idx));
    }
  }

  hide() {
    this.piece = null;
    this.root.classList.remove('active');
  }
}
