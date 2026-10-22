/**
 * The quest state machine. Flags and inventory are the saved source of truth;
 * objectives are derived from them via the pure functions in Progression.js.
 */
import { LEVELS, LEVEL_ORDER, CHAPTER_TITLES } from '../story/questData.js';
import {
  makeContext,
  levelProgress,
  currentObjective,
  isLevelComplete,
  isLevelUnlocked,
  nextLevelId,
  summarize,
} from './Progression.js';

export class QuestManager {
  constructor(game) {
    this.game = game;
    this.lastProgress = null;
    this._completing = new Set();
    this._ready = false;
  }

  get state() {
    return this.game.state;
  }

  get flags() {
    return this.state.flags;
  }

  context() {
    return makeContext(this.state.flags, this.game.inventory.items);
  }

  hasFlag(key) {
    const value = this.flags[key];
    return value === true || (typeof value === 'number' && value > 0);
  }

  getFlag(key, fallback = false) {
    return key in this.flags ? this.flags[key] : fallback;
  }

  setFlag(key, value = true) {
    if (this.flags[key] === value) return;
    this.flags[key] = value;
    this.game.bus.emit('flag:changed', { key, value });
    this.refresh();
    this.game.requestSave();
  }

  increment(key, amount = 1) {
    const value = (Number(this.flags[key]) || 0) + amount;
    this.flags[key] = value;
    this.game.bus.emit('flag:changed', { key, value });
    this.refresh();
    this.game.requestSave();
    return value;
  }

  get activeLevel() {
    return this.state.level || 1;
  }

  get activeLevelData() {
    return LEVELS[this.activeLevel];
  }

  progress(levelId = this.activeLevel) {
    return levelProgress(levelId, this.context());
  }

  currentObjective(levelId = this.activeLevel) {
    return currentObjective(levelId, this.context());
  }

  summary() {
    return summarize(this.state, this.context());
  }

  chapterLabel(levelId = this.activeLevel) {
    return {
      kicker: LEVELS[levelId]?.chapter || 'Chapter I',
      title: CHAPTER_TITLES[levelId] || '',
    };
  }

  /** Recompute objectives, push a snapshot to the HUD and detect completion. */
  refresh({ silent = false } = {}) {
    if (!this._ready) return;
    const levelId = this.activeLevel;
    const progress = this.progress(levelId);
    const snapshot = {
      levelId,
      level: LEVELS[levelId],
      ...progress,
      current: currentObjective(levelId, this.context()),
      completed: this.state.completed.includes(levelId),
      unlockedNext: isLevelUnlocked(this.state, Math.min(5, levelId + 1)),
      summary: this.summary(),
    };
    this.lastProgress = snapshot;
    this.game.bus.emit('quest:updated', snapshot);
    if (!silent) this.game.hud?.renderQuest(snapshot);

    if (progress.allDone && !this.state.completed.includes(levelId) && !this._completing.has(levelId)) {
      this._completing.add(levelId);
      this.completeLevel(levelId);
    }
  }

  start() {
    this._ready = true;
    this.refresh();
  }

  completeLevel(levelId) {
    if (this.state.completed.includes(levelId)) return;
    this.state.completed.push(levelId);
    this.state.completed.sort((a, b) => a - b);
    this.flags[`L${levelId}_complete`] = true;
    this.game.bus.emit('level:completed', { levelId, level: LEVELS[levelId] });
    this.game.requestSave({ immediate: true });
    this.refresh();
  }

  /** Used by tests and the save validator. */
  isUnlocked(levelId) {
    return isLevelUnlocked(this.state, levelId);
  }

  nextLevel() {
    return nextLevelId(this.activeLevel);
  }

  setActiveLevel(levelId) {
    if (!LEVELS[levelId]) return false;
    if (!isLevelUnlocked(this.state, levelId)) return false;
    this.state.level = levelId;
    this.refresh();
    return true;
  }

  /** Ordered list for the journal, including locked chapters. */
  journal() {
    return LEVEL_ORDER.map((levelId) => {
      const level = LEVELS[levelId];
      const unlocked = isLevelUnlocked(this.state, levelId);
      const completed = this.state.completed.includes(levelId);
      const progress = unlocked ? levelProgress(levelId, this.context()) : { objectives: [], done: 0, total: 0 };
      return {
        level,
        unlocked,
        completed,
        active: this.activeLevel === levelId,
        objectives: progress.objectives,
      };
    });
  }
}
