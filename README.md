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

`.github/workflows/deploy.yml` runs on every push to `main`: install, test,
build, then publish. It detects which publishing mode the repository is in and
handles both:

| Pages source | What the workflow does | Where the game lives |
| --- | --- | --- |
| **GitHub Actions** (preferred) | Uploads `dist/` with `actions/upload-pages-artifact` and deploys with `actions/deploy-pages` | `https://<user>.github.io/<repo>/` |
| **Deploy from a branch** (the default) | Copies `dist/` into `game/` and commits it | `https://<user>.github.io/<repo>/game/` |

In branch mode the root page is still the source shell, so it detects that its
entry module failed to load, checks that `game/index.html` exists, and forwards
the visitor there. `https://<user>.github.io/<repo>/` therefore works either
way.

> **Switching to the Actions source is a one-click job for a repository admin**
> (Settings → Pages → Build and deployment → Source → *GitHub Actions*). Neither
> a workflow token nor an app installation token can do it: creating a Pages
> site requires repository **administration** rights, which `GITHUB_TOKEN`
> cannot be granted — `actions/configure-pages` with `enablement: true` fails
> with *Resource not accessible by integration* for exactly this reason.
> Setting it removes the committed `game/` folder from future builds.

`vite.config.js` sets `base: './'`, so the same build works from a project
subpath, a user site, a custom domain, or a throwaway local server:

```bash
npm run build
cd dist && python3 -m http.server 8000   # http://localhost:8000/
```

`game/` is committed on purpose in branch mode; do not add it to `.gitignore`.
If the deployed page loads but the game does not start, an inline watchdog in
`index.html` explains what failed instead of leaving a half-rendered page.

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
