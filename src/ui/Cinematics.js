/**
 * Fades, flashes, chapter cards, world introductions and completion flourishes.
 * These are the connective tissue between gameplay beats.
 */
import { LEVEL_OUTROS } from '../story/storyData.js';

export class Cinematics {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.chapterCard = document.getElementById('chapter-card');
    this.letterboxEl = document.getElementById('letterbox');
    this._captionEl = null;
    this._fadeEl = null;
    this._flashEl = null;
    this._fadeToken = 0;
    this._buildLayers();
  }

  _buildLayers() {
    const fade = document.createElement('div');
    fade.id = 'cinematic-fade';
    Object.assign(fade.style, {
      position: 'absolute',
      inset: '0',
      background: '#04060a',
      opacity: '1',
      pointerEvents: 'none',
      zIndex: '39',
      transition: 'opacity 0.7s ease',
    });
    this.root.appendChild(fade);
    this._fadeEl = fade;

    const flash = document.createElement('div');
    flash.id = 'cinematic-flash';
    Object.assign(flash.style, {
      position: 'absolute',
      inset: '0',
      background: '#fff6dc',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '56',
      mixBlendMode: 'screen',
      transition: 'opacity 0.45s ease',
    });
    this.root.appendChild(flash);
    this._flashEl = flash;
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  /** Fade the screen to black. Safe to call repeatedly. */
  fadeOut(duration = 600) {
    const token = ++this._fadeToken;
    this._fadeEl.style.transition = `opacity ${duration}ms ease`;
    this._fadeEl.style.opacity = '1';
    return new Promise((resolve) => {
      setTimeout(() => {
        if (token === this._fadeToken) resolve();
      }, duration);
    });
  }

  /** Reveal the world again. */
  fadeIn(duration = 900) {
    const token = ++this._fadeToken;
    this._fadeEl.style.transition = `opacity ${duration}ms ease`;
    this._fadeEl.style.opacity = '0';
    return new Promise((resolve) => {
      setTimeout(() => {
        if (token === this._fadeToken) resolve();
      }, duration);
    });
  }

  setFadeOpacity(value) {
    this._fadeEl.style.opacity = String(value);
  }

  flashScreen(color = '#fff6dc', duration = 500) {
    if (!this._flashEl) return;
    this._flashEl.style.background = color;
    this._flashEl.style.transition = 'opacity 90ms ease';
    this._flashEl.style.opacity = '0.72';
    setTimeout(() => {
      this._flashEl.style.transition = `opacity ${duration}ms ease`;
      this._flashEl.style.opacity = '0';
    }, 110);
  }

  setLetterbox(active) {
    this.letterboxEl?.classList.toggle('is-active', !!active);
    this.letterboxEl?.classList.toggle('hidden', false);
  }

  showChapterCard({ kicker, title, sub }, duration = 3800) {
    if (!this.chapterCard) return Promise.resolve();
    const kickerEl = document.getElementById('chapter-card-kicker');
    const titleEl = document.getElementById('chapter-card-title');
    const subEl = document.getElementById('chapter-card-sub');
    kickerEl.textContent = kicker || '';
    titleEl.textContent = title || '';
    subEl.textContent = sub || '';

    this.chapterCard.classList.remove('hidden');
    void this.chapterCard.offsetWidth;
    this.chapterCard.classList.add('is-visible');
    this.game.audio?.play('chapter');
    return new Promise((resolve) => {
      setTimeout(() => {
        this.chapterCard.classList.remove('is-visible');
        this.chapterCard.classList.add('hidden');
        resolve();
      }, duration);
    });
  }

  showWorldIntro(title, lines = [], duration = 7000) {
    this.clearCaption();
    const el = document.createElement('div');
    el.className = 'cinematic-caption';
    for (const line of lines.slice(0, 2)) {
      const p = document.createElement('p');
      p.textContent = line;
      el.appendChild(p);
    }
    if (!lines.length) {
      const p = document.createElement('p');
      p.textContent = title;
      el.appendChild(p);
    }
    document.getElementById('hud')?.appendChild(el) ?? this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    this._captionEl = el;
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => {
        el.remove();
        if (this._captionEl === el) this._captionEl = null;
      }, 1200);
    }, duration);
  }

  caption(text, duration = 4200) {
    this.clearCaption();
    const el = document.createElement('div');
    el.className = 'cinematic-caption';
    const p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    this._captionEl = el;
    return new Promise((resolve) => {
      setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => {
          el.remove();
          if (this._captionEl === el) this._captionEl = null;
          resolve();
        }, 1200);
      }, duration);
    });
  }

  clearCaption() {
    if (this._captionEl) {
      this._captionEl.remove();
      this._captionEl = null;
    }
  }

  completeChapter(levelId) {
    const data = LEVEL_OUTROS[levelId];
    if (!data) return Promise.resolve();
    const el = document.createElement('div');
    el.className = 'completion-card';
    el.innerHTML = `
      <p class="completion-kicker"></p>
      <p class="completion-title"></p>
      <p class="completion-sub"></p>
    `;
    el.querySelector('.completion-kicker').textContent = data.kicker;
    el.querySelector('.completion-title').textContent = data.title;
    el.querySelector('.completion-sub').textContent = data.sub;
    this.root.appendChild(el);
    this.game.audio?.play('chapter');
    this.flashScreen('#fff2ce', 800);
    return new Promise((resolve) => {
      setTimeout(() => {
        el.remove();
        resolve();
      }, 3700);
    });
  }

  /** Reveal a line of text centred on screen (used before the ending). */
  revealLine(text, duration = 4200) {
    const el = document.createElement('div');
    el.className = 'reveal-line';
    const em = document.createElement('em');
    em.textContent = text;
    el.appendChild(em);
    this.root.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 1.2s ease';
      el.style.opacity = '1';
    });
    return new Promise((resolve) => {
      setTimeout(() => {
        el.remove();
        resolve();
      }, duration);
    });
  }
}
