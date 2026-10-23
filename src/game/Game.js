/**
 * Game — the orchestrator.
 *
 * Owns the frame loop, the persistent state, and the wiring between systems.
 * Individual systems never reach into each other directly; they receive the
 * game instance and talk through it (or through the event bus).
 */
import { EventBus } from './EventBus.js';
import { Renderer, isWebGLAvailable } from './Renderer.js';
import { SceneManager } from './SceneManager.js';
import { CameraController } from './CameraController.js';
import { InputManager } from './InputManager.js';
import { MobileControls } from './MobileControls.js';
import { CollisionSystem } from './CollisionSystem.js';
import { PlayerController } from './PlayerController.js';
import { InteractionSystem } from './InteractionSystem.js';
import { WorldManager } from './WorldManager.js';
import { QuestManager } from './QuestManager.js';
import { LevelManager } from './LevelManager.js';
import { InventoryManager } from './InventoryManager.js';
import { ShopManager } from './ShopManager.js';
import { SaveManager, createNewState, normalizeSettings } from './SaveManager.js';
import { AudioManager } from './AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { DialogueUI } from '../ui/DialogueUI.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { ShopUI } from '../ui/ShopUI.js';
import { JournalUI } from '../ui/JournalUI.js';
import { SettingsUI, PauseMenu } from '../ui/SettingsUI.js';
import { BookUI } from '../ui/BookUI.js';
import { Cinematics } from '../ui/Cinematics.js';
import { Modal } from '../ui/Modal.js';
import { SecretReveal } from '../story/SecretReveal.js';
import { FinalEnding } from '../story/FinalEnding.js';
import { INTRO_NARRATION, LORE, BARKS } from '../story/storyData.js';
import { canEnterEnding, nextDestination } from './Progression.js';

const MAX_DT = 0.05;

export class Game {
  /**
   * @param {{ rendererFactory?: ((container: HTMLElement, settings: object) => object) | null }} [options]
   *   `rendererFactory` is a test seam: the integration harness supplies a
   *   headless renderer because a real one needs WebGL. Production never
   *   passes it, so the availability check and Renderer stay on the path.
   */
  constructor({ rendererFactory = null } = {}) {
    this._rendererFactory = rendererFactory;
    this.bus = new EventBus();
    this.saveManager = new SaveManager();
    this.settings = normalizeSettings(this.saveManager.loadSettings());
    this.state = this.saveManager.loadState() || createNewState();

    this.root = document.getElementById('app');
    this.sceneRoot = document.getElementById('scene-root');
    this.blockers = new Set();
    this.paused = false;
    this.titleMode = true;
    this.transitioning = false;
    this.started = false;
    this.elapsed = 0;
    this.playtimeAccum = 0;
    this._lastFrame = 0;
    this._loopHandle = null;
    this._starting = false;
    this._orientationBlocked = false;
    this._fatal = false;
    this._revealRequested = false;
    this._lockPauseTimer = null;
  }

  /* ================================================================ */
  /* Boot                                                             */
  /* ================================================================ */

  async boot() {
    if (!this._rendererFactory && !isWebGLAvailable()) {
      this.showFatal(
        'The wind could not reach this world',
        'This browser or device does not support WebGL, which Project Asteria needs for its 3D world.',
        'Try enabling hardware acceleration, updating your browser, or opening the game on a newer device.',
      );
      return;
    }

    try {
      this.renderer = this._rendererFactory
        ? this._rendererFactory(this.sceneRoot, this.settings)
        : new Renderer(this.sceneRoot, this.settings);
    } catch (err) {
      console.error(err);
      this.showFatal(
        'The wind could not reach this world',
        'WebGL could not be initialized on this device.',
        'Try enabling hardware acceleration, updating your browser, or opening the game on another device.',
      );
      return;
    }

    this.sceneManager = new SceneManager();
    this.cameraController = new CameraController(this);
    this.input = new InputManager(this.renderer.canvas);
    this.input.onPointerLockChange = (locked) => this._onPointerLockChange(locked);
    this.input.setSensitivity(this.settings.sensitivity);
    this.input.invertY = this.settings.invertY;
    this.collision = new CollisionSystem();
    this.audio = new AudioManager(this.settings);
    this.mobile = new MobileControls(this.input, document.getElementById('mobile-controls'));

    this.inventory = new InventoryManager(this);
    this.quests = new QuestManager(this);
    this.levels = new LevelManager(this);
    this.player = new PlayerController(this);
    // The player lives outside worldRoot so swapping worlds never disposes them.
    this.sceneManager.scene.add(this.player.group);
    // After the player, so any owned looks are worn from the first frame.
    this.shop = new ShopManager(this);
    this.worlds = new WorldManager(this);
    this.interactions = new InteractionSystem(this);
    this.hud = new HUD(this);
    this.dialogue = new DialogueUI(this);
    this.inventoryUI = new InventoryUI(this);
    this.shopUI = new ShopUI(this);
    this.journalUI = new JournalUI(this);
    this.settingsUI = new SettingsUI(this);
    this.pauseMenu = new PauseMenu(this);
    this.cinematics = new Cinematics(this);
    this.bookUI = new BookUI(this);
    this.secretReveal = new SecretReveal(this);
    this.ending = new FinalEnding(this);
    this.modal = new Modal(this);

    document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);

    this.hud.hide();
    this.hud.updateSoundButton();
    this.mobile.enable(false);
    this.setLoading(true, 'The wind is rising…', 'Gathering the chronicle');

    this._bindGlobalEvents();
    this._startLoop();

    // Build the meadow behind the title screen.
    try {
      await this.worlds.enter('mondstadt', { level: 1 });
      const world = this.worlds.current;
      if (world?.getTitleCamera) this.cameraController.startOrbit(world.getTitleCamera());
      this.setLoading(false);
      this.showTitle();
      await this.cinematics.fadeIn(1200);
    } catch (err) {
      console.error(err);
      this.setLoading(false);
      this.showFatal(
        'The world could not be built',
        'Something went wrong while preparing the meadow.',
        'Reload the page to try again. If it keeps happening, try a different browser.',
      );
    }

    this._checkOrientation();
  }

  /** Gentle onboarding: movement is taught by doing, looking and interacting after. */
  _showOpeningHints() {
    if (this._openingHintsShown || !this.settings.hints) return;
    this._openingHintsShown = true;
    setTimeout(() => {
      if (!this.started || this.titleMode) return;
      this.hud.toast({ icon: '◈', text: BARKS.lookTutorial, variant: 'hint' });
    }, 1600);
    setTimeout(() => {
      if (!this.started || this.titleMode) return;
      this.hud.toast({ icon: '⌘', text: BARKS.interactTutorial, variant: 'hint' });
    }, 8200);
    setTimeout(() => {
      if (!this.started || this.titleMode) return;
      this.hud.toast({ icon: '❔', text: 'Press H at any time for the full control list.', variant: 'hint' });
    }, 14800);
  }

  _bindGlobalEvents() {
    this.bus.on('player:first-steps', () => {
      if (!this.started) return;
      if (this.state.level === 1) this.quests.setFlag('L1_moved', true);
      this._showOpeningHints();
    });

    this.bus.on('level:completed', ({ levelId }) => this._onLevelComplete(levelId));

    // Small, steady income so the ledger is never out of reach for a reader
    // who explores instead of grinding. Cosmetic-only, so it cannot break a chapter.
    this.bus.on('inventory:changed', ({ id, amount }) => {
      if (id === 'windFragment' && amount > 0) this.shop?.earnFromEvent('fragment');
    });

    this.bus.on('world:entered', ({ world }) => {
      this.player.setShadows(this.renderer.tier === 'high');
      this.interactions.refresh();
      world?.onEnter?.();
    });

    document.getElementById('btn-start')?.addEventListener('click', () => {
      this.audio.unlock();
      if (this.saveManager.hasState()) {
        this.confirm({
          title: 'Begin a new adventure?',
          message:
            'A saved journey already exists. Starting a new adventure will replace it. You can keep the saved journey instead.',
          confirmLabel: 'Start new',
          cancelLabel: 'Keep my journey',
          danger: true,
        }).then((confirmed) => {
          if (confirmed) this.startNewGame({ reset: true });
        });
      } else {
        this.startNewGame();
      }
    });

    document.getElementById('btn-continue')?.addEventListener('click', () => {
      this.audio.unlock();
      this.continueGame();
    });

    document.getElementById('btn-title-new')?.addEventListener('click', () => {
      this.audio.unlock();
      this.confirm({
        title: 'Start over?',
        message: 'This will clear the saved journey and begin Chapter I again.',
        confirmLabel: 'Start over',
        danger: true,
      }).then((confirmed) => {
        if (confirmed) this.startNewGame({ reset: true });
      });
    });

    document.getElementById('btn-title-settings')?.addEventListener('click', () => {
      this.audio.unlock();
      this.settingsUI.open({ fromTitle: true });
    });

    document.getElementById('btn-title-sound')?.addEventListener('click', () => {
      this.audio.unlock();
      this.toggleMute();
    });

    document.getElementById('fatal-reload')?.addEventListener('click', () => window.location.reload());

    window.addEventListener('resize', () => this._checkOrientation());
    window.addEventListener('orientationchange', () => setTimeout(() => this._checkOrientation(), 220));
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveNow();
        this.input.exitPointerLock();
      }
    });

    // Escape while paused is handled by the modal; while playing it pauses.
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.started && !this.titleMode && !this.paused && !this.blockers.size) {
        event.preventDefault();
        this.openPauseMenu();
      }
    });

  }

  /* ================================================================ */
  /* Title                                                            */
  /* ================================================================ */

  showTitle() {
    this.titleMode = true;
    this.started = false;
    this.removeBlocker('ending');
    this.player.setVisible(false);
    this.hud.hide();
    this.hud.setPrompt(null);
    this.mobile.enable(false);
    this.ending.stop();
    this.cinematics.clearCaption();
    this.cinematics.setLetterbox(false);

    const title = document.getElementById('screen-title');
    title?.classList.remove('is-leaving');
    title?.classList.remove('hidden');
    document.getElementById('screen-loading')?.classList.add('hidden');

    const hasSave = this.saveManager.hasState() && this.state.started;
    const continueBtn = document.getElementById('btn-continue');
    continueBtn?.classList.toggle('hidden', !hasSave);
    document.getElementById('btn-title-new')?.classList.toggle('hidden', !hasSave);

    this.hud.updateSoundButton();

    if (this.worlds.current?.getTitleCamera) {
      this.cameraController.startOrbit(this.worlds.current.getTitleCamera());
    }
  }

  hideTitle() {
    const title = document.getElementById('screen-title');
    if (!title) return;
    title.classList.add('is-leaving');
    setTimeout(() => title.classList.add('hidden'), 1200);
  }

  /* ================================================================ */
  /* State & start / continue                                         */
  /* ================================================================ */

  _applyState(state) {
    this.state = state;
    // Both managers read through `game.state`, so only the item alias needs
    // to be re-pointed at the freshly loaded object.
    this.inventory.items = state.items || {};
    this.state.items = this.inventory.items;
    this.shop?.refresh();
    this.quests.start();
  }

  async startNewGame({ reset = false } = {}) {
    if (this._starting) return;
    this._starting = true;

    // Fullscreen must be requested inside the click gesture.
    this.requestFullscreen();
    this.audio.unlock();
    this.hideTitle();
    this.setLoading(true, 'The wind is rising…', 'Opening the meadow');

    try {
      if (reset) this.saveManager.clearState();
      const state = createNewState();
      state.started = true;
      state.level = 1;
      state.world = 'mondstadt';
      this._applyState(state);

      this.titleMode = false;
      this.started = true;
      this.ending.stop();
      this.cameraController.stopOrbit();
      this.cameraController.exitCinematic();

      await this.worlds.enter('mondstadt', { level: 1 });
      const world = this.worlds.current;
      const spawn = world.spawns.default;
      this.player.setVisible(true);
      this.player.teleport(spawn.x, spawn.z, spawn.yaw);
      this.levels.onWorldEntered('mondstadt');

      this.hud.show();
      this.hud.setChapter('Chapter I', 'Whispers of the Wind');
      this.mobile.enable(this.mobile.isTouchDevice);
      this.setLoading(false);
      await this.cinematics.fadeIn(900);

      // Opening narration, then the chapter card.
      this.cinematics.setLetterbox(true);
      this.addBlocker('intro');
      this.audio.setScene({ music: 'meadow', ambience: 'meadow' });
      await this.dialogue.play({ lines: INTRO_NARRATION });
      this.removeBlocker('intro');
      this.cinematics.setLetterbox(false);

      this.hud.toast({
        icon: '✦',
        kicker: 'Chapter I',
        text: 'Speak with Wren by the wind shrine.',
        variant: 'quest',
      });
      if (this.settings.hints) {
        this.hud.toast({ icon: '➤', text: BARKS.moveTutorial, variant: 'hint' });
      }

      this.quests.refresh();
      this.saveNow();
    } catch (err) {
      console.error(err);
      this.setLoading(false);
      this.showFatal('The adventure could not begin', 'Something went wrong while entering the meadow.', 'Reload the page and try again.');
    } finally {
      this._starting = false;
    }
  }

  async continueGame() {
    if (this._starting) return;
    this._starting = true;
    this.requestFullscreen();
    this.audio.unlock();
    this.hideTitle();
    this.setLoading(true, 'The wind remembers…', 'Returning to your journey');

    try {
      const loaded = this.saveManager.loadState();
      if (!loaded || !loaded.started) {
        this._starting = false;
        this.setLoading(false);
        this.startNewGame();
        return;
      }
      this._applyState(loaded);
      this.titleMode = false;
      this.started = true;
      this.cameraController.stopOrbit();

      const worldId = this.worlds.hasWorld(loaded.world) ? loaded.world : 'mondstadt';
      await this.worlds.enter(worldId, { level: loaded.level });
      const world = this.worlds.current;
      const spawn = world.spawns[loaded.spawn] || world.spawns.default;
      this.player.setVisible(true);
      this.player.teleport(spawn.x, spawn.z, spawn.yaw);

      this.hud.show();
      this.mobile.enable(this.mobile.isTouchDevice);
      this.cameraController.snapToPlayer();
      this.levels.onWorldEntered(worldId);
      this.quests.refresh();
      this.setLoading(false);
      await this.cinematics.fadeIn(800);

      this.hud.toast({
        icon: '✦',
        kicker: 'Welcome back',
        text: `${this.quests.chapterLabel().kicker} — ${this.quests.chapterLabel().title}`,
        detail: 'Your progress has been restored.',
        variant: 'quest',
      });
    } catch (err) {
      console.error(err);
      this.setLoading(false);
      this.showFatal('The journey could not be restored', 'Your save could not be loaded into the world.', 'You can return to the title screen and begin again.');
    } finally {
      this._starting = false;
    }
  }

  /* ================================================================ */
  /* World travel                                                     */
  /* ================================================================ */

  async travelToWorld(worldId, spawnId = 'default', { level = null, bypassGate = false } = {}) {
    if (this.transitioning) return false;

    // A world load can still be unwinding from an earlier jump (or from the
    // queue WorldManager keeps). Travelling into that returns null and the
    // journey silently does nothing, so wait for the manager to be free first.
    if (this.worlds?.loading) {
      const started = Date.now();
      while (this.worlds.loading && Date.now() - started < 4000) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }

    // The world's own waystones route through LevelManager, which checks the
    // gate with a specific message. Callers that legitimately skip it (the
    // ending, the title screen) pass bypassGate.
    if (!bypassGate && this.levels) {
      const gate = this.levels.canTravelTo(worldId);
      if (!gate.ok) {
        this.toast(gate.message || 'The way is closed.', 'hint');
        this.audio.play('locked');
        return false;
      }
    }

    this.transitioning = true;
    this.addBlocker('transition');
    this.input.exitPointerLock();
    this.hud.setPrompt(null);

    try {
      await this.cinematics.fadeOut(550);
      this.cameraController.exitCinematic();
      this.ending.stop();
      this.removeBlocker('ending');
      this.ending.layer?.classList.add('hidden');

      const world = await this.worlds.enter(worldId, { level: level ?? this.state.level });
      if (!world) return false;
      const spawn = world.spawns[spawnId] || world.spawns.default;
      this.player.setVisible(true);
      this.player.teleport(spawn.x, spawn.z, spawn.yaw);
      this.cameraController.stopOrbit();
      this.cameraController.snapToPlayer();

      this.state.world = worldId;
      this.state.spawn = spawnId;
      if (Number.isInteger(level) && level >= 1 && level <= 5 && this.quests.isUnlocked(level)) {
        this.state.level = Math.max(this.state.level, level);
      }

      this.levels.onWorldEntered(worldId);
      this.quests.refresh();
      this.hud.show();
      this.mobile.enable(this.mobile.isTouchDevice);
      this.removeBlocker('transition');
      await this.cinematics.fadeIn(900);
      this.saveNow();
      return true;
    } catch (err) {
      console.error('[Travel] failed', err);
      this.removeBlocker('transition');
      await this.cinematics.fadeIn(600);
      this.toast('The way is blocked. Try the waystone again.', 'hint');
      return false;
    } finally {
      this.transitioning = false;
    }
  }

  /* ================================================================ */
  /* Loop                                                             */
  /* ================================================================ */

  _startLoop() {
    const loop = (now) => {
      this._loopHandle = requestAnimationFrame(loop);
      if (!this._lastFrame) this._lastFrame = now;
      const raw = (now - this._lastFrame) / 1000;
      this._lastFrame = now;
      const dt = Math.min(MAX_DT, Math.max(0, raw));
      this.update(dt);
      this.renderer.render(this.sceneManager.scene, this.cameraController.camera);
      this.input.endFrame();
    };
    this._loopHandle = requestAnimationFrame(loop);
  }

  update(dt) {
    if (this._fatal) return;
    this.elapsed += dt;
    if (!this.paused) this.playtimeAccum += dt;
    this.renderer.trackFrame(dt);

    this._handleGlobalInput();

    if (this.paused || this._orientationBlocked) {
      this.cameraController.update(dt * 0.2);
      this.worlds.update(dt * 0.2, this.elapsed);
      this.audio.update(dt);
      this.hud.update(dt);
      return;
    }

    this.cameraController.update(dt);
    this.player.update(dt, this.elapsed);
    this.worlds.update(dt, this.elapsed);
    this.interactions.update(dt);
    this.hud.update(dt);
    this.audio.update(dt);

    if (this.started && this.playtimeAccum > 12) {
      this.state.playtime += this.playtimeAccum;
      this.playtimeAccum = 0;
      this.requestSave();
    }
  }

  _handleGlobalInput() {
    if (!this.started || this.titleMode || this.transitioning) return;
    if (this.paused || this.blockers.size) return;

    if (this.input.consumePress('inventory')) {
      this.inventoryUI.open();
      return;
    }
    if (this.input.consumePress('journal')) {
      this.journalUI.open();
      return;
    }
    if (this.input.consumePress('shop')) {
      this.shopUI.open();
      return;
    }
    if (this.input.consumePress('help')) {
      this.settingsUI.showControls();
      return;
    }
  }

  /* ================================================================ */
  /* Blocks, pause, settings                                          */
  /* ================================================================ */

  addBlocker(id) {
    this.blockers.add(id);
    if (this.blockers.size && this.player) this.hud?.setPrompt(null);
  }

  removeBlocker(id) {
    this.blockers.delete(id);
  }

  isInputBlocked() {
    return this.paused || this.blockers.size > 0 || !this.player?.visible || this.titleMode;
  }

  isMovementBlocked() {
    return this.isInputBlocked() || this.transitioning;
  }

  /**
   * Browsers swallow the Escape keydown that releases pointer lock, so a
   * keyboard player pressing Esc used to lose the mouse and get no menu at all
   * — which reads as "the menu is broken". Treat the release itself as the
   * pause request, with every legitimate release (dialogues, modals, travel,
   * the ending, tab switches) already guarded by a blocker.
   */
  _onPointerLockChange(locked) {
    clearTimeout(this._lockPauseTimer);
    this._lockPauseTimer = null;
    if (locked) return;
    if (!this.started || this.titleMode || this.transitioning || this.paused) return;
    if (this.blockers.size) return;
    this._lockPauseTimer = setTimeout(() => {
      this._lockPauseTimer = null;
      if (!this.started || this.titleMode || this.transitioning || this.paused) return;
      if (this.blockers.size || document.pointerLockElement) return;
      this.openPauseMenu();
    }, 240);
  }

  openPauseMenu() {
    if (this.paused || this.titleMode || !this.started) return;
    clearTimeout(this._lockPauseTimer);
    this._lockPauseTimer = null;
    this.paused = true;
    document.body.classList.add('is-paused');
    this.input.exitPointerLock();
    this.pauseMenu.open();
  }

  /**
   * A panel opened from the pause menu closes back into the pause menu.
   * Without this, closing the satchel left the game paused with no menu on
   * screen and no Escape handler running — which reads as a frozen game.
   */
  returnToPause() {
    if (!this.paused) return;
    this.paused = false;
    document.body.classList.remove('is-paused');
    this.openPauseMenu();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    document.body.classList.remove('is-paused');
    if (!this.renderer.isMobile && this.blockers.size === 0) this.input.requestPointerLock();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.setVolumes(this.settings);
    this.saveSettings();
    this.hud.updateSoundButton();
    this.hud.toast({
      icon: this.settings.muted ? '◌' : '♪',
      text: this.settings.muted ? 'Sound muted' : 'Sound restored',
      variant: 'hint',
    });
  }

  saveSettings() {
    this.saveManager.saveSettings(this.settings);
  }

  applySettings() {
    document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);
    this.input?.setSensitivity(this.settings.sensitivity);
    if (this.input) this.input.invertY = this.settings.invertY;
    this.audio?.setVolumes(this.settings);
    this.renderer?.applyQuality();
    this.saveSettings();
  }

  requestSave({ immediate = false } = {}) {
    if (!this.state?.started) return;
    this.state.playtime += this.playtimeAccum;
    this.playtimeAccum = 0;
    if (immediate) this.saveManager.saveState(this.state);
    else this.saveManager.queueSave(this.state);
  }

  saveNow() {
    if (!this.state) return;
    this.saveManager.flush();
    this.state.playtime += this.playtimeAccum;
    this.playtimeAccum = 0;
    if (this.state.started || this.saveManager.hasState()) {
      this.saveManager.saveState(this.state);
    }
    this.saveSettings();
  }

  returnToSafePoint() {
    if (!this.player) return;
    this.player.respawn();
    this.toast('You return to the last safe place.', 'hint');
    this.resume();
  }

  /**
   * Travel to wherever the chronicle continues. Used by the pause menu, so a
   * player who is stuck between chapters always has a way forward that never
   * skips a gate the progress rules would refuse.
   */
  async resumeChronicle({ silent = false } = {}) {
    if (!this.started || this.titleMode) return false;
    const destination = nextDestination(this.state);
    if (!destination) return false;
    if (this.worlds.currentId === destination.world) {
      if (!silent) this.toast('You are already where the chronicle continues.', 'hint');
      return false;
    }
    this.resume();
    const moved = await this.travelToWorld(destination.world, destination.spawn, {
      level: destination.level,
      bypassGate: true,
    });
    if (moved && !silent) {
      this.hud?.toast({
        icon: '✦',
        kicker: 'The chronicle continues',
        text: destination.label,
        variant: 'quest',
      });
    }
    return moved;
  }

  async requestFullscreen() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      /* Fullscreen is optional; the game is fully playable without it. */
    }
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      this.toast('Fullscreen is not available in this browser.', 'hint');
    }
  }

  _checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    const touch = this.mobile?.isTouchDevice;
    const shouldBlock = portrait && touch && this.started && !this.titleMode;
    const screen = document.getElementById('screen-rotate');
    screen?.classList.toggle('hidden', !shouldBlock);
    this._orientationBlocked = shouldBlock;
  }

  /* ================================================================ */
  /* UI helpers                                                       */
  /* ================================================================ */

  setLoading(visible, title = '', hint = '') {
    const screen = document.getElementById('screen-loading');
    if (!screen) return;
    if (visible) {
      screen.classList.remove('hidden');
      screen.classList.remove('is-leaving');
      if (title) document.getElementById('loading-title').textContent = title;
      if (hint) document.getElementById('loading-hint').textContent = hint;
      const fill = document.getElementById('loading-fill');
      if (fill) fill.style.width = '36%';
    } else {
      const fill = document.getElementById('loading-fill');
      if (fill) fill.style.width = '100%';
      screen.classList.add('is-leaving');
      setTimeout(() => screen.classList.add('hidden'), 850);
    }
  }

  showFatal(title, message, hint) {
    this._fatal = true;
    const screen = document.getElementById('screen-fatal');
    if (!screen) return;
    document.getElementById('fatal-title').textContent = title;
    document.getElementById('fatal-message').textContent = message;
    document.getElementById('fatal-hint').textContent = hint || '';
    screen.classList.remove('hidden');
    this.setLoading(false);
    if (this._loopHandle) cancelAnimationFrame(this._loopHandle);
    this.saveManager.flush();
  }

  toast(options, variant) {
    if (typeof options === 'string') this.hud.toast({ text: options, variant });
    else this.hud.toast(options);
  }

  openLore(key, titleOverride = null, linesOverride = null) {
    const data = LORE[key] || {};
    const title = titleOverride || data.title || 'Notes';
    const pages = linesOverride || data.pages || [];
    const body = document.createElement('div');
    for (const line of pages) {
      const p = document.createElement('p');
      p.className = 'confirm-message';
      p.style.fontStyle = 'italic';
      p.textContent = line;
      body.appendChild(p);
    }
    this.audio.play('page');
    this.modal.open({
      title,
      subtitle: 'A page worth reading',
      body,
      actions: [{ label: 'Close', variant: 'ghost' }],
    });
  }

  confirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (value) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };
      this.modal.open({
        title,
        body: `<p class="confirm-message">${message}</p>`,
        actions: [
          {
            label: cancelLabel,
            variant: 'ghost',
            onClick: () => finish(false),
          },
          {
            label: confirmLabel,
            variant: danger ? 'danger' : 'primary',
            onClick: () => finish(true),
          },
        ],
        onClose: () => finish(false),
      });
    });
  }

  confirmResetProgress() {
    this.confirm({
      title: 'Reset all progress?',
      message:
        'This clears the chronicle completely — chapters, items, puzzles and the discovery of the hidden page. It cannot be undone.',
      confirmLabel: 'Reset everything',
      cancelLabel: 'Keep my journey',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.confirm({
        title: 'One more time',
        message: 'The wind will forget this journey. Do you want to begin again from the title screen?',
        confirmLabel: 'Yes, reset',
        cancelLabel: 'No',
        danger: true,
      }).then((second) => {
        if (!second) return;
        this.saveManager.clearState();
        this.state = createNewState();
        this.saveSettings();
        window.location.reload();
      });
    });
  }

  /* ================================================================ */
  /* Level completion                                                 */
  /* ================================================================ */

  async _onLevelComplete(levelId) {
    if (!this.started) return;
    try {
      this.levels.onLevelComplete(levelId);
    } catch (err) {
      // A world's own completion flourish must never take the chapter card,
      // the reward or the save down with it.
      console.error('[Chapter] world completion failed', err);
    }
    this.audio.play('chapter');
    this.cinematics.completeChapter(levelId).catch(() => {});

    this.shop?.earnFromEvent('chapter', { label: 'Chapter reward' });

    const reward = this.levels.rewardFor(levelId);
    if (reward) {
      this.toast({
        icon: '✦',
        kicker: 'Chapter Reward',
        text: reward.label,
        variant: 'item',
      });
    }

    this.saveNow();
    this.quests.refresh();
    this.hud.setChapter(
      this.quests.chapterLabel().kicker,
      this.quests.chapterLabel().title,
    );

    if (levelId === 5) {
      this.toast({
        icon: '❧',
        text: 'The chronicle is complete. The library will remember you.',
        variant: 'quest',
      });
    }
  }

  /* ================================================================ */
  /* Ending                                                           */
  /* ================================================================ */

  async startEnding() {
    if (!canEnterEnding(this.state)) {
      this.toast('The way is not open yet.', 'hint');
      return false;
    }
    this.audio.play('reveal');
    const ok = await this.travelToWorld('sanctuary', 'default', { level: 5, bypassGate: true });
    if (!ok) return false;
    this.state.flags.ending_started = true;
    this.state.endingSeen = true;
    this.shop?.earnFromEvent('ending', { label: 'The chronicle closes' });
    this.saveNow();

    // The ending is a quiet, hands-off scene: no movement, no HUD, and a mouse
    // that can reach the buttons on the overlay.
    this.addBlocker('ending');
    this.hud.hide();
    this.input.exitPointerLock();
    await this.ending.start();
    return true;
  }

  async returnFromEnding() {
    this.ending.stop();
    this.removeBlocker('ending');
    this.state.endingSeen = true;
    this.saveNow();
    this.hud.show();
    this.cinematics.setLetterbox(false);
    this.cameraController.stopOrbit();
    this.cameraController.exitCinematic();
    await this.travelToWorld('hiddenLibrary', 'default', { level: 5, bypassGate: true });
    this.toast({
      icon: '❧',
      text: 'The library is quiet again. The chronicle is on its pedestal.',
      variant: 'hint',
    });
  }

  async returnToTitle() {
    this.saveNow();
    this.addBlocker('transition');
    await this.cinematics.fadeOut(600);
    this.ending.stop();
    this.hud.hide();
    this.mobile.enable(false);
    this.player.setVisible(false);
    this.cameraController.exitCinematic();
    try {
      await this.worlds.enter('mondstadt', { level: 1 });
      if (this.worlds.current?.getTitleCamera) {
        this.cameraController.startOrbit(this.worlds.current.getTitleCamera());
      }
    } catch (err) {
      console.warn(err);
    }
    this.titleMode = true;
    this.started = false;
    this.removeBlocker('transition');
    this.showTitle();
    await this.cinematics.fadeIn(900);
  }
}
