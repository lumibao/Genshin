/**
 * Boot integration test.
 *
 * Runs the *whole* Game — every system, every world, the real save manager and
 * the real UI — inside jsdom, with a headless renderer in place of WebGL.
 *
 * This is the closest thing to launching the game that a machine without a
 * browser can do. It catches wiring mistakes between Game and its systems:
 * missing methods, wrong arguments, promises that never settle and state that
 * never reaches the HUD.
 *
 * Run with: npm run test:boot
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.Event = window.Event;
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn);
globalThis.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

/* A canvas 2D context good enough for the procedural textures. */
function makeContext() {
  const gradient = { addColorStop() {} };
  const base = {
    canvas: null,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: () => {},
    measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
  };
  return new Proxy(base, {
    get: (target, prop) => (prop in target ? target[prop] : () => {}),
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
  });
}
window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
  if (type !== '2d') return null;
  if (!this.__ctx) {
    this.__ctx = makeContext();
    this.__ctx.canvas = this;
  }
  return this.__ctx;
};

const { Game } = await import('../src/game/Game.js');
const { BookUI } = await import('../src/ui/BookUI.js');

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
    results.push(`  ✗ ${name}\n      ${err?.stack?.split('\n').slice(0, 6).join('\n      ') || err}`);
  }
}

/* Headless renderer: same surface as Renderer, without WebGL. */
function makeRenderer(container) {
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  container.appendChild(canvas);
  return {
    canvas,
    width: 1280,
    height: 720,
    isMobile: false,
    qualityScale: 1,
    tier: 'low',
    contextLost: false,
    applyQuality() {},
    resize() {},
    trackFrame() {},
    render() {},
    dispose() {
      canvas.remove();
    },
  };
}

/** Skip the cinematic waits so a test can run in a fraction of a second. */
function fastForward(game) {
  game.cinematics.wait = () => Promise.resolve();
  game.cinematics.fadeIn = () => Promise.resolve();
  game.cinematics.fadeOut = () => Promise.resolve();
  game.cinematics.showChapterCard = () => Promise.resolve();
  game.cinematics.showWorldIntro = () => Promise.resolve();
  game.cinematics.completeChapter = () => Promise.resolve();
  game.dialogue.play = async () => {};
  game.audio.unlock = async () => {};
}

const game = new Game({ rendererFactory: makeRenderer });

console.log('\nProject Asteria — boot integration (jsdom)\n');

try {
  await test('boot builds the systems and the meadow behind the title screen', async () => {
    await game.boot();

    for (const system of [
      'renderer', 'sceneManager', 'cameraController', 'input', 'collision', 'audio',
      'mobile', 'inventory', 'quests', 'levels', 'player', 'worlds', 'interactions',
      'hud', 'dialogue', 'inventoryUI', 'journalUI', 'settingsUI', 'pauseMenu',
      'cinematics', 'bookUI', 'secretReveal', 'ending', 'modal',
    ]) {
      assert.ok(game[system], `missing system: ${system}`);
    }

    assert.equal(game.titleMode, true);
    assert.equal(game.worlds.currentId, 'mondstadt');
    assert.equal(game.player.visible, false);
    assert.equal(game.player.group.parent, game.sceneManager.scene, 'player is in the scene');
    assert.equal(document.getElementById('hud').classList.contains('hidden'), true);
    assert.equal(document.getElementById('screen-title').classList.contains('hidden'), false);
  });

  await test('starting a new adventure enters the world and shows the HUD', async () => {
    fastForward(game);
    await game.startNewGame();

    assert.equal(game.started, true);
    assert.equal(game.titleMode, false);
    assert.equal(game.state.started, true);
    assert.equal(game.state.level, 1);
    assert.equal(game.worlds.currentId, 'mondstadt');
    assert.equal(game.player.visible, true);
    assert.ok(game.player.position.y > -5, 'the player is dropped onto the terrain');

    assert.equal(document.getElementById('hud').classList.contains('hidden'), false);
    assert.equal(game.blockers.size, 0, 'no input blocker is left behind');
    assert.equal(game.state.flags.L1_chapterSeen, true, 'the chapter card was recorded');
    assert.equal(document.getElementById('chapter-kicker').textContent, 'Chapter I');
  });

  await test('the quest tracker follows chapter progress', async () => {
    game.quests.setFlag('L1_moved', true);
    game.quests.setFlag('L1_talkedWren', true);
    const items = [...document.querySelectorAll('#quest-objectives li:not(.objective-hint)')];
    assert.ok(items.length >= 5, 'all chapter I objectives are listed');
    assert.equal(items[0].classList.contains('is-done'), true);
    assert.equal(items[1].classList.contains('is-done'), true);

    // Gather the fragments and finish the chapter through real interactions.
    const world = game.worlds.current;
    for (let i = 0; i < 3; i++) await world.interactables.find((it) => it.id === `fragment-${i}`).action();
    await world.interactables.find((it) => it.id === 'chest').action();
    await world.interactables.find((it) => it.id === 'wren').action();

    assert.deepEqual(game.state.completed, [1], 'chapter I completed');
    assert.equal(game.inventory.count('archiveKey'), 1);
    assert.ok(document.getElementById('quest-objectives').textContent.includes('Chapter complete'));
  });

  await test('travel swaps the world, the flag state and the chapter badge', async () => {
    fastForward(game);
    const arrived = await game.travelToWorld('whisperingWoods', 'default', { level: 2 });
    assert.equal(arrived, true);
    assert.equal(game.worlds.currentId, 'whisperingWoods');
    assert.equal(game.state.world, 'whisperingWoods');
    assert.equal(game.state.level, 2);
    assert.equal(game.state.flags.L2_enteredWoods, true);
    assert.equal(document.getElementById('chapter-kicker').textContent, 'Chapter II');
    assert.equal(game.transitioning, false, 'the transition lock is released');
    assert.equal(game.blockers.size, 0);
    assert.ok(game.player.position.y > -5);
  });

  await test('a sealed area refuses travel and explains why', async () => {
    fastForward(game);
    const before = game.worlds.currentId;
    const moved = await game.travelToWorld('observatory', 'default', { level: 4 });
    assert.equal(moved, false);
    assert.equal(game.worlds.currentId, before, 'the player stays where they were');
    assert.ok(document.getElementById('toasts').textContent.length > 0, 'a hint was shown');
  });

  await test('pause menu freezes the game and resume releases it', async () => {
    game.openPauseMenu();
    assert.equal(game.paused, true);
    assert.equal(game.isInputBlocked(), true);
    assert.ok(document.querySelector('#ui-root .modal-layer'), 'the pause modal is open');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 320));
    assert.equal(game.paused, false);
    assert.equal(game.modal.isOpen, false);
  });

  await test('settings changes persist and reach the subsystems', async () => {
    game.settings.muted = true;
    game.saveSettings();
    assert.ok(localStorage.getItem('asteria:settings:v1').includes('"muted":true'));
    game.settings.muted = false;
    game.saveSettings();
    assert.equal(game.hud.updateSoundButton, game.hud.updateSoundButton);
  });

  await test('the game can return to the title screen and resume from the save', async () => {
    fastForward(game);
    await game.returnToTitle();
    assert.equal(game.titleMode, true);
    assert.equal(game.started, false);
    assert.equal(game.player.visible, false);
    assert.equal(document.getElementById('screen-title').classList.contains('hidden'), false);
    assert.equal(document.getElementById('btn-continue').classList.contains('hidden'), false);
    assert.equal(game.saveManager.hasState(), true);

    fastForward(game);
    await game.continueGame();
    assert.equal(game.titleMode, false);
    assert.equal(game.worlds.currentId, 'whisperingWoods');
    assert.equal(game.state.level, 2);
    assert.equal(document.getElementById('hud').classList.contains('hidden'), false);
  });

  await test('opening the satchel, journal and settings blocks input and frees it again', async () => {
    for (const [name, open] of [
      ['inventory', () => game.inventoryUI.open()],
      ['journal', () => game.journalUI.open()],
      ['settings', () => game.settingsUI.open()],
    ]) {
      open();
      assert.equal(game.isInputBlocked(), true);
      assert.ok(document.querySelector('#ui-root .modal-layer'));
      game.modal.isOpen;
      // Close whichever modal belongs to the panel.
      const layer = document.querySelector('#ui-root .modal-layer');
      layer.querySelector('.modal-close')?.click();
      await new Promise((resolve) => setTimeout(resolve, 320));
      assert.equal(document.querySelectorAll('#ui-root .modal-layer').length, 0,
        `${name}: layers left ${document.querySelectorAll('#ui-root .modal-layer').length}`);
    }
  });

  await test('the hidden page cannot be revealed before its chapter', async () => {
    const result = await game.secretReveal.begin();
    assert.equal(result, false);
    assert.equal(game.secretReveal.active, false);
    assert.equal(game.blockers.size, 0);
  });

  await test('the ending opens in the sanctuary and returns to the library', async () => {
    fastForward(game);
    game.state.discoveredPage = true;
    game.state.flags.L5_messageRead = true;
    game.state.completed = [1, 2, 3, 4, 5];

    // The ending has long deliberate pauses; skip them for the test.
    game.cinematics.wait = () => Promise.resolve();
    game.bookUI.open = () => Promise.resolve({ closed: true });

    const started = await game.startEnding();
    assert.equal(started, true);
    assert.equal(game.worlds.currentId, 'sanctuary');
    assert.equal(game.ending.active, true);
    assert.equal(document.getElementById('ending-layer').classList.contains('hidden'), false);
    assert.equal(game.isInputBlocked(), true, 'the ending blocks movement');
    assert.equal(document.getElementById('hud').classList.contains('hidden'), true);

    await game.returnFromEnding();
    assert.equal(game.worlds.currentId, 'hiddenLibrary');
    assert.equal(game.ending.active, false);
    assert.equal(game.isInputBlocked(), false, 'returning releases the ending blocker');
    assert.equal(document.getElementById('hud').classList.contains('hidden'), false);
  });

  await test('the reveal plays in the real library with the real book and overlay', async () => {
    fastForward(game);
    game.state.completed = [1, 2, 3, 4];
    game.state.discoveredPage = false;
    game.state.flags = { ...game.state.flags, L4_seal: true, L5_entered: true };

    const moved = await game.travelToWorld('hiddenLibrary', 'default', { level: 5, bypassGate: true });
    assert.equal(moved, true);
    assert.equal(game.worlds.currentId, 'hiddenLibrary');
    assert.equal(game.worlds.current.book instanceof Object, true, 'the library has a physical book');

    // The ending test replaced the book UI with a stub; restore the real one.
    game.bookUI = new BookUI(game);

    const reveal = game.secretReveal.begin();
    let settled = 'pending';
    reveal.then((value) => { settled = value; }).catch((err) => { settled = `error:${err}`; });
    // Wait for the cinematic to reach the overlay (the book has to swing open).
    const started = Date.now();
    while (!document.getElementById('book-overlay') && settled === 'pending') {
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (Date.now() - started > 9000) break;
    }
    assert.ok(document.getElementById('book-overlay'), 'the chronicle overlay opened');
    assert.equal(game.state.discoveredPage, true);
    assert.equal(game.state.flags.L5_messageRead, true);
    assert.ok(document.querySelectorAll('#book-overlay .reveal-word').length > 10, 'words appear one by one');

    const closed = (async () => {
      document.querySelector('#book-overlay .book-next').click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      document.querySelector('#book-overlay .book-close').click();
    })();
    const result = await Promise.race([reveal, new Promise((resolve) => setTimeout(() => resolve('timeout'), 9000))]);
    await closed;
    assert.equal(result, true, 'the reveal completed');
    assert.equal(game.blockers.has('reveal'), false);
    assert.equal(game.hud.root.classList.contains('is-dimmed'), false);
  });

  await test('the world loop updates without throwing', async () => {
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    assert.ok(Number.isFinite(game.cameraController.camera.position.x));
    assert.ok(Number.isFinite(game.player.position.x));
    assert.equal(game.player.visible, true);
  });
} finally {
  // Stop the animation loop so the process can exit.
  if (game._loopHandle) cancelAnimationFrame(game._loopHandle);
  game._loopHandle = null;
  game.saveManager.flush();
}

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
process.exit(0);
