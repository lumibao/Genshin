/**
 * NPC dialogue and narration. Typewriter text, click/space to advance,
 * mobile tap support, and a skip control. Resolves when the conversation ends.
 */
import { DIALOGUES, NPCS } from '../story/dialogueData.js';

const CHAR_DELAY = 16; // ms per character

export class DialogueUI {
  constructor(game) {
    this.game = game;
    this.layer = document.getElementById('dialogue');
    this.speakerEl = document.getElementById('dialogue-speaker');
    this.portraitEl = document.getElementById('dialogue-portrait');
    this.textEl = document.getElementById('dialogue-text');
    this.skipBtn = document.getElementById('dialogue-skip');
    this.isActive = false;
    this._lines = [];
    this._index = 0;
    this._resolve = null;
    this._typing = false;
    this._shown = 0;
    this._fullText = '';
    this._lastTick = 0;
    this._raf = null;
    this._advanceLock = 0;

    this._keyHandler = (event) => {
      if (!this.isActive) return;
      if (['Space', 'Enter', 'KeyE', 'Escape', 'NumpadEnter'].includes(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.code === 'Escape') this._finishAll();
        else this.advance();
      }
    };

    this.layer?.addEventListener('click', (event) => {
      if (event.target.closest('#dialogue-skip')) return;
      this.advance();
    });
    this.skipBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this._finishAll();
    });
  }

  _bindKeys() {
    document.addEventListener('keydown', this._keyHandler, true);
  }

  _unbindKeys() {
    document.removeEventListener('keydown', this._keyHandler, true);
  }

  /**
   * @param {string | {lines: Array, npc?: string}} source
   */
  async play(source) {
    let data = typeof source === 'string' ? DIALOGUES[source] : source;
    if (!data) {
      console.warn('[Dialogue] unknown dialogue', source);
      return;
    }
    if (this.isActive) {
      // Queue after the current conversation rather than overlapping.
      while (this.isActive) await new Promise((r) => setTimeout(r, 80));
      data = typeof source === 'string' ? DIALOGUES[source] : source;
      if (!data) return;
    }

    this._npcId = data.npc || null;
    this._lines = data.lines.filter(Boolean).map((line) => (typeof line === 'string' ? { text: line } : line));
    this._index = 0;
    this.isActive = true;
    this.layer.classList.remove('hidden');
    this.game.addBlocker('dialogue');
    this.game.input.exitPointerLock?.();
    this._bindKeys();

    const result = new Promise((resolve) => {
      this._resolve = resolve;
    });

    this._showLine();
    return result;
  }

  _showLine() {
    const line = this._lines[this._index];
    if (!line) {
      this._end();
      return;
    }
    const speakerId = line.speaker === '' ? null : line.speaker || this._npcId;
    const npc = speakerId ? NPCS[speakerId] : null;

    if (line.speaker === '') {
      this.speakerEl.textContent = 'The Chronicle';
      this.portraitEl.textContent = '❦';
    } else if (npc) {
      this.speakerEl.textContent = npc.name;
      this.portraitEl.textContent = npc.portrait;
      this.portraitEl.style.borderColor = npc.color;
    } else {
      this.speakerEl.textContent = 'Voice';
      this.portraitEl.textContent = '✧';
    }

    this._fullText = line.text || '';
    this._startTyping();
    this.game.audio?.play('dialogue', { muted: true });
  }

  _startTyping() {
    this._typing = true;
    this._shown = 0;
    this.textEl.textContent = '';
    if (this.game.settings.reducedMotion) {
      this._shown = this._fullText.length;
      this.textEl.textContent = this._fullText;
      this._typing = false;
      return;
    }
    this._lastTick = performance.now();
    const step = (now) => {
      if (!this._typing) return;
      const dt = Math.min(64, now - this._lastTick);
      this._lastTick = now;
      this._shown = Math.min(this._fullText.length, this._shown + dt / CHAR_DELAY);
      const count = Math.floor(this._shown);
      this.textEl.textContent = this._fullText.slice(0, count);
      if (count < this._fullText.length) {
        this._raf = requestAnimationFrame(step);
      } else {
        this._typing = false;
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  _completeTyping() {
    this._typing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._shown = this._fullText.length;
    this.textEl.textContent = this._fullText;
  }

  advance() {
    if (!this.isActive) return;
    const now = performance.now();
    if (now - this._advanceLock < 80) return;
    this._advanceLock = now;

    if (this._typing) {
      this._completeTyping();
      return;
    }
    this.game.audio?.play('dialogueAdvance', { muted: true });
    this._index++;
    if (this._index >= this._lines.length) {
      this._end();
      return;
    }
    this._showLine();
  }

  _finishAll() {
    if (!this.isActive) return;
    this._end();
  }

  _end() {
    if (!this.isActive) return;
    this.isActive = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.layer?.classList.add('hidden');
    this._unbindKeys();
    this.game.removeBlocker('dialogue');
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.();
    this._lines = [];
  }

  /** Store the NPC context for the next play call. */
  useNpc(npcId) {
    this._currentNpcId = npcId;
    return this;
  }
}
