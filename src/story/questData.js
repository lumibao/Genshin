/**
 * The campaign. Every objective is a pure predicate over saved progress so the
 * quest state machine is deterministic, testable and safe to resume.
 *
 * `progress(ctx)` returns a number from 0..target.
 * `ctx.flags` holds booleans / counters, `ctx.count(itemId)` reads inventory.
 */

export const LEVEL_ORDER = [1, 2, 3, 4, 5];

export const LEVELS = {
  1: {
    id: 1,
    key: 'L1',
    chapter: 'Chapter I',
    title: 'Whispers of the Wind',
    place: 'Windrise Meadow, Mondstadt',
    world: 'mondstadt',
    summary:
      'A quiet meadow beneath the windmills. Wren, a wandering scholar, believes the old wind shrine still remembers something worth finding.',
    journal:
      'The wind has carried me to a meadow I have never walked before. A scholar named Wren waits by the old shrine — and the grass leans toward him as though it has been waiting too.',
    reward: { item: null, label: 'The Wind Gate Opens' },
    objectives: [
      {
        id: 'steps',
        text: 'Take your first steps through the meadow',
        hint: 'WASD / arrows or the left joystick to move.',
        progress: (ctx) => (ctx.flags.L1_moved ? 1 : 0),
      },
      {
        id: 'wren',
        text: 'Speak with Wren by the wind shrine',
        hint: 'Approach the glowing marker and press E.',
        progress: (ctx) => (ctx.flags.L1_talkedWren ? 1 : 0),
      },
      {
        id: 'fragments',
        text: 'Gather wind fragments',
        target: 3,
        progress: (ctx) => Math.min(3, ctx.count('windFragment')),
        hint: 'Three fragments are drifting around the meadow.',
      },
      {
        id: 'chest',
        text: 'Open the weathered chest near the old wall',
        progress: (ctx) => (ctx.flags.L1_chestOpened ? 1 : 0),
      },
      {
        id: 'report',
        text: 'Return to Wren with what you found',
        progress: (ctx) => (ctx.flags.L1_reported ? 1 : 0),
      },
    ],
  },

  2: {
    id: 2,
    key: 'L2',
    chapter: 'Chapter II',
    title: 'The Forgotten Ruins',
    place: 'Whispering Woods & the Fallen Circle',
    world: 'whisperingWoods',
    summary:
      'The archive key points north, into woods that whisper with old names. Beyond them, a ruin sleeps with its gate still sealed.',
    journal:
      'The key is warm in my hand. Wren says the woods remember every traveler who walked them, and that the ruins beyond have not opened for a hundred years. Something about the wind feels expectant.',
    reward: { item: 'archiveMap', label: 'Ancient Archive Map' },
    objectives: [
      {
        id: 'woods',
        text: 'Follow the path through the Whispering Woods',
        progress: (ctx) => (ctx.flags.L2_enteredWoods ? 1 : 0),
      },
      {
        id: 'arch',
        text: 'Find the archway hidden among the trees',
        progress: (ctx) => (ctx.flags.L2_foundRuins ? 1 : 0),
        hint: 'Follow the stone markers north through the forest.',
      },
      {
        id: 'mechanisms',
        text: 'Awaken the three wind mechanisms',
        target: 3,
        progress: (ctx) => Math.min(3, ctx.flags.L2_lit || 0),
      },
      {
        id: 'order',
        text: 'Wake them in the order the stones remember',
        progress: (ctx) => (ctx.flags.L2_puzzleSolved ? 1 : 0),
        hint: 'A mural on the western wall shows the order of the winds.',
      },
      {
        id: 'gate',
        text: 'Pass through the sealed ruin gate',
        progress: (ctx) => (ctx.flags.L2_gateOpened ? 1 : 0),
      },
      {
        id: 'fragment',
        text: 'Recover the first chronicle fragment',
        progress: (ctx) => (ctx.flags.L2_fragmentFound ? 1 : 0),
      },
    ],
  },

  3: {
    id: 3,
    key: 'L3',
    chapter: 'Chapter III',
    title: 'The Sealed Archive',
    place: 'The Archive Beneath the Ruins',
    world: 'archive',
    summary:
      'Beneath the ruins, an archive has kept its silence. Three pages are missing from a chronicle that was never finished.',
    journal:
      'Stairs go down further than the hill should allow. The archive smells of dust and cold candle smoke. Someone shelved these books in a hurry — as if they meant to come back.',
    reward: { item: 'starlitSigil', label: 'Starlit Sigil' },
    objectives: [
      {
        id: 'enter',
        text: 'Enter the sealed archive',
        progress: (ctx) => (ctx.flags.L3_entered ? 1 : 0),
      },
      {
        id: 'pages',
        text: 'Recover the missing chronicle pages',
        target: 3,
        progress: (ctx) => Math.min(3, ctx.count('chroniclePage')),
      },
      {
        id: 'symbols',
        text: 'Return each symbol to its matching mechanism',
        progress: (ctx) => (ctx.flags.L3_symbolsSolved ? 1 : 0),
        hint: 'The page symbols and the pedestal engravings share a shape.',
      },
      {
        id: 'shelf',
        text: 'Unlock the concealed bookshelf',
        progress: (ctx) => (ctx.flags.L3_bookshelfUnlocked ? 1 : 0),
      },
      {
        id: 'book',
        text: 'Find The Unwritten Chronicle',
        progress: (ctx) => (ctx.flags.L3_bookFound ? 1 : 0),
      },
    ],
  },

  4: {
    id: 4,
    key: 'L4',
    chapter: 'Chapter IV',
    title: 'The Celestial Trial',
    place: 'The Observatory Above the Clouds',
    world: 'observatory',
    summary:
      'The Starlit Sigil answers a door that has no handle. Above the clouds, a trial waits beneath a sky full of quiet constellations.',
    journal:
      'The sigil pulled me up a stair that should not exist. From here the world is only peaks and stars. Someone built this observatory to watch for something — or for someone.',
    reward: null,
    objectives: [
      {
        id: 'arrive',
        text: 'Reach the mountaintop observatory',
        progress: (ctx) => (ctx.flags.L4_arrived ? 1 : 0),
      },
      {
        id: 'stars',
        text: 'Light the three star mechanisms',
        target: 3,
        progress: (ctx) => Math.min(3, ctx.flags.L4_stars || 0),
      },
      {
        id: 'constellation',
        text: 'Trace the constellation the sky is showing you',
        progress: (ctx) => (ctx.flags.L4_constellationSolved ? 1 : 0),
        hint: 'Stand at the lens and follow the brightest points in order.',
      },
      {
        id: 'seal',
        text: 'Claim the final seal fragment',
        progress: (ctx) => (ctx.flags.L4_seal ? 1 : 0),
      },
      {
        id: 'return',
        text: 'Return to the sealed archive',
        progress: (ctx) => (ctx.flags.L4_returned ? 1 : 0),
        hint: 'Touch the waystone at the edge of the observatory deck. The stair to Chapter V opens in the archive it leads back to.',
      },
    ],
  },

  5: {
    id: 5,
    key: 'L5',
    chapter: 'Chapter V',
    title: 'The Ancient Library',
    place: 'The Forgotten Library',
    world: 'hiddenLibrary',
    summary:
      'The Celestial Seal opens a stair beneath the archive. Below it, a library has been waiting with one book left open on its pedestal.',
    journal:
      'The seal turned like a key in a lock I could not see. The stairs were warm. Somewhere below, candlelight is still burning after all these years — as though someone left it lit on purpose.',
    reward: null,
    objectives: [
      {
        id: 'descend',
        text: 'Descend into the forgotten library',
        progress: (ctx) => (ctx.flags.L5_entered ? 1 : 0),
      },
      {
        id: 'pedestal',
        text: 'Approach the central pedestal',
        progress: (ctx) => (ctx.flags.L5_pedestalReached ? 1 : 0),
      },
      {
        id: 'open',
        text: 'Open The Unwritten Chronicle',
        progress: (ctx) => (ctx.flags.L5_bookOpened ? 1 : 0),
      },
      {
        id: 'read',
        text: 'Read what the pages have kept',
        progress: (ctx) => (ctx.flags.L5_messageRead ? 1 : 0),
      },
      {
        id: 'light',
        text: 'Follow the light beyond the library',
        optional: true,
        progress: (ctx) => (ctx.flags.ending_started ? 1 : 0),
      },
    ],
  },
};

export const LEVEL_WORLDS = {
  mondstadt: { level: 1 },
  whisperingWoods: { level: 2 },
  ancientRuins: { level: 2 },
  archive: { level: 3 },
  observatory: { level: 4 },
  hiddenLibrary: { level: 5 },
  sanctuary: { level: 5 },
};

export const CHAPTER_TITLES = {
  1: 'Whispers of the Wind',
  2: 'The Forgotten Ruins',
  3: 'The Sealed Archive',
  4: 'The Celestial Trial',
  5: 'The Ancient Library',
};

export function getLevel(id) {
  return LEVELS[id] || null;
}
