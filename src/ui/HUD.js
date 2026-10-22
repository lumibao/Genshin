/**
 * Heads-up display: quest tracker, minimap, prompts, toasts, stamina and the
 * mobile control shell. Never owns game state — it renders what it is given.
 */
import { QuestTracker } from './QuestTracker.js';

const MARKER_COLORS = {
  npc: '#e8cf94',
  relic: '#9fe3d3',
  gate: '#c4b2f0',
  poi: '#b8b3a4',
  water: '#7fb4cc',
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.tracker = new QuestTracker(game);
    this.toastsEl = document.getElementById('toasts');
    this.promptEl = document.getElementById('interaction-prompt');
    this.promptKey = document.getElementById('prompt-key');
    this.promptText = document.getElementById('prompt-text');
    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap?.getContext('2d');
    this.chapterKicker = document.getElementById('chapter-kicker');
    this.chapterName = document.getElementById('chapter-name');
    this.staminaEl = document.getElementById('stamina');
    this.staminaFill = this.staminaEl?.querySelector('i');
    this.puzzlePanel = null;
    this._toasts = [];
    this._minimapTimer = 0;
    this._promptSignature = '';
    this._bind();
  }

  _bind() {
    document.getElementById('btn-inventory')?.addEventListener('click', () => this.game.inventoryUI.open());
    document.getElementById('btn-menu')?.addEventListener('click', () => this.game.openPauseMenu());
    document.getElementById('btn-sound')?.addEventListener('click', () => this.game.toggleMute());
    this.promptEl?.addEventListener('click', () => this.game.interactions?.activateNearest());
    this.updateSoundButton();
  }

  show() {
    this.root?.classList.remove('hidden');
  }

  hide() {
    this.root?.classList.add('hidden');
  }

  setVisible(visible) {
    this.root?.classList.toggle('is-dimmed', !visible);
  }

  setChapter(kicker, title) {
    this.tracker.setChapter(kicker, title);
  }

  setLevel(levelId) {
    const chapter = this.game.quests?.chapterLabel(levelId);
    if (chapter) this.tracker.setChapter(chapter.kicker, chapter.title);
  }

  renderQuest(snapshot) {
    this.tracker.render(snapshot);
  }

  /* ----------------------------- Prompt ----------------------------- */

  setPrompt(prompt) {
    if (!prompt) {
      this.promptEl?.classList.add('hidden');
      this._promptSignature = '';
      return;
    }
    const signature = `${prompt.key}|${prompt.label}`;
    if (signature === this._promptSignature) return;
    this._promptSignature = signature;
    this.promptEl?.classList.remove('hidden');
    if (this.promptKey) this.promptKey.textContent = prompt.key || 'E';
    if (this.promptText) this.promptText.textContent = prompt.label || 'Interact';
  }

  /* ----------------------------- Toasts ----------------------------- */

  toast(options) {
    if (!this.toastsEl) return;
    if (typeof options === 'string') options = { text: options };
    const { icon = '✦', kicker = '', text = '', detail = '', variant = '' } = options;
    if (!text) return;

    // Deduplicate rapid duplicates (e.g. holding interact).
    if (this._toasts.some((t) => t.textContent?.includes(text) && !t.dataset.leaving)) return;

    const el = document.createElement('div');
    el.className = `toast ${variant ? `toast--${variant}` : ''}`;
    el.innerHTML = `
      <span class="toast-icon"><span></span></span>
      <span class="toast-main">
        <span class="toast-kicker"></span>
        <span class="toast-text"></span>
        <span class="toast-detail"></span>
      </span>
    `;
    el.querySelector('.toast-icon span').textContent = icon;
    el.querySelector('.toast-kicker').textContent = kicker;
    el.querySelector('.toast-text').textContent = text;
    const detailEl = el.querySelector('.toast-detail');
    if (detail) detailEl.textContent = detail;
    else detailEl.remove();
    if (!kicker) el.querySelector('.toast-kicker').remove();

    this.toastsEl.appendChild(el);
    this._toasts.push(el);
    while (this._toasts.length > 4) {
      const oldest = this._toasts.shift();
      oldest?.remove();
    }

    setTimeout(() => {
      el.dataset.leaving = '1';
      el.classList.add('is-out');
      setTimeout(() => {
        el.remove();
        this._toasts = this._toasts.filter((t) => t !== el);
      }, 480);
    }, 4600);
  }

  /* ----------------------------- Puzzle ----------------------------- */

  showPuzzlePanel(title, steps) {
    this.hidePuzzlePanel();
    const panel = document.createElement('div');
    panel.className = 'puzzle-panel';
    panel.innerHTML = `
      <h4></h4>
      <div class="puzzle-steps"></div>
    `;
    panel.querySelector('h4').textContent = title;
    const container = panel.querySelector('.puzzle-steps');
    for (let i = 0; i < steps; i++) {
      const step = document.createElement('span');
      step.className = 'puzzle-step';
      step.innerHTML = `<span>${i + 1}</span>`;
      container.appendChild(step);
    }
    this.root?.appendChild(panel);
    this.puzzlePanel = panel;
  }

  setPuzzleProgress(done, activeIndex = -1) {
    if (!this.puzzlePanel) return;
    const steps = this.puzzlePanel.querySelectorAll('.puzzle-step');
    steps.forEach((step, index) => {
      step.classList.toggle('is-done', index < done);
      step.classList.toggle('is-active', index === activeIndex && index >= done);
    });
  }

  hidePuzzlePanel() {
    this.puzzlePanel?.remove();
    this.puzzlePanel = null;
  }

  /* ----------------------------- Minimap ----------------------------- */

  update(dt) {
    this._minimapTimer += dt;
    if (this._minimapTimer < 0.1) {
      this._updateStamina();
      return;
    }
    this._minimapTimer = 0;
    this.drawMinimap();
    this._updateStamina();
  }

  _updateStamina() {
    const player = this.game.player;
    if (!this.staminaEl || !player) return;
    const ratio = player.staminaRatio;
    const show = player.visible && (ratio < 0.995 || player.isSprinting);
    this.staminaEl.classList.toggle('hidden', !show);
    this.staminaEl.classList.toggle('is-empty', ratio <= 0.01);
    if (this.staminaFill) this.staminaFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  drawMinimap() {
    const canvas = this.minimap;
    const ctx = this.minimapCtx;
    if (!canvas || !ctx) return;
    if (this.game.settings.minimap === false) {
      canvas.parentElement.style.display = 'none';
      return;
    }
    canvas.parentElement.style.display = '';

    const size = canvas.width;
    const center = size / 2;
    const range = 44; // world units from centre to rim
    const scale = (size / 2 - 8) / range;
    const player = this.game.player;
    const world = this.game.worlds?.current;
    const px = player?.position.x ?? 0;
    const pz = player?.position.z ?? 0;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 1, 0, Math.PI * 2);
    ctx.clip();

    // Background
    const bg = ctx.createRadialGradient(center, center, 0, center, center, center);
    bg.addColorStop(0, 'rgba(18, 28, 40, 0.95)');
    bg.addColorStop(1, 'rgba(8, 13, 20, 0.98)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // Subtle rings
    ctx.strokeStyle = 'rgba(232, 201, 138, 0.09)';
    ctx.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(center, center, (center - 6) * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const toScreen = (x, z) => ({
      x: center + (x - px) * scale,
      y: center + (z - pz) * scale,
    });

    // World features
    const minimapData = world?.getMinimapData?.() || { markers: [] };
    if (world?.bounds) {
      const b = toScreen(world.bounds.x, world.bounds.z);
      ctx.strokeStyle = 'rgba(232, 201, 138, 0.18)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, world.bounds.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Markers
    const now = performance.now() * 0.001;
    for (const marker of minimapData.markers) {
      const point = toScreen(marker.x, marker.z);
      if (Math.hypot(point.x - center, point.y - center) > center - 8) continue;
      const color = MARKER_COLORS[marker.type] || '#cfc4ad';
      ctx.fillStyle = color;
      if (marker.type === 'gate') {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.4 + Math.sin(now * 3) * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6.5 + Math.sin(now * 2) * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (marker.type === 'npc') {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y - 4);
        ctx.lineTo(point.x + 3.4, point.y);
        ctx.lineTo(point.x, point.y + 4);
        ctx.lineTo(point.x - 3.4, point.y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(point.x, point.y, marker.type === 'water' ? 4.5 : 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Player arrow
    if (player) {
      const angle = Math.PI - player.facing;
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(angle);
      ctx.fillStyle = '#f7e7b8';
      ctx.shadowColor = 'rgba(247, 231, 184, 0.8)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.4);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // Rim
    ctx.strokeStyle = 'rgba(232, 201, 138, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(center, center, center - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ----------------------------- Chrome ----------------------------- */

  updateSoundButton() {
    const muted = !!this.game.settings?.muted;
    const button = document.getElementById('btn-sound');
    button?.classList.toggle('is-muted', muted);
    button?.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    const label = document.querySelector('#btn-title-sound .sound-label');
    if (label) label.textContent = muted ? 'Sound: Off' : 'Sound: On';
    document.getElementById('btn-title-sound')?.setAttribute('aria-pressed', String(!muted));
  }

  setChapterCardVisible() {
    // reserved for future UI flourishes
  }
}
