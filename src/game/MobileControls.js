/**
 * Virtual joystick, swipe-to-look area and touch action buttons.
 * Writes into the same InputManager that the desktop controls use.
 */
export class MobileControls {
  constructor(input, root) {
    this.input = input;
    this.root = root;
    this.joystick = root.querySelector('#joystick');
    this.knob = root.querySelector('.joystick-knob');
    this.lookArea = root.querySelector('#touch-look');
    this.interactBtn = root.querySelector('#btn-interact');
    this.jumpBtn = root.querySelector('#btn-jump');
    this.active = false;
    this.joystickPointerId = null;
    this.lookPointerId = null;
    this.lookLast = { x: 0, y: 0 };
    this.maxRadius = 52;
    this._idleTimer = null;

    this._bind();
  }

  get isTouchDevice() {
    try {
      return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    } catch {
      return false;
    }
  }

  enable(show) {
    this.active = show;
    this.root.classList.toggle('hidden', !show);
    document.body.classList.toggle('is-touch', show);
    if (show) this._markIdle();
  }

  _bind() {
    if (!this.root) return;

    if (this.joystick) {
      this.joystick.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        event.preventDefault();
        this.joystickPointerId = event.pointerId;
        this.joystick.classList.add('is-active');
        this._moveKnob(event);
        this.joystick.setPointerCapture?.(event.pointerId);
      });
      this.joystick.addEventListener('pointermove', (event) => {
        if (event.pointerId !== this.joystickPointerId) return;
        event.preventDefault();
        this._moveKnob(event);
      });
      const release = (event) => {
        if (event.pointerId !== this.joystickPointerId) return;
        this.joystickPointerId = null;
        this.joystick.classList.remove('is-active');
        this.knob.style.transform = 'translate3d(0,0,0)';
        this.input.virtualMove.x = 0;
        this.input.virtualMove.y = 0;
      };
      this.joystick.addEventListener('pointerup', release);
      this.joystick.addEventListener('pointercancel', release);
      this.joystick.addEventListener('lostpointercapture', release);
    }

    if (this.lookArea) {
      this.lookArea.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        this.lookPointerId = event.pointerId;
        this.lookLast.x = event.clientX;
        this.lookLast.y = event.clientY;
        this.lookArea.classList.remove('is-idle');
        this.lookArea.setPointerCapture?.(event.pointerId);
      });
      this.lookArea.addEventListener('pointermove', (event) => {
        if (event.pointerId !== this.lookPointerId) return;
        const dx = event.clientX - this.lookLast.x;
        const dy = event.clientY - this.lookLast.y;
        this.lookLast.x = event.clientX;
        this.lookLast.y = event.clientY;
        this.input.addLookDelta(dx * 1.35, dy * 1.35);
        this._markIdle();
      });
      const endLook = (event) => {
        if (event.pointerId !== this.lookPointerId) return;
        this.lookPointerId = null;
        this._markIdle();
      };
      this.lookArea.addEventListener('pointerup', endLook);
      this.lookArea.addEventListener('pointercancel', endLook);
      this.lookArea.addEventListener('lostpointercapture', endLook);
    }

    const bindButton = (element, action) => {
      if (!element) return;
      let lastPress = -Infinity;
      // Some mobile browsers deliver touchstart without a usable pointerdown
      // (older WebViews, or when a parent swallows the pointer). Listen to all
      // three and de-duplicate so one tap is exactly one action.
      const press = (event) => {
        const now = performance.now();
        if (now - lastPress < 60) return;
        lastPress = now;
        event.preventDefault?.();
        event.stopPropagation?.();
        element.classList.add('is-pressed');
        this.input.trigger(action);
        try {
          navigator.vibrate?.(8);
        } catch {
          /* ignore */
        }
      };
      const release = () => element.classList.remove('is-pressed');
      element.addEventListener('pointerdown', press, { passive: false });
      element.addEventListener('touchstart', press, { passive: false });
      element.addEventListener('click', press);
      element.addEventListener('pointerup', release);
      element.addEventListener('touchend', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('pointerleave', release);
      element.addEventListener('contextmenu', (event) => event.preventDefault());
    };
    bindButton(this.interactBtn, 'interact');
    bindButton(this.jumpBtn, 'jump');

    window.addEventListener('resize', () => this._updateRadius());
    window.addEventListener('orientationchange', () => setTimeout(() => this._updateRadius(), 240));
    this._updateRadius();
  }

  _updateRadius() {
    const rect = this.joystick?.getBoundingClientRect();
    if (rect && rect.width) this.maxRadius = rect.width * 0.34;
  }

  _moveKnob(event) {
    const rect = this.joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const distance = Math.hypot(dx, dy);
    const limit = this.maxRadius;
    if (distance > limit) {
      dx = (dx / distance) * limit;
      dy = (dy / distance) * limit;
    }
    this.knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    // Screen down = -forward, screen right = +strafe
    this.input.virtualMove.x = dx / limit;
    this.input.virtualMove.y = -dy / limit;
  }

  setInteractReady(ready) {
    this.interactBtn?.classList.toggle('is-ready', !!ready);
  }

  _markIdle() {
    if (!this.lookArea) return;
    this.lookArea.classList.add('is-idle');
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this.lookArea.classList.remove('is-idle');
    }, 3200);
  }
}
