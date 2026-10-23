/**
 * Unified input for keyboard, mouse, pointer lock and the touch layer.
 *
 * The rest of the game never talks to raw DOM events: it asks for a movement
 * vector, a look delta or an edge-triggered action. This keeps desktop and
 * mobile on exactly the same controller.
 */

const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const ACTION_KEYS = {
  interact: ['KeyE', 'KeyF'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  menu: ['Escape'],
  inventory: ['KeyI'],
  journal: ['KeyJ'],
  shop: ['KeyB'],
  map: ['KeyM'],
  help: ['KeyH'],
};

const PREVENT_DEFAULT = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
]);

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.move = { x: 0, y: 0 };
    this.virtualMove = { x: 0, y: 0 };
    this.lookX = 0;
    this.lookY = 0;
    this.zoomDelta = 0;
    this.pointerLocked = false;
    this.dragLook = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.onPointerLockChange = null;
    this._dragging = false;
    this._lastPointer = { x: 0, y: 0 };
    this._bound = {};
    this._coarse = false;
    try {
      this._coarse = window.matchMedia('(pointer: coarse)').matches;
    } catch {
      this._coarse = false;
    }

    this._install();
  }

  _install() {
    this._bound.keydown = (event) => this._onKeyDown(event);
    this._bound.keyup = (event) => this._onKeyUp(event);
    this._bound.blur = () => this._clearKeys();
    this._bound.pointerdown = (event) => this._onPointerDown(event);
    this._bound.pointermove = (event) => this._onPointerMove(event);
    this._bound.pointerup = (event) => this._onPointerUp(event);
    this._bound.wheel = (event) => {
      if (!this.enabled) return;
      this.zoomDelta += Math.sign(event.deltaY) * 0.8;
      event.preventDefault();
    };
    this._bound.lockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.onPointerLockChange?.(this.pointerLocked);
    };
    this._bound.contextmenu = (event) => {
      if (this.enabled) event.preventDefault();
    };

    window.addEventListener('keydown', this._bound.keydown, { passive: false });
    window.addEventListener('keyup', this._bound.keyup);
    window.addEventListener('blur', this._bound.blur);
    this.canvas.addEventListener('pointerdown', this._bound.pointerdown);
    window.addEventListener('pointermove', this._bound.pointermove, { passive: true });
    window.addEventListener('pointerup', this._bound.pointerup);
    window.addEventListener('pointercancel', this._bound.pointerup);
    this.canvas.addEventListener('wheel', this._bound.wheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this._bound.contextmenu);
    document.addEventListener('pointerlockchange', this._bound.lockChange);
  }

  _isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  _onKeyDown(event) {
    if (this._isTypingTarget(event.target)) return;
    if (PREVENT_DEFAULT.has(event.code) && this.enabled) event.preventDefault();
    if (event.repeat) return;
    this.keys.add(event.code);

    for (const [action, codes] of Object.entries(ACTION_KEYS)) {
      if (codes.includes(event.code)) this.trigger(action);
    }
    if (event.code === 'KeyE' || event.code === 'Enter') {
      // Enter is a convenience interact only while focused on the canvas.
      if (document.activeElement === this.canvas) this.trigger('interact');
    }
  }

  _onKeyUp(event) {
    this.keys.delete(event.code);
    for (const [action, codes] of Object.entries(ACTION_KEYS)) {
      if (codes.includes(event.code)) this.released.add(action);
    }
  }

  _onPointerDown(event) {
    if (event.pointerType === 'touch') return; // handled by MobileControls
    this._dragging = true;
    this._lastPointer.x = event.clientX;
    this._lastPointer.y = event.clientY;
    this.canvas.focus?.({ preventScroll: true });
    if (this.enabled && !this.pointerLocked && event.button === 0) {
      this.requestPointerLock();
    }
    if (event.button === 2) this.trigger('alternate');
  }

  _onPointerMove(event) {
    if (event.pointerType === 'touch') return;
    if (!this.enabled) return;
    if (this.pointerLocked) {
      this.lookX += event.movementX || 0;
      this.lookY += event.movementY || 0;
    } else if (this._dragging) {
      const dx = event.clientX - this._lastPointer.x;
      const dy = event.clientY - this._lastPointer.y;
      this._lastPointer.x = event.clientX;
      this._lastPointer.y = event.clientY;
      this.lookX += dx;
      this.lookY += dy;
    }
  }

  _onPointerUp(event) {
    if (event.pointerType === 'touch') return;
    this._dragging = false;
  }

  _clearKeys() {
    this.keys.clear();
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
  }

  requestPointerLock() {
    if (this._coarse || !this.canvas.requestPointerLock) return false;
    try {
      const promise = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (promise?.catch) {
        promise.catch(() => {
          // Older browsers reject the options object; fall back to plain call.
          try {
            this.canvas.requestPointerLock();
          } catch {
            /* ignore */
          }
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
  }

  trigger(action) {
    this.pressed.add(action);
  }

  consumePress(action) {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  isDown(action) {
    if (this.released.has(action)) return false;
    const codes = ACTION_KEYS[action];
    return codes ? codes.some((code) => this.keys.has(code)) : false;
  }

  /** Movement vector in local space: x = strafe, y = forward. */
  getMoveVector() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (MOVE_KEYS.forward.some((c) => this.keys.has(c))) y += 1;
    if (MOVE_KEYS.back.some((c) => this.keys.has(c))) y -= 1;
    if (MOVE_KEYS.right.some((c) => this.keys.has(c))) x += 1;
    if (MOVE_KEYS.left.some((c) => this.keys.has(c))) x -= 1;

    x += this.virtualMove.x;
    y += this.virtualMove.y;

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    this.move.x = x;
    this.move.y = y;
    return this.move;
  }

  /** Consume accumulated look movement, scaled by user sensitivity. */
  consumeLookDelta() {
    const scale = 0.0022 * (this.sensitivity || 1);
    const dx = this.lookX * scale;
    const dy = this.lookY * scale * (this.invertY ? -1 : 1);
    this.lookX = 0;
    this.lookY = 0;
    return { x: dx, y: dy };
  }

  addLookDelta(dx, dy) {
    if (!this.enabled) return;
    this.lookX += dx;
    this.lookY += dy;
  }

  consumeZoom() {
    const value = this.zoomDelta;
    this.zoomDelta = 0;
    return value;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  setSensitivity(value) {
    this.sensitivity = value;
  }

  dispose() {
    window.removeEventListener('keydown', this._bound.keydown);
    window.removeEventListener('keyup', this._bound.keyup);
    window.removeEventListener('blur', this._bound.blur);
    this.canvas.removeEventListener('pointerdown', this._bound.pointerdown);
    window.removeEventListener('pointermove', this._bound.pointermove);
    window.removeEventListener('pointerup', this._bound.pointerup);
    window.removeEventListener('pointercancel', this._bound.pointerup);
    this.canvas.removeEventListener('wheel', this._bound.wheel);
    this.canvas.removeEventListener('contextmenu', this._bound.contextmenu);
    document.removeEventListener('pointerlockchange', this._bound.lockChange);
  }
}
