// Central keyboard/mouse/pointer-lock input state.
export class InputManager {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    this.mouseButtons = new Set();
    this.mouseJustPressed = new Set();
    this.wheelDelta = 0;
    this.pointerLocked = false;
    this.enabled = false;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (!this.keys.has(k)) this.justPressed.add(k);
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.mouseDelta.x += e.movementX || 0;
      this.mouseDelta.y += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (!this.mouseButtons.has(e.button)) this.mouseJustPressed.add(e.button);
      this.mouseButtons.add(e.button);
      if (!this.pointerLocked) {
        this.dom.requestPointerLock();
      }
    };
    this._onMouseUp = (e) => {
      this.mouseButtons.delete(e.button);
    };
    this._onWheel = (e) => {
      if (!this.enabled) return;
      this.wheelDelta += Math.sign(e.deltaY);
    };
    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
    };
    this._onContextMenu = (e) => {
      if (this.enabled) e.preventDefault();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.dom.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this.dom.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.dom.addEventListener('contextmenu', this._onContextMenu);
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.justPressed.has(code); }
  wasMousePressed(button) { return this.mouseJustPressed.has(button); }

  // Call once per frame after consuming this frame's deltas
  endFrame() {
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this.wheelDelta = 0;
    this.justPressed.clear();
    this.mouseJustPressed.clear();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.mouseButtons.clear();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.dom.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.dom.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.dom.removeEventListener('contextmenu', this._onContextMenu);
  }
}
