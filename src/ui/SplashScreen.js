/**
 * The splash — what the link looks like once it opens.
 *
 * It is plain markup in index.html, painted before the engine exists, so a
 * visitor who opens a shared link sees artwork and the title instead of a black
 * screen while the bundle downloads. It has three states:
 *
 *   waiting   the world is still being built; the door says so and does nothing
 *   ready     the door opens the meadow (or resumes a saved journey)
 *   leaving   fading out, with the title screen already behind it
 *
 * It never makes a promise the game cannot keep: if boot fails, Game.js takes
 * the splash down before showing the error.
 */
export class SplashScreen {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('screen-splash');
    this.gate = document.getElementById('btn-enter');
    this.label = this.gate?.querySelector('.btn-label');
    this.hint = this.root?.querySelector('.splash-hint');
    this.isOpen = !!this.root && !this.root.classList.contains('hidden');
    this.closing = false;
    this.ready = false;
    this._action = null;
    this._bound = {
      tap: (event) => {
        if (event.target.closest?.('.splash-skip, a, button:not(#btn-enter)')) return;
        this.dismiss({ byUser: true });
      },
      key: (event) => {
        if (!this.isOpen) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
          event.preventDefault();
          this.dismiss({ byUser: true });
        }
      },
      ready: null,
    };
    if (!this.root) return;
    this.root.addEventListener('click', this._bound.tap);
    window.addEventListener('keydown', this._bound.key);
    if (this.isOpen) document.body.classList.add('is-splash');
    this._setWaiting();
  }

  /**
   * Fill in the line under the title and what the door does. Called once the
   * engine is ready, so the copy can reflect a saved journey.
   */
  configure({ reason = null, action = null, gateLabel = 'Enter the meadow' } = {}) {
    this._action = action;
    if (reason) {
      const slot = this.root?.querySelector('.splash-reason');
      if (slot) slot.replaceChildren(document.createTextNode(reason));
      this._reason = reason;
    }
    if (this.label) this.label.textContent = gateLabel;
    this._gateLabel = gateLabel;
  }

  /** The world is ready: let the door do its job. */
  setReady() {
    this.ready = true;
    this.root?.classList.remove('is-waiting');
    this.root?.classList.add('is-ready');
    if (this.label) this.label.textContent = this._gateLabel || 'Enter the meadow';
    if (this.hint) this.hint.textContent = 'Tap anywhere, or press any key';
  }

  /** The engine failed: the splash must not hide the explanation. */
  abort() {
    if (!this.root) return;
    this.ready = false;
    this._unbind();
    this.root.classList.add('hidden');
    this.isOpen = false;
    document.body.classList.remove('is-splash');
  }

  dismiss({ byUser = false, instant = false } = {}) {
    if (!this.root || this.closing) return;
    // Tapping a door that is still being built only nudges the visitor.
    if (byUser && !this.ready) {
      this.root.classList.remove('is-waiting-nudge');
      void this.root.offsetWidth;
      this.root.classList.add('is-waiting-nudge');
      return;
    }
    this.closing = true;
    const action = byUser ? this._action : null;
    this.root.classList.add(byUser ? 'is-handing-off' : 'is-leaving');

    const finish = () => {
      this.root.classList.add('hidden');
      this.root.classList.remove('is-leaving', 'is-handing-off');
      this.isOpen = false;
      document.body.classList.remove('is-splash');
      if (byUser) this._unbind();
      if (byUser && action) action();
    };
    if (instant) {
      this.root.classList.add('hidden');
      this.root.classList.remove('is-leaving', 'is-handing-off');
      this.isOpen = false;
      document.body.classList.remove('is-splash');
      this._unbind();
      if (byUser && action) action();
      this.closing = false;
      return;
    }
    setTimeout(finish, byUser ? 420 : 760);
  }

  _setWaiting() {
    this.ready = false;
    this.root?.classList.add('is-waiting');
    if (this.label) this.label.textContent = 'The wind is rising…';
    if (this.hint) this.hint.textContent = 'Opening the chronicle';
  }

  _unbind() {
    this.root?.removeEventListener('click', this._bound.tap);
    window.removeEventListener('keydown', this._bound.key);
  }
}
