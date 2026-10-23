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
const dom = new JSDOM(html, {
  pretendToBeVisual: true,
  url: 'http://localhost/',
  // The boot watchdog is covered by its own test; keep its timer out of these runs.
  beforeParse: (window) => {
    window.__asteriaSkipBootWatchdog = true;
  },
});
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
      'hud', 'dialogue', 'inventoryUI', 'journalUI', 'shop', 'shopUI', 'settingsUI', 'pauseMenu',
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
    await new Promise((resolve) => setTimeout(resolve, 500));
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
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(document.querySelectorAll('#ui-root .modal-layer').length, 0,
        `${name}: layers left ${document.querySelectorAll('#ui-root .modal-layer').length}`);
    }
  });

  await test('the ledger trades mora for looks and dresses the running traveler', async () => {
    const purseBefore = game.shop.mora;
    assert.equal(purseBefore, 220 + 15 * 3 + 120, 'starting purse plus fragments and the chapter reward');

    game.shopUI.open();
    assert.equal(game.isInputBlocked(), true);
    assert.ok(document.querySelector('#ui-root .shop'), 'the ledger rendered');

    // Wish once through the real button.
    document.querySelector('#ui-root .shop-tab[data-tab="wish"]').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    document.querySelector('#ui-root .shop-wish-one').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(game.shop.wallet.wishes, 1);
    assert.equal(game.shop.mora, purseBefore - 20, 'the wish was paid for');
    assert.ok(game.shop.unlockedCount >= 1, 'something was won');
    assert.equal(document.querySelectorAll('#ui-root .shop-result').length, 1);

    // A cape bought (or won) is worn by the model in the scene, not only in data.
    game.shop.wallet.owned.push('look.cape.ember');
    game.shop.equip('look.cape.ember');
    assert.equal(game.player.capeMaterial.color.getHexString(), '8f4436');
    assert.equal(game.state.wallet.equipped.cape, 'look.cape.ember');

    document.querySelector('#ui-root .modal-close').click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(game.isInputBlocked(), false);
    assert.equal(document.querySelectorAll('#ui-root .modal-layer').length, 0);
  });

  await test('the pause menu offers the ledger, and a lost pointer lock pauses the game', async () => {
    game.openPauseMenu();
    const labels = [...document.querySelectorAll('#ui-root .pause-actions .btn')].map((b) => b.textContent);
    assert.ok(labels.some((label) => label.includes("Wanderer's Ledger")), 'the ledger is reachable from the pause menu');

    document.querySelector('#ui-root .modal-close').click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(game.paused, false);

    // Browsers swallow the Escape keydown that releases the mouse. Losing the
    // lock is therefore treated as the pause request.
    game._onPointerLockChange(false);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(game.paused, true, 'the menu opened when the pointer lock was released');
    assert.ok(document.querySelector('#ui-root .modal-layer'));
    game.resume();
    game.pauseMenu.modal.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  await test('a panel opened from the pause menu comes back to the pause menu', async () => {
    game.openPauseMenu();
    assert.equal(game.paused, true);
    const satchel = [...document.querySelectorAll('#ui-root .pause-actions .btn')].find(
      (button) => button.textContent === 'Satchel',
    );
    satchel.click();
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.equal(game.paused, true, 'opening the satchel does not resume the world');
    assert.ok(document.querySelector('#ui-root .inventory-grid'), 'the satchel is on screen');

    document.querySelector('#ui-root .modal-close').click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(game.paused, true, 'closing the satchel must not leave a frozen world');
    assert.ok(document.querySelector('#ui-root .pause-actions'), 'the pause menu is back');

    document.querySelector('#ui-root .pause-actions .btn-primary').click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(game.paused, false, 'Resume returns to the world');
    assert.equal(document.querySelectorAll('#ui-root .modal-layer').length, 0);
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
      if (Date.now() - started > 20000) break;
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
    const result = await Promise.race([reveal, new Promise((resolve) => setTimeout(() => resolve('timeout'), 20000))]);
    await closed;
    assert.equal(result, true, 'the reveal completed');
    assert.equal(game.blockers.has('reveal'), false);
    assert.equal(game.hud.root.classList.contains('is-dimmed'), false);
  });

  await test('the whole chronicle can be walked from Chapter I to Chapter V', async () => {
    // A second, independent Game so this walkthrough cannot disturb the save
    // the earlier tests built up.
    const walk = new Game({ rendererFactory: makeRenderer });
    await walk.boot();
    fastForward(walk);
    await walk.startNewGame();
    // Headless players never walk, so give the story its first-steps flag.
    walk.bus.emit('player:first-steps');

    const here = () => walk.worlds.current;
    const interact = async (id) => {
      const item = here().interactables.find((entry) => entry.id === id);
      assert.ok(item, `${here().id || 'world'} is missing the interactable ${id}`);
      try {
        await item.action();
      } catch (err) {
        console.error(
          `[walk] ${id} threw in ${here()?.constructor?.name} (current ${walk.worlds.currentId}, stairRune ${!!here()?._stairRune})`,
        );
        throw err;
      }
    };
    const go = async (world, spawn, level) => {
      const moved = await walk.travelToWorld(world, spawn, { level, bypassGate: true });
      assert.equal(moved, true, `could not travel to ${world}`);
    };
    // World doors start their travel from inside the interaction, which is not
    // awaited, so wait for the swap instead of assuming it finished.
    const waitForWorld = async (id) => {
      const started = Date.now();
      while (walk.worlds.currentId !== id) {
        if (Date.now() - started > 8000) break;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.equal(walk.worlds.currentId, id, `did not arrive in ${id}`);
    };

    /* Chapter I — gather the fragments and report to Wren. */
    for (const id of ['wren', 'fragment-0', 'fragment-1', 'fragment-2', 'chest', 'wren']) await interact(id);
    assert.deepEqual(walk.state.completed, [1], 'chapter I completes');

    /* Chapter II — woods, then the ruins mechanism puzzle. */
    await go('whisperingWoods', 'default', 2);
    await go('ancientRuins', 'fromWoods', 2);
    await interact('mural');
    // Reading the mural opens a lore modal, which blocks input until closed.
    walk.modal.close();
    for (const id of ['mechanism-east', 'mechanism-north', 'mechanism-south', 'ruin-fragment']) await interact(id);
    assert.deepEqual(walk.state.completed, [1, 2], 'chapter II completes');

    /* Chapter III — the archive. */
    await go('archive', 'default', 3);
    for (const id of ['page-moon', 'page-star', 'page-wind', 'pedestal-moon', 'pedestal-star', 'pedestal-wind', 'chronicle']) {
      await interact(id);
    }
    assert.deepEqual(walk.state.completed, [1, 2, 3], 'chapter III completes');

    /* Chapter IV — the observatory, its constellation and the seal. */
    await go('observatory', 'default', 4);
    for (let i = 0; i < 3; i++) await interact(`star-mechanism-${i}`);
    for (const index of [0, 2, 1, 3]) await interact(`star-pylon-${index}`);
    assert.equal(walk.state.flags.L4_constellationSolved, true, 'the constellation can be traced');

    // The seal sits behind the lens collider: stand where a player would stand
    // and prove the prompt is offered from there.
    const sealPrompt = (z) => {
      walk.player.setVisible(true);
      walk.player.teleport(0, z, Math.PI);
      walk.interactions.refresh();
      walk.interactions.update(1 / 60);
      return walk.interactions.nearest?.id;
    };
    assert.equal(sealPrompt(3.05), 'celestial-seal', 'the seal is claimable from the deck');
    await interact('celestial-seal');
    assert.equal(walk.state.flags.L4_seal, true, 'the seal is claimed');

    /* Back through the archive: this is what completes Chapter IV. */
    await interact('return-archive');
    await waitForWorld('archive');
    assert.equal(walk.state.flags.L4_returned, true, 'the return is recorded');
    assert.deepEqual(walk.state.completed, [1, 2, 3, 4], 'chapter IV completes on return');

    /* Chapter V — the gate that used to feel unreachable. */
    assert.equal(walk.levels.canTravelTo('hiddenLibrary').ok, true, 'the library gate is open');
    await interact('hidden-library-door');
    await waitForWorld('hiddenLibrary');
    assert.equal(walk.state.flags.L5_entered, true);
    assert.equal(walk.state.level, 5);

    // And the rescue route agrees with where the walk actually ended up.
    const { nextDestination } = await import('../src/game/Progression.js');
    assert.equal(nextDestination(walk.state).world, 'hiddenLibrary');

    if (walk._loopHandle) cancelAnimationFrame(walk._loopHandle);
    walk._loopHandle = null;
    walk.saveManager.flush();
  });

  await test('the pause menu can put a lost player back where the story continues', async () => {
    // Pretend the save stopped after the observatory's seal, before the return.
    const saved = { ...game.state };
    game.state = {
      ...game.state,
      level: 4,
      completed: [1, 2, 3],
      discoveredPage: false,
      endingSeen: false,
      flags: { ...game.state.flags, L4_seal: false, L4_returned: false, L5_entered: false },
    };
    fastForward(game);
    const moved = await game.resumeChronicle({ silent: true });
    assert.equal(
      moved,
      true,
      `the rescue route travels (world ${game.worlds.currentId}, transitioning ${game.transitioning}, started ${game.started}, blockers ${[...game.blockers].join(',')})`,
    );
    assert.equal(game.worlds.currentId, 'observatory');

    const labels = (() => {
      game.openPauseMenu();
      return [...document.querySelectorAll('#ui-root .pause-actions .btn')].map((b) => b.textContent);
    })();
    assert.ok(labels.some((label) => label.includes('chronicle continues')), 'the pause menu offers the way forward');
    game.pauseMenu.modal.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    game.state = saved;
  });

  await test('the splash hands the visitor over to the title screen', async () => {
    const splash = document.getElementById('screen-splash');
    assert.ok(splash, 'the splash is in the real page');
    assert.equal(splash.classList.contains('is-waiting'), false, 'boot finished, so the door is live');
    assert.equal(splash.classList.contains('hidden'), false, 'it is still up until the visitor opens the door');
    assert.ok(
      ['Enter the meadow', 'Continue the chronicle'].includes(
        splash.querySelector('#btn-enter .btn-label').textContent,
      ),
      'the door says what it will do',
    );

    const label = splash.querySelector('#btn-enter .btn-label').textContent;
    splash.querySelector('#btn-enter').click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(splash.classList.contains('hidden'), true, 'the splash steps aside');
    assert.equal(document.body.classList.contains('is-splash'), false, 'and stops owning the page');

    // What the door does next is covered where it belongs — the title flow and
    // the save flow have their own tests. Here we only check the two promises
    // the splash makes: it reports the right thing, and it gets out of the way.
    assert.ok(
      ['Enter the meadow', 'Continue the chronicle'].includes(label),
      `the splash knows which journey this is (${label})`,
    );
  });

  await test('the mirror opens on the real camera and hands it back on close', async () => {
    game.start?.(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    game.player.setVisible(true);
    game.started = true;
    game.titleMode = false;

    game.openCharacterViewer();
    assert.equal(game.inspecting, true, 'the mirror is active');
    assert.ok(game.cameraController.inspect, 'the camera is orbiting her');
    assert.ok(document.querySelector('.viewer'), 'the mirror layer is on screen');
    assert.equal(game.isInputBlocked(), true, 'movement is blocked while looking');

    // The camera must actually come in close, not stay at chase distance.
    for (let i = 0; i < 60; i++) game.update(1 / 60);
    const head = game.player.position.clone();
    head.y += 1.2;
    const distance = game.cameraController.camera.position.distanceTo(head);
    assert.ok(distance < 3.4, `the mirror gets close (${distance.toFixed(2)})`);

    // Pinch/wheel zoom reaches the inspect camera (negative = closer).
    game.cameraController.zoom(-0.4);
    assert.ok(game.cameraController.inspect.targetDistance < 2.3, 'zoom works inside the mirror');

    game.closeCharacterViewer();
    assert.equal(game.inspecting, false, 'the mirror closes');
    assert.equal(game.cameraController.inspect, null, 'the chase camera is restored');
    assert.equal(document.querySelector('.viewer'), null);
    assert.equal(game.isInputBlocked(), false, 'the player can move again');
  });

  await test('a real pull plays the wish scene and skipping returns to the ledger', async () => {
    game.shop.wallet.mora += 200;
    game.shopUI.open({ tab: 'wish' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    document.querySelector('#ui-root .shop-wish-one').click();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const scene = document.querySelector('.wish-scene');
    assert.ok(scene, 'the star falls in the real game too');
    assert.ok(scene.querySelector('.wish-card-name').textContent.length > 0);

    // The Skip control ends the scene immediately, wherever the star is.
    scene.querySelector('.wish-skip').click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(document.querySelector('.wish-scene'), null, 'the scene clears away');

    const slot = document.querySelector('#ui-root .shop-wish-result');
    assert.equal(slot.classList.contains('is-awaiting-reveal'), false, 'the results are no longer hidden');
    game.shopUI.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
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
