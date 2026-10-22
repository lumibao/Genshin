/**
 * Persistence for Project Asteria.
 *
 * Progress and settings live in localStorage under separate keys so that
 * changing a volume never touches progress and vice-versa. Every read is
 * defensive: private browsing, disabled storage or corrupted JSON must never
 * prevent the game from starting.
 */

export const SAVE_KEY = 'asteria:save:v1';
export const SETTINGS_KEY = 'asteria:settings:v1';
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  music: 0.5,
  ambient: 0.62,
  sfx: 0.7,
  muted: false,
  reducedMotion: false,
  invertY: false,
  sensitivity: 1,
  quality: 'auto',
  hints: true,
  minimap: true,
});

/** A brand new adventure, at the very beginning of Chapter I. */
export function createNewState() {
  return {
    version: SAVE_VERSION,
    started: false,
    level: 1,
    world: 'mondstadt',
    spawn: 'default',
    completed: [],
    flags: {},
    items: {},
    discoveredPage: false,
    endingSeen: false,
    playtime: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Merge a possibly-old save into the current schema without losing progress. */
export function normalizeState(raw) {
  const base = createNewState();
  if (!isPlainObject(raw)) return base;

  const state = {
    ...base,
    ...raw,
    version: SAVE_VERSION,
    completed: Array.isArray(raw.completed) ? raw.completed.filter((n) => Number.isInteger(n) && n >= 1 && n <= 5) : [],
    flags: isPlainObject(raw.flags) ? { ...raw.flags } : {},
    items: isPlainObject(raw.items) ? { ...raw.items } : {},
    level: Number.isInteger(raw.level) && raw.level >= 1 && raw.level <= 5 ? raw.level : 1,
    world: typeof raw.world === 'string' && raw.world ? raw.world : 'mondstadt',
    spawn: typeof raw.spawn === 'string' && raw.spawn ? raw.spawn : 'default',
    discoveredPage: raw.discoveredPage === true,
    endingSeen: raw.endingSeen === true,
    started: raw.started === true,
    playtime: Number.isFinite(raw.playtime) ? Math.max(0, raw.playtime) : 0,
  };

  // Integrity: never allow a level to be marked complete unless its predecessor
  // is also complete. This blocks a tampered save from skipping the story.
  const completed = [];
  for (const n of [1, 2, 3, 4, 5]) {
    if (state.completed.includes(n) && (n === 1 || completed.includes(n - 1))) completed.push(n);
  }
  state.completed = completed;

  // A level can never be active beyond one step past the furthest completion.
  const furthest = completed.length ? Math.max(...completed) : 0;
  state.level = Math.min(state.level, Math.min(5, furthest + 1));
  if (state.level < 1) state.level = 1;

  return state;
}

function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__asteria_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export class SaveManager {
  constructor(storage = null) {
    this.storage = storage || safeStorage();
    this.available = !!this.storage;
    this._pending = null;
    this._timer = null;
    this._lastWritten = '';
  }

  readRaw(key) {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  writeRaw(key, value) {
    if (!this.storage) return false;
    try {
      this.storage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn('[Save] unable to write to storage', err);
      return false;
    }
  }

  loadState() {
    const raw = this.readRaw(SAVE_KEY);
    if (!raw) return null;
    try {
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      console.warn('[Save] corrupted save, ignoring', err);
      return null;
    }
  }

  hasState() {
    const raw = this.readRaw(SAVE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return !!parsed && parsed.started === true;
    } catch {
      return false;
    }
  }

  saveState(state) {
    const payload = JSON.stringify({ ...state, version: SAVE_VERSION, updatedAt: Date.now() });
    if (payload === this._lastWritten) return;
    this._lastWritten = payload;
    this.writeRaw(SAVE_KEY, payload);
  }

  /**
   * Debounced save used during play (interactions can fire many times per
   * second). A final flush happens on pagehide/visibilitychange.
   */
  queueSave(state, delay = 700) {
    if (this._timer) clearTimeout(this._timer);
    this._pending = state;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._pending) {
        this.saveState(this._pending);
        this._pending = null;
      }
    }, delay);
  }

  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._pending) {
      this.saveState(this._pending);
      this._pending = null;
    }
  }

  clearState() {
    this.flush();
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this._lastWritten = '';
  }

  loadSettings() {
    const raw = this.readRaw(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
      const parsed = JSON.parse(raw);
      return normalizeSettings(parsed);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    this.writeRaw(SETTINGS_KEY, JSON.stringify(normalized));
  }
}

export function normalizeSettings(raw) {
  const base = { ...DEFAULT_SETTINGS };
  if (!isPlainObject(raw)) return base;
  const num = (v, fallback) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
  return {
    music: num(raw.music, base.music),
    ambient: num(raw.ambient, base.ambient),
    sfx: num(raw.sfx, base.sfx),
    muted: raw.muted === true,
    reducedMotion: raw.reducedMotion === true,
    invertY: raw.invertY === true,
    sensitivity: Number.isFinite(raw.sensitivity) ? Math.min(2, Math.max(0.35, raw.sensitivity)) : base.sensitivity,
    quality: ['auto', 'high', 'low'].includes(raw.quality) ? raw.quality : 'auto',
    hints: raw.hints !== false,
    minimap: raw.minimap !== false,
  };
}
