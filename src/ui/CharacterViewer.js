/**
 * The Traveler's Mirror — a close-up, hand-held view of the character.
 *
 * The world keeps rendering behind the overlay; only the camera changes, so
 * what you inspect is the real model wearing the real look, not a copy. Drag to
 * turn, wheel or pinch to zoom, and the buttons exist because the game is
 * played on a phone first.
 */
const SLOT_LABEL = {
  title: 'Title',
  cape: 'Cape',
  charm: 'Charm',
  dye: 'Dye',
  companion: 'Companion',
};

export class CharacterViewer {
  constructor(game) {
    this.game = game;
    this.root = null;
    this.stage = null;
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.pointers = new Map();
    this.pinchDistance = 0;
    this._bound = {
      keydown: (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.game.closeCharacterViewer();
        }
      },
    };
  }

  get isOpen() {
    return !!this.root;
  }

  open() {
    if (this.root) return;
    const wrap = document.createElement('div');
    wrap.className = 'viewer';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'The traveler, up close');

    const stage = document.createElement('div');
    stage.className = 'viewer-stage';
    stage.tabIndex = -1;
    wrap.appendChild(stage);

    const head = document.createElement('header');
    head.className = 'viewer-head';
    head.innerHTML = `
      <p class="viewer-kicker">The Traveler’s Mirror</p>
      <h2 class="viewer-title"></h2>
      <p class="viewer-hint">Drag to turn · scroll or pinch to zoom</p>
    `;
    head.querySelector('.viewer-title').textContent = this._title();
    wrap.appendChild(head);

    wrap.appendChild(this._looksPanel());

    const controls = document.createElement('div');
    controls.className = 'viewer-controls';
    controls.append(
      this._button('−', 'Zoom out', () => this._zoom(-0.35)),
      this._button('+', 'Zoom in', () => this._zoom(0.35)),
      this._button('⟳', 'Toggle slow spin', (button) => {
        const camera = this.game.cameraController;
        camera.setInspectSpin(!camera.inspectSpin);
        button.classList.toggle('is-active', camera.inspectSpin);
        button.setAttribute('aria-pressed', String(camera.inspectSpin));
        this.game.audio?.play('toggle');
      }, { pressed: this.game.cameraController.inspectSpin }),
      this._button('◎', 'Face the traveler', () => {
        const view = this.game.cameraController.inspect;
        if (!view) return;
        view.yaw = (this.game.player?.facing ?? 0) + 0.28;
        view.pitch = 0.08;
        view.targetDistance = 2.3;
        view.idle = -4;
        this.game.audio?.play('interact');
      }),
      this._button('Done', 'Close the mirror', () => this.game.closeCharacterViewer(), { variant: 'primary' }),
    );
    wrap.appendChild(controls);

    this._bindPointer(stage);
    document.body.appendChild(wrap);
    document.body.classList.add('is-mirror');
    this.root = wrap;
    this.stage = stage;
    window.addEventListener('keydown', this._bound.keydown, true);
    requestAnimationFrame(() => stage.focus?.({ preventScroll: true }));
  }

  close() {
    if (!this.root) return;
    window.removeEventListener('keydown', this._bound.keydown, true);
    document.body.classList.remove('is-mirror');
    this.root.remove();
    this.root = null;
    this.stage = null;
    this.pointers.clear();
    this.dragging = false;
  }

  /** Re-read the worn look, so the mirror matches the wardrobe. */
  refresh() {
    if (!this.root) return;
    const title = this.root.querySelector('.viewer-title');
    if (title) title.textContent = this._title();
    const panel = this.root.querySelector('.viewer-looks');
    if (panel) panel.replaceWith(this._looksPanel());
    const button = this.root.querySelector('.viewer-controls [data-action="spin"]');
    if (button) {
      const on = this.game.cameraController.inspectSpin;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }

  _title() {
    const looks = this.game.shop?.getLooks?.() || {};
    return looks.title || 'The Traveler';
  }

  _looksPanel() {
    const panel = document.createElement('dl');
    panel.className = 'viewer-looks';
    const shop = this.game.shop;
    const groups = shop?.ownedBySlot?.() || {};
    const looks = shop?.getLooks?.() || {};
    const nameOf = (slot, fallback) => {
      const equipped = shop?.equippedIn?.(slot);
      if (!equipped) return fallback;
      const found = (groups[slot] || []).find((entry) => entry.look === equipped);
      return found?.name || fallback;
    };
    const rows = {
      title: looks.title || 'Wanderer',
      cape: nameOf('cape', 'Traveler’s mantle'),
      charm: nameOf('charm', 'Wind pendant'),
      dye: nameOf('dye', 'Weathered linen'),
      companion: nameOf('companion', 'No companion'),
    };
    for (const slot of ['title', 'cape', 'charm', 'dye', 'companion']) {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = SLOT_LABEL[slot];
      const dd = document.createElement('dd');
      dd.textContent = rows[slot];
      row.append(dt, dd);
      panel.appendChild(row);
    }
    return panel;
  }

  _button(label, ariaLabel, handler, { variant = '', pressed = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `viewer-btn ${variant ? `viewer-btn--${variant}` : ''}`.trim();
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    if (ariaLabel === 'Toggle slow spin') {
      button.dataset.action = 'spin';
      button.setAttribute('aria-pressed', String(pressed));
      button.classList.toggle('is-active', pressed);
    }
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      handler(button);
    });
    return button;
  }

  _zoom(delta) {
    this.game.cameraController.zoom(delta);
    this.game.audio?.play('hover');
  }

  _bindPointer(stage) {
    const point = (event) => ({ x: event.clientX, y: event.clientY });

    stage.addEventListener('pointerdown', (event) => {
      stage.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, point(event));
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.lastPointer = point(event);
      } else if (this.pointers.size === 2) {
        this.dragging = false;
        const [a, b] = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });

    stage.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, point(event));

      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDistance > 0) {
          const delta = (this.pinchDistance - distance) * 0.006;
          if (Math.abs(delta) > 0.001) this.game.cameraController.zoom(delta);
        }
        this.pinchDistance = distance;
        return;
      }

      if (!this.dragging) return;
      const now = point(event);
      const dx = (now.x - this.lastPointer.x) * 0.0075;
      const dy = (now.y - this.lastPointer.y) * 0.005;
      this.lastPointer = now;
      this.game.cameraController.addInspectLook(dx, dy);
    });

    const end = (event) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinchDistance = 0;
      if (this.pointers.size === 0) this.dragging = false;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('pointerleave', end);

    stage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.game.cameraController.zoom(Math.sign(event.deltaY) * 0.55);
      },
      { passive: false },
    );
  }
}
