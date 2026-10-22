/**
 * NPC conversations. Each entry may be reused across quest states; the world
 * code decides which entry to play based on saved flags.
 *
 * A line is either a string or { text, speaker } to allow narration inside a
 * conversation. No personal or romantic content appears anywhere in this file.
 */

export const NPCS = {
  wren: {
    name: 'Wren',
    title: 'Wandering Scholar',
    portrait: '✦',
    color: '#dcc38a',
  },
  elowen: {
    name: 'Elowen',
    title: 'Keeper of the Whispering Woods',
    portrait: '❧',
    color: '#a8c8a0',
  },
  echo: {
    name: 'The Archivist\u2019s Echo',
    title: 'Something left behind',
    portrait: '✧',
    color: '#a9c3dc',
  },
  warden: {
    name: 'Astral Warden',
    title: 'Keeper of the Observatory',
    portrait: '☾',
    color: '#b9b5e0',
  },
};

export const DIALOGUES = {
  /* ------------------------------- WREN ------------------------------- */
  'wren.first': {
    npc: 'wren',
    lines: [
      'You walk like someone who has been listening to the wind. Good. Most people only hear it.',
      'I am Wren. I have spent the better part of eleven years in this meadow, asking a shrine the same question.',
      'It answers everything except that one. Or perhaps it has been waiting for a different voice.',
      'The grass here lifts when you step past it. Three wind fragments have been drifting around these hills since the last storm. Would you gather them for me?',
      { text: 'He gestures at the shrine without looking away from you.', speaker: '' },
      'Bring them back, and I will show you what I have been trying to open for eleven years.',
    ],
  },
  'wren.reminder': {
    npc: 'wren',
    lines: [
      'The fragments catch on the tall grass. Follow the shimmer — they are not shy, only playful.',
      'And if you see a chest along the old wall, open it. The meadow has been keeping it for someone.',
    ],
  },
  'wren.progress': {
    npc: 'wren',
    lines: [
      'Two of three. The wind is warming to you.',
      'I have seen it happen before, you know. The meadow decides who it will show itself to.',
    ],
  },
  'wren.chest': {
    npc: 'wren',
    lines: [
      'So the meadow did keep something for you. That key is old — older than the ruins to the north.',
      'There is an archive beneath those ruins. I have never been able to open it. Every lock I try turns to rust in my hands.',
      { text: 'He turns the key over in the light, then presses it back into your palm.', speaker: '' },
      'It does not rust for you. That is either very good fortune, or something was waiting for you in particular.',
      'Follow the stone markers north through the Whispering Woods. Elowen keeps the path. Tell her Wren sent you — she will pretend not to care.',
    ],
  },
  'wren.after': {
    npc: 'wren',
    lines: [
      'The north road is kind, if you let it be. The woods will whisper. Do not answer them.',
      'And traveler — when you find what is down there, whatever it is… I hope it knows how long it has been waiting.',
    ],
  },
  'wren.farewell': {
    npc: 'wren',
    lines: [
      'I will keep the fire going. Someone should be here when the wind changes.',
    ],
  },

  /* ------------------------------ ELOWEN ------------------------------ */
  'elowen.first': {
    npc: 'elowen',
    lines: [
      'You are the one Wren sent. He always sends the interesting ones and keeps the tea for himself.',
      'The ruins are ahead, through the two leaning stones. The gate is sealed, but the mechanisms along the wall are older than the gate. Older things wake first.',
      'There is a mural on the western wall. It shows the order the winds were given. Read it before you touch anything — the mechanisms are not forgiving of guessing.',
      'And traveler? Whichever way the wind turns you, leave the trees as you found them.',
    ],
  },
  'elowen.hint': {
    npc: 'elowen',
    lines: [
      'East, then north, then south. That is how the world was woken.',
      'The east wind came first — thin and quick. The north wind came heavy. The south wind curled in on itself, like something remembering.',
      'If they dim on you, wait a breath and try again. Even wind can be patient.',
    ],
  },
  'elowen.after': {
    npc: 'elowen',
    lines: [
      'The gate opened. I felt it in the roots.',
      'Go on, then. I will tell Wren you were less trouble than most.',
    ],
  },

  /* --------------------------- ARCHIVIST ECHO --------------------------- */
  'echo.first': {
    npc: 'echo',
    lines: [
      { text: 'The air here is very still. Then, quietly, someone clears their throat — though no one is there.', speaker: '' },
      'Ah. A reader. It has been a long while since the archive had one of those.',
      'I am what is left of the archivist. A habit, mostly. Dust with opinions.',
      'Three pages were taken from the chronicle on the southern shelf. Three symbols were carved from the matching pedestals. Whoever arranged this wanted to see whether a story could be put back together.',
      'Find the pages. Read the symbols. Put them where they belong. Then the shelf will remember how to open.',
    ],
  },
  'echo.pages': {
    npc: 'echo',
    lines: [
      'The pages are here, somewhere. This room was built to hold things that did not want to be found.',
      'Look low. Look behind. Scholars hid their work from other scholars, never from the wind.',
    ],
  },
  'echo.symbols': {
    npc: 'echo',
    lines: [
      'Each page carries a mark. Each pedestal carries the same mark, worn by hands that knew it.',
      'Match the mark to the pedestal. The order does not matter to the lock — only the matching.',
      'I would help more, but I am mostly a memory and memories are unreliable about details.',
    ],
  },
  'echo.book': {
    npc: 'echo',
    lines: [
      { text: 'The concealed shelf slides aside with a sound like a held breath released.', speaker: '' },
      'There. The Unwritten Chronicle. It has been sealed since before I was a habit.',
      'It will not open for just anyone. The cover answers to the celestial seal — and that is kept at the observatory, above the clouds.',
      'Take the Starlit Sigil from the chronicle shelf. It will show you the way up. And traveler… the book is not dangerous. It is only careful.',
    ],
  },
  'echo.hint': {
    npc: 'echo',
    lines: [
      'One page rests near the candle that never goes out. One is behind the leaning shelf. One is where a reader would first look, if a reader were humble.',
    ],
  },

  /* ----------------------------- ASTRAL WARDEN ----------------------------- */
  'warden.first': {
    npc: 'warden',
    lines: [
      'You climbed. Most turn back at the third stair, when the wind starts telling the truth.',
      'I am the Warden of this observatory. I keep a lens aimed at something that has not moved in a thousand years, and I keep a promise I no longer remember making.',
      'The trial is simple: light the three star mechanisms, then trace the constellation the sky is offering you.',
      'There is no penalty for failing. Only for not looking up.',
    ],
  },
  'warden.hint': {
    npc: 'warden',
    lines: [
      'The mechanisms kindle when you stand close and mean it. The constellation is drawn in the order the stars brighten — not the order they appear.',
      'Watch the sky above the lens for a full turn. The brightest point comes first, then the one closest to the peak, then the two that answer each other.',
    ],
  },
  'warden.after': {
    npc: 'warden',
    lines: [
      'The seal is yours. It is not a key, exactly. It is more like a question that has been waiting for its answer.',
      'Go back down. There is a stair beneath the archive that only opens for someone carrying both.',
      { text: 'The Warden looks up at the lens, and for a moment seems almost human.', speaker: '' },
      'I have kept this place a long time. I think it was always meant to end with someone arriving.',
    ],
  },
  'warden.farewell': {
    npc: 'warden',
    lines: ['The stars will keep. They are good at that.'],
  },
};

export function getDialogue(id) {
  return DIALOGUES[id] || null;
}
