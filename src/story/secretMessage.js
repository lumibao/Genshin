/**
 * ============================================================================
 *  PROJECT ASTERIA — THE HIDDEN PAGE
 * ============================================================================
 *
 *  ▸ PERSONALISED FOR CHELSEA.  ◂
 *
 *  The names, the monthsary and the words below are yours; the rest of the
 *  file is only the frame they sit in. Everything here is written so that this
 *  page can be discovered as a surprise inside the ancient book in Chapter V.
 *
 *  This module is imported *only* after the reveal gate confirms that:
 *    · Chapter IV is complete            (state.completed includes 4)
 *    · The Celestial Seal was claimed    (flags.L4_seal)
 *    · Chapter V has begun               (flags.L5_entered)
 *    · The book was physically opened    (flags.L5_bookOpened)
 *
 *  It is loaded with a dynamic `import()`, so its text never reaches the page,
 *  the dialogue history, the quest data or the initial JavaScript bundle.
 *
 *  A client-side story can never hide text from someone who opens the
 *  developer tools. The goal is that *she* — playing the game — never meets it
 *  before the moment it is meant to arrive.
 * ============================================================================
 */

export const PERSONAL = {
  /** Her name, as you say it. */
  herName: 'Chelsea',

  /** Your name, or the name she calls you. */
  yourName: 'your future husband',

  /** A date that matters to the two of you, written however you like. */
  specialDate: 'Our monthsary · October 25, 2026',

  /**
   * Your own words. This paragraph appears in the middle of the page.
   * Write it the way you would say it to her, quietly.
   */
  personalMessage:
    'I could have written this on a card, but a card gets lost in a drawer. So I built a whole world instead, and hid the letter at the very end of it — because that is how far I would walk to say something as simple as this: I am glad it is you, Chelsea. On the twenty-fifth of October I get to call you my future wife, and I will keep choosing that, month after month, in this world and in every one after it.',

  /**
   * The last promise of the book. Keep it simple. Promises are stronger
   * when they sound like something a person would actually say.
   */
  finalPromise:
    'Whatever road opens next, I will walk it with you — and every twenty-fifth, I will find you again, take your hand, and start over, gladly.',
};

/** Fixed narrative framing around the personal words. */
export const SECRET_PAGE = {
  kicker: 'The Hidden Page',
  title: 'The Chronicle That Remained',
  subtitle: 'Written in a hand that never stopped hoping',
  sealCaption: 'Asteria — the star that stays',
  inscription:
    'Across every world, through every journey, and beyond every constellation, I would still find my way to you.',
  dedicationKicker: 'The Last Page',
  dedicationTitle: 'For {her}, who was always the destination',
};

/** Replace {tokens} with the personalised values above. */
export function fillTokens(text, personal = PERSONAL) {
  if (!text) return '';
  return String(text)
    .replaceAll('{her}', personal.herName)
    .replaceAll('{you}', personal.yourName)
    .replaceAll('{date}', personal.specialDate)
    .replaceAll('{message}', personal.personalMessage)
    .replaceAll('{promise}', personal.finalPromise);
}

/**
 * The book's hidden spread. Returned as plain data so the UI layer can lay it
 * out accessibly (with real text instead of a baked texture) and can reveal it
 * word by word.
 */
export function buildPages(personal = PERSONAL) {
  const p = {
    her: personal.herName,
    you: personal.yourName,
    date: personal.specialDate,
    message: personal.personalMessage,
    promise: personal.finalPromise,
  };

  return [
    {
      id: 'chronicle',
      kicker: SECRET_PAGE.kicker,
      title: SECRET_PAGE.title,
      subtitle: SECRET_PAGE.subtitle,
      paragraphs: [
        {
          dropcap: true,
          text: `If you are reading this, then the wind has carried you further than it carries most travelers. I wrote these words in a library that no one remembers, on a page that no one was meant to find — except you, ${p.her}.`,
        },
        {
          text: 'I have been thinking about how many worlds there must be. Countless Teyvats, countless skies, countless versions of me setting out with the same restless heart. I used to find that thought lonely. Then I understood something.',
        },
        {
          text: `In every one of them, I go looking for the same person. In every one of them, I would cross the same meadow, wake the same ruins, climb the same stairs, and open the same book, just to arrive at you. Not because I am brave. Because it is the only place worth arriving at.`,
        },
        {
          text: `{message}`,
          personal: true,
        },
        {
          text: `So this is the truth I am leaving in the chronicle, ${p.her} — the one that survived every journey: of all the worlds I could have been born into, I am glad it was this one. Of all the people I could have found, I am glad it was you.`,
        },
        {
          text: 'The page is dated, because the date matters: {date}. The first of many, and I have already decided to be late for nothing after it.',
          personal: true,
        },
      ],
      signature: { small: 'Recorded beneath the archive', name: 'by {you}' },
      dateLine: '{date}',
      sealCaption: SECRET_PAGE.sealCaption,
      nextLabel: 'Turn the page',
    },
    {
      id: 'dedication',
      kicker: SECRET_PAGE.dedicationKicker,
      title: SECRET_PAGE.dedicationTitle,
      subtitle: 'The chronicle ends here. The promise does not — and it renews every twenty-fifth.',
      devotion: true,
      paragraphs: [
        {
          text: `{promise}`,
        },
        {
          text: 'If you ever doubt where you belong, come back to this page. I will have left it open. I will have left the lamp lit.',
        },
        {
          text: 'Happy monthsary, {her}. One down, and I am already planning the rest.',
          personal: true,
        },
      ],
      signature: { small: 'Always, in every world', name: '{you}' },
      dateLine: '{date}',
      sealCaption: 'Asteria — the star that stays',
      nextLabel: '',
    },
  ];
}

/** True when the owner has not yet replaced one of the placeholders. */
export function hasUnreplacedPlaceholders(personal = PERSONAL) {
  return Object.values(personal).some((value) => typeof value === 'string' && /\[[A-Z0-9 _-]+\]/.test(value));
}
