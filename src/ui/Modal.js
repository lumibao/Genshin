/**
 * Accessible modal surface shared by inventory, journal, settings, pause and
 * confirmation dialogs. Traps focus, closes on Escape and blocks gameplay
 * input through the Game's blocker stack.
 */
export class Modal {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.element = null;
    this.isOpen = false;
    this._onClose = null;
    this._previousFocus = null;
    this._keyHandler = null;
    this._actions = [];
  }

  open({
    title = '',
    subtitle = '',
    body = '',
    bodyNode = null,
    actions = [],
    className = '',
    closable = true,
    onClose = null,
    wide = false,
    closeLabel = 'Close',
  } = {}) {
    this.close({ silent: true });

    this._onClose = onClose;
    this._previousFocus = document.activeElement;
    this._actions = actions;

    const layer = document.createElement('div');
    layer.className = 'modal-layer';
    layer.innerHTML = `
      <div class="modal ${wide ? 'modal--wide' : ''} ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <div>
            <h2 class="modal-title" id="modal-title"></h2>
            <p class="modal-sub"></p>
          </div>
          <button class="modal-close" type="button" aria-label="${closeLabel}">✕</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>
    `;
    const titleEl = layer.querySelector('.modal-title');
    titleEl.textContent = title;
    const subEl = layer.querySelector('.modal-sub');
    subEl.textContent = subtitle;
    if (!subtitle) subEl.remove();

    const bodyEl = layer.querySelector('.modal-body');
    if (bodyNode) bodyEl.appendChild(bodyNode);
    else if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);

    const foot = layer.querySelector('.modal-foot');
    this._actionButtons = [];
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn ${action.variant === 'primary' ? 'btn-primary' : action.variant === 'danger' ? 'btn-danger' : 'btn-ghost'} ${action.className || ''}`;
      button.textContent = action.label;
      button.addEventListener('click', async () => {
        if (action.onClick) {
          const result = action.onClick();
          if (result && typeof result.then === 'function') await result;
        }
        if (action.close !== false) this.close();
      });
      foot.appendChild(button);
      this._actionButtons.push(button);
    }
    if (!actions.length) foot.remove();

    const closeBtn = layer.querySelector('.modal-close');
    if (closable) closeBtn.addEventListener('click', () => this.close());
    else closeBtn.remove();

    layer.addEventListener('mousedown', (event) => {
      if (event.target === layer && closable) this.close();
    });

    this._keyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (closable) this.close();
        return;
      }
      if (event.key === 'Tab') this._trapFocus(event);
    };
    document.addEventListener('keydown', this._keyHandler, true);

    this.root.appendChild(layer);
    this.element = layer;
    this.isOpen = true;
    this.game.addBlocker('modal');
    // Release the mouse so the dialog can actually be clicked.
    this.game.input?.exitPointerLock?.();
    this.game.audio?.play('open');

    requestAnimationFrame(() => {
      const focusTarget = this._actionButtons[0] || layer.querySelector('.modal-close') || layer.querySelector('button, [tabindex]');
      focusTarget?.focus({ preventScroll: true });
    });

    return layer;
  }

  _trapFocus(event) {
    if (!this.element) return;
    const focusable = this.element.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  close({ silent = false } = {}) {
    if (!this.element) return;
    const onClose = this._onClose;
    this._onClose = null;
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler, true);
      this._keyHandler = null;
    }
    const element = this.element;
    this.element = null;
    this.isOpen = false;
    this.game.removeBlocker('modal');
    element.classList.add('is-closing');
    setTimeout(() => element.remove(), 220);
    this._previousFocus?.focus?.({ preventScroll: true });
    if (!silent) {
      this.game.audio?.play('close');
      onClose?.();
    }
  }

  /** Rebuild the body of an open modal (used by settings live-preview). */
  setBody(node) {
    const body = this.element?.querySelector('.modal-body');
    if (!body) return;
    body.replaceChildren(node);
  }
}
