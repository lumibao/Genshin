/**
 * Chapter flow: which world belongs to which level, what the player is allowed
 * to enter, and the narrative beats that fire the first time an area loads.
 */
import { LEVELS, LEVEL_WORLDS } from '../story/questData.js';
import { WORLD_INTROS, CHAPTER_CARDS, BARKS } from '../story/storyData.js';
import { isLevelCompleted } from './Progression.js';

export const WORLD_LEVELS = {
  mondstadt: 1,
  whisperingWoods: 2,
  ancientRuins: 2,
  archive: 3,
  observatory: 4,
  hiddenLibrary: 5,
  sanctuary: 5,
};

export class LevelManager {
  constructor(game) {
    this.game = game;
    this._handlingEntry = false;
  }

  canTravelTo(worldId) {
    const state = this.game.state;
    const flags = state.flags;
    switch (worldId) {
      case 'mondstadt':
      case 'whisperingWoods':
        return { ok: true };
      case 'ancientRuins':
        return { ok: true };
      case 'archive':
        if (!isLevelCompleted(state, 2)) {
          return { ok: false, message: 'The stair is dark. The ruins still hold a page you have not found.' };
        }
        return { ok: true };
      case 'observatory':
        if (!isLevelCompleted(state, 3)) {
          return { ok: false, message: BARKS.observatoryLocked };
        }
        return { ok: true };
      case 'hiddenLibrary':
        if (!isLevelCompleted(state, 4)) {
          return { ok: false, message: BARKS.librarySealed };
        }
        if (!flags.L4_seal) {
          return { ok: false, message: 'The celestial lock is missing its final seal.' };
        }
        return { ok: true };
      case 'sanctuary':
        if (!state.discoveredPage || !flags.L5_messageRead) {
          return { ok: false, message: 'The way is not open yet. The book has not been read.' };
        }
        return { ok: true };
      default:
        return { ok: false, message: 'The wind does not know that road.' };
    }
  }

  async requestTravel(worldId, spawn = 'default', options = {}) {
    const check = this.canTravelTo(worldId);
    if (!check.ok) {
      this.game.hud?.toast({ text: check.message, variant: 'hint', icon: '✦' });
      this.game.audio?.play('locked');
      return false;
    }
    await this.game.travelToWorld(worldId, spawn, options);
    return true;
  }

  /** Called by Game after a world finishes loading. */
  onWorldEntered(worldId) {
    const state = this.game.state;
    const flags = state.flags;
    const quests = this.game.quests;
    const levelId = WORLD_LEVELS[worldId] || state.level;

    state.world = worldId;
    if (levelId > state.level && quests.isUnlocked(levelId)) state.level = levelId;

    switch (worldId) {
      case 'whisperingWoods':
        quests.setFlag('L2_enteredWoods', true);
        break;
      case 'ancientRuins':
        quests.setFlag('L2_foundRuins', true);
        break;
      case 'archive': {
        quests.setFlag('L3_entered', true);
        const returningWithSeal = !!flags.L4_seal && !flags.L4_returned;
        if (returningWithSeal) {
          quests.setFlag('L4_returned', true);
          this.game.hud?.toast({
            icon: '☾',
            kicker: 'The seal returns',
            text: 'The celestial lock is whole.',
            detail: 'The stair on the east wall of the archive will open now.',
            variant: 'quest',
          });
        }
        break;
      }
      case 'observatory':
        quests.setFlag('L4_arrived', true);
        break;
      case 'hiddenLibrary':
        quests.setFlag('L5_entered', true);
        state.level = 5;
        break;
      case 'sanctuary':
        quests.setFlag('ending_started', true);
        break;
      default:
        break;
    }

    quests.refresh();

    const level = LEVELS[this.game.state.level];
    this.game.hud?.setChapter(level.chapter, level.title);
    this.game.hud?.setLevel(level.id);

    // First visit to a chapter: title card + atmospheric introduction.
    const seenKey = `L${levelId}_chapterSeen`;
    if (!flags[seenKey] && worldId !== 'sanctuary') {
      flags[seenKey] = true;
      const card = CHAPTER_CARDS[levelId];
      if (card) this.game.cinematics.showChapterCard(card);
      const intro = WORLD_INTROS[worldId];
      if (intro) this.game.cinematics.showWorldIntro(intro.title, intro.lines);
    }

    // The library reveal chapter deserves its own quiet announcement.
    if (worldId === 'hiddenLibrary' && !flags.L5_librarySeen) {
      flags.L5_librarySeen = true;
      this.game.audio?.setIntensity?.('reverent');
    }

    // Hide the HUD while the reveal is imminent, then let the world take over.
    this.game.requestSave();
  }

  /** Reward granted when a chapter completes. */
  rewardFor(levelId) {
    return LEVELS[levelId]?.reward || null;
  }

  onLevelComplete(levelId) {
    const reward = this.rewardFor(levelId);
    if (reward?.item) {
      this.game.inventory.add(reward.item, 1);
    }
    this.game.worlds.current?.onLevelComplete?.(levelId);
    this.game.hud?.refreshWaypoint?.();
  }

  nextWorldFor(levelId) {
    return LEVEL_WORLDS[LEVELS[levelId]?.world || 'mondstadt'] || null;
  }
}
