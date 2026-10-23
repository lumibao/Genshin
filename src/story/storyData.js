/**
 * World-facing narrative: opening narration, chapter cards, level outros and
 * the lore text found on readable props.
 *
 * Nothing in this file references the personal dedication. Those words live
 * in `secretMessage.js`, which is only fetched after the reveal gate passes.
 */

export const GAME = {
  title: 'Project Asteria',
  subtitle: 'The Chronicles of Teyvat',
  tagline: 'Where the wind remembers every name it has carried.',
  saveLabel: 'Asteria — The Chronicles of Teyvat',
};

/** Opening cinematic narration, shown after START ADVENTURE. */
export const INTRO_NARRATION = [
  {
    speaker: '',
    text: 'Long before the wind learned the names of the cities, it carried a single story back and forth across the hills — patient, unfinished, waiting for someone to listen.',
  },
  {
    speaker: '',
    text: 'The people of Mondstadt say that a forgotten shrine still stands in the meadow at Windrise. They say that on quiet evenings, the grass there leans toward a voice no one can hear.',
  },
  {
    speaker: '',
    text: 'A wanderer has come looking for that voice. There is a key, a crumbling archive, and a chronicle with one page left unwritten.',
  },
  {
    speaker: '',
    text: 'You do not yet know why the wind brought you here. But it has been waiting a long time, and it is glad you came.',
  },
];

export const CHAPTER_CARDS = {
  1: { kicker: 'Chapter I', title: 'Whispers of the Wind', sub: 'Windrise Meadow · Mondstadt' },
  2: { kicker: 'Chapter II', title: 'The Forgotten Ruins', sub: 'The Whispering Woods' },
  3: { kicker: 'Chapter III', title: 'The Sealed Archive', sub: 'Beneath the Fallen Circle' },
  4: { kicker: 'Chapter IV', title: 'The Celestial Trial', sub: 'The Observatory Above the Clouds' },
  5: { kicker: 'Chapter V', title: 'The Ancient Library', sub: 'The Forgotten Library' },
};

/** Shown when a chapter is completed (before the reward toast). */
export const LEVEL_OUTROS = {
  1: {
    kicker: 'Chapter I Complete',
    title: 'The Wind Remembers',
    sub: 'You carry the Ancient Archive Key.',
  },
  2: {
    kicker: 'Chapter II Complete',
    title: 'The Gate Opens',
    sub: 'You carry the Ancient Archive Map.',
  },
  3: {
    kicker: 'Chapter III Complete',
    title: 'The Unwritten Chronicle',
    sub: 'The Starlit Sigil hums in your hand.',
  },
  4: {
    kicker: 'Chapter IV Complete',
    title: 'The Final Seal',
    sub: 'Something below the archive has begun to unlock.',
  },
  5: {
    kicker: 'The Chronicle That Remained',
    title: 'A Page Remains',
    sub: 'Some words are kept for the one who was always meant to read them.',
  },
};

/** Chapter journal blurbs for the diary UI (non-personal). */
export const WORLD_INTROS = {
  mondstadt: {
    title: 'Windrise Meadow',
    lines: [
      'The grass here is taller than it looks from the road, and it moves in long silver waves.',
      'A windmill turns on the ridge. Somewhere a bell is ringing for no one in particular.',
    ],
  },
  whisperingWoods: {
    title: 'The Whispering Woods',
    lines: [
      'The trees lean together as though sharing a secret they have kept for centuries.',
      'Stone markers, half-swallowed by moss, point the way deeper.',
    ],
  },
  ancientRuins: {
    title: 'The Fallen Circle',
    lines: [
      'A ring of broken pillars stands in a clearing, older than the woods around it.',
      'Three mechanisms wait along the wall, dark and patient.',
    ],
  },
  archive: {
    title: 'The Sealed Archive',
    lines: [
      'The stairs open into a hall of shelves, each book chained as if it might try to leave.',
      'Three empty slots gape in the chronicle shelf. The dust around them is disturbed.',
    ],
  },
  observatory: {
    title: 'The Observatory',
    lines: [
      'The air up here is thin and clear. The stars look close enough to touch.',
      'A great lens turns slowly, tracking something that has not moved in a very long time.',
    ],
  },
  hiddenLibrary: {
    title: 'The Forgotten Library',
    lines: [
      'Candles burn without wind. Shelves climb into darkness above you.',
      'At the center of the room, a single book rests open on a pedestal — as if left there for you.',
    ],
  },
  sanctuary: {
    title: 'The Celestial Sanctuary',
    lines: [
      'Floating islands drift in a sea of stars. A luminous tree sheds petals without end.',
      'The path glows beneath your feet, and every step feels like arriving.',
    ],
  },
};

/** Interactive lore props. Entirely in-world, no personal content. */
export const LORE = {
  wrenJournal: {
    title: 'Wren\u2019s Field Journal',
    pages: [
      'Third season of searching. The shrine at Windrise answers when I speak my own name, but not when I speak the city\u2019s. I begin to suspect it is listening for something more particular.',
      'The old map in the archive shows four circles and a fifth mark left deliberately blank. A blank space is not an absence. It is an invitation.',
    ],
  },
  ruinMural: {
    title: 'Mural of the Three Winds',
    pages: [
      'The mural shows three winds in a line: the first rises from the east and is drawn in thin lines; the second falls from the north, broad and heavy; the third curls inward from the south and is drawn with a spiral.',
      'Beneath the winds, in a script older than the stones, a line has been cut: \u201cWake them as the wind wakes the world \u2014 in the order it was given.\u201d',
      'At the foot of the mural a mason has scratched a plain note in a later hand: \u201cThere are three pillars, not four. East, north, south. This wall is the west, and the west only tells you the order \u2014 it does not answer.\u201d',
    ],
  },
  archiveLedger: {
    title: 'Archive Ledger, Final Entry',
    pages: [
      'We have taken the chronicle apart. Three pages were removed first, then four, then all but one. If someone comes looking, they must prove they can put a story back together before they are trusted with the rest.',
      'I have left the symbols where a careful reader will find them. I have left the book where a patient one will look.',
    ],
  },
  observatoryChart: {
    title: 'Star Chart, Annotated',
    pages: [
      'The constellation has no name in any catalogue I own. It appears only when the lens is aligned with the northern peak, and even then it seems to be waiting for someone to finish drawing it.',
      'Four stars, one line each. Trace them in the order they kindle.',
    ],
  },
  libraryInscription: {
    title: 'Inscription above the Pedestal',
    pages: [
      'This room was not built to keep books. It was built to keep an answer.',
      'Whoever you are: you have walked further than most. The lamps are lit. Sit, if you wish. The page has been waiting, and it will wait a little longer.',
    ],
  },
  shrine: {
    title: 'The Forgotten Wind Shrine',
    pages: [
      'The statue is faceless, worn smooth by a century of wind. Offerings have been placed at its feet: a coil of rope, a wooden bird, three copper coins gone green.',
      'Carved into the base, half erased: \u201cFor the one who comes after, the wind keeps everything.\u201d',
    ],
  },
};

/** Small one-line barks used to guide without breaking immersion. */
export const BARKS = {
  moveTutorial: 'The wind nudges you forward. Move with WASD, or the joystick on the left.',
  lookTutorial: 'Drag with the mouse or swipe the right side of the screen to look around.',
  interactTutorial: 'Press E when the prompt appears, or tap the ✦ button.',
  shrineSealed: 'The shrine is sealed. Someone is standing beside it, waiting to be spoken to.',
  fragmentNear: 'A wind fragment hums nearby — follow the shimmer.',
  gateLocked: 'The gate will not answer yet. The mechanisms along the wall are still dark.',
  needPages: 'Three pages are missing from this chronicle.',
  archiveSealed: 'The bookshelf has no handle. Its lock is shaped like three symbols.',
  bookSealed: 'A thin silver seal holds the cover shut. It is not the kind of lock that force opens.',
  observatoryLocked: 'The waystone is dark. The observatory will not answer an unfinished archive.',
  librarySealed: 'The stair is sealed by a celestial lock — a circle of stars with one piece missing.',
  wrongOrder: 'The mechanisms dim. That is not the order the stones remember.',
  puzzleReset: 'The mechanisms reset with a soft sigh of wind.',
};
