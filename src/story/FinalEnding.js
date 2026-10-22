/**
 * The optional ending sanctuary.
 *
 * Displays the in-world inscription, then reveals the personal dedication.
 * Everything here only runs after `state.discoveredPage` is true; the
 * inscription text itself is loaded dynamically from secretMessage.js.
 */
export class FinalEnding {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.active = false;
    this._token = 0;
    this._pages = null;
    this._build();
  }

  _build() {
    const layer = document.createElement('div');
    layer.id = 'ending-layer';
    layer.className = 'hidden';
    layer.innerHTML = `
      <div class="ending-title">
        <p class="ending-kicker">The Celestial Sanctuary</p>
        <h2>Where Every Road Ends</h2>
        <p>A quiet place, kept for one arrival.</p>
      </div>
      <div class="final-inscription">
        <p></p>
        <div class="inscription-rule"><span></span><i>✦</i><span></span></div>
      </div>
      <div class="ending-actions"></div>
    `;
    this.root.appendChild(layer);
    this.layer = layer;
    this.titleEl = layer.querySelector('.ending-title');
    this.inscriptionEl = layer.querySelector('.final-inscription');
    this.inscriptionText = layer.querySelector('.final-inscription p');
    this.actionsEl = layer.querySelector('.ending-actions');
    this._buildActions();
  }

  _buildActions() {
    const actions = [
      { label: 'Read the hidden page', handler: () => this.readPage(0) },
      { label: 'Read the dedication', handler: () => this.readPage(-1) },
      { label: 'Replay the final scene', handler: () => this.replay() },
      { label: 'Return to the journey', handler: () => this.leave() },
    ];
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.textContent = action.label;
      button.addEventListener('click', action.handler);
      this.actionsEl.appendChild(button);
    }
  }

  async start() {
    if (!this.game.state.discoveredPage) return false;
    this.active = true;
    const token = ++this._token;
    this.layer.classList.remove('hidden');
    this.titleEl.classList.remove('is-visible');
    this.inscriptionEl.classList.remove('is-visible');
    this.actionsEl.classList.remove('is-visible');

    const world = this.game.worlds.current;
    if (world?.getEndingCamera) {
      this.game.cameraController.startOrbit(world.getEndingCamera());
    }
    this.game.audio?.setScene({ music: 'sanctuary', ambience: 'celestial' });

    if (!this._pages) {
      const module = await import('./secretMessage.js');
      const pages = module.buildPages();
      const fill = module.fillTokens;
      this._pages = pages.map((page) => ({
        ...page,
        title: fill(page.title),
        subtitle: fill(page.subtitle),
        paragraphs: (page.paragraphs || []).map((p) => ({ ...p, text: fill(p.text) })),
        signature: {
          small: fill(page.signature?.small || ''),
          name: fill(page.signature?.name || ''),
        },
        dateLine: fill(page.dateLine || ''),
      }));
      this.inscription = module.SECRET_PAGE.inscription;
    }
    if (token !== this._token) return false;

    // Cinematic: title, then the in-world inscription.
    await this.game.cinematics.wait(1400);
    if (token !== this._token) return false;
    this.titleEl.classList.add('is-visible');
    this.game.cinematics.flashScreen('#ffe9c0', 1600);

    await this.game.cinematics.wait(2600);
    if (token !== this._token) return false;
    this.inscriptionText.textContent = this.inscription;
    this.inscriptionEl.classList.add('is-visible');
    this.game.audio?.play('chapter');

    await this.game.cinematics.wait(6200);
    if (token !== this._token) return false;

    // The dedication, revealed as the last page of the chronicle.
    await this.readPage(-1);
    if (token !== this._token) return false;
    this.actionsEl.classList.add('is-visible');
    return true;
  }

  async readPage(index) {
    if (!this._pages) {
      const module = await import('./secretMessage.js');
      this._pages = module.buildPages();
    }
    const pages = this._pages;
    await this.game.bookUI.open(pages, {
      startIndex: index < 0 ? pages.length - 1 : index,
      context: 'ending',
      onClose: () => {
        this.actionsEl.classList.add('is-visible');
      },
    });
    this.actionsEl.classList.add('is-visible');
  }

  async replay() {
    if (!this.active) return;
    this._token++;
    this.titleEl.classList.remove('is-visible');
    this.inscriptionEl.classList.remove('is-visible');
    this.actionsEl.classList.remove('is-visible');
    await this.game.cinematics.fadeOut(500);
    await this.game.cinematics.wait(200);
    this.start();
    await this.game.cinematics.fadeIn(900);
  }

  leave() {
    this.game.returnFromEnding();
  }

  stop() {
    this.active = false;
    this._token++;
    this.layer.classList.add('hidden');
    this.titleEl.classList.remove('is-visible');
    this.inscriptionEl.classList.remove('is-visible');
    this.actionsEl.classList.remove('is-visible');
  }
}
