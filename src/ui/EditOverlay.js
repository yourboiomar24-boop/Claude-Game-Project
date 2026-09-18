// On-screen 3x3 segment editor. Opened by Player when 'F' targets a wall
// or floor: the player is frozen and the mouse cursor is released so this
// overlay can be clicked directly. Clicking a solid tile marks it grey
// (pending removal); clicking it again un-marks it. Pressing 'F' a second
// time (handled by Player) commits the marked tiles, which actually cuts
// them out of the 3D mesh (a door/window), and closes the overlay.
export class EditOverlay {
  constructor(container) {
    const root = document.createElement('div');
    root.id = 'edit-overlay';
    root.innerHTML = `
      <div class="edit-title">EDITING — click tiles to mark, press F to cut</div>
      <div class="edit-grid" id="edit-grid"></div>
    `;
    container.appendChild(root);
    this.root = root;
    this.grid = root.querySelector('#edit-grid');
    this.cells = [];
    this.piece = null;
    this.marked = new Set();

    // Build top-to-bottom visually (row2=top .. row0=bottom) but keep
    // segment indices row-major bottom-to-top to match StructurePiece.
    for (let visualRow = 0; visualRow < 3; visualRow++) {
      for (let col = 0; col < 3; col++) {
        const row = 2 - visualRow;
        const idx = row * 3 + col;
        const cell = document.createElement('div');
        cell.className = 'edit-cell';
        cell.dataset.idx = String(idx);
        cell.addEventListener('click', () => this._onCellClick(idx));
        this.grid.appendChild(cell);
        this.cells.push(cell);
      }
    }
  }

  _onCellClick(idx) {
    if (!this.piece || !this.piece.isSegmentSolid(idx)) return; // already open — nothing to mark
    if (this.marked.has(idx)) this.marked.delete(idx);
    else this.marked.add(idx);
    this._refresh();
  }

  open(piece) {
    this.piece = piece;
    this.marked.clear();
    this.root.classList.add('active');
    this._refresh();
  }

  // Cuts the marked tiles out of the piece's mesh and hides the overlay.
  commit(piece) {
    if (piece && this.marked.size) piece.clearSegments([...this.marked]);
    this.marked.clear();
    this.piece = null;
    this.root.classList.remove('active');
  }

  _refresh() {
    if (!this.piece) return;
    for (const cell of this.cells) {
      const idx = parseInt(cell.dataset.idx, 10);
      const open = !this.piece.isSegmentSolid(idx);
      cell.classList.toggle('open', open);
      cell.classList.toggle('marked', !open ? false : this.marked.has(idx));
    }
  }
}
