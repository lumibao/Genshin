/**
 * Headless smoke tests for Project Asteria.
 *
 * The sandbox this project was built in has no browser, so this harness does
 * two things instead:
 *   1. Exercises every world's build/update/dispose path against real Three.js
 *      geometry and materials, using a tiny fake canvas/DOM for procedural
 *      textures. This catches runtime errors in world code.
 *   2. Verifies the quest state machine, the reveal gate and the save system
 *      with the same pure modules the game uses.
 *
 * It does not test WebGL rendering, shader compilation or UI pixels.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ------------------------------------------------------------------ */
/* Minimal DOM / canvas shim                                          */
/* ------------------------------------------------------------------ */

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...names) { names.forEach((n) => this.set.add(n)); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); }
  toggle(name, force) {
    const has = this.set.has(name);
    const next = force === undefined ? !has : !!force;
    if (next) this.set.add(name); else this.set.delete(name);
    return next;
  }
  contains(name) { return this.set.has(name); }
}

function makeContext2D() {
  const gradient = { addColorStop() {} };
  const base = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', globalAlpha: 1,
    globalCompositeOperation: 'source-over', font: '10px serif', textAlign: 'start',
    textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: '#000',
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: () => {},
    measureText: () => ({ width: 12 }),
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {}, resetTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    arc() {}, arcTo() {}, ellipse() {}, rect() {}, roundRect() {}, fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    setLineDash() {}, getLineDash: () => [],
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeCanvas() {
  const canvas = {
    width: 512,
    height: 512,
    style: {},
    _ctx: null,
    getContext(type) {
      if (type !== '2d') return null;
      if (!this._ctx) {
        this._ctx = makeContext2D();
        this._ctx.canvas = this;
      }
      return this._ctx;
    },
    toDataURL: () => 'data:image/png;base64,',
    addEventListener() {}, removeEventListener() {},
  };
  return canvas;
}

function makeElement(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '',
    id: '',
    style: {},
    dataset: {},
    children: [],
    parentElement: null,
    textContent: '',
    innerHTML: '',
    offsetWidth: 100,
    offsetHeight: 100,
    classList: new FakeClassList(),
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    append(...children) { children.forEach((c) => this.appendChild(c)); },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); },
    remove() { this.parentElement?.removeChild?.(this); },
    replaceChildren(...children) { this.children = []; children.forEach((c) => this.appendChild(c)); },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    scrollTo() {}, scrollIntoView() {}, insertBefore() {}, cloneNode() { return makeElement(tag); },
    setPointerCapture() {}, releasePointerCapture() {},
  };
  return el;
}

const documentElements = new Map();

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  localStorage: null,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  location: { reload() {} },
  AudioContext: undefined,
  webkitAudioContext: undefined,
};

Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node-smoke-test', maxTouchPoints: 0 },
  configurable: true,
  writable: true,
});
globalThis.document = {
  body: makeElement('body'),
  documentElement: makeElement('html'),
  activeElement: null,
  hidden: false,
  pointerLockElement: null,
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : makeElement(tag)),
  createElementNS: (ns, tag) => makeElement(tag),
  getElementById: (id) => {
    if (!documentElements.has(id)) {
      const el = makeElement('div');
      el.id = id;
      documentElements.set(id, el);
    }
    return documentElements.get(id);
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  exitPointerLock() {},
  exitFullscreen() {},
  fullscreenElement: null,
};

globalThis.localStorage = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
})();
window.localStorage = globalThis.localStorage;
globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};
globalThis.Image = function Image() {};

if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

/* ------------------------------------------------------------------ */
/* Imports under test                                                 */
/* ------------------------------------------------------------------ */

const THREE = await import('three');
const { LEVELS } = await import('../src/story/questData.js');
const Progression = await import('../src/game/Progression.js');
const { createNewState, normalizeState, SaveManager } = await import('../src/game/SaveManager.js');
const { CollisionSystem } = await import('../src/game/CollisionSystem.js');
const { PlayerController } = await import('../src/game/PlayerController.js');
const { CameraController } = await import('../src/game/CameraController.js');
const { AncientBook } = await import('../src/worlds/AncientBook.js');
const worlds = {
  MondstadtWorld: (await import('../src/worlds/MondstadtWorld.js')).MondstadtWorld,
  WhisperingWoods: (await import('../src/worlds/WhisperingWoods.js')).WhisperingWoods,
  AncientRuins: (await import('../src/worlds/AncientRuins.js')).AncientRuins,
  SealedArchive: (await import('../src/worlds/ForgottenLibrary.js')).SealedArchive,
  HiddenLibrary: (await import('../src/worlds/ForgottenLibrary.js')).HiddenLibrary,
  CelestialObservatory: (await import('../src/worlds/CelestialObservatory.js')).CelestialObservatory,
  CelestialSanctuary: (await import('../src/worlds/CelestialSanctuary.js')).CelestialSanctuary,
};

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    results.push(`  ✗ ${name}\n      ${err?.stack?.split('\n').slice(0, 4).join('\n      ') || err}`);
  }
}

/* ------------------------------------------------------------------ */
/* Mock game used to build worlds                                     */
/* ------------------------------------------------------------------ */

function makeMockGame(stateOverrides = {}) {
  const state = {
    ...createNewState(),
    started: true,
    ...stateOverrides,
  };
  const noop = () => {};
  const game = {
    state,
    settings: { hints: true, minimap: true },
    renderer: { tier: 'high', isMobile: false },
    cameraController: {
      shake: noop,
      snapToPlayer: noop,
      getForward: () => ({ x: 0, z: -1 }),
      getRight: () => ({ x: 1, z: 0 }),
      yaw: 0,
      pitch: 0.2,
    },
    player: { position: new THREE.Vector3(0, 0, 0), visible: true, facing: 0, staminaRatio: 1 },
    collision: new CollisionSystem(),
    worlds: { current: null, getHeightAt: () => 0 },
    sceneManager: { addWorldGroup: noop, setAtmosphere: noop, clearWorld: noop },
    inventory: {
      items: {},
      count(id) { return this.items[id] || 0; },
      add(id, n = 1) { this.items[id] = (this.items[id] || 0) + n; return this.items[id]; },
      getEntries: () => [],
    },
    quests: {
      flags: state.flags,
      setFlag(k, v = true) { state.flags[k] = v; },
      hasFlag(k) { return !!state.flags[k]; },
      increment(k, n = 1) { state.flags[k] = (state.flags[k] || 0) + n; },
      refresh: noop,
    },
    hud: {
      toast: noop, showPuzzlePanel: noop, setPuzzleProgress: noop, hidePuzzlePanel: noop,
      setPrompt: noop, setChapter: noop, setLevel: noop, refreshWaypoint: noop,
      setVisible: noop, updateSoundButton: noop,
    },
    audio: { play: noop, setScene: noop, setIntensity: noop, update: noop },
    cinematics: { flashScreen: noop, showChapterCard: async () => {}, showWorldIntro: noop, completeChapter: async () => {} },
    dialogue: { play: async () => {} },
    levels: {
      requestTravel: async () => true,
      canTravelTo: () => ({ ok: true }),
      rewardFor: () => null,
    },
    openLore: noop,
    startEnding: async () => true,
    returnFromEnding: async () => true,
    secretReveal: { begin: async () => true, reopen: async () => true },
    bookUI: { open: async () => ({ closed: true }) },
    isInputBlocked: () => false,
    isMovementBlocked: () => false,
    input: {
      getMoveVector: () => ({ x: 0, y: 0 }),
      consumeLookDelta: () => ({ x: 0, y: 0 }),
      consumeZoom: () => 0,
      isDown: () => false,
      consumePress: () => false,
    },
    requestSave: noop,
    saveNow: noop,
    toast: noop,
    addBlocker: noop,
    removeBlocker: noop,
    bus: { on: noop, emit: noop },
  };
  game.worlds.current = null;
  return game;
}

/* ------------------------------------------------------------------ */
/* Progression tests                                                  */
/* ------------------------------------------------------------------ */

const levelFlags = {
  1: { L1_moved: true, L1_talkedWren: true, L1_chestOpened: true, L1_reported: true },
  2: {
    L2_enteredWoods: true, L2_foundRuins: true, L2_lit: 3, L2_puzzleSolved: true,
    L2_gateOpened: true, L2_fragmentFound: true,
  },
  3: {
    L3_entered: true, L3_symbolsSolved: true, L3_bookshelfUnlocked: true, L3_bookFound: true,
  },
  4: {
    L4_arrived: true, L4_stars: 3, L4_constellationSolved: true, L4_seal: true, L4_returned: true,
  },
  5: {
    L5_entered: true, L5_pedestalReached: true, L5_bookOpened: true, L5_messageRead: true,
  },
};

const levelItems = { 1: { windFragment: 3 }, 2: { archiveFragment: 1 }, 3: { chroniclePage: 3 }, 4: {}, 5: {} };

console.log('\nProject Asteria — headless smoke tests\n');

await test('quest data defines five chapters with objectives', () => {
  for (let i = 1; i <= 5; i++) {
    assert.ok(LEVELS[i], `chapter ${i} exists`);
    assert.ok(LEVELS[i].objectives.length >= 4, `chapter ${i} has objectives`);
  }
});

await test('level 1 objectives complete with the expected flags and items', () => {
  const ctx = Progression.makeContext(levelFlags[1], levelItems[1]);
  const progress = Progression.levelProgress(1, ctx);
  assert.equal(progress.allDone, true);
  assert.equal(progress.done, progress.total);
});

await test('level 1 stays incomplete while a fragment is missing', () => {
  const ctx = Progression.makeContext(levelFlags[1], { windFragment: 2 });
  assert.equal(Progression.levelProgress(1, ctx).allDone, false);
});

await test('every chapter completes with its intended progress state', () => {
  for (let i = 1; i <= 5; i++) {
    const ctx = Progression.makeContext(levelFlags[i], levelItems[i]);
    assert.equal(Progression.levelProgress(i, ctx).allDone, true, `chapter ${i} should complete`);
  }
});

await test('chapters unlock strictly one after another', () => {
  const state = createNewState();
  assert.equal(Progression.isLevelUnlocked(state, 1), true);
  assert.equal(Progression.isLevelUnlocked(state, 2), false);
  state.completed = [1];
  assert.equal(Progression.isLevelUnlocked(state, 2), true);
  assert.equal(Progression.isLevelUnlocked(state, 3), false);
  state.completed = [1, 2];
  assert.equal(Progression.isLevelUnlocked(state, 3), true);
  assert.equal(Progression.furthestUnlockedLevel(state), 3);
});

await test('level 5 is locked until chapter 4 is complete', () => {
  const state = createNewState();
  state.completed = [1, 2, 3];
  state.level = 4;
  assert.equal(Progression.isLevelUnlocked(state, 5), false);
  state.completed = [1, 2, 3, 4];
  assert.equal(Progression.isLevelUnlocked(state, 5), true);
});

await test('hidden page gate requires chapter 4, the seal, chapter 5 entry and opening the book', () => {
  const state = createNewState();
  state.completed = [1, 2, 3, 4];
  state.flags.L4_seal = true;
  state.flags.L5_entered = true;
  assert.equal(Progression.canRevealHiddenPage(state), false, 'book not yet opened');
  state.flags.L5_bookOpened = true;
  assert.equal(Progression.canRevealHiddenPage(state), true, 'all four conditions met');

  const noSeal = { ...state, flags: { ...state.flags, L4_seal: false } };
  assert.equal(Progression.canRevealHiddenPage(noSeal), false);
  const noChapter4 = { ...state, completed: [1, 2, 3] };
  assert.equal(Progression.canRevealHiddenPage(noChapter4), false);
  const noEntry = { ...state, flags: { ...state.flags, L5_entered: false } };
  assert.equal(Progression.canRevealHiddenPage(noEntry), false);
});

await test('the ending requires the discovered page and a read chronicle', () => {
  const state = createNewState();
  assert.equal(Progression.canEnterEnding(state), false);
  state.flags.L5_messageRead = true;
  assert.equal(Progression.canEnterEnding(state), false);
  state.discoveredPage = true;
  assert.equal(Progression.canEnterEnding(state), true);
});

/* ------------------------------------------------------------------ */
/* Save system tests                                                  */
/* ------------------------------------------------------------------ */

await test('save states round-trip through storage', () => {
  localStorage.clear();
  const manager = new SaveManager(globalThis.localStorage);
  const state = createNewState();
  state.started = true;
  state.level = 3;
  state.completed = [1, 2];
  state.flags.L3_entered = true;
  state.items.chroniclePage = 2;
  manager.saveState(state);
  const loaded = manager.loadState();
  assert.equal(loaded.level, 3);
  assert.deepEqual(loaded.completed, [1, 2]);
  assert.equal(loaded.flags.L3_entered, true);
  assert.equal(loaded.items.chroniclePage, 2);
  assert.equal(manager.hasState(), true);
  manager.clearState();
  assert.equal(manager.hasState(), false);
  assert.equal(manager.loadState(), null);
});

await test('tampered saves cannot skip chapters', () => {
  const tampered = normalizeState({
    started: true,
    level: 5,
    completed: [1, 3, 5],
    flags: {},
  });
  assert.deepEqual(tampered.completed, [1]);
  assert.ok(tampered.level <= 2, 'level is clamped to the furthest completion + 1');
  assert.equal(tampered.discoveredPage, false);
  assert.equal(tampered.endingSeen, false);
});

await test('settings normalize to safe ranges', () => {
  const manager = new SaveManager(globalThis.localStorage);
  manager.saveSettings({ music: 4, ambient: -2, sfx: 0.5, sensitivity: 99, quality: 'nope' });
  const loaded = manager.loadSettings();
  assert.equal(loaded.music, 1);
  assert.equal(loaded.ambient, 0);
  assert.equal(loaded.quality, 'auto');
  assert.ok(loaded.sensitivity <= 2);
});

/* ------------------------------------------------------------------ */
/* Collision tests                                                    */
/* ------------------------------------------------------------------ */

await test('circle collision pushes the player out of props', () => {
  const system = new CollisionSystem();
  system.setColliders([CollisionSystem.circle(0, 0, 1)], { x: 0, z: 0, radius: 10 });
  const position = { x: 0.4, z: 0 };
  const corrected = system.resolve(position, 0.4);
  assert.equal(corrected, true);
  assert.ok(Math.hypot(position.x, position.z) >= 1.399);
});

await test('box collision resolves and world bounds contain the player', () => {
  const system = new CollisionSystem();
  system.setColliders([CollisionSystem.box(2, 0, 1, 1)], { x: 0, z: 0, radius: 5 });
  const position = { x: 0.9, z: 0.2 };
  system.resolve(position, 0.4);
  assert.ok(position.x <= 0.61 || Math.abs(position.z) >= 1.39);
  const outside = { x: 9, z: 0 };
  system.resolve(outside, 0.4);
  assert.ok(Math.hypot(outside.x, outside.z) <= 5.01);
});

/* ------------------------------------------------------------------ */
/* World construction                                                 */
/* ------------------------------------------------------------------ */

for (const [name, WorldClass] of Object.entries(worlds)) {
  await test(`${name} builds, updates and disposes without errors`, async () => {
    const game = makeMockGame();
    const scene = new THREE.Scene();
    const world = new WorldClass({ game, level: 1, scene });
    await world.build();

    assert.ok(world.group.children.length > 5, 'world has content');
    assert.ok(world.heightAt(0, 0) !== undefined && Number.isFinite(world.heightAt(3, -2)), 'terrain height is finite');
    assert.ok(world.spawns.default, 'world exposes a default spawn');
    assert.ok(world.interactables.length >= 1, 'world has interactables');

    world.update(0.016, 1.2);
    world.update(0.016, 1.6);

    const scene2 = new THREE.Scene();
    scene2.add(world.group);
    world.dispose();
    assert.ok(true);
  });
}

await test('Mondstadt chapters expose the full level 1 interaction set', async () => {
  const game = makeMockGame();
  const world = new worlds.MondstadtWorld({ game, level: 1 });
  await world.build();
  const ids = world.interactables.map((i) => i.id);
  for (const required of ['wren', 'chest', 'shrine', 'wind-gate']) {
    assert.ok(ids.includes(required), `missing interactable ${required}`);
  }
  assert.equal(ids.filter((id) => id.startsWith('fragment-')).length, 3);
  assert.ok(world.colliders.length > 10, 'meadow has collision');
  assert.ok(world.markers.some((m) => m.type === 'npc'), 'Wren appears on the minimap');
});

await test('ruins puzzle only opens the gate on the correct order', async () => {
  const game = makeMockGame();
  const world = new worlds.AncientRuins({ game, level: 2 });
  await world.build();

  // Wrong first input resets and does not solve.
  world.activateMechanism('north');
  assert.equal(world.step, 0);
  assert.equal(world.solved, false);

  world.activateMechanism('east');
  world.activateMechanism('north');
  assert.equal(world.solved, false);
  world.activateMechanism('south');
  assert.equal(world.solved, true);
  assert.equal(game.state.flags.L2_puzzleSolved, true);
  assert.equal(game.state.flags.L2_gateOpened, true);

  // The fragment can now be collected through its interaction.
  const fragment = world.interactables.find((i) => i.id === 'ruin-fragment');
  await fragment.action();
  assert.equal(game.state.flags.L2_fragmentFound, true);
});

await test('archive puzzle matches pages to pedestals and unlocks the shelf', async () => {
  const game = makeMockGame();
  const world = new worlds.SealedArchive({ game, level: 3 });
  await world.build();

  const pages = world.interactables.filter((i) => i.id.startsWith('page-'));
  assert.equal(pages.length, 3);
  for (const page of pages) await page.action();
  assert.equal(game.inventory.count('chroniclePage'), 3);

  // Trying a pedestal before its page exists is impossible now, but the
  // matching logic should still solve when all three are placed.
  for (const id of ['moon', 'star', 'wind']) {
    const pedestal = world.interactables.find((i) => i.id === `pedestal-${id}`);
    await pedestal.action();
  }
  assert.equal(game.state.flags.L3_symbolsSolved, true);
  assert.equal(game.state.flags.L3_bookshelfUnlocked, true);
});

await test('observatory constellation accepts only the intended sequence', async () => {
  const game = makeMockGame();
  const world = new worlds.CelestialObservatory({ game, level: 4 });
  await world.build();

  // Light all three star mechanisms.
  for (const id of [0, 1, 2]) {
    const mechanism = world.interactables.find((i) => i.id === `star-mechanism-${id}`);
    await mechanism.action();
  }
  assert.equal(world.starsLit, 3);

  // Wrong order fails.
  const pylon = (n) => world.interactables.find((i) => i.id === `star-pylon-${n}`);
  await pylon(1).action();
  assert.equal(world.traceStep, 0);
  assert.equal(world.solved, false);

  // Correct order: 0, 2, 1, 3.
  for (const n of [0, 2, 1, 3]) await pylon(n).action();
  assert.equal(world.solved, true);
  assert.equal(game.state.flags.L4_constellationSolved, true);

  const seal = world.interactables.find((i) => i.id === 'celestial-seal');
  await seal.action();
  assert.equal(game.state.flags.L4_seal, true);
  assert.equal(game.inventory.count('celestialSeal'), 1);
});

await test('hidden library requires the reveal gate before exposing the page', async () => {
  const game = makeMockGame({ completed: [1, 2, 3], flags: { L4_seal: true, L5_entered: true } });
  const world = new worlds.HiddenLibrary({ game, level: 5 });
  await world.build();
  const book = world.interactables.find((i) => i.id === 'unwritten-chronicle');
  assert.ok(book, 'book is interactable');
  assert.ok(world.book instanceof AncientBook);
  assert.equal(game.state.discoveredPage, false);
  assert.equal(Progression.canRevealHiddenPage(game.state), false);
});

await test('the physical book opens on a spine-mounted hinge with visible pages', async () => {
  const book = new AncientBook({ sealed: true });
  assert.ok(book.coverPivot, 'cover has a pivot');
  assert.ok(book.hiddenPage, 'hidden page exists');
  const closedRotation = book.coverPivot.rotation.z;
  const opening = book.open();
  for (let i = 0; i < 200; i++) book.update(0.02);
  await opening;
  assert.ok(book.coverPivot.rotation.z > closedRotation + 1, 'cover swings open');
  assert.equal(book.hiddenPage.visible, true);
  assert.equal(book.isOpen, true);
  assert.ok(book.light.intensity > 0, 'warm light emerges from the pages');
});

await test('player controller initialises and can teleport onto terrain', () => {
  const game = makeMockGame();
  game.worlds.getHeightAt = (x, z) => Math.sin(x * 0.1) * 0.5 + Math.cos(z * 0.1) * 0.5;
  const player = new PlayerController(game);
  player.setVisible(true);
  player.teleport(2, 3, Math.PI);
  assert.ok(Math.abs(player.position.y - game.worlds.getHeightAt(2, 3)) < 0.2);
  player.update(0.016, 0.016);
  assert.equal(Number.isFinite(player.position.x), true);
});

await test('the traveler wears a look: cape, dye, charm and the companion wisp', () => {
  const game = makeMockGame();
  const player = new PlayerController(game);
  player.setVisible(true);

  player.applyLooks({
    cape: { color: '#8f4436' },
    dye: { color: '#2f5f9c', deep: '#1d3d68' },
    charm: { color: '#fff3c9', emissive: '#ffcc66' },
    companion: { color: '#ffd9b0', emissive: '#ff9a58', scale: 1.15 },
    title: 'Starwarden',
  });
  assert.equal(player.capeMaterial.color.getHexString(), '8f4436');
  assert.equal(player.materials.accent.color.getHexString(), '2f5f9c');
  assert.equal(player.charmMaterial.emissive.getHexString(), 'ffcc66');
  assert.equal(player.companion.visible, true);
  assert.equal(player.wornLooks.title, 'Starwarden');

  player.update(0.016, 0.016);
  assert.ok(Number.isFinite(player.companion.position.y), 'the wisp hovers without blowing up');

  // An empty look set restores the traveler's own clothes.
  player.applyLooks({});
  assert.equal(player.companion.visible, false);
  assert.equal(player.materials.accent.color.getHexString(), '2f6d78');
  assert.equal(player.capeMaterial.color.getHexString(), '295f6b');
});

await test('third-person camera responds to look and keeps a finite position', () => {
  const game = makeMockGame();
  game.renderer.width = 1280;
  game.renderer.height = 720;
  game.input = {
    consumeLookDelta: () => ({ x: 0.1, y: 0.02 }),
    consumeZoom: () => 0,
    isDown: () => false,
  };
  game.player = { position: new THREE.Vector3(0, 0, 0), facing: 0, staminaRatio: 1, visible: true };
  game.worlds = { getHeightAt: () => 0, getCameraObstacles: () => [] };
  const camera = new CameraController(game);
  const before = camera.yaw;
  camera.update(0.016);
  assert.notEqual(camera.yaw, before);
  assert.ok(Number.isFinite(camera.camera.position.x));
});

/* ------------------------------------------------------------------ */
/* Real managers wired together (chapter flow)                        */
/* ------------------------------------------------------------------ */

const { EventBus } = await import('../src/game/EventBus.js');
const { InventoryManager } = await import('../src/game/InventoryManager.js');
const { QuestManager } = await import('../src/game/QuestManager.js');
const { LevelManager } = await import('../src/game/LevelManager.js');

/**
 * A Game stand-in with the *real* inventory, quest and level managers wired to
 * the real event bus. This exercises the same code path the game uses when a
 * world flag completes a chapter.
 */
function makeFlowGame({ level = 1, completed = [], flags = {}, items = {} } = {}) {
  const state = {
    ...createNewState(),
    started: true,
    level,
    completed: [...completed],
    flags: { ...flags },
    items: { ...items },
  };
  const bus = new EventBus();
  const noop = () => {};
  const game = {
    state,
    bus,
    settings: { hints: true, minimap: true, reducedMotion: true },
    renderer: { tier: 'high', isMobile: false },
    audio: { play: noop, setScene: noop, setIntensity: noop, update: noop },
    hud: {
      renderQuest: noop, toast: noop, setPrompt: noop, setChapter: noop,
      setLevel: noop, showPuzzlePanel: noop, setPuzzleProgress: noop,
      hidePuzzlePanel: noop, updateSoundButton: noop,
    },
    cinematics: {
      flashScreen: noop,
      completeChapter: async () => {},
      showChapterCard: noop,
      showWorldIntro: noop,
    },
    dialogue: { play: async () => {} },
    cameraController: { shake: noop, snapToPlayer: noop },
    player: { position: new THREE.Vector3(0, 0, 0), visible: true },
    collision: new CollisionSystem(),
    worlds: { current: null, getHeightAt: () => 0 },
    sceneManager: { addWorldGroup: noop, setAtmosphere: noop, clearWorld: noop },
    openLore: noop,
    startEnding: async () => true,
    returnFromEnding: async () => true,
    secretReveal: { begin: async () => true, reopen: noop },
    requestSave: noop,
    saveNow: noop,
    addBlocker: noop,
    removeBlocker: noop,
    isInputBlocked: () => false,
    isMovementBlocked: () => false,
    input: { getMoveVector: () => ({ x: 0, y: 0 }) },
    travelToWorld: async () => true,
  };
  game.inventory = new InventoryManager(game);
  game.quests = new QuestManager(game);
  game.levels = new LevelManager(game);
  game.quests.start();
  return game;
}

/* ------------------------------------------------------------------ */
/* The secret message module                                          */
/* ------------------------------------------------------------------ */

await test('secretMessage defines clearly marked personal placeholders', async () => {
  const secret = await import('../src/story/secretMessage.js');
  assert.ok(secret.PERSONAL.herName.includes('[HER NAME]'));
  assert.ok(secret.PERSONAL.yourName.includes('[YOUR NAME]'));
  assert.ok(secret.PERSONAL.specialDate.includes('[SPECIAL DATE]'));
  assert.equal(secret.hasUnreplacedPlaceholders(), true);
  const pages = secret.buildPages();
  assert.equal(pages.length >= 2, true);
  const filled = secret.fillTokens('For {her}, from {you} on {date}.');
  assert.ok(filled.includes('[HER NAME]'));
  assert.equal(filled.includes('{her}'), false);
});

await test('secretMessage chunk is not imported by the initial entry bundle', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.equal(/secretMessage/.test(source), false, 'main.js must not import the secret module');
  const reveal = readFileSync(new URL('../src/story/SecretReveal.js', import.meta.url), 'utf8');
  assert.ok(/await import\(['"]\.\/secretMessage\.js['"]\)/.test(reveal), 'SecretReveal loads it dynamically');
});

/* ------------------------------------------------------------------ */
/* Chapter flow: worlds -> flags -> quests -> chapter completion      */
/* ------------------------------------------------------------------ */

await test('chapter I can be completed through world interactions alone', async () => {
  const game = makeFlowGame();
  const world = new worlds.MondstadtWorld({ game, level: 1 });
  await world.build();
  game.worlds.current = world;

  game.quests.setFlag('L1_moved', true);
  assert.equal(game.state.completed.length, 0);

  // Talk to Wren: starts the quest.
  await world.interactables.find((i) => i.id === 'wren').action();
  assert.equal(game.state.flags.L1_talkedWren, true);

  // Gather all three fragments.
  for (let i = 0; i < 3; i++) {
    await world.interactables.find((it) => it.id === `fragment-${i}`).action();
  }
  assert.equal(game.inventory.count('windFragment'), 3);

  // Open the chest.
  await world.interactables.find((i) => i.id === 'chest').action();
  assert.equal(game.state.flags.L1_chestOpened, true);
  assert.equal(game.inventory.count('archiveKey'), 1, 'the key is not duplicated by the chapter reward');

  // Report back: completes the chapter.
  await world.interactables.find((i) => i.id === 'wren').action();
  assert.equal(game.state.flags.L1_reported, true);
  assert.deepEqual(game.state.completed, [1]);
  assert.equal(game.state.flags.L1_complete, true);
  assert.equal(game.levels.canTravelTo('whisperingWoods').ok, true);
});

await test('the archive stair stays sealed until chapter II is finished', () => {
  const game = makeFlowGame({ level: 1, completed: [1] });
  assert.equal(game.levels.canTravelTo('archive').ok, false);
  game.state.completed = [1, 2];
  assert.equal(game.levels.canTravelTo('archive').ok, true);
});

await test('the observatory refuses entry before chapter III is finished', () => {
  const game = makeFlowGame({ level: 2, completed: [1, 2] });
  assert.equal(game.levels.canTravelTo('observatory').ok, false);
  game.state.completed = [1, 2, 3];
  assert.equal(game.levels.canTravelTo('observatory').ok, true);
});

await test('the hidden library needs chapter IV and the seal', () => {
  const game = makeFlowGame({ level: 4, completed: [1, 2, 3, 4] });
  assert.equal(game.levels.canTravelTo('hiddenLibrary').ok, false);
  game.state.flags.L4_seal = true;
  assert.equal(game.levels.canTravelTo('hiddenLibrary').ok, true);
});

await test('the sanctuary stays closed until the hidden page is read', () => {
  const game = makeFlowGame({ level: 5, completed: [1, 2, 3, 4, 5] });
  assert.equal(game.levels.canTravelTo('sanctuary').ok, false);
  game.state.discoveredPage = true;
  assert.equal(game.levels.canTravelTo('sanctuary').ok, false, 'reading the page is also required');
  game.state.flags.L5_messageRead = true;
  assert.equal(game.levels.canTravelTo('sanctuary').ok, true);
});

await test('entering the observatory records the arrival flag and chapter', () => {
  const game = makeFlowGame({ level: 3, completed: [1, 2] });
  assert.equal(game.levels.canTravelTo('observatory').ok, false);
  game.state.completed = [1, 2, 3];
  assert.equal(game.levels.canTravelTo('observatory').ok, true);
  game.levels.onWorldEntered('observatory');
  assert.equal(game.state.flags.L4_arrived, true);
  assert.equal(game.state.level, 4);
  assert.deepEqual(game.quests.chapterLabel(), { kicker: 'Chapter IV', title: 'The Celestial Trial' });
});

await test('entering the hidden library pins the journey to chapter V', () => {
  const game = makeFlowGame({ level: 4, completed: [1, 2, 3, 4], flags: { L4_seal: true } });
  game.levels.onWorldEntered('hiddenLibrary');
  assert.equal(game.state.level, 5);
  assert.equal(game.state.flags.L5_entered, true);
});

/* ------------------------------------------------------------------ */
/* The Wanderer's Ledger: wallet, stock and the wishing star          */
/* ------------------------------------------------------------------ */

const { ShopManager } = await import('../src/game/ShopManager.js');
const shopData = await import('../src/story/shopData.js');

function makeShopGame({ mora = null } = {}) {
  const state = { ...createNewState(), started: true };
  const bus = new EventBus();
  const applied = [];
  const game = {
    state,
    bus,
    hud: { toast() {}, setTitleTag() {} },
    audio: { play() {} },
    inventory: { add() {} },
    player: { applyLooks: (looks) => applied.push(looks) },
    requestSave() {},
    saveNow() {},
    applied,
  };
  game.shop = new ShopManager(game);
  if (Number.isFinite(mora)) game.shop.wallet.mora = mora;
  return game;
}

await test('a new adventure starts with a purse, and the wallet survives a save round-trip', () => {
  const fresh = createNewState();
  assert.equal(fresh.wallet.mora, shopData.STARTING_MORA);
  assert.deepEqual(fresh.wallet.owned, []);
  assert.deepEqual(fresh.wallet.equipped, {});

  const saved = normalizeState({
    ...fresh,
    started: true,
    wallet: {
      mora: 321,
      owned: ['look.cape.ember', 'look.not-a-real-look'],
      purchased: ['cape.ember', 'nonsense'],
      pity: 7,
      wishes: 4,
      equipped: { cape: 'look.cape.ember', title: 'look.cape.ember', bogus: 'look.cape.ember' },
    },
  });
  assert.equal(saved.wallet.mora, 321);
  assert.deepEqual(saved.wallet.owned, ['look.cape.ember'], 'unknown looks are dropped');
  assert.deepEqual(saved.wallet.purchased, ['cape.ember'], 'unknown stock is dropped');
  assert.deepEqual(saved.wallet.equipped, { cape: 'look.cape.ember' }, 'only owned looks in their own slot stay worn');
  assert.equal(saved.wallet.pity, 7);
});

await test('buying a look spends mora, records it and dresses the traveler', () => {
  const game = makeShopGame({ mora: 500 });
  const result = game.shop.buy('cape.ember');
  assert.equal(result.ok, true);
  assert.equal(game.shop.mora, 340);
  assert.ok(game.shop.owns('look.cape.ember'));
  assert.equal(game.shop.isEquipped('look.cape.ember'), true);
  assert.equal(game.state.wallet.equipped.cape, 'look.cape.ember');

  // The model is repainted with the cape's own colour, not the default teal.
  const last = game.applied[game.applied.length - 1];
  assert.equal(last.cape.color, '#8f4436');

  // Buying the same ware twice is refused rather than double-charging.
  const again = game.shop.buy('cape.ember');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'owned');
  assert.equal(game.shop.mora, 340);
});

await test('an empty purse cannot buy, and stock never touches story items', () => {
  const game = makeShopGame({ mora: 10 });
  const denied = game.shop.buy('title.starwarden');
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'mora');
  assert.equal(game.shop.mora, 10);

  const storyIds = ['windFragment', 'archiveKey', 'archiveMap', 'archiveFragment', 'chroniclePage', 'starlitSigil', 'celestialSeal'];
  for (const item of shopData.SHOP_ITEMS) {
    assert.equal(storyIds.includes(item.id), false, `${item.id} must never be a story item`);
    assert.ok(shopData.LOOKS[item.look], `${item.id} points at a real look`);
    assert.equal(shopData.slotForLook(item.look), shopData.LOOKS[item.look].slot);
  }
});

await test('wishes never repeat a look until the pool is exhausted', () => {
  const game = makeShopGame({ mora: 100000 });
  const seen = new Set();
  for (let i = 0; i < shopData.WISH_POOL.length; i++) {
    const result = game.shop.wish(1, { roll: () => 0.42 });
    assert.equal(result.ok, true);
    const [entry] = result.results;
    assert.equal(entry.duplicate, false, 'a duplicate arrived before the pool ran out');
    assert.equal(seen.has(entry.look), false);
    seen.add(entry.look);
  }
  assert.equal(seen.size, shopData.WISH_POOL.length);
  assert.equal(game.shop.unlockedCount, game.shop.totalLooks);
});

await test('pity guarantees a legendary and then resets', () => {
  const game = makeShopGame({ mora: 100000 });
  game.shop.wallet.pity = shopData.PITY_LIMIT - 1;
  const result = game.shop.wish(1, { roll: () => 0.999 });
  const [entry] = result.results;
  assert.equal(entry.rarity, 'legendary', 'the pity draw must be legendary');
  assert.equal(entry.pityHit, true);
  assert.equal(game.shop.pity, 0, 'pity resets after a legendary');

  // And a guaranteed pull is advertised correctly.
  game.shop.wallet.pity = 3;
  assert.equal(game.shop.pityRemaining, shopData.PITY_LIMIT - 3);
});

await test('duplicates convert into mora once every look is owned', () => {
  const game = makeShopGame({ mora: 100000 });
  game.shop.wish(10, { roll: () => 0.42 });
  while (game.shop.unlockedCount < game.shop.totalLooks) game.shop.wish(1, { roll: () => 0.42 });

  const before = game.shop.mora;
  const result = game.shop.wish(1, { roll: () => 0.1 });
  const [entry] = result.results;
  assert.equal(entry.duplicate, true);
  assert.equal(entry.refund, shopData.DUPLICATE_REFUND);
  assert.equal(game.shop.mora, before - shopData.WISH_COST + shopData.DUPLICATE_REFUND);
});

await test('a ten-pull costs the bundle price and returns ten results', () => {
  const game = makeShopGame({ mora: 1000 });
  const before = game.shop.mora;
  const result = game.shop.wish(10, { roll: () => 0.5 });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 10);
  assert.equal(result.cost, shopData.WISH_COST_TEN);
  assert.equal(game.shop.mora, before - shopData.WISH_COST_TEN);
});

await test('wearing a look is reversible, and resetLooks restores the traveler', () => {
  const game = makeShopGame({ mora: 500 });
  game.shop.buy('charm.wind');
  assert.equal(game.shop.getLooks().charm.color, '#d8efbe');
  game.shop.resetLooks();
  assert.deepEqual(game.shop.getLooks(), { title: null, cape: null, charm: null, dye: null, companion: null });
  assert.deepEqual(game.shop.wallet.equipped, {});
});

await test('the ruins puzzle has three mechanisms, a compass, and no fourth pillar', async () => {
  const game = makeMockGame();
  const world = new worlds.AncientRuins({ game, level: 2 });
  await world.build();

  assert.deepEqual(Object.keys(world.mechanisms).sort(), ['east', 'north', 'south']);
  assert.equal(world.mechanisms.west, undefined, 'there is no western mechanism');

  // Every direction is written on the floor and above each mechanism, so a
  // player never has to guess which pillar is which.
  for (const letter of ['N', 'S', 'E', 'W', 'MURAL']) {
    assert.ok(
      Object.keys(world._letterCache || {}).some((key) => key.startsWith(`${letter}|`)),
      `the floor compass is missing ${letter}`,
    );
  }
  for (const [id, letter] of [['east', 'E'], ['north', 'N'], ['south', 'S']]) {
    const prompt = world.interactables.find((entry) => entry.id === `mechanism-${id}`).prompt();
    assert.ok(prompt.includes(id) && prompt.includes(`(${letter})`), `prompt for ${id} names its direction: ${prompt}`);
  }
});

/* ------------------------------------------------------------------ */
/* Reachability, the chapter rescue route and the cel-shaded traveler  */
/* ------------------------------------------------------------------ */

const { nextDestination } = await import('../src/game/Progression.js');

await test('every interactable can be reached from outside its own colliders', async () => {
  const worldsToAudit = [
    ['MondstadtWorld', worlds.MondstadtWorld, 1],
    ['WhisperingWoods', worlds.WhisperingWoods, 2],
    ['AncientRuins', worlds.AncientRuins, 2],
    ['SealedArchive', worlds.SealedArchive, 3],
    ['CelestialObservatory', worlds.CelestialObservatory, 4],
    ['HiddenLibrary', worlds.HiddenLibrary, 5],
  ];
  const PLAYER_RADIUS = 0.42;

  for (const [name, WorldClass, level] of worldsToAudit) {
    const game = makeMockGame();
    const world = new WorldClass({ game, level });
    await world.build();

    for (const item of world.interactables) {
      const p = item.position || {};
      const radius = item.radius || 2.4;

      // How far outside the geometry must a player stand to touch this point?
      // The binding constraint is the *outermost* collider that contains it;
      // a small pedestal inside a larger dais ring cannot be reached through
      // the ring, which is exactly the bug this test exists to catch.
      let required = 0;
      for (const c of world.colliders) {
        let inside = false;
        let toEdge = 0;
        if (c.type === 'circle') {
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          inside = d < c.r;
          toEdge = c.r - d;
        } else {
          const dx = Math.abs(p.x - c.x);
          const dz = Math.abs(p.z - c.z);
          inside = dx < c.halfW && dz < c.halfD;
          toEdge = Math.min(c.halfW - dx, c.halfD - dz);
        }
        if (inside) required = Math.max(required, toEdge + PLAYER_RADIUS);
      }

      assert.ok(
        radius >= required + 0.2,
        `${name}: "${item.id}" can only be reached from ${required.toFixed(2)} away, but its radius is ${radius}`,
      );
    }
  }
});

await test('a player can physically walk from the library door to the chronicle', async () => {
  // Regression for the Chapter V dead end: the dais used to be a solid 4.5
  // radius wall, so the pedestal stayed 4.92 away and the book could never be
  // opened on foot. Walk the real controller over the real collision set.
  const game = makeMockGame({ level: 5 });
  game.state.flags = {};
  game.worlds = { getHeightAt: () => 0 };
  const world = new worlds.HiddenLibrary({ game, level: 5 });
  await world.build();

  const collision = new CollisionSystem();
  collision.setColliders(world.colliders, world.bounds);
  game.collision = collision;
  game.cameraController = {
    getForward: () => ({ x: 0, z: -1 }),
    getRight: () => ({ x: 1, z: 0 }),
    snapToPlayer: () => {},
  };
  game.input = {
    getMoveVector: () => ({ x: 0, y: 1 }),
    isDown: () => false,
    consumePress: () => false,
    endFrame: () => {},
  };
  game.worlds.getHeightAt = (x, z) => world.heightAt(x, z);

  const player = new PlayerController(game);
  game.player = player;
  player.setVisible(true);
  player.teleport(0, 13, Math.PI);

  const book = world.interactables.find((i) => i.id === 'unwritten-chronicle');
  for (let step = 0; step < 600; step++) {
    player.update(1 / 60, step / 60);
    world.update(1 / 60, step / 60);
  }

  const distance = Math.hypot(player.position.x - book.position.x, player.position.z - book.position.z);
  assert.ok(
    distance < book.radius,
    `the traveler stalled ${distance.toFixed(2)} from the chronicle (radius ${book.radius})`,
  );
  assert.ok(distance < 3.2, `walked into the pedestal: stopped ${distance.toFixed(2)} away`);
  assert.ok(world.heightAt(0, -6) > 0.2, 'the dais lifts the player instead of blocking them');
});

await test('the ruins survive a chapter-complete event at any build stage', async () => {
  const game = makeMockGame();
  const world = new worlds.AncientRuins({ game, level: 2 });
  // Fired before build(): the rune does not exist yet, and that must be safe.
  world.onLevelComplete(2);
  await world.build();
  world.onLevelComplete(2);
  assert.ok(world._stairRuneDisc, 'the stair rune disc is remembered, not its group');
  assert.equal(world._stairRuneDisc.material.opacity, 0.7);
});

await test('the rescue route always points at the next reachable chapter', () => {
  const base = () => ({ ...createNewState(), started: true });

  const fresh = base();
  assert.equal(nextDestination(fresh).world, 'mondstadt');

  const afterOne = { ...base(), completed: [1], level: 2 };
  assert.equal(nextDestination(afterOne).world, 'ancientRuins');

  const afterThree = { ...base(), completed: [1, 2, 3], level: 4 };
  assert.equal(nextDestination(afterThree).world, 'observatory');

  const sealInHand = { ...base(), completed: [1, 2, 3, 4], level: 4, flags: { L4_seal: true } };
  assert.equal(nextDestination(sealInHand).world, 'archive', 'the return trip completes chapter IV');

  const returned = { ...base(), completed: [1, 2, 3, 4], level: 5, flags: { L4_seal: true, L4_returned: true } };
  assert.equal(nextDestination(returned).world, 'hiddenLibrary');

  const revealed = { ...base(), completed: [1, 2, 3, 4], level: 5, discoveredPage: true };
  assert.equal(nextDestination(revealed).world, 'hiddenLibrary');
});

await test('the traveler is cel-shaded, outlined and still fully re-paintable', () => {
  const game = makeMockGame();
  const player = new PlayerController(game);

  const toonMaterials = [];
  const outlines = [];
  player.model.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData.isOutline) outlines.push(obj);
    else if (obj.material?.isMeshToonMaterial) toonMaterials.push(obj.material);
  });

  assert.ok(toonMaterials.length > 10, 'the body uses toon materials');
  assert.ok(outlines.length > 5, 'the silhouette has inverted-hull outlines');
  assert.ok(player._gradientMap, 'a shared gradient ramp bands the shading');

  // Anime face furniture.
  assert.ok(player.eyes?.children.length === 2, 'two eyes');
  // The ponytail is a chain: segment one holds two nested segments plus the tie.
  const nest = player.ponytail?.children?.find((child) => child.isGroup);
  assert.ok(nest, 'the ponytail hangs from a joint that can swing');
  assert.ok(nest.children.some((child) => child.isGroup), 'the chain keeps nesting so it can flutter');

  // Looks still reach the exact materials the shop writes to.
  player.applyLooks({ dye: { color: '#2f5f9c', deep: '#1d3d68' }, cape: { color: '#8f4436' } });
  assert.equal(player.materials.accent.color.getHexString(), '2f5f9c');
  assert.equal(player.capeMaterial.color.getHexString(), '8f4436');
});

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
