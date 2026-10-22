# Project Asteria — The Chronicles of Teyvat

An original, single-player 3D fantasy adventure that runs in the browser. Five
short chapters take you from a wind-lit meadow to a forgotten library, where a
book that was never written is waiting to be opened.

Everything you see and hear is generated in code: there are no model, texture,
or audio files to download. Three.js draws the world, the Web Audio API
synthesises the score and ambience, and the interface is plain HTML and CSS.

> This is an original work, inspired by the *feeling* of open-world fantasy
> games. It is not affiliated with, endorsed by, or connected to HoYoverse.

---

## Running it

Requires **Node.js 18+** and a browser with WebGL 2.

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build
```

The game is fully client-side — `dist/` can be hosted on any static host.

---

## Deploying to GitHub Pages

The published site must be the **build output**, never the repository source.
`index.html` imports the `three` package by name and links CSS from `src/`,
which only a bundler can resolve — serving the source gives a blank, unstyled
page.

This repository ships `.github/workflows/deploy.yml`, which on every push to
`main` installs, runs the test suite, builds, and publishes `dist/`.

**One-time setup:** Settings → Pages → **Source: GitHub Actions**
(not "Deploy from a branch").

`vite.config.js` sets `base: './'`, so the same build works from a project site
(`https://<user>.github.io/Genshin/`), a user site, a custom domain, or a
throwaway local server:

```bash
npm run build
cd dist && python3 -m http.server 8000   # http://localhost:8000/
```

If the deployed page ever loads but the game does not start, an inline watchdog
in `index.html` explains what failed instead of leaving a half-rendered page.

---

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `W A S D` / arrow keys | left joystick |
| Look | mouse (click to capture) or drag | drag the right side |
| Interact | `E` / `F` | ✦ button |
| Sprint | `Shift` | — |
| Jump | `Space` | ↑ button |
| Satchel | `I` | HUD bag button |
| Journal | `J` | pause menu |
| Controls help | `H` | pause menu |
| Pause | `Esc` | HUD menu button |

Pointer lock is optional: dragging with the mouse still turns the camera, which
is what touch and trackpads use. Fullscreen is requested when you start a new
adventure and can be toggled in Settings.

---

## The journey

| Chapter | Place | What happens |
| --- | --- | --- |
| I | Windrise Meadow | Meet Wren, gather three wind fragments, open the old chest. |
| II | Whispering Woods & the Fallen Circle | Wake three mechanisms in the order the stones remember. |
| III | The Sealed Archive | Match three pages to their pedestals; meet the Archivist's Echo. |
| IV | The Celestial Observatory | Light the star mechanisms, then trace the constellation. |
| V | The Forgotten Library | Open the Unwritten Chronicle. |

Progress is saved automatically to `localStorage` and is validated on load:
tampered saves cannot unlock a chapter that was never completed.

---

## Personalising the hidden page

Chapter V ends with a book that contains a page written just for one person.
**Before giving the game to her, edit one file:**

```
src/story/secretMessage.js
```

1. Replace the placeholders in `PERSONAL`:

   | Placeholder | Meaning |
   | --- | --- |
   | `[HER NAME]` | her name, as you say it |
   | `[YOUR NAME]` | your name, or the name she calls you |
   | `[SPECIAL DATE]` | a date that matters to the two of you |

2. Rewrite `personalMessage` and `finalPromise` in your own voice. Short and
   plain reads better than grand.
3. Adjust `SECRET_PAGE.inscription` if you want a different closing line — it
   is also shown in the ending sanctuary.
4. Run the tests: `npm test`. The logic test fails while placeholders remain,
   which is a deliberate reminder.

That module is **never** imported by the initial bundle. It is fetched with a
dynamic `import()` only after the reveal gate clears (Chapter IV complete, the
Celestial Seal claimed, Chapter V entered, and the physical book opened). Its
words do not appear in quest data, dialogue, the journal, or the main
JavaScript chunk.

A client-side story can never hide text from someone who opens developer tools.
The goal is simply that she never meets it before the moment it is meant to
arrive.

---

## Project structure

```
index.html                 app shell, all HUD/screen markup
src/
  main.js                  entry point: fonts, boot, fatal-error handling
  game/
    Game.js                orchestrator: loop, state, transitions, UI wiring
    Renderer.js            WebGL renderer, adaptive resolution, quality tiers
    SceneManager.js        scene, fog/atmosphere, world disposal
    CameraController.js    third-person camera, orbit, cinematic, shake
    PlayerController.js    movement, stamina, procedural character
    InputManager.js        keyboard/mouse/pointer-lock/touch abstraction
    MobileControls.js      virtual stick, swipe look, action buttons
    CollisionSystem.js     circle/box colliders and world bounds
    InteractionSystem.js   nearest-interactable detection and prompts
    WorldManager.js        lazy world loading, swapping, disposal
    QuestManager.js        objective snapshots and chapter completion
    LevelManager.js        travel gates, first-visit beats, rewards
    InventoryManager.js    items and pickups
    Progression.js         pure functions over saved progress
    SaveManager.js         versioned localStorage save + settings
    AudioManager.js        synthesised music, ambience and SFX
    Textures.js            procedural canvas textures
    EventBus.js            tiny pub/sub
  worlds/
    WorldKit.js            reusable geometry: terrain, sky, props, particles
    BaseWorld.js           world lifecycle: colliders, markers, interactables
    NPCKit.js              procedural NPC models and quest markers
    MondstadtWorld.js      Chapter I
    WhisperingWoods.js     Chapter II (woods)
    AncientRuins.js        Chapter II (ruins and the mechanism puzzle)
    ForgottenLibrary.js    Chapters III and V
    AncientBook.js         the physical, opening book
    CelestialObservatory.js Chapter IV
    CelestialSanctuary.js  the ending area
  ui/
    HUD.js, QuestTracker.js, DialogueUI.js, BookUI.js, InventoryUI.js,
    JournalUI.js, SettingsUI.js, Cinematics.js, Modal.js
  story/
    storyData.js           lore, barks, chapter cards, world intros
    questData.js           the five chapters and their objective predicates
    dialogueData.js        NPCs and conversations
    SecretReveal.js        the reveal sequence and its gate
    FinalEnding.js         the ending sanctuary overlay
    secretMessage.js       ← the personal page (edit this)
  styles/                  reset, layout, HUD, dialogue, book, mobile, motion
scripts/
  smoke-test.mjs           headless logic + world construction tests
  ui-test.mjs              jsdom tests for every interface module
  boot-test.mjs            boots the whole game in jsdom with a headless renderer
public/assets/             reserved names for future art; currently unused
```

---

## Tests

```bash
npm test          # all three suites
npm run test:logic
npm run test:ui
npm run test:boot
```

* **logic** builds every world with real Three.js geometry, drives three
  puzzle sequences, plays Chapter I end to end through its interactions, and
  checks the save/progression system.
* **ui** renders the real `index.html` inside jsdom and drives the HUD,
  dialogue, book, inventory, journal, settings, pause menu, cinematics, reveal
  and ending.
* **boot** starts the actual `Game` object with a headless renderer: it boots
  to the title screen, begins an adventure, completes Chapter I, travels,
  pauses, opens every panel, returns to the title and continues from the save.

The suites do not test WebGL rendering or shader compilation — that needs a
real browser.

---

## Notes on design

* **No external assets.** Textures are drawn to canvases at load time; music and
  ambience are scheduled oscillators and filtered noise. The game works offline
  after the first load.
* **Quality tiers.** `auto` lowers the render scale when frame time rises;
  Settings also offers `high` and `performance`.
* **Accessibility.** Reduced motion calms camera shake and slows the orbit,
  dialogue text can be skipped instantly, and every modal traps focus and
  closes on `Esc`. Hints can be turned off without hiding objectives.
* **Mobile.** Landscape is recommended; a rotate prompt appears in portrait on
  touch devices.
