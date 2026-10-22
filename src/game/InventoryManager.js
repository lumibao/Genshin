/**
 * Quest inventory. Descriptions are deliberately world-facing only — they
 * never hint at the personal page.
 */

export const ITEMS = {
  windFragment: {
    name: 'Wind Fragment',
    glyph: '❖',
    color: '#a8ecdc',
    type: 'relic',
    description:
      'A shard of moving air, cool to the touch. It hums a note you almost recognise, then forgets it.',
  },
  archiveKey: {
    name: 'Ancient Archive Key',
    glyph: '⚿',
    color: '#e6cd94',
    type: 'key',
    description:
      'A heavy iron key with a wind-sigil cut into its bow. Wren says every lock he tried it on turned to rust.',
  },
  archiveMap: {
    name: 'Ancient Archive Map',
    glyph: '⌖',
    color: '#d8c9a2',
    type: 'key',
    description:
      'A map drawn on oiled cloth. Four circles are inked in careful hands; the fifth is left blank.',
  },
  archiveFragment: {
    name: 'Chronicle Fragment',
    glyph: '❧',
    color: '#e6d4a8',
    type: 'relic',
    description:
      'The first torn page of a much longer chronicle. The ink is still dark, as though it were written yesterday.',
  },
  chroniclePage: {
    name: 'Chronicle Page',
    glyph: '❧',
    color: '#e8d9b0',
    type: 'relic',
    description:
      'A page torn from a larger book. The symbol in its margin matches one of the archive pedestals.',
  },
  starlitSigil: {
    name: 'Starlit Sigil',
    glyph: '✶',
    color: '#bcd8f0',
    type: 'key',
    description:
      'A small disc of cold starlight. When you hold it up, the sky seems slightly closer than it was.',
  },
  celestialSeal: {
    name: 'Celestial Seal',
    glyph: '☾',
    color: '#e3d6ff',
    type: 'key',
    description:
      'Half medallion, half star chart. It is warm, and it turns toward the earth as though listening for a lock.',
  },
};

export class InventoryManager {
  constructor(game) {
    this.game = game;
    this.items = game.state.items || {};
  }

  count(id) {
    const value = this.items[id];
    return Number.isFinite(value) ? value : 0;
  }

  has(id, count = 1) {
    return this.count(id) >= count;
  }

  add(id, amount = 1, { silent = false } = {}) {
    if (!id || amount === 0) return 0;
    this.items[id] = Math.max(0, this.count(id) + amount);
    if (this.items[id] === 0) delete this.items[id];
    this.game.state.items = this.items;
    this.game.bus.emit('inventory:changed', { id, amount, total: this.count(id) });
    if (!silent && amount > 0) {
      const def = ITEMS[id];
      this.game.hud?.toast({
        icon: def?.glyph || '✦',
        kicker: amount > 1 ? `Obtained ×${amount}` : 'Obtained',
        text: def?.name || id,
        variant: 'item',
      });
      this.game.audio?.play('item');
    }
    this.game.quests?.refresh();
    this.game.requestSave();
    return this.count(id);
  }

  remove(id, amount = 1) {
    return this.add(id, -amount, { silent: true });
  }

  getEntries() {
    return Object.entries(this.items)
      .filter(([id, count]) => count > 0 && ITEMS[id])
      .map(([id, count]) => ({ id, count, ...ITEMS[id] }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'key' ? -1 : 1));
  }

  reset() {
    this.items = {};
    this.game.state.items = this.items;
    this.game.bus.emit('inventory:changed', { id: null, amount: 0, total: 0 });
  }
}
