/**
 * The Wishing Star's answer.
 *
 * A full-screen, canvas-driven reveal: the sky darkens, a single star swells
 * overhead, then falls across the sky, bursts, and leaves the wished-for look
 * hanging in its light. It is deliberately additive — the ledger's result list
 * is already in the DOM underneath, so nothing here is required for the pull to
 * count. Skipping only skips the show.
 *
 * Everything is 2D canvas + transforms, so it stays cheap on a phone, and the
 * whole thing collapses to a quiet fade when "reduced motion" is on.
 */
import { RARITY } from '../story/shopData.js';

const PALETTE = {
  common: { glow: '#d8cdb5', rgb: '216, 205, 181', sky: '#121722' },
  rare: { glow: '#a9d3f0', rgb: '169, 211, 240', sky: '#0d1622' },
  legendary: { glow: '#f2d79b', rgb: '242, 215, 155', sky: '#1a1408' },
};

const PHASE = {
  charge: 780,
  fall: 1150,
  burst: 620,
  card: 780,
};

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t;

export class WishCinematic {
  constructor(game) {
    this.game = game;
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.raf = 0;
    this.active = false;
    this.start = 0;
    this.phase = 'idle';
    this.results = [];
    this.onDone = null;
    this.stars = [];
    this.sparks = [];
    this.trail = [];
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.flash = 0;
    this._bound = {
      click: (event) => this._onTap(event),
      resize: () => this._resize(),
    };
  }

  /** The rarest thing in the pull decides the light of the whole scene. */
  static heroOf(results = []) {
    const order = { common: 0, rare: 1, legendary: 2 };
    return results.reduce(
      (best, entry) => (!best || (order[entry.rarity] || 0) > (order[best.rarity] || 0) ? entry : best),
      null,
    );
  }

  get reducedMotion() {
    return this.game.settings?.reducedMotion === true;
  }

  /**
   * Play the reveal. Resolves when the scene is dismissed (or immediately when
   * motion is reduced or there is nothing to show).
   */
  play(results = [], { onDone = null } = {}) {
    this.results = results;
    this.onDone = onDone;
    const hero = WishCinematic.heroOf(results);
    if (!hero || this.reducedMotion || typeof document === 'undefined') {
      onDone?.();
      return Promise.resolve();
    }

    this._build(hero);
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Scene                                                            */
  /* ---------------------------------------------------------------- */

  _build(hero) {
    this._teardown();
    const tier = PALETTE[hero.rarity] || PALETTE.common;
    this.tier = tier;
    this.hero = hero;
    this.active = true;

    const root = document.createElement('div');
    root.className = `wish-scene rarity--${hero.rarity}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', `Wish result: ${hero.name}`);

    const canvas = document.createElement('canvas');
    canvas.className = 'wish-canvas';
    root.appendChild(canvas);

    const veil = document.createElement('div');
    veil.className = 'wish-veil';
    root.appendChild(veil);

    const card = document.createElement('div');
    card.className = 'wish-card';
    card.innerHTML = `
      <span class="wish-card-kicker"></span>
      <span class="wish-card-glyph" aria-hidden="true"></span>
      <span class="wish-card-name"></span>
      <span class="wish-card-meta"></span>
      <span class="wish-card-stars" aria-hidden="true"></span>
    `;
    card.querySelector('.wish-card-kicker').textContent =
      hero.rarity === 'legendary' ? 'The star answered' : 'The star answered';
    card.querySelector('.wish-card-glyph').textContent = hero.glyph || '✦';
    card.querySelector('.wish-card-name').textContent = hero.name;
    card.querySelector('.wish-card-meta').textContent = [
      RARITY[hero.rarity]?.label || 'Common',
      hero.duplicate ? `Duplicate · +${hero.refund} mora` : null,
      hero.pityHit ? 'Guaranteed' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    card.querySelector('.wish-card-stars').textContent =
      hero.rarity === 'legendary' ? '✦✦✦✦✦' : hero.rarity === 'rare' ? '✦✦✦✧✧' : '✦✦✧✧✧';
    root.appendChild(card);
    this.card = card;

    if (this.results.length > 1) {
      const strip = document.createElement('ul');
      strip.className = 'wish-others';
      strip.setAttribute('aria-label', 'Everything else the star gave');
      for (const entry of this.results) {
        if (entry === hero) continue;
        const item = document.createElement('li');
        item.className = `wish-other rarity--${entry.rarity || 'common'}`;
        const glyph = document.createElement('span');
        glyph.className = 'wish-other-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = entry.glyph || '✦';
        const name = document.createElement('span');
        name.className = 'wish-other-name';
        name.textContent = entry.name;
        item.append(glyph, name);
        strip.appendChild(item);
      }
      root.appendChild(strip);
      this.strip = strip;
    }

    const hint = document.createElement('p');
    hint.className = 'wish-hint';
    hint.textContent = 'Tap to continue';
    root.appendChild(hint);

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'wish-skip';
    skip.textContent = 'Skip';
    skip.addEventListener('click', (event) => {
      event.stopPropagation();
      this._finish();
    });
    root.appendChild(skip);

    root.addEventListener('click', this._bound.click);
    document.body.appendChild(root);
    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', this._bound.resize);

    this.start = performance.now();
    this.phase = 'charge';
    this.flash = 0;
    this.trail = [];
    this.sparks = [];
    this._seedStars();
    this.game.audio?.play('wish');
    this.raf = requestAnimationFrame((now) => this._tick(now));
  }

  _seedStars() {
    const count = 110;
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.3,
      base: 0.18 + Math.random() * 0.55,
      speed: 0.6 + Math.random() * 2.4,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  _resize() {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth || 1280;
    const height = window.innerHeight || 720;
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------------------------------------------------------- */
  /* Timeline                                                         */
  /* ---------------------------------------------------------------- */

  _tick(now) {
    if (!this.active) return;
    const t = now - this.start;
    const { charge, fall, burst, card } = PHASE;
    let previous = this.phase;

    if (t < charge) this.phase = 'charge';
    else if (t < charge + fall) this.phase = 'fall';
    else if (t < charge + fall + burst) this.phase = 'burst';
    else this.phase = 'reveal';

    if (previous !== this.phase) this._onPhase(this.phase, previous);

    this._draw(t);
    this.raf = requestAnimationFrame((next) => this._tick(next));
    void card;
  }

  _onPhase(phase, previous) {
    if (phase === 'burst') {
      this.game.audio?.play(this.hero?.rarity === 'legendary' ? 'wishBurst' : 'item');
      this.flash = 1;
      this._spawnBurst();
    }
    if (phase === 'reveal' && previous !== 'reveal') {
      this.card?.classList.add('is-visible');
      this.strip?.classList.add('is-visible');
      this.root?.classList.add('is-revealed');
    }
  }

  /** Star head position, in CSS pixels. */
  _starPosition(t) {
    const { charge, fall } = PHASE;
    const p = Math.min(1, Math.max(0, (t - charge) / fall));
    const eased = easeIn(p);
    // Start where the star gathered, so it drops out of its own glow instead
    // of teleporting above the frame.
    const sx = this.width * 0.82;
    const sy = this.height * 0.16;
    const ex = this.width * 0.5;
    const ey = this.height * 0.42;
    return {
      x: sx + (ex - sx) * eased,
      y: sy + (ey - sy) * eased,
      p,
    };
  }

  _spawnBurst() {
    const count = this.hero?.rarity === 'legendary' ? 150 : 100;
    const cx = this.width * 0.5;
    const cy = this.height * 0.42;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 520;
      this.sparks.push({
        x: cx + (Math.random() - 0.5) * 24,
        y: cy + (Math.random() - 0.5) * 24,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.82,
        life: 0,
        max: 0.7 + Math.random() * 1.1,
        r: 1 + Math.random() * 2.2,
        hue: Math.random() < 0.35 ? '255, 246, 214' : null,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Drawing                                                          */
  /* ---------------------------------------------------------------- */

  _draw(t) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width: w, height: h } = this;
    const tier = this.tier || PALETTE.common;

    // Sky: deep at the edges, warm at the heart of the wish.
    const gradient = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.8);
    gradient.addColorStop(0, tier.sky);
    gradient.addColorStop(0.45, 'rgba(8, 10, 16, 0.97)');
    gradient.addColorStop(1, 'rgba(4, 5, 9, 1)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Stars, brighter as the wish gathers.
    const wake = Math.min(1, t / (PHASE.charge + PHASE.fall));
    ctx.globalCompositeOperation = 'lighter';
    for (const star of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * 0.0016 * star.speed + star.phase);
      const alpha = Math.min(1, star.base * twinkle * (0.55 + wake * 0.85));
      ctx.fillStyle = `rgba(235, 242, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.phase === 'charge') {
      this._drawCharge(ctx, t, tier);
    } else if (this.phase === 'fall') {
      this._drawFall(ctx, t, tier);
    } else {
      this._drawBurst(ctx, t, tier);
    }

    this._drawSparks(ctx);

    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255, 252, 240, ${Math.min(0.85, this.flash * 0.62).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - 0.055);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawCharge(ctx, t, tier) {
    const p = Math.min(1, t / PHASE.charge);
    const cx = this.width * 0.82;
    const cy = this.height * 0.16;
    const pulse = 0.7 + 0.3 * Math.sin(p * Math.PI * 3);
    const radius = (6 + 26 * easeOut(p)) * pulse;
    this._glow(ctx, cx, cy, radius * 6, tier.rgb, 0.85);
    this._glow(ctx, cx, cy, radius * 1.6, '255, 250, 232', 0.95);
    this._glow(ctx, cx, cy, radius * 0.5, '255, 255, 255', 1);

    // Faint thread of light reaching down, hinting at where it will fall.
    ctx.strokeStyle = `rgba(255, 246, 220, ${(0.1 + p * 0.22).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(this.width * 0.5, this.height * 0.42);
    ctx.stroke();
  }

  _drawFall(ctx, t, tier) {
    const { x, y, p } = this._starPosition(t);
    this.trail.push({ x, y, at: performance.now() });
    if (this.trail.length > 40) this.trail.shift();

    this._drawTrail(ctx, tier);

    // Sparks peeling off the head.
    if (Math.random() < 0.85) {
      this.sparks.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        vx: -70 - Math.random() * 120,
        vy: -20 - Math.random() * 60,
        life: 0,
        max: 0.45 + Math.random() * 0.6,
        r: 0.8 + Math.random() * 1.8,
        hue: '255, 244, 205',
      });
    }

    this._glow(ctx, x, y, 40 + p * 30, '255, 240, 200', 0.9);
    this._glow(ctx, x, y, 14 + p * 6, '255, 252, 240', 1);
    this._glow(ctx, x, y, 5, '255, 255, 255', 1);
  }

  _drawBurst(ctx, t, tier) {
    const cx = this.width * 0.5;
    const cy = this.height * 0.42;
    const since = Math.max(0, t - PHASE.charge - PHASE.fall);
    const p = Math.min(1, since / (PHASE.burst + 260));
    const reach = Math.max(this.width, this.height);

    // Light rays: soft warm triangles that bloom out of the break point.
    const rays = 18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(since * 0.00009);
    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + (i % 2) * 0.08;
      const length = reach * (0.18 + 0.62 * easeOut(Math.min(1, since / 760))) * (i % 3 === 0 ? 1 : 0.72);
      ctx.save();
      ctx.rotate(angle);
      const ray = ctx.createLinearGradient(0, 0, length, 0);
      ray.addColorStop(0, `rgba(255, 251, 238, ${(0.8 * (1 - p * 0.7)).toFixed(3)})`);
      ray.addColorStop(0.28, `rgba(${tier.rgb}, ${(0.4 * (1 - p * 0.7)).toFixed(3)})`);
      ray.addColorStop(1, `rgba(${tier.rgb}, 0)`);
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(length * 0.62, -length * 0.05, length, 0);
      ctx.quadraticCurveTo(length * 0.62, length * 0.05, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Expanding rings, the loudest of them right at the break.
    for (const [delay, width, strength] of [[0, 4.5, 0.9], [140, 2.4, 0.6], [320, 1.3, 0.4]]) {
      const local = Math.max(0, since - delay);
      if (!local) continue;
      const ratio = Math.min(1, local / 1050);
      const radius = 18 + easeOut(ratio) * reach * 0.78;
      const alpha = (1 - ratio) * strength;
      ctx.strokeStyle = `rgba(255, 250, 232, ${alpha.toFixed(3)})`;
      ctx.lineWidth = width * (1 - ratio * 0.75);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    this._glow(ctx, cx, cy, 70 + p * 150, tier.rgb, 1 - p * 0.55);
    this._glow(ctx, cx, cy, 26 + p * 40, '255, 252, 240', 1 - p * 0.4);
  }

  _drawSparks(ctx) {
    if (!this.sparks.length) return;
    const dt = 1 / 60;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.life += dt;
      if (spark.life >= spark.max) {
        this.sparks.splice(i, 1);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 42 * dt;
      spark.vx *= 0.985;
      spark.vy *= 0.985;
      const fade = 1 - spark.life / spark.max;
      const color = spark.hue || '255, 231, 172';
      ctx.fillStyle = `rgba(${color}, ${(fade * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.r * (0.4 + fade * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Soft radial light. `rgb` is a bare triplet so alpha can be layered. */
  _glow(ctx, x, y, radius, rgb, alpha = 1) {
    if (radius <= 0 || alpha <= 0) return;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${rgb}, ${Math.min(1, 0.92 * alpha).toFixed(3)})`);
    gradient.addColorStop(0.32, `rgba(${rgb}, ${Math.min(1, 0.42 * alpha).toFixed(3)})`);
    gradient.addColorStop(0.66, `rgba(${rgb}, ${Math.min(1, 0.12 * alpha).toFixed(3)})`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * A smooth, tapering comet tail: two passes of joined segments, a wide soft
   * one and a narrow bright one. Segment widths grow toward the head, so the
   * tail narrows to a point behind it.
   */
  _drawTrail(ctx, tier) {
    const points = this.trail;
    if (points.length < 2) return;
    ctx.lineCap = 'round';
    const passes = [
      { base: 3.2, scale: 20, rgb: tier.rgb, alpha: 0.1 },
      { base: 0.8, scale: 8, rgb: '255, 248, 226', alpha: 0.62 },
    ];
    for (const pass of passes) {
      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        const t = i / points.length;
        ctx.strokeStyle = `rgba(${pass.rgb}, ${(pass.alpha * Math.pow(t, 1.4)).toFixed(3)})`;
        ctx.lineWidth = pass.base + t * pass.scale;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Dismissal                                                        */
  /* ---------------------------------------------------------------- */

  _onTap() {
    if (!this.active) return;
    if (this.phase !== 'reveal') {
      // Fast-forward: the point of the scene is already made.
      this.start = performance.now() - (PHASE.charge + PHASE.fall + PHASE.burst + 1);
      return;
    }
    this._finish();
  }

  skip() {
    this._finish();
  }

  _finish() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const done = this.onDone;
    const resolve = this._resolve;
    this.onDone = null;
    this._resolve = null;
    this.game.audio?.play('close');

    const root = this.root;
    this.root = null;
    this.card = null;
    this.strip = null;
    if (root) {
      if (this.reducedMotion) {
        root.remove();
      } else {
        root.classList.add('is-closing');
        setTimeout(() => root.remove(), 240);
      }
    }
    window.removeEventListener('resize', this._bound.resize);
    done?.();
    resolve?.();
  }

  _teardown() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.root) {
      this.root.removeEventListener('click', this._bound.click);
      this.root.remove();
    }
    window.removeEventListener('resize', this._bound.resize);
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.sparks = [];
    this.trail = [];
    this.active = false;
  }

  dispose() {
    this._teardown();
  }
}
