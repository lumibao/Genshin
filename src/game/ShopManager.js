/**
 * The Wanderer's Ledger.
 *
 * Owns the wallet, the shop ledger and the wishing star. All of it lives in the
 * save (`state.wallet`), so purchases, pity and worn looks survive a reload.
 * Nothing here touches story items — see shopData.js for why.
 */
import {
  SHOP_ITEMS,
  STARTING_MORA,
  PITY_LIMIT,
  WISH_COST,
  WISH_COST_TEN,
  DUPLICATE_REFUND,
  EARNINGS,
  LOOKS,
  SLOTS,
  emptyWallet,
  normalizeWallet,
  findShopItem,
  describeLook,
  drawWish,
  slotForLook,
} from '../story/shopData.js';

export class ShopManager {
  constructor(game) {
    this.game = game;
    this._normalize();
    this._applyLooks({ save: false });
  }

  get wallet() {
    return this.game.state.wallet;
  }

  _normalize() {
    this.game.state.wallet = normalizeWallet(this.game.state.wallet);
    return this.game.state.wallet;
  }

  /** Re-read the wallet after a save is loaded or replaced, then re-dress. */
  refresh() {
    this._normalize();
    this._applyLooks({ save: false });
    return this.wallet;
  }

  /* ---------------------------------------------------------------- */
  /* Money                                                            */
  /* ---------------------------------------------------------------- */

  get mora() {
    return this.wallet.mora;
  }

  canAfford(amount) {
    return this.wallet.mora >= amount;
  }

  earn(amount, { label = null, silent = false } = {}) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!value) return 0;
    this.wallet.mora += value;
    if (!silent) {
      this.game.hud?.toast({
        icon: '◈',
        kicker: label || 'Mora received',
        text: `+${value} mora`,
        variant: 'item',
      });
      this.game.audio?.play('item');
    }
    this._changed();
    return value;
  }

  /** Reward hook used by LevelManager, so the rates live in one place. */
  earnFromEvent(kind, { label = null, silent = false } = {}) {
    const amount = EARNINGS[kind];
    if (!amount) return 0;
    return this.earn(amount, { label, silent: silent || kind === 'fragment' });
  }

  spend(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (this.wallet.mora < value) return false;
    this.wallet.mora -= value;
    this._changed();
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Shop                                                             */
  /* ---------------------------------------------------------------- */

  /** Shop stock, with everything the panel needs to render it. */
  stock() {
    const wallet = this.wallet;
    return SHOP_ITEMS.map((item) => {
      const look = describeLook(item.look);
      const owned = wallet.owned.includes(item.look);
      return {
        ...item,
        name: look?.name || item.id,
        glyph: look?.glyph || '✦',
        rarity: look?.rarity || 'common',
        slot: look?.slot || null,
        owned,
        equipped: this.isEquipped(item.look),
        affordable: wallet.mora >= item.price,
      };
    });
  }

  buy(id) {
    const item = findShopItem(id);
    if (!item) return { ok: false, reason: 'unknown' };
    if (this.wallet.owned.includes(item.look)) return { ok: false, reason: 'owned' };
    if (!this.canAfford(item.price)) {
      this.game.audio?.play('locked');
      return { ok: false, reason: 'mora' };
    }

    this.spend(item.price);
    this.wallet.purchased.push(id);
    this.wallet.owned.push(item.look);
    this.game.inventory?.add?.(item.look, 1, { silent: true });
    this.equip(item.look, { silent: true });
    this.game.audio?.play('unlock');
    const look = describeLook(item.look);
    this.game.hud?.toast({
      icon: look?.glyph || '✦',
      kicker: 'Acquired',
      text: look?.name || item.id,
      detail: `−${item.price} mora`,
      variant: 'item',
    });
    this._changed();
    return { ok: true, item, look };
  }

  /* ---------------------------------------------------------------- */
  /* Looks                                                            */
  /* ---------------------------------------------------------------- */

  owns(look) {
    return this.wallet.owned.includes(look);
  }

  equippedIn(slot) {
    return this.wallet.equipped[slot] || null;
  }

  isEquipped(look) {
    const slot = slotForLook(look);
    return !!slot && this.wallet.equipped[slot] === look;
  }

  equip(look, { silent = false } = {}) {
    const slot = slotForLook(look);
    if (!slot) return false;
    if (!this.owns(look)) return false;
    if (this.wallet.equipped[slot] === look) return true;

    this.wallet.equipped[slot] = look;
    this._applyLooks();
    this.game.audio?.play('toggle');
    if (!silent) {
      const lookData = describeLook(look);
      this.game.hud?.toast({
        icon: lookData?.glyph || '✦',
        text: `${lookData?.name || 'Look'} equipped`,
        variant: 'hint',
      });
    }
    this._changed();
    return true;
  }

  /** Removes every cosmetic and returns the traveler's own clothes. */
  resetLooks() {
    this.wallet.equipped = {};
    this._applyLooks();
    this.game.audio?.play('toggle');
    this._changed();
  }

  /**
   * Cosmetic state the player model reads.
   * Slots map to the visual patch they carry (dye repaints the tunic accent).
   */
  getLooks() {
    const equipped = this.wallet.equipped || {};
    const looks = { title: null, cape: null, charm: null, dye: null, companion: null };
    for (const [slot, look] of Object.entries(equipped)) {
      const visual = LOOKS[look]?.visual;
      if (!visual) continue;
      if (slot === 'title') looks.title = visual.title || null;
      else looks[slot] = visual[slot === 'dye' ? 'accent' : slot] || null;
    }
    return looks;
  }

  /** Owned looks grouped by slot, for the "Your Look" tab. */
  ownedBySlot() {
    const groups = {};
    for (const look of this.wallet.owned) {
      const data = describeLook(look);
      if (!data) continue;
      (groups[data.slot] ||= []).push({ ...data, equipped: this.isEquipped(look) });
    }
    return groups;
  }

  _applyLooks({ save = true } = {}) {
    const looks = this.getLooks();
    this.game.player?.applyLooks?.(looks);
    this.game.hud?.setTitleTag?.(looks.title);
    if (save) this.game.requestSave?.();
  }

  /* ---------------------------------------------------------------- */
  /* Wishing star                                                     */
  /* ---------------------------------------------------------------- */

  wishCost(times = 1) {
    return times >= 10 ? WISH_COST_TEN : WISH_COST;
  }

  /**
   * Spend mora and draw looks.
   * @returns {{ok: boolean, reason?: string, cost?: number, results?: Array}}
   */
  wish(times = 1, { roll = Math.random } = {}) {
    const count = times >= 10 ? 10 : 1;
    const cost = this.wishCost(count);
    if (!this.canAfford(cost)) {
      this.game.audio?.play('locked');
      return { ok: false, reason: 'mora', cost };
    }

    this.spend(cost);
    const results = [];
    for (let i = 0; i < count; i++) {
      const draw = drawWish({ owned: this.wallet.owned, roll, pity: this.wallet.pity });
      const look = describeLook(draw.look);
      this.wallet.wishes += 1;

      if (draw.duplicate) {
        this.wallet.mora += DUPLICATE_REFUND;
        this.wallet.pity += 1;
        results.push({ ...look, duplicate: true, refund: DUPLICATE_REFUND });
        continue;
      }

      this.wallet.owned.push(draw.look);
      this.game.inventory?.add?.(draw.look, 1, { silent: true });
      this.wallet.pity = look?.rarity === 'legendary' ? 0 : this.wallet.pity + 1;
      results.push({ ...look, duplicate: false, pityHit: draw.pityHit });
    }
    this.wallet.pity = Math.min(this.wallet.pity, PITY_LIMIT - 1);

    // Auto-equip into empty slots, so every wish visibly changes something.
    for (const result of results) {
      if (result.duplicate) continue;
      if (result.slot && !this.wallet.equipped[result.slot]) {
        this.wallet.equipped[result.slot] = result.look;
      }
    }

    this._applyLooks({ save: false });
    this.game.audio?.play(results.some((r) => r.rarity === 'legendary') ? 'reveal' : 'chapter');
    this._changed();
    return { ok: true, cost, results };
  }

  get pity() {
    return this.wallet.pity;
  }

  /** Wishes left before a legendary is guaranteed (at least 1). */
  get pityRemaining() {
    return Math.max(1, PITY_LIMIT - this.wallet.pity);
  }

  get unlockedCount() {
    return this.wallet.owned.length;
  }

  get totalLooks() {
    return Object.keys(LOOKS).length;
  }

  _changed() {
    this.game.state.wallet = this.wallet;
    this.game.requestSave?.();
    this.game.bus?.emit('shop:changed', {
      mora: this.wallet.mora,
      owned: [...this.wallet.owned],
      equipped: { ...this.wallet.equipped },
    });
  }
}

export { STARTING_MORA, PITY_LIMIT, WISH_COST, WISH_COST_TEN, emptyWallet, normalizeWallet };
