/**
 * Pure progression rules. No DOM, no Three.js — this module is unit-testable
 * and is the single source of truth for "what is done" and "what is unlocked".
 */
import { LEVELS, LEVEL_ORDER } from '../story/questData.js';

export function makeContext(flags = {}, items = {}) {
  return {
    flags: flags || {},
    items: items || {},
    count(itemId) {
      const value = this.items?.[itemId];
      return Number.isFinite(value) ? value : 0;
    },
  };
}

/** Status of every objective of a level. */
export function objectiveStatus(levelId, ctx) {
  const level = LEVELS[levelId];
  if (!level) return [];
  return level.objectives.map((objective) => {
    const target = objective.target || 1;
    let value = 0;
    try {
      value = Number(objective.progress(ctx)) || 0;
    } catch {
      value = 0;
    }
    value = Math.max(0, Math.min(target, value));
    return {
      id: objective.id,
      text: objective.text,
      hint: objective.hint || '',
      optional: !!objective.optional,
      target,
      value,
      done: value >= target,
    };
  });
}

export function levelProgress(levelId, ctx) {
  const objectives = objectiveStatus(levelId, ctx);
  const required = objectives.filter((o) => !o.optional);
  const done = required.filter((o) => o.done).length;
  return {
    objectives,
    done,
    total: required.length,
    allDone: required.length > 0 && done === required.length,
    ratio: required.length ? done / required.length : 0,
  };
}

/** The next objective the player should be chasing (skips completed ones). */
export function currentObjective(levelId, ctx) {
  const statuses = objectiveStatus(levelId, ctx);
  return statuses.find((o) => !o.done && !o.optional) || statuses.find((o) => !o.done) || null;
}

export function isLevelComplete(levelId, ctx) {
  return levelProgress(levelId, ctx).allDone;
}

export function completedLevels(state) {
  return Array.isArray(state?.completed) ? state.completed : [];
}

export function isLevelCompleted(state, levelId) {
  return completedLevels(state).includes(levelId);
}

/**
 * A chapter is unlocked only when the previous chapter is complete.
 * There is intentionally no UI that can override this.
 */
export function isLevelUnlocked(state, levelId) {
  if (levelId === 1) return true;
  return isLevelCompleted(state, levelId - 1);
}

/** Highest level the player may access. */
export function furthestUnlockedLevel(state) {
  let furthest = 1;
  for (const id of LEVEL_ORDER) {
    if (isLevelUnlocked(state, id)) furthest = id;
  }
  return furthest;
}

export function nextLevelId(levelId) {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index === -1) return null;
  return LEVEL_ORDER[index + 1] || null;
}

/**
 * The reveal gate. The ancient book is only allowed to show its hidden page
 * when the whole celestial chapter has been finished and the player has
 * physically opened the book in the library below the archive.
 */
export function canRevealHiddenPage(state) {
  if (!state) return false;
  const flags = state.flags || {};
  return (
    isLevelCompleted(state, 4) &&
    flags.L4_seal === true &&
    flags.L5_entered === true &&
    flags.L5_bookOpened === true
  );
}

export function canEnterEnding(state) {
  if (!state) return false;
  return state.discoveredPage === true && state.flags?.L5_messageRead === true;
}

/** Compact progress summary for the pause menu. */
export function summarize(state, ctx) {
  const levelId = state?.level || 1;
  const progress = levelProgress(levelId, ctx);
  return {
    levelId,
    chapter: LEVELS[levelId]?.chapter || 'Chapter I',
    title: LEVELS[levelId]?.title || '',
    done: progress.done,
    total: progress.total,
    completed: completedLevels(state),
    discoveredPage: !!state?.discoveredPage,
    endingSeen: !!state?.endingSeen,
  };
}
