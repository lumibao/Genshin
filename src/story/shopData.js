/**
 * The Wanderer's Ledger — the meadow shop, and the wishing star behind it.
 *
 * Everything in the satchel (keys, relics, fragments, pages) comes from the
 * story and can never be bought or sold: the chapter objectives read those
 * counts directly. Only "looks" are purchasable, so nothing here can break a
 * chapter. The wishing star pays out the same looks, which makes it a shortcut
 * rather than a second economy with its own progression.
 *
 * One table drives everything: LOOKS owns the name, slot and the actual visual
 * patch applied to the traveler. SHOP_ITEMS adds prices, WISH_POOL adds weights.
 */

export const CURRENCY = 'mora';

export const SLOTS = ['title', 'cape', 'charm', 'dye', 'companion'];

/** A gentle starting purse, so the ledger is usable on the first visit. */
export const STARTING_MORA = 220;

export const RARITY = {
  common: { label: 'Common', color: '#cfc4ad' },
  rare: { label: 'Rare', color: '#a9d3f0' },
  legendary: { label: 'Legendary', color: '#f2d79b' },
};

/**
 * Every look in the game. `visual` is read by PlayerController.applyLooks():
 *   cape     → { color, deep }
 *   accent   → { color, deep }   (tunic, skirt, cuffs)
 *   charm    → { color, emissive }
 *   companion→ { color, emissive, scale }
 *   title    → rendered under the chapter badge
 */
export const LOOKS = {
  'look.charm.windflower': {
    slot: 'charm',
    name: 'Meadow Charm',
    glyph: '✿',
    rarity: 'common',
    visual: { charm: { color: '#d8efbe', emissive: '#8fcb63' } },
  },
  'look.dye.verdant': {
    slot: 'dye',
    name: 'Verdant Cloth Dye',
    glyph: '❦',
    rarity: 'common',
    visual: { accent: { color: '#3f7a5c', deep: '#27503c' } },
  },
  'look.charm.dew': {
    slot: 'charm',
    name: 'Dewdrop Charm',
    glyph: '❍',
    rarity: 'common',
    visual: { charm: { color: '#d6f2ff', emissive: '#6fc4e8' } },
  },
  'look.dye.azure': {
    slot: 'dye',
    name: 'Azure Cloth Dye',
    glyph: '❖',
    rarity: 'rare',
    visual: { accent: { color: '#2f5f9c', deep: '#1d3d68' } },
  },
  'look.title.wayfarer': {
    slot: 'title',
    name: 'Title — Wayfarer',
    glyph: '❧',
    rarity: 'rare',
    visual: { title: 'Wayfarer' },
  },
  'look.cape.ember': {
    slot: 'cape',
    name: 'Ember Cape',
    glyph: '✦',
    rarity: 'rare',
    visual: { cape: { color: '#8f4436', deep: '#5f2c25' } },
  },
  'look.companion.starling': {
    slot: 'companion',
    name: 'Starling Wisp',
    glyph: '✧',
    rarity: 'rare',
    visual: { companion: { color: '#d9e6ff', emissive: '#8fb4ff', scale: 1 } },
  },
  'look.charm.star': {
    slot: 'charm',
    name: 'Starfall Charm',
    glyph: '☄',
    rarity: 'legendary',
    visual: { charm: { color: '#fff3c9', emissive: '#ffcc66' } },
  },
  'look.cape.moonlit': {
    slot: 'cape',
    name: 'Moonlit Cape',
    glyph: '☾',
    rarity: 'legendary',
    visual: { cape: { color: '#3d4a75', deep: '#232c4a' } },
  },
  'look.title.starwarden': {
    slot: 'title',
    name: 'Title — Starwarden',
    glyph: '✶',
    rarity: 'legendary',
    visual: { title: 'Starwarden' },
  },
  'look.companion.embermoth': {
    slot: 'companion',
    name: 'Ember Moth',
    glyph: '❁',
    rarity: 'legendary',
    visual: { companion: { color: '#ffd9b0', emissive: '#ff9a58', scale: 1.15 } },
  },
};

/** What the shop actually stocks. Wish-only looks stay wish-only on purpose. */
export const SHOP_ITEMS = [
  {
    id: 'charm.wind',
    look: 'look.charm.windflower',
    price: 90,
    description: 'A pressed windflower set in resin. It catches the light when you run.',
  },
  {
    id: 'dye.azure',
    look: 'look.dye.azure',
    price: 70,
    description: 'A pouch of crushed cerulean stone. Deepens the trim on your tunic.',
  },
  {
    id: 'title.wayfarer',
    look: 'look.title.wayfarer',
    price: 120,
    description: 'A quiet name for someone who keeps walking. Shown beneath the chapter badge.',
  },
  {
    id: 'cape.ember',
    look: 'look.cape.ember',
    price: 160,
    description: 'Rust-red cloth that remembers firelight. Warms the whole silhouette.',
  },
  {
    id: 'charm.star',
    look: 'look.charm.star',
    price: 210,
    description: 'A shard of night sky on a silver thread. Brightest when the world is quiet.',
  },
  {
    id: 'title.starwarden',
    look: 'look.title.starwarden',
    price: 240,
    description: 'For those who climbed the observatory and did not look away.',
  },
];

/** Every look a wish can award. Weights add up to 100. */
export const WISH_POOL = [
  { look: 'look.charm.windflower', weight: 20 },
  { look: 'look.dye.verdant', weight: 18 },
  { look: 'look.charm.dew', weight: 15 },
  { look: 'look.dye.azure', weight: 12 },
  { look: 'look.title.wayfarer', weight: 10 },
  { look: 'look.cape.ember', weight: 8 },
  { look: 'look.companion.starling', weight: 7 },
  { look: 'look.charm.star', weight: 5 },
  { look: 'look.cape.moonlit', weight: 3 },
  { look: 'look.title.starwarden', weight: 1.5 },
  { look: 'look.companion.embermoth', weight: 0.5 },
];

export const WISH_COST = 20;
export const WISH_COST_TEN = 170;

/** Published in the panel, so it has to be true: a legendary by the Nth wish. */
export const PITY_LIMIT = 20;

/** Duplicates (once every look is owned) convert to mora. */
export const DUPLICATE_REFUND = 30;

/** Earnings. Generous on purpose: a chapter funds roughly a ten-pull. */
export const EARNINGS = {
  chapter: 120, // per chapter completed
  fragment: 15, // each wind fragment carried home
  reveal: 500, // discovering the hidden page
  ending: 200, // reaching the sanctuary
};

/** A brand new purse. */
export function emptyWallet() {
  return {
    mora: STARTING_MORA,
    purchased: [],
    owned: [],
    pity: 0,
    wishes: 0,
    equipped: {},
  };
}

/**
 * Coerce anything a save (or a hand-edited file) might contain.
 * Unknown looks are dropped rather than trusted: a save can be edited.
 */
export function normalizeWallet(raw) {
  const base = emptyWallet();
  if (!raw || typeof raw !== 'object') return base;

  const int = (value, fallback = 0) =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
  const list = (value, allow = () => true) =>
    Array.isArray(value)
      ? [...new Set(value.filter((entry) => typeof entry === 'string' && allow(entry)))]
      : [];

  const owned = list(raw.owned, (look) => !!LOOKS[look]);
  const purchased = list(raw.purchased, (id) => {
    const item = findShopItem(id);
    return !!item && !!LOOKS[item.look];
  });

  // Everything bought is also owned; a half-written save must never lock the
  // player out of a look they already paid for.
  for (const id of purchased) {
    const look = findShopItem(id)?.look;
    if (look && !owned.includes(look)) owned.push(look);
  }

  const equipped = {};
  if (raw.equipped && typeof raw.equipped === 'object') {
    for (const [slot, look] of Object.entries(raw.equipped)) {
      if (!SLOTS.includes(slot)) continue;
      if (slotForLook(look) !== slot) continue;
      if (!owned.includes(look)) continue;
      equipped[slot] = look;
    }
  }

  return {
    mora: int(raw.mora, base.mora),
    purchased,
    owned,
    pity: Math.min(PITY_LIMIT - 1, int(raw.pity) % PITY_LIMIT),
    wishes: int(raw.wishes),
    equipped,
  };
}

export function findShopItem(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

export function findLook(look) {
  return LOOKS[look] || null;
}

export function findWishEntry(look) {
  return WISH_POOL.find((item) => item.look === look) || null;
}

export function slotForLook(look) {
  return LOOKS[look]?.slot || null;
}

/** Everything a look describes, flattened for the UI. */
export function describeLook(look) {
  const entry = LOOKS[look];
  if (!entry) return null;
  const shop = SHOP_ITEMS.find((item) => item.look === look);
  return {
    look,
    slot: entry.slot,
    name: entry.name,
    glyph: entry.glyph,
    rarity: entry.rarity,
    visual: entry.visual,
    price: shop?.price ?? null,
    description: shop?.description ?? null,
  };
}

/**
 * Weighted draw.
 *
 * `roll` is injectable so the tests (and the demo) can be deterministic.
 * Looks already owned are excluded while any remain, so a wish always gives
 * something new until the pool is exhausted — after that, duplicates convert
 * to mora instead of feeling like a loss.
 */
export function drawWish({ owned = [], roll = Math.random, pity = 0 } = {}) {
  const ownedSet = new Set(owned);
  const unowned = WISH_POOL.filter((entry) => !ownedSet.has(entry.look));
  const pool = unowned.length ? unowned : WISH_POOL;
  const poolSet = new Set(pool.map((entry) => entry.look));

  // Pity: by the PITY_LIMIT-th wish without a legendary, one is guaranteed.
  if (pity + 1 >= PITY_LIMIT) {
    const legendary = WISH_POOL.filter((entry) => LOOKS[entry.look]?.rarity === 'legendary').sort(
      (a, b) => a.weight - b.weight,
    );
    const available = legendary.filter((entry) => poolSet.has(entry.look));
    if (available.length) {
      const chosen = available[available.length - 1];
      return { look: chosen.look, duplicate: ownedSet.has(chosen.look), pityHit: true };
    }
  }

  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let target = roll() * total;
  let chosen = pool[pool.length - 1];
  for (const entry of pool) {
    target -= entry.weight;
    if (target <= 0) {
      chosen = entry;
      break;
    }
  }
  return {
    look: chosen.look,
    duplicate: ownedSet.has(chosen.look),
    pityHit: false,
  };
}
