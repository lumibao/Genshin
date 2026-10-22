/**
 * Orchestrates the hidden-page reveal inside the Ancient Library.
 *
 * The personal content is fetched with a dynamic import *after* the gate has
 * passed, so it is not present in the initial bundle and never touches the DOM
 * during chapters I–IV.
 */
import { canRevealHiddenPage } from '../game/Progression.js';

export class SecretReveal {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.revealed = false;
    this._pages = null;
  }

  /** Gate check used by both the interaction and (optionally) tests. */
  gateOpen() {
    return canRevealHiddenPage(this.game.state);
  }

  async begin() {
    if (this.active) return false;
    const { state, quests } = this.game;
    const flags = state.flags;

    if (!state.completed.includes(4) || !flags.L4_seal) {
      this.game.hud.toast({ icon: '☾', text: 'The seal on the cover does not answer you yet.', variant: 'hint' });
      return false;
    }
    if (!flags.L5_entered) {
      this.game.hud.toast({ icon: '❧', text: 'The book is not ready to be read here.', variant: 'hint' });
      return false;
    }

    // Mark the physical interaction before the final assertion, so the gate
    // genuinely requires the player to have opened the book in Chapter V.
    quests.setFlag('L5_bookOpened', true);
    if (!this.gateOpen()) return false;

    this.active = true;
    this.game.addBlocker('reveal');
    this.game.hud.setVisible(false);
    this.game.cinematics.setLetterbox(true);
    this.game.audio?.setIntensity('reverent');
    this.game.audio?.play('reveal');
    this.game.input.exitPointerLock?.();

    const world = this.game.worlds.current;
    const book = world?.book;

    try {
      await this.game.cinematics.fadeOut(450);
      this.game.cinematics.setFadeOpacity(0.18);

      if (book) {
        const framing = book.getCinematicCamera();
        this.game.cameraController.enterCinematic({
          position: framing.position,
          lookAt: framing.lookAt,
          fov: 38,
          damp: 1.5,
        });
        await this.game.cinematics.wait(700);
        this.game.cinematics.flashScreen('#ffe9b8', 900);
        this.game.cameraController.shake(0.06, 0.8);
        await Promise.all([book.open(), this.game.cinematics.wait(1250)]);
        this.game.audio?.play('seal');
        this.game.cinematics.flashScreen('#fff4d6', 1100);
        await this.game.cinematics.wait(420);
      }

      await this.game.cinematics.fadeIn(700);
      this.game.hud.setVisible(false);

      // The gate has passed: load the personal words now.
      const pages = await this.loadPages();
      this._pages = pages;

      if (!state.discoveredPage) {
        state.discoveredPage = true;
        state.flags.L5_messageRead = true;
        state.flags.L5_pageDiscoveredAt = Date.now();
        this.revealed = true;
        this.game.saveNow();
      }
      quests.refresh();
      world?.onRevealComplete?.();
      this.game.audio?.setScene({ music: 'reveal' });

      await this.game.bookUI.open(pages, {
        startIndex: 0,
        context: 'reveal',
        onClose: () => this.finish(),
      });
      return true;
    } catch (err) {
      console.error('[Reveal] failed', err);
      this.finish();
      return false;
    }
  }

  async loadPages() {
    // Imported only after the reveal gate — see README and secretMessage.js.
    const module = await import('./secretMessage.js');
    const pages = module.buildPages();
    const fill = module.fillTokens;
    return pages.map((page) => ({
      ...page,
      title: fill(page.title),
      subtitle: fill(page.subtitle),
      paragraphs: (page.paragraphs || []).map((paragraph) => ({
        ...paragraph,
        text: fill(paragraph.text),
      })),
      signature: {
        small: fill(page.signature?.small || ''),
        name: fill(page.signature?.name || ''),
      },
      dateLine: fill(page.dateLine || ''),
    }));
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.game.cinematics.setLetterbox(false);
    this.game.cameraController.exitCinematic();
    this.game.hud.setVisible(true);
    this.game.removeBlocker('reveal');
    this.game.audio?.setIntensity('normal');
    this.game.audio?.setScene({ music: this.game.worlds.current?.music || 'library' });
    this.game.saveNow();

    if (this.game.state.discoveredPage) {
      this.game.hud.toast({
        icon: '✧',
        kicker: 'The Way Onward',
        text: 'A door of light has opened at the far end of the library.',
        variant: 'quest',
      });
      this.game.hud.toast({
        icon: '❧',
        text: 'The chronicle can be read again from the pedestal.',
        variant: 'hint',
      });
    }
  }

  /** Re-read from the pedestal or the ending sanctuary. */
  async reopen() {
    if (!this.game.state.discoveredPage) {
      return this.begin();
    }
    if (this.active) return false;
    this.active = true;
    this.game.addBlocker('reveal');
    this.game.hud.setVisible(false);
    this.game.cinematics.setLetterbox(true);
    this.game.audio?.play('bookOpen');

    const world = this.game.worlds.current;
    const book = world?.book;
    if (book) {
      const framing = book.getCinematicCamera({ side: -1 });
      this.game.cameraController.enterCinematic({
        position: framing.position,
        lookAt: framing.lookAt,
        fov: 40,
        damp: 1.8,
      });
      await this.game.cinematics.wait(500);
    }

    const pages = this._pages || (await this.loadPages());
    this._pages = pages;
    await this.game.bookUI.open(pages, {
      startIndex: 0,
      context: world?.music === 'sanctuary' ? 'ending' : 'reveal',
      onClose: () => {
        this.active = false;
        this.game.cinematics.setLetterbox(false);
        this.game.cameraController.exitCinematic();
        this.game.hud.setVisible(true);
        this.game.removeBlocker('reveal');
        this.game.audio?.setScene({ music: world?.music || 'library' });
      },
    });
    return true;
  }
}
