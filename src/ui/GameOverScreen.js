export class GameOverScreen {
  constructor(container, onRestart) {
    const root = document.createElement('div');
    root.id = 'gameover-screen';
    root.innerHTML = `
      <h1 id="gameover-title">VICTORY ROYALE</h1>
      <div class="placement" id="gameover-placement">#1 out of 20</div>
      <button id="restart-btn">Return to Menu</button>
    `;
    container.appendChild(root);
    this.root = root;
    root.querySelector('#restart-btn').addEventListener('click', () => {
      this.hide();
      onRestart();
    });
  }

  show(win, placement, total) {
    this.root.classList.add('active');
    this.root.classList.toggle('victory', win);
    this.root.classList.toggle('defeat', !win);
    this.root.querySelector('#gameover-title').textContent = win ? 'VICTORY ROYALE' : 'ELIMINATED';
    this.root.querySelector('#gameover-placement').textContent = `#${placement} out of ${total}`;
    document.exitPointerLock?.();
  }

  hide() {
    this.root.classList.remove('active');
  }
}
