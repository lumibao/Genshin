/**
 * Procedural canvas textures.
 *
 * Everything is generated at runtime so the project ships without binary art
 * dependencies, and so the palette stays cohesive across worlds. Each texture
 * is cached; `disposeTextures()` releases them when the game tears down.
 */
import * as THREE from 'three';

const cache = new Map();

function seededRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

function finish(canvas, { repeat = 1, srgb = true, aniso = 4 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = aniso;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  // Cached across worlds — the scene disposer must not free these.
  texture.userData.shared = true;
  return texture;
}

function cached(key, factory) {
  if (cache.has(key)) return cache.get(key);
  const texture = factory();
  cache.set(key, texture);
  return texture;
}

function addGrain(ctx, size, amount, rng, alpha = 0.06) {
  const data = ctx.getImageData(0, 0, size, size);
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    if (rng() > amount) continue;
    const shift = (rng() - 0.5) * 42;
    pixels[i] = Math.min(255, Math.max(0, pixels[i] + shift));
    pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1] + shift));
    pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] + shift));
    pixels[i + 3] = Math.round(pixels[i + 3] * (1 - alpha * rng()));
  }
  ctx.putImageData(data, 0, 0);
}

/* ------------------------------------------------------------------ */
/* Sprite helpers                                                      */
/* ------------------------------------------------------------------ */

/** Soft radial glow, used for motes, portal cores and light shafts. */
export function glowTexture(color = '#f7e7b8') {
  return cached(`glow:${color}`, () => {
    const { canvas, ctx } = makeCanvas(128);
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.18, color);
    gradient.addColorStop(0.45, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    return finish(canvas, { repeat: 1 });
  });
}

/** Four-point sparkle used for collectibles and star mechanisms. */
export function sparkleTexture(color = '#fff6d8') {
  return cached(`sparkle:${color}`, () => {
    const { canvas, ctx } = makeCanvas(128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.16, color);
    g.addColorStop(0.4, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    ctx.beginPath();
    // vertical ray
    ctx.moveTo(64, 2);
    ctx.quadraticCurveTo(70, 52, 126, 64);
    ctx.quadraticCurveTo(70, 76, 64, 126);
    ctx.quadraticCurveTo(58, 76, 2, 64);
    ctx.quadraticCurveTo(58, 52, 64, 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(64, 64, 14, 0, Math.PI * 2);
    ctx.fill();
    return finish(canvas);
  });
}

/** Puffy anime cloud. */
export function cloudTexture(seed = 3) {
  return cached(`cloud:${seed}`, () => {
    const { canvas, ctx } = makeCanvas(512, 256);
    const rng = seededRandom(seed * 977 + 13);
    ctx.clearRect(0, 0, 512, 256);
    for (let i = 0; i < 26; i++) {
      const x = 80 + rng() * 352;
      const y = 110 + rng() * 70;
      const r = 34 + rng() * 74;
      const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.55, 'rgba(248,250,255,0.62)');
      g.addColorStop(1, 'rgba(235,242,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Warmer underside for the anime look.
    const shade = ctx.createLinearGradient(0, 140, 0, 240);
    shade.addColorStop(0, 'rgba(206,214,236,0)');
    shade.addColorStop(1, 'rgba(196,204,232,0.22)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 512, 256);
    return finish(canvas);
  });
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** Warm, faintly mottled parchment for the physical page of the book. */
export function parchmentTexture() {
  return cached('parchment', () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);
    const rng = seededRandom(77);
    ctx.fillStyle = '#efe0bd';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 60; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 30 + rng() * 150;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tint = rng() > 0.55 ? '188,158,104' : '255,248,226';
      g.addColorStop(0, `rgba(${tint},${0.05 + rng() * 0.09})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }

    // Fibres
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 380; i++) {
      ctx.strokeStyle = `rgba(126,96,54,${0.02 + rng() * 0.05})`;
      ctx.beginPath();
      const x = rng() * size;
      const y = rng() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 40, y + (rng() - 0.5) * 40);
      ctx.stroke();
    }

    // Edge ambering
    const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.72);
    edge.addColorStop(0, 'rgba(120,86,40,0)');
    edge.addColorStop(1, 'rgba(120,86,40,0.24)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);

    addGrain(ctx, size, 0.4, rng, 0.04);
    return finish(canvas, { repeat: 1 });
  });
}

/** Deep blue leather with gold tooling for the chronicle's cover. */
export function bookLeatherTexture() {
  return cached('bookLeather', () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);
    const rng = seededRandom(912);
    const base = ctx.createLinearGradient(0, 0, size, size);
    base.addColorStop(0, '#243a52');
    base.addColorStop(0.5, '#1a2b3f');
    base.addColorStop(1, '#12202f');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // Leather grain
    for (let i = 0; i < 1800; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 0.6 + rng() * 2.4;
      ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${0.012 + rng() * 0.03})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gold fillet frame
    ctx.strokeStyle = 'rgba(206,170,102,0.62)';
    ctx.lineWidth = 4;
    ctx.strokeRect(34, 34, size - 68, size - 68);
    ctx.strokeStyle = 'rgba(206,170,102,0.3)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(48, 48, size - 96, size - 96);

    // Corner flourishes
    const drawFlourish = (cx, cy, flipX, flipY) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(flipX, flipY);
      ctx.strokeStyle = 'rgba(224,190,120,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 46);
      ctx.quadraticCurveTo(4, 4, 46, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, 58);
      ctx.quadraticCurveTo(12, 14, 58, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(18, 18, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224,190,120,0.55)';
      ctx.fill();
      ctx.restore();
    };
    drawFlourish(52, 52, 1, 1);
    drawFlourish(size - 52, 52, -1, 1);
    drawFlourish(52, size - 52, 1, -1);
    drawFlourish(size - 52, size - 52, -1, -1);

    // Central emblem: concentric circles + compass star
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = 'rgba(224,190,120,0.5)';
    ctx.lineWidth = 1.6;
    [72, 52].forEach((r) => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(236,206,146,0.75)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(7, -7, 0, -62);
      ctx.quadraticCurveTo(-7, -7, 0, -18);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(247,231,184,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    addGrain(ctx, size, 0.22, rng, 0.05);
    return finish(canvas, { repeat: 1 });
  });
}

/** Page block edge: many thin cream lines. */
export function pageEdgeTexture() {
  return cached('pageEdge', () => {
    const { canvas, ctx } = makeCanvas(256);
    const rng = seededRandom(51);
    ctx.fillStyle = '#e6d6ae';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const shade = 226 + Math.floor(rng() * 24);
      ctx.fillStyle = `rgb(${shade},${shade - 10},${shade - 42})`;
      ctx.fillRect(0, y, 256, 1.4);
    }
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(150,120,72,${0.03 + rng() * 0.06})`;
      ctx.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 10);
    }
    return finish(canvas, { repeat: 1 });
  });
}

/** Mossy stone for ruins, pillars and archive walls. */
export function stoneTexture(tint = 'default') {
  return cached(`stone:${tint}`, () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);
    const rng = seededRandom(tint === 'dark' ? 404 : 205);
    const palettes = {
      default: ['#9a9689', '#8a8679', '#a8a293'],
      dark: ['#575a5e', '#494c52', '#62656a'],
      warm: ['#a8967b', '#96846a', '#b6a488'],
    };
    const palette = palettes[tint] || palettes.default;
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, size, size);

    // Ashlar blocks
    const rows = 6;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (size / 8);
      for (let c = -1; c < 4; c++) {
        const x = offset + c * (size / 4);
        const y = r * rowH;
        ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
        ctx.fillRect(x + 1.5, y + 1.5, size / 4 - 3, rowH - 3);
        ctx.strokeStyle = 'rgba(40,38,34,0.28)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1.5, y + 1.5, size / 4 - 3, rowH - 3);
      }
    }

    // Weathering
    for (let i = 0; i < 240; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 2 + rng() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const mossy = rng() > 0.55;
      g.addColorStop(0, mossy ? `rgba(88,112,62,${0.08 + rng() * 0.2})` : `rgba(50,48,44,${0.05 + rng() * 0.12})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    addGrain(ctx, size, 0.3, rng, 0.05);
    return finish(canvas, { repeat: 2 });
  });
}

/** Plank wood for bridges, shelves and crates. */
export function woodTexture(tint = 'default') {
  return cached(`wood:${tint}`, () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);
    const rng = seededRandom(tint === 'dark' ? 707 : 311);
    const base = tint === 'dark' ? '#4a3524' : '#7a5a3a';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const planks = 6;
    const h = size / planks;
    for (let p = 0; p < planks; p++) {
      const shade = tint === 'dark' ? 56 + rng() * 22 : 96 + rng() * 34;
      ctx.fillStyle = `rgb(${shade + 22},${shade - 4},${shade - 32})`;
      ctx.fillRect(0, p * h + 1, size, h - 2);

      // grain
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(40,26,14,${0.04 + rng() * 0.1})`;
        ctx.lineWidth = 0.7 + rng() * 1.2;
        ctx.beginPath();
        const y = p * h + 4 + rng() * (h - 8);
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.3, y + (rng() - 0.5) * 6, size * 0.7, y + (rng() - 0.5) * 6, size, y);
        ctx.stroke();
      }
      // knot
      if (rng() > 0.55) {
        const kx = rng() * size;
        const ky = p * h + h * 0.5;
        for (let k = 3; k > 0; k--) {
          ctx.strokeStyle = `rgba(30,18,8,${0.1 * k})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(kx, ky, 4 * k, 2.2 * k, rng(), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(24,14,6,0.35)';
      ctx.fillRect(0, p * h, size, 1.6);
    }

    addGrain(ctx, size, 0.24, rng, 0.05);
    return finish(canvas, { repeat: 2 });
  });
}

/** Rune ring used by seals, waystones and the observatory lens. */
export function runeRingTexture(color = '#f2dda6') {
  return cached(`rune:${color}`, () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);
    const rng = seededRandom(1234);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';

    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    [232, 196, 148].forEach((r) => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Tick marks
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const long = i % 4 === 0;
      ctx.globalAlpha = long ? 0.95 : 0.45;
      ctx.lineWidth = long ? 2.4 : 1.1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 200, Math.sin(a) * 200);
      ctx.lineTo(Math.cos(a) * (long ? 226 : 214), Math.sin(a) * (long ? 226 : 214));
      ctx.stroke();
    }

    // Rune glyphs around the band
    const glyphs = ['\u16A0', '\u16B1', '\u16C1', '\u16D2', '\u16E0', '\u16B7', '\u16CF', '\u16A6'];
    ctx.globalAlpha = 0.85;
    ctx.font = '26px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, -168);
      ctx.fillText(glyphs[Math.floor(rng() * glyphs.length)], 0, 0);
      ctx.restore();
    }

    // Inner star
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 118 : 46;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 96, 0, Math.PI * 2);
    ctx.stroke();

    return finish(canvas, { repeat: 1 });
  });
}

/** Soft radial shadow blob used under characters and props. */
export function blobShadowTexture() {
  return cached('blobShadow', () => {
    const { canvas, ctx } = makeCanvas(128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return finish(canvas, { repeat: 1, srgb: false });
  });
}

/** Warm parchment used for hanging library banners and maps. */
export function bannerTexture(hue = '#7c2f2a') {
  return cached(`banner:${hue}`, () => {
    const { canvas, ctx } = makeCanvas(256, 512);
    const rng = seededRandom(88);
    const g = ctx.createLinearGradient(0, 0, 256, 512);
    g.addColorStop(0, hue);
    g.addColorStop(1, '#2a1414');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = 'rgba(226,196,130,0.75)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 220, 476);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(226,196,130,0.35)';
    ctx.strokeRect(30, 30, 196, 452);

    ctx.save();
    ctx.translate(128, 210);
    ctx.strokeStyle = 'rgba(238,212,152,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 58 : 22;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(238,212,152,0.5)';
    ctx.font = '15px serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u2726', 128, 360);
    addGrain(ctx, 256, 0.25, rng, 0.06);
    return finish(canvas, { repeat: 1 });
  });
}

/** Metal / gold micro-noise for the book's clasps. */
export function metalTexture(color = '#c8a86a') {
  return cached(`metal:${color}`, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    const rng = seededRandom(66);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(255,246,214,${rng() * 0.14})`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(60,40,12,${rng() * 0.12})`;
      ctx.fillRect(rng() * size, rng() * size, 1, 1 + rng() * 4);
    }
    return finish(canvas, { repeat: 1 });
  });
}

/** Sky gradient used for the title screen fallback and minimap. */
export function skyGradientTexture(top = '#7fb4dd', bottom = '#e9ddc4') {
  return cached(`skyGrad:${top}:${bottom}`, () => {
    const { canvas, ctx } = makeCanvas(64, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    return finish(canvas, { repeat: 1 });
  });
}

export function disposeTextures() {
  for (const texture of cache.values()) {
    try {
      texture.dispose();
    } catch {
      /* ignore */
    }
  }
  cache.clear();
}
