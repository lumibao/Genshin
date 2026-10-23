/**
 * DOM tests for the interface layer.
 *
 * Runs the real markup from index.html inside jsdom, then drives the UI modules
 * with a mock game. This catches the class of bug a headless 3D smoke test
 * cannot: missing elements, broken event wiring, promises that never resolve
 * and blockers that are never released.
 *
 * Run with: npm run test:ui
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

// jsdom has no canvas backend. A permissive 2D context keeps the minimap quiet
// while still exercising its drawing code paths.
function makeContext() {
  const gradient = { addColorStop() {} };
  const base = {
    canvas: null,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    measureText: () => ({ width: 8 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
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

const { HUD } = await import('../src/ui/HUD.js');
const { DialogueUI } = await import('../src/ui/DialogueUI.js');
const { Modal } = await import('../src/ui/Modal.js');
const { BookUI } = await import('../src/ui/BookUI.js');
const { InventoryUI } = await import('../src/ui/InventoryUI.js');
const { JournalUI } = await import('../src/ui/JournalUI.js');
const { SettingsUI, PauseMenu } = await import('../src/ui/SettingsUI.js');
const { Cinematics } = await import('../src/ui/Cinematics.js');
const { SecretReveal } = await import('../src/story/SecretReveal.js');
const { FinalEnding } = await import('../src/story/FinalEnding.js');
const { createNewState } = await import('../src/game/SaveManager.js');
const { ShopManager } = await import('../src/game/ShopManager.js');
const { ShopUI } = await import('../src/ui/ShopUI.js');
const { WishCinematic } = await import('../src/ui/WishCinematic.js');
const { CharacterViewer } = await import('../src/ui/CharacterViewer.js');
const { CameraController } = await import('../src/game/CameraController.js');
const shopData = await import('../src/story/shopData.js');
const { InputManager } = await import('../src/game/InputManager.js');
const { MobileControls } = await import('../src/game/MobileControls.js');
const { PlayerController } = await import('../src/game/PlayerController.js');
const THREE = await import('three');

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
    results.push(`  ✗ ${name}\n      ${err?.stack?.split('\n').slice(0, 5).join('\n      ') || err}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* Mock game                                                          */
/* ------------------------------------------------------------------ */

function makeGame(overrides = {}) {
  const blockers = new Set();
  const calls = [];
  const game = {
    state: { ...createNewState(), started: true, discoveredPage: true },
    settings: {
      music: 0.5, ambient: 0.6, sfx: 0.7, muted: false, reducedMotion: true,
      invertY: false, sensitivity: 1, quality: 'auto', hints: true, minimap: true,
    },
    calls,
    blockers,
    addBlocker: (id) => blockers.add(id),
    removeBlocker: (id) => blockers.delete(id),
    isInputBlocked: () => blockers.size > 0,
    isMovementBlocked: () => blockers.size > 0,
    input: {
      exitPointerLock: () => calls.push('unlock'),
      requestPointerLock: () => calls.push('lock'),
      setSensitivity: () => {},
      invertY: false,
    },
    audio: {
      play: (name) => calls.push(`audio:${name}`),
      setVolumes: () => calls.push('audio:volumes'),
      setScene: () => calls.push('audio:scene'),
      setIntensity: () => calls.push('audio:intensity'),
    },
    cameraController: {
      cinematicDampScale: 1,
      resize: () => {},
      enterCinematic: () => calls.push('cinematic:enter'),
      exitCinematic: () => calls.push('cinematic:exit'),
      startOrbit: () => calls.push('orbit'),
      shake: () => calls.push('shake'),
      snapToPlayer: () => {},
    },
    renderer: { isMobile: false, applyQuality: () => calls.push('quality') },
    inventory: {
      items: {},
      count: () => 0,
      getEntries: () => overrides.entries || [],
    },
    quests: {
      summary: () => ({ chapter: 'Chapter I', title: 'Whispers of the Wind', done: 2, total: 5, completed: [] }),
      journal: () => overrides.journal || [],
      refresh: () => calls.push('refresh'),
      chapterLabel: () => ({ kicker: 'Chapter I', title: 'Whispers of the Wind' }),
      setFlag: (key, value) => {
        game.state.flags[key] = value;
        calls.push(`flag:${key}`);
      },
      hasFlag: (key) => !!game.state.flags[key],
    },
    worlds: {
      current: {
        music: 'library',
        book: {
          getCinematicCamera: () => ({ position: [0, 2, 4], lookAt: [0, 1, 0] }),
          open: () => Promise.resolve(),
        },
        onRevealComplete: () => calls.push('revealComplete'),
        getEndingCamera: () => ({ center: [0, 0, 0], radius: 10 }),
      },
    },
    player: { visible: true, position: { x: 0, y: 0, z: 0 } },
    hud: {},
    saveNow: () => calls.push('saveNow'),
    saveSettings: () => calls.push('saveSettings'),
    saveManager: {
      saveSettings: () => calls.push('saveSettings'),
      hasState: () => true,
      clearState: () => calls.push('clearState'),
    },
    resume: () => calls.push('resume'),
    returnToSafePoint: () => calls.push('returnToSafePoint'),
    returnToTitle: () => calls.push('returnToTitle'),
    returnFromEnding: () => calls.push('returnFromEnding'),
    confirmResetProgress: () => calls.push('confirmResetProgress'),
    toggleFullscreen: () => calls.push('toggleFullscreen'),
    toggleMute: () => calls.push('toggleMute'),
    openPauseMenu: () => calls.push('openPauseMenu'),
    startEnding: () => calls.push('startEnding'),
    openLore: () => calls.push('openLore'),
    requestSave: () => calls.push('requestSave'),
    ...overrides,
  };

  game.hud = new HUD(game);
  game.cinematics = new Cinematics(game);
  return game;
}

const uiRoot = () => document.getElementById('ui-root');

function clearDynamicUi() {
  uiRoot().replaceChildren();
  document.getElementById('dialogue').classList.add('hidden');
  document.body.className = '';
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

console.log('\nProject Asteria — interface tests (jsdom)\n');

await test('HUD shows the chapter, renders objectives, prompts and toasts', async () => {
  clearDynamicUi();
  const { hud } = makeGame();
  hud.show();
  assert.equal(document.getElementById('hud').classList.contains('hidden'), false);

  hud.setChapter('Chapter II', 'The Forgotten Ruins');
  assert.equal(document.getElementById('chapter-kicker').textContent, 'Chapter II');
  assert.equal(document.getElementById('chapter-name').textContent, 'The Forgotten Ruins');

  hud.renderQuest({
    levelId: 2,
    level: { chapter: 'Chapter II', title: 'The Forgotten Ruins' },
    current: { id: 'arch', text: 'Find the archway hidden among the trees', hint: 'Follow the stone markers north.' },
    objectives: [
      { id: 'woods', text: 'Follow the path through the Whispering Woods', done: true, current: false },
      { id: 'arch', text: 'Find the archway hidden among the trees', hint: 'Follow the stone markers north.', done: false, current: true },
    ],
    done: 1,
    total: 2,
  });
  const items = [...document.querySelectorAll('#quest-objectives li:not(.objective-hint)')];
  assert.equal(items.length, 2);
  assert.equal(items[0].classList.contains('is-done'), true);
  assert.equal(items[1].classList.contains('is-current'), true);
  assert.ok(document.querySelector('#quest-objectives .objective-hint'), 'the current objective hint is shown');

  hud.setPrompt({ key: 'E', label: 'Speak with Wren' });
  assert.equal(document.getElementById('interaction-prompt').classList.contains('hidden'), false);
  assert.equal(document.getElementById('prompt-text').textContent, 'Speak with Wren');
  hud.setPrompt(null);
  assert.equal(document.getElementById('interaction-prompt').classList.contains('hidden'), true);

  hud.toast({ icon: '✦', kicker: 'Quest', text: 'Speak with Wren', variant: 'quest' });
  assert.equal(document.querySelectorAll('#toasts .toast').length, 1);

  hud.hide();
  assert.equal(document.getElementById('hud').classList.contains('hidden'), true);
});

await test('modal opens, traps focus, closes on Escape and releases its blocker', async () => {
  clearDynamicUi();
  const game = makeGame();
  const modal = new Modal(game);
  let closed = false;
  modal.open({
    title: 'Paused',
    subtitle: 'The wind will wait',
    body: '<p class="confirm-message">Take a breath.</p>',
    actions: [{ label: 'Resume', variant: 'primary' }],
    onClose: () => {
      closed = true;
    },
  });

  assert.equal(game.blockers.has('modal'), true);
  assert.equal(uiRoot().querySelector('.modal-title').textContent, 'Paused');
  assert.equal(uiRoot().querySelectorAll('.modal-foot .btn').length, 1);

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(0);
  assert.equal(modal.isOpen, false);
  assert.equal(closed, true);
  assert.equal(game.blockers.has('modal'), false);
  await sleep(450);
  assert.equal(uiRoot().querySelector('.modal-layer'), null);
});

await test('dialogue plays line by line, advances on click and releases its blocker', async () => {
  clearDynamicUi();
  const game = makeGame();
  const dialogue = new DialogueUI(game);
  const promise = dialogue.play('wren.first');

  assert.equal(game.blockers.has('dialogue'), true);
  assert.equal(document.getElementById('dialogue').classList.contains('hidden'), false);
  assert.equal(document.getElementById('dialogue-speaker').textContent, 'Wren');
  assert.ok(document.getElementById('dialogue-text').textContent.length > 0, 'first line is typed instantly');

  const layer = document.getElementById('dialogue');
  // The UI debounces rapid advances for 80ms; a slow runner must not beat it.
  for (let i = 0; i < 12 && dialogue.isActive; i++) {
    layer.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(140);
  }
  await promise;

  assert.equal(dialogue.isActive, false);
  assert.equal(game.blockers.has('dialogue'), false);
  assert.equal(document.getElementById('dialogue').classList.contains('hidden'), true);
});

await test('dialogue narration is labelled The Chronicle and can be skipped', async () => {
  clearDynamicUi();
  const game = makeGame();
  const dialogue = new DialogueUI(game);
  const promise = dialogue.play({
    lines: [
      { speaker: '', text: 'Long before the wind learned the names of the cities…' },
      { speaker: '', text: 'The grass leans toward a voice no one can hear.' },
    ],
  });
  assert.equal(document.getElementById('dialogue-speaker').textContent, 'The Chronicle');
  document.getElementById('dialogue-skip').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await promise;
  assert.equal(dialogue.isActive, false);
  assert.equal(game.blockers.has('dialogue'), false);
});

await test('book opens, renders words, turns pages and resolves on close', async () => {
  clearDynamicUi();
  const game = makeGame();
  const book = new BookUI(game);
  const pages = [
    {
      kicker: 'The First Page',
      title: 'For [HER NAME]',
      subtitle: 'A chronicle kept for one reader',
      paragraphs: [
        { text: 'This is the first paragraph, written for [HER NAME] with a dropcap.', dropcap: true },
        { text: 'A second paragraph, personal and quiet, for [YOUR NAME].', personal: true },
      ],
      signature: { small: 'With all my heart,', name: '[YOUR NAME]' },
      dateLine: '[SPECIAL DATE]',
      sealCaption: 'The seal of the archive',
    },
    {
      kicker: 'The Second Page',
      title: 'What the wind carries',
      subtitle: 'After the last chapter',
      paragraphs: [{ text: 'The second page of the chronicle.' }],
      signature: { small: 'Always,', name: '[YOUR NAME]' },
      dateLine: '[SPECIAL DATE]',
    },
  ];

  const done = book.open(pages, { context: 'reveal' });
  assert.equal(game.blockers.has('book'), true);
  assert.equal(document.body.classList.contains('is-reading'), true);
  assert.equal(document.querySelectorAll('#book-overlay').length, 1, 'only one overlay exists');
  assert.equal(document.querySelector('#book-overlay .page-title').textContent, 'For [HER NAME]');
  assert.ok(document.querySelector('#book-overlay .dropcap'), 'dropcap paragraph');
  assert.ok(document.querySelectorAll('#book-overlay .reveal-word').length > 5, 'word reveal spans');
  assert.equal(document.querySelector('#book-overlay .sig-name').textContent, '[YOUR NAME]');

  document.querySelector('#book-overlay .book-next').click();
  await sleep(30);
  assert.equal(document.querySelector('#book-overlay .page-title').textContent, 'What the wind carries');
  assert.equal(document.querySelector('#book-overlay .book-next').textContent, 'Close the book', 'the last page closes the book');
  assert.notEqual(document.querySelector('#book-overlay .book-prev').style.display, 'none');

  document.querySelector('#book-overlay .book-prev').click();
  await sleep(30);
  assert.equal(document.querySelector('#book-overlay .page-title').textContent, 'For [HER NAME]');

  document.querySelector('#book-overlay .book-close').click();
  await done;
  assert.equal(book.isOpen, false);
  await sleep(1400);
  assert.equal(document.getElementById('book-overlay'), null);
  assert.equal(game.blockers.has('book'), false);
  assert.equal(document.body.classList.contains('is-reading'), false);
});

await test('inventory separates keys and relics, shows detail and an empty state', async () => {
  clearDynamicUi();
  const game = makeGame({
    entries: [
      { id: 'archiveKey', type: 'key', name: 'Ancient Archive Key', glyph: '⚿', description: 'A heavy key.', count: 1 },
      { id: 'windFragment', type: 'relic', name: 'Wind Fragment', glyph: '❖', description: 'It hums.', count: 3 },
    ],
  });
  const inventory = new InventoryUI(game);
  inventory.open();
  const sections = uiRoot().querySelectorAll('.inv-section-title');
  assert.equal(sections.length, 2, 'keys and relics are separated');

  const entry = uiRoot().querySelector('.inv-item');
  entry.click();
  assert.ok(uiRoot().querySelector('.inv-detail').textContent.length > 0);
  inventory.modal.close();
  await sleep(0);

  clearDynamicUi();
  const emptyGame = makeGame({ entries: [] });
  const emptyInventory = new InventoryUI(emptyGame);
  emptyInventory.open();
  assert.ok(uiRoot().querySelector('.inv-empty'), 'empty state is shown');
  emptyInventory.modal.close();
});

await test('journal hides objectives for locked chapters', async () => {
  clearDynamicUi();
  const journal = makeGame({
    journal: [
      {
        level: { id: 1, chapter: 'Chapter I', title: 'Whispers of the Wind', place: 'Windrise Meadow' },
        unlocked: true, completed: true, active: false,
        objectives: [{ id: 'steps', text: 'Take your first steps', done: true }],
      },
      {
        level: { id: 2, chapter: 'Chapter II', title: 'The Forgotten Ruins', place: 'The Whispering Woods' },
        unlocked: false, completed: false, active: false, objectives: [],
      },
    ],
  });
  const ui = new JournalUI(journal);
  ui.open();
  const cards = uiRoot().querySelectorAll('.journal-chapter');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelectorAll('.journal-objectives li').length, 1);
  assert.equal(cards[1].querySelectorAll('.journal-objectives li').length, 0);
  assert.ok(cards[1].textContent.includes('Unknown region'), 'locked chapters hide their location');
  assert.ok(cards[1].classList.contains('is-locked'));
  ui.modal.close();
});

await test('settings edit live values, reach the camera and persist on close', async () => {
  clearDynamicUi();
  const game = makeGame();
  const settings = new SettingsUI(game);
  settings.open();
  assert.ok(uiRoot().querySelectorAll('.setting-row').length >= 6);

  const muteRow = [...uiRoot().querySelectorAll('.setting-row')].find((row) => row.textContent.includes('Mute everything'));
  muteRow.querySelector('.toggle').click();
  assert.equal(game.settings.muted, true);

  const qualityRow = [...uiRoot().querySelectorAll('.setting-row')].find((row) => row.textContent.includes('Graphics'));
  const performanceButton = [...qualityRow.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Performance');
  performanceButton.click();
  assert.equal(game.settings.quality, 'low');
  assert.ok(game.calls.includes('quality'));
  assert.ok(game.calls.includes('saveSettings'));

  const motionRow = [...uiRoot().querySelectorAll('.setting-row')].find((row) => row.textContent.includes('Reduced motion'));
  const motionToggle = motionRow.querySelector('.toggle');
  assert.equal(motionToggle.getAttribute('aria-checked'), 'true', 'reduced motion starts enabled in the mock');
  assert.equal(game.cameraController.cinematicDampScale, 1);
  motionToggle.click();
  await sleep(0);
  assert.equal(game.settings.reducedMotion, false);
  assert.equal(game.cameraController.cinematicDampScale, 1);
  motionToggle.click();
  await sleep(0);
  assert.equal(game.settings.reducedMotion, true);
  assert.equal(document.body.classList.contains('reduced-motion'), true);
  assert.equal(game.cameraController.cinematicDampScale, 0.6);

  settings.modal.close();
  await sleep(0);
  assert.ok(game.calls.filter((c) => c === 'saveSettings').length >= 2);
});

await test('pause menu offers every recovery action and resumes on close', async () => {
  clearDynamicUi();
  const game = makeGame();
  const pause = new PauseMenu(game);
  pause.open();
  const labels = [...uiRoot().querySelectorAll('.pause-actions .btn')].map((b) => b.textContent);
  for (const expected of [
    'Resume', 'Adventure Journal', 'Satchel', 'Settings', 'Controls',
    'Return to safe point', 'Save & return to title', 'Reset all progress',
  ]) {
    assert.ok(labels.includes(expected), `missing ${expected}`);
  }

  uiRoot().querySelector('.pause-actions .btn').click();
  await sleep(0);
  assert.ok(game.calls.includes('resume'));
  assert.equal(pause.modal.isOpen, false);
  assert.equal(game.blockers.has('modal'), false);
});

await test('cinematics show chapter cards, captions and fades', async () => {
  clearDynamicUi();
  const game = makeGame();
  const cinematics = game.cinematics;

  assert.ok(document.getElementById('cinematic-fade'));
  assert.ok(document.getElementById('cinematic-flash'));

  cinematics.setLetterbox(true);
  assert.equal(document.getElementById('letterbox').classList.contains('is-active'), true);
  cinematics.setLetterbox(false);
  assert.equal(document.getElementById('letterbox').classList.contains('is-active'), false);

  const card = cinematics.showChapterCard({ kicker: 'Chapter II', title: 'The Forgotten Ruins', sub: 'The Whispering Woods' }, 40);
  assert.equal(document.getElementById('chapter-card-kicker').textContent, 'Chapter II');
  assert.equal(document.getElementById('chapter-card').classList.contains('is-visible'), true);
  await card;
  assert.equal(document.getElementById('chapter-card').classList.contains('is-visible'), false);

  cinematics.caption('A quiet place, kept for one arrival.');
  assert.ok(document.querySelector('.cinematic-caption'));
  cinematics.clearCaption();
  assert.equal(document.querySelector('.cinematic-caption'), null);

  await cinematics.fadeOut(10);
  assert.equal(document.getElementById('cinematic-fade').style.opacity, '1');
  await cinematics.fadeIn(10);
  assert.equal(document.getElementById('cinematic-fade').style.opacity, '0');
});

await test('the reveal gate refuses to open the book before chapter V is reached', async () => {
  clearDynamicUi();
  const game = makeGame();
  const reveal = new SecretReveal(game);
  assert.equal(reveal.gateOpen(), false);
  const result = await reveal.begin();
  assert.equal(result, false);
  assert.equal(reveal.active, false);
  assert.equal(game.blockers.has('reveal'), false, 'a refused reveal leaves no blocker behind');
});

await test('the reveal opens the chronicle, records the discovery and releases input', async () => {
  clearDynamicUi();
  const game = makeGame();
  game.state.completed = [1, 2, 3, 4];
  game.state.discoveredPage = false;
  game.state.flags = { L4_seal: true, L5_entered: true };

  const opened = [];
  let closeBook;
  const closed = new Promise((resolve) => {
    closeBook = resolve;
  });
  game.bookUI = {
    open: (pages, options) => {
      opened.push({ pages, options });
      return closed;
    },
  };

  // A fast-forward cinematics layer: the timing of the reveal is covered by the
  // browser, the logic here is what matters.
  const immediate = () => Promise.resolve();
  game.cinematics = {
    fadeOut: immediate, fadeIn: immediate, wait: immediate,
    setFadeOpacity: () => {}, flashScreen: () => {}, setLetterbox: () => {},
  };

  const reveal = new SecretReveal(game);
  assert.equal(reveal.gateOpen(), false, 'opening the physical book is still required');

  const promise = reveal.begin();
  await sleep(30);

  assert.equal(opened.length, 1, 'the chronicle opened');
  assert.ok(opened[0].pages.length >= 2, 'the chronicle has pages');
  assert.equal(game.state.discoveredPage, true);
  assert.equal(game.state.flags.L5_messageRead, true);
  assert.equal(typeof game.state.flags.L5_pageDiscoveredAt, 'number');
  assert.ok(game.blockers.has('reveal'), 'input is blocked during the reveal');

  closeBook();
  await promise;
  await sleep(0);
  assert.ok(game.calls.includes('revealComplete'), 'the world is told the reveal finished');
});

await test('the ending layer builds, reveals its actions and hides on stop', async () => {
  clearDynamicUi();
  const game = makeGame();
  const ending = new FinalEnding(game);

  assert.ok(document.getElementById('ending-layer'));
  assert.equal(document.getElementById('ending-layer').classList.contains('hidden'), true);
  assert.equal(document.querySelectorAll('#ending-layer .ending-actions .btn').length, 4);

  ending.start();
  await sleep(20);
  assert.equal(ending.active, true);
  assert.equal(document.getElementById('ending-layer').classList.contains('hidden'), false);
  assert.ok(game.calls.includes('orbit'), 'the ending camera orbits the sanctuary');

  ending.stop();
  assert.equal(ending.active, false);
  assert.equal(document.getElementById('ending-layer').classList.contains('hidden'), true);
});

await test('the ending refuses to start without a discovered page', async () => {
  clearDynamicUi();
  const game = makeGame();
  game.state.discoveredPage = false;
  const ending = new FinalEnding(game);
  const result = await ending.start();
  assert.equal(result, false);
  assert.equal(ending.active, false);
});

/* ------------------------------------------------------------------ */
/* Boot watchdog (runs the real inline script from index.html)         */
/* ------------------------------------------------------------------ */

async function runWatchdog({ booted = false, waitMs = 80 } = {}) {
  const probe = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    beforeParse(window) {
      window.__asteriaBootWaitMs = waitMs;
      if (booted) window.projectAsteria = { fake: true };
    },
  });
  // jsdom fires "load" once the document is parsed.
  await new Promise((resolve) => setTimeout(resolve, waitMs + 600));
  return probe.window.document.getElementById('boot-error');
}

await test('the boot watchdog explains a page whose module never loads', async () => {
  const overlay = await runWatchdog({ booted: false });
  assert.ok(overlay, 'an explanation is shown instead of a silent half-rendered page');
  assert.ok(overlay.textContent.includes('could not start'));
  assert.ok(overlay.textContent.includes('Reload'));
});

await test('the boot watchdog stays silent once the game has booted', async () => {
  const overlay = await runWatchdog({ booted: true });
  assert.equal(overlay, null, 'no overlay when the module evaluated');
});

await test('a source-served page redirects to the published build in game/', async () => {
  const navigations = [];
  const fetched = [];
  const probe = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/Genshin/',
    beforeParse(window) {
      window.__asteriaBootWaitMs = 60;
      window.__asteriaNavigate = (url) => navigations.push(url);
      window.fetch = (url, options) => {
        fetched.push({ url, method: options && options.method });
        return Promise.resolve({ ok: true, status: 200 });
      };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const w = probe.window;
  assert.equal(typeof w.__asteriaBootFallback, 'function', 'the fallback is reachable');
  assert.equal(w.document.getElementById('boot-error'), null, 'no error box: the build exists');

  // The entry module failed to load, so the fallback ran on its own.
  assert.ok(
    navigations.includes('./game/') || fetched.some((f) => f.url === './game/index.html'),
    `expected a probe of ./game/ or a redirect, got ${JSON.stringify({ navigations, fetched })}`,
  );
  for (const entry of fetched) {
    assert.equal(entry.method, 'HEAD', 'the probe is a HEAD request');
    assert.equal(entry.url, './game/index.html');
  }
});

await test('the fallback explains itself when no build is published', async () => {
  const probe = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/Genshin/',
    beforeParse(window) {
      window.__asteriaBootWaitMs = 60;
      window.fetch = () => Promise.resolve({ ok: false, status: 404 });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 400));

  const box = probe.window.document.getElementById('boot-error');
  assert.ok(box, 'an explanation is shown');
  assert.ok(box.textContent.includes('could not start'));
  assert.ok(box.textContent.includes('Reload'));
  assert.equal(probe.window.document.querySelector('a[href*="game"]'), null);
});

await test("the ledger opens with the purse, three tabs and its wares", async () => {
  clearDynamicUi();
  const game = makeGame();
  game.shop = new ShopManager(game);
  const shopUI = new ShopUI(game);
  shopUI.open();

  assert.equal(game.blockers.has('modal'), true, 'the ledger blocks gameplay input');
  assert.ok(uiRoot().textContent.includes("The Wanderer's Ledger"));
  assert.equal(uiRoot().querySelectorAll('.shop-tab').length, 3);
  assert.equal(uiRoot().querySelectorAll('.shop-card').length, shopData.SHOP_ITEMS.length);
  assert.equal(uiRoot().querySelector('.shop-purse-value').textContent, String(shopData.STARTING_MORA));
  assert.ok(uiRoot().querySelector('.shop-pity').textContent.includes('Legendary guaranteed'));

  shopUI.close();
  await sleep(260);
  assert.equal(game.blockers.has('modal'), false);
});

await test('buying from the ledger spends mora, repaints the traveler and stays bought', async () => {
  clearDynamicUi();
  const applied = [];
  const game = makeGame();
  game.player = { visible: true, applyLooks: (looks) => applied.push(looks) };
  game.shop = new ShopManager(game);
  const shopUI = new ShopUI(game);
  shopUI.open();

  const card = uiRoot().querySelector('.shop-card[data-item="cape.ember"]');
  assert.ok(card, 'the ember cape is on the shelf');
  card.querySelector('.shop-buy').click();
  await sleep(0);

  assert.equal(game.shop.mora, shopData.STARTING_MORA - 160);
  assert.ok(game.shop.owns('look.cape.ember'));
  assert.equal(applied[applied.length - 1].cape.color, '#8f4436');
  assert.equal(uiRoot().querySelector('.shop-purse-value').textContent, String(shopData.STARTING_MORA - 160));

  // The rebuilt card now offers to wear it rather than to buy it again.
  const again = uiRoot().querySelector('.shop-card[data-item="cape.ember"]');
  assert.equal(again.querySelector('.shop-price').textContent, 'Owned');
  assert.equal(again.querySelector('.shop-buy').textContent, 'Worn');
  shopUI.close();
});

await test('the wishing star spends mora and lists every result with its rarity', async () => {
  clearDynamicUi();
  const game = makeGame();
  game.shop = new ShopManager(game);
  const shopUI = new ShopUI(game);
  shopUI.open();

  uiRoot().querySelector('.shop-tab[data-tab="wish"]').click();
  await sleep(0);

  const ten = uiRoot().querySelector('.shop-wish-ten');
  assert.equal(ten.disabled, shopData.STARTING_MORA < shopData.WISH_COST_TEN);
  assert.ok(uiRoot().textContent.includes(String(shopData.PITY_LIMIT)), 'the pity rule is published');

  ten.click();
  await sleep(0);

  const results = uiRoot().querySelectorAll('.shop-result');
  assert.equal(results.length, 10, 'a ten-pull shows ten results');
  for (const result of results) {
    assert.ok(result.dataset.rarity, 'each result carries its rarity');
    assert.ok(result.querySelector('.shop-result-name').textContent.length > 0);
  }
  assert.equal(
    uiRoot().querySelector('.shop-purse-value').textContent,
    String(shopData.STARTING_MORA - shopData.WISH_COST_TEN),
  );

  // The wardrobe tab lists what was just won and lets it be worn.
  uiRoot().querySelector('.shop-tab[data-tab="look"]').click();
  await sleep(0);
  assert.ok(uiRoot().querySelectorAll('.shop-owned-item').length > 0, 'won looks appear in the wardrobe');
  assert.ok(uiRoot().querySelector('.shop-look-summary'), 'the current look is summarised');
  shopUI.close();
});

await test('on a phone the HUD buttons sit above the touch layer and are thumb-sized', async () => {
  const hudCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
  const mobileCss = readFileSync(new URL('../src/styles/mobile.css', import.meta.url), 'utf8');
  const mainCss = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
  const shopCss = readFileSync(new URL('../src/styles/shop.css', import.meta.url), 'utf8');

  const tokenZ = Number(mainCss.match(/--z-hud:\s*(\d+)/)?.[1]);
  const controlsZ = Number(mobileCss.match(/#mobile-controls\s*{[^}]*z-index:\s*(\d+)/s)?.[1]);
  assert.ok(Number.isFinite(tokenZ) && Number.isFinite(controlsZ), 'both layers declare a z-index');
  assert.ok(
    controlsZ < tokenZ,
    `the touch layer (z ${controlsZ}) must sit under the HUD (z ${tokenZ}) or it swallows taps on the shop, sound and menu buttons`,
  );

  // The HUD starts transparent to pointers but its buttons must opt back in.
  assert.ok(
    /#hud\s*{[^}]*pointer-events:\s*none/s.test(hudCss),
    'the HUD itself never blocks the world',
  );
  assert.ok(
    /#hud button[^{]*{[^}]*pointer-events:\s*auto/s.test(hudCss),
    'HUD buttons receive taps',
  );

  // Thumb-sized targets on touch devices.
  const touchIcon = mobileCss.match(/\.is-touch \.icon-btn\s*{([^}]*)}/s)?.[1] || '';
  const width = Number(touchIcon.match(/width:\s*(\d+)px/)?.[1]);
  const height = Number(touchIcon.match(/height:\s*(\d+)px/)?.[1]);
  assert.ok(width >= 40 && height >= 40, `touch HUD buttons are ${width}x${height}, expected at least 40x40`);

  // The ledger is usable on a phone too.
  assert.ok(/\.is-touch \.shop-buy[^{]*{[^}]*min-height:\s*44px/s.test(shopCss), 'shop buttons are 44px tall on touch');
  assert.ok(/\.is-touch \.shop-tab\s*{[^}]*padding:\s*12px/s.test(shopCss), 'shop tabs are comfortable to tap');
});

await test('the touch controls are a sibling of the HUD, not trapped inside it', () => {
  const hud = document.getElementById('hud');
  const controls = document.getElementById('mobile-controls');
  assert.ok(controls, 'the touch control layer exists');
  assert.equal(hud.contains(controls), false, 'the HUD must not clip or hide the touch controls');

  const mainCss = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
  const mobileCss = readFileSync(new URL('../src/styles/mobile.css', import.meta.url), 'utf8');
  const hudZ = Number(mainCss.match(/--z-hud:\s*(\d+)/)?.[1]);
  const controlsZ = Number(mobileCss.match(/#mobile-controls\s*{[^}]*z-index:\s*(\d+)/s)?.[1]);
  assert.ok(hudZ > controlsZ, `the HUD (z ${hudZ}) must sit above the touch layer (z ${controlsZ})`);
  assert.ok(/\.touch-jump\s*{[^}]*width:\s*5[6-9]px/s.test(mobileCss), 'the jump button is thumb sized');
  assert.ok(
    /#touch-look\s*{[^}]*top:\s*\d+px/s.test(mobileCss),
    'the look area starts below the top HUD bar so it cannot blanket the HUD',
  );
});

await test('tapping jump on a phone actually lifts the traveler', async () => {
  const { window: win } = dom;
  const canvas = document.createElement('canvas');
  const input = new InputManager(canvas);
  const mobile = new MobileControls(input, document.getElementById('mobile-controls'));
  mobile.enable(true);

  const game = {
    state: { flags: {}, items: {} },
    renderer: { tier: 'low' },
    hud: { toast() {} },
    audio: { play() {} },
    input,
    collision: { resolve: () => false },
    worlds: { getHeightAt: () => 0, getSurface: () => 'stone', spawnFootstepDust() {} },
    cameraController: {
      getForward: () => ({ x: 0, z: -1 }),
      getRight: () => ({ x: 1, z: 0 }),
      snapToPlayer() {},
    },
    isMovementBlocked: () => false,
    bus: { emit() {} },
    quests: { setFlag() {} },
    player: { position: new THREE.Vector3() },
  };
  const player = new PlayerController(game);
  game.player = player;
  player.setVisible(true);
  player.teleport(0, 0, 0);
  for (let i = 0; i < 5; i++) player.update(1 / 60, i / 60);
  const start = player.position.y;

  const tap = new win.Event('pointerdown', { bubbles: true, cancelable: true });
  tap.pointerId = 1;
  tap.pointerType = 'touch';
  document.getElementById('btn-jump').dispatchEvent(tap);
  assert.ok(input.pressed.has('jump'), 'the tap reaches the input manager');

  let apex = start;
  for (let i = 0; i < 40; i++) {
    player.update(1 / 60, i / 60);
    apex = Math.max(apex, player.position.y);
  }
  assert.ok(apex - start > 0.8, `jump only reached ${(apex - start).toFixed(2)} above the ground`);
  assert.ok(player.position.y <= start + 0.01, 'the traveler lands again');

  // Interact shares the same wiring.
  const tapInteract = new win.Event('pointerdown', { bubbles: true, cancelable: true });
  tapInteract.pointerId = 2;
  tapInteract.pointerType = 'touch';
  document.getElementById('btn-interact').dispatchEvent(tapInteract);
  assert.ok(input.pressed.has('interact'), 'the interact button is tappable');
  mobile.enable(false);
});

await test('a jump tapped just before landing is not swallowed', async () => {
  const game = makeGame({ isMovementBlocked: () => false });
  game.collision = { resolve: () => false };
  game.worlds = { getHeightAt: () => 0, getSurface: () => 'stone', spawnFootstepDust() {} };
  game.cameraController = {
    ...game.cameraController,
    getForward: () => ({ x: 0, z: -1 }),
    getRight: () => ({ x: 1, z: 0 }),
  };
  const presses = [];
  game.input = {
    getMoveVector: () => ({ x: 0, y: 0 }),
    isDown: () => false,
    consumePress: (action) => {
      if (action !== 'jump' || presses.length === 0) return false;
      presses.shift();
      return true;
    },
    endFrame: () => {},
  };
  const player = new PlayerController(game);
  game.player = player;
  player.setVisible(true);
  player.teleport(0, 0, 0);
  for (let i = 0; i < 5; i++) player.update(1 / 60, i / 60);

  presses.push('jump');
  player.update(1 / 60, 0);
  // Fall until just above the ground, then tap: the buffer must hold the tap
  // for the last few centimetres instead of dropping it.
  let guard = 0;
  while (!(player.velocity.y < 0 && player.position.y < 0.35) && guard++ < 120) {
    player.update(1 / 60, 0);
  }
  assert.ok(!player.grounded, 'still in the air when the tap arrives');

  presses.push('jump');
  let landedJumped = false;
  for (let i = 0; i < 90; i++) {
    player.update(1 / 60, 0);
    if (player.velocity.y > 3) landedJumped = true;
  }
  assert.ok(landedJumped, 'the buffered tap fires on landing instead of being dropped');
});

/* ------------------------------------------------------------------ */
/* The wishing star's pull scene                                      */
/* ------------------------------------------------------------------ */

await test('a wish opens the falling-star scene and skipping reveals the list', async () => {
  clearDynamicUi();
  const game = makeGame();
  game.settings.reducedMotion = false;
  game.shop = new ShopManager(game);
  const shopUI = new ShopUI(game);
  shopUI.open();
  uiRoot().querySelector('.shop-tab[data-tab="wish"]').click();
  await sleep(0);

  assert.ok(uiRoot().querySelector('.shop-wish-sky'), 'the wish tab has its own night sky');
  assert.ok(uiRoot().querySelector('.shop-pity-track'), 'the pity guarantee is a visible road');

  uiRoot().querySelector('.shop-wish-one').click();
  await sleep(0);

  const scene = document.querySelector('.wish-scene');
  assert.ok(scene, 'the pull opens a full-screen scene');
  assert.ok(scene.querySelector('.wish-canvas'), 'the scene draws the star on a canvas');
  assert.ok(scene.querySelector('.wish-card-name').textContent.length > 0, 'the card names the result');

  const slot = uiRoot().querySelector('.shop-wish-result');
  assert.ok(slot.classList.contains('is-awaiting-reveal'), 'the list waits for the star');
  assert.equal(uiRoot().querySelectorAll('.shop-result').length, 1, 'the result is already in the DOM');

  game.shopUI = shopUI;
  shopUI.cinematic.skip();
  await sleep(300);
  assert.equal(document.querySelector('.wish-scene'), null, 'the scene closes when skipped');
  assert.ok(slot.classList.contains('is-revealed'), 'the list is revealed afterwards');
  shopUI.close();
});

await test('the pull scene is a single quiet reveal when motion is reduced', async () => {
  clearDynamicUi();
  const game = makeGame(); // reducedMotion: true
  game.shop = new ShopManager(game);
  const shopUI = new ShopUI(game);
  shopUI.open();
  uiRoot().querySelector('.shop-tab[data-tab="wish"]').click();
  await sleep(0);
  uiRoot().querySelector('.shop-wish-one').click();
  await sleep(0);

  assert.equal(document.querySelector('.wish-scene'), null, 'no flying star for reduced motion');
  assert.ok(
    uiRoot().querySelector('.shop-wish-result').classList.contains('is-revealed'),
    'the results are simply there',
  );
  shopUI.close();
});

await test('the hero card belongs to the rarest result of a ten-pull', () => {
  const hero = WishCinematic.heroOf([
    { name: 'Common thing', rarity: 'common' },
    { name: 'Rare thing', rarity: 'rare' },
    { name: 'Legendary thing', rarity: 'legendary' },
    { name: 'Another common', rarity: 'common' },
  ]);
  assert.equal(hero.name, 'Legendary thing');
  assert.equal(WishCinematic.heroOf([]), null);
});

/* ------------------------------------------------------------------ */
/* The traveler's mirror                                             */
/* ------------------------------------------------------------------ */

function makeInspectCamera(overrides = {}) {
  return new CameraController({
    renderer: { width: 1280, height: 720 },
    input: {
      consumeLookDelta: () => ({ x: 0, y: 0 }),
      consumeZoom: () => 0,
    },
    worlds: { getHeightAt: () => 0 },
    player: { position: new THREE.Vector3(0, 0, 0), facing: 0 },
    ...overrides,
  });
}

await test('the mirror camera orbits the character and zooms right in', () => {
  const camera = makeInspectCamera();
  camera.startInspect();
  assert.ok(camera.inspect, 'inspect mode is on');
  for (let i = 0; i < 40; i++) camera.update(1 / 60);
  const head = new THREE.Vector3(0, 1.2, 0);
  const distance = camera.camera.position.distanceTo(head);
  assert.ok(distance < 3.2, `the camera settles close to her (${distance.toFixed(2)})`);
  assert.ok(distance > 0.6, 'but not inside her head');

  const yaw = camera.inspect.yaw;
  camera.addInspectLook(0.6, 0.1);
  assert.notEqual(camera.inspect.yaw, yaw, 'dragging turns the view');

  for (let i = 0; i < 40; i++) camera.zoom(0.5);
  assert.ok(camera.inspect.targetDistance >= 0.89, 'zooming in is clamped');
  for (let i = 0; i < 40; i++) camera.zoom(-0.5);
  assert.ok(camera.inspect.targetDistance <= 4.61, 'zooming out is clamped');

  camera.stopInspect();
  assert.equal(camera.inspect, null, 'the mirror releases the camera');
});

await test('the mirror opens, turns on drag, zooms on tap and closes cleanly', async () => {
  clearDynamicUi();
  const calls = [];
  const camera = {
    inspectSpin: true,
    inspect: { yaw: 0, pitch: 0, targetDistance: 2.3, idle: 0 },
    addInspectLook: (dx, dy) => calls.push(`look:${dx.toFixed(3)}:${dy.toFixed(3)}`),
    zoom: (delta) => calls.push(`zoom:${delta.toFixed(2)}`),
    setInspectSpin: (on) => calls.push(`spin:${on}`),
    startInspect: () => calls.push('start'),
    stopInspect: () => calls.push('stop'),
    snapToPlayer: () => {},
  };
  const game = makeGame();
  game.cameraController = camera;
  game.player = { facing: 0, position: new THREE.Vector3() };
  game.shop = new ShopManager(game);
  game.openCharacterViewer = () => calls.push('open');
  game.closeCharacterViewer = () => calls.push('close');

  const viewer = new CharacterViewer(game);
  viewer.open();
  await sleep(0);

  const layer = document.querySelector('.viewer');
  assert.ok(layer, 'the mirror is on screen');
  assert.ok(layer.querySelector('.viewer-looks'), 'it lists the worn look');
  const buttons = [...layer.querySelectorAll('.viewer-btn')];
  assert.ok(buttons.length >= 4, 'it offers zoom, spin and a way out');

  const stage = layer.querySelector('.viewer-stage');
  const down = new window.Event('pointerdown', { bubbles: true, cancelable: true });
  down.pointerId = 1;
  down.clientX = 400;
  down.clientY = 300;
  stage.dispatchEvent(down);
  const move = new window.Event('pointermove', { bubbles: true, cancelable: true });
  move.pointerId = 1;
  move.clientX = 460;
  move.clientY = 320;
  stage.dispatchEvent(move);
  assert.ok(calls.some((call) => call.startsWith('look:')), 'dragging turns the traveler');

  const up = new window.Event('pointerup', { bubbles: true, cancelable: true });
  up.pointerId = 1;
  stage.dispatchEvent(up);

  const zoomIn = buttons.find((button) => button.getAttribute('aria-label') === 'Zoom in');
  zoomIn.click();
  assert.ok(calls.some((call) => call === 'zoom:0.35'), 'the zoom button works by tap');

  const spin = layer.querySelector('[data-action="spin"]');
  spin.click();
  assert.ok(calls.some((call) => call === 'spin:false'), 'the slow spin can be switched off');

  const done = buttons.find((button) => button.getAttribute('aria-label') === 'Close the mirror');
  done.click();
  assert.ok(calls.includes('close'), 'the Done button closes the mirror');

  viewer.close();
  assert.equal(document.querySelector('.viewer'), null, 'the mirror layer is removed');
  assert.equal(document.body.classList.contains('is-mirror'), false);
});

await test('the wardrobe and the pause menu both offer the mirror', () => {
  const shopSource = readFileSync(new URL('../src/ui/ShopUI.js', import.meta.url), 'utf8');
  const pauseSource = readFileSync(new URL('../src/ui/SettingsUI.js', import.meta.url), 'utf8');
  const gameSource = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  const viewerCss = readFileSync(new URL('../src/styles/viewer.css', import.meta.url), 'utf8');

  assert.ok(/openCharacterViewer/.test(shopSource), 'the wardrobe opens the mirror');
  assert.ok(/openCharacterViewer/.test(pauseSource), 'the pause menu opens the mirror');
  assert.ok(/closeCharacterViewer/.test(gameSource), 'the game owns the mirror lifecycle');
  assert.ok(/\.viewer-btn\s*{[^}]*height:\s*46px/s.test(viewerCss), 'the mirror buttons are thumb sized');
  assert.ok(/\.viewer-stage\s*{[^}]*touch-action:\s*none/s.test(viewerCss), 'dragging does not scroll the page');
});

await test('pinching on the look area zooms the chase camera', async () => {
  clearDynamicUi();
  const input = new InputManager(document.createElement('canvas'));
  const controls = new MobileControls(input, document.getElementById('mobile-controls'));
  const look = document.getElementById('touch-look');
  const send = (type, id, x, y) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    event.pointerId = id;
    event.pointerType = 'touch';
    event.clientX = x;
    event.clientY = y;
    look.dispatchEvent(event);
  };

  send('pointerdown', 11, 400, 300);
  send('pointerdown', 12, 500, 300);
  send('pointermove', 12, 560, 300);
  const zoom = input.consumeZoom();
  // Spreading the fingers brings the camera in, so the delta is negative.
  assert.ok(zoom < 0, `pinching apart should pull the camera closer (${zoom})`);

  send('pointermove', 12, 420, 300);
  assert.ok(input.consumeZoom() > 0, 'pinching together pushes the camera back out');

  send('pointerup', 11);
  send('pointerup', 12);
  controls.dispose?.();
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
