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
    ShopManager.js         the wallet, the ledger and the wishing star
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
    JournalUI.js, ShopUI.js, SettingsUI.js, Cinematics.js, Modal.js,
    WishCinematic.js       the wishing star's falling-star pull scene
    CharacterViewer.js     the Traveler's Mirror (drag to turn, pinch to zoom)
  story/
    storyData.js           lore, barks, chapter cards, world intros
    shopData.js            looks, prices, wish pool, pity and reward rates
    questData.js           the five chapters and their objective predicates
    dialogueData.js        NPCs and conversations
    SecretReveal.js        the reveal sequence and its gate
    FinalEnding.js         the ending sanctuary overlay
    secretMessage.js       the personal page — personalised for Chelsea;
                           edit PERSONAL there to change names or the date
  styles/                  reset, layout, HUD, dialogue, book, mobile, motion,
                           shop (ledger, wishes) and viewer (the mirror)
scripts/
  smoke-test.mjs           headless logic + world construction tests
  ui-test.mjs              jsdom tests for every interface module
  boot-test.mjs            boots the whole game in jsdom with a headless renderer
public/assets/             reserved names for future art; currently unused
```

---

## Getting unstuck

The pause menu has **Where the chronicle continues**. It reads the save and
offers the next gate the progress rules already allow — the observatory while
Chapter IV is unfinished, the archive while the seal's return trip is pending,
the library once Chapter IV is complete. It never skips a chapter; it only
removes the "I don't know where to go" dead end.

Chapter V itself needs three things in order, all of them marked on the map:

1. Light the three star mechanisms, then trace the pylons in the sky's order.
2. Claim the seal that forms above the lens (stand just outside the lens ring).
3. Touch the observatory waystone to return — the *return* trip is what
   finishes Chapter IV — then open the celestial stair on the archive's east
   wall. Its runes glow and a beacon marks it once the seal is home.

## Mobile

The HUD (satchel, ledger, sound, menu) is a **layer above** the touch controls,
and its buttons are 44 px targets on touch devices. The full-height look area
sits underneath the HUD, so a swipe that starts on a button never steals the tap
and a swipe on open ground still turns the camera. The interaction prompt is
tappable as well, so a player with both thumbs on the controls can still
interact.

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
  It then walks a second, independent save through Chapters I–V end to end and
  checks that the rescue route points where that walk actually ended up.

The suites do not test WebGL rendering or shader compilation — that needs a
real browser.

---

## Notes on design

* **No external assets.** Textures are drawn to canvases at load time; music and
  ambience are scheduled oscillators and filtered noise. The game works offline
  after the first load.
* **The traveler is stylised, not smooth.** The avatar is primitive-built but
  cel-shaded: a 4-step `MeshToonMaterial` ramp, inverted-hull outlines on the
  silhouette pieces, a large head with banded irises, layered hair with a
  three-segment ponytail, and a layered outfit (mantle, bodice, flared skirt,
  thigh boots, sash and a Vision-like gem). Every piece a look repaints is kept
  on `materials.accent` / `materials.accentDeep` / `capeMaterial` /
  `charmMaterial`, so the shop still works unchanged.
* **Quality tiers.** `auto` lowers the render scale when frame time rises;
  Settings also offers `high` and `performance`.
* **Accessibility.** Reduced motion calms camera shake and slows the orbit,
  dialogue text can be skipped instantly, and every modal traps focus and
  closes on `Esc`. Hints can be turned off without hiding objectives.
* **Mobile.** Landscape is recommended; a rotate prompt appears in portrait on
  touch devices.

---

## The Wanderer's Ledger (shop, wishes and looks)

Open the ledger with **B**, the star button in the HUD, or *Wanderer's Ledger &
Wishing Star* in the pause menu.

Everything it trades in is **cosmetic**. Quest items — wind fragments, keys,
pages, seals — are never sold and never bought, so the shop cannot open or
close a chapter. Wares and wishes both pay out "looks":

| Slot | What it changes |
| --- | --- |
| Title | a line under the chapter badge |
| Cape | the cape's cloth colour |
| Charm | the pendant's colour and glow |
| Dye | the tunic, skirt and cuff accent |
| Companion | a small wisp that hovers at your shoulder |

Prices, the wish pool, rarity weights, pity and reward rates all live in
`src/story/shopData.js`:

* **Wishes** cost 20 mora, or 170 for ten. You never receive a look you already
  own until every look is owned; after that, duplicates return 30 mora.
* **Pity** is published and true: a legendary is guaranteed within **20**
  wishes, and the counter is visible above the tabs.
* **Mora** comes from finishing chapters (120), carrying wind fragments home
  (15 each), reaching the ending (200) and — generously — from discovering the
  hidden page (500), so a reader is never priced out of a nice cape.

The wallet (`state.wallet`) is part of the save: mora, purchases, owned looks,
worn looks, pity and wish count all survive a reload, and `normalizeWallet()`
drops anything unknown so a hand-edited save cannot inject a look.

### The pull scene

A wish is not a list that appears: the sky darkens, a star swells overhead,
falls across the screen trailing light, breaks, and leaves the rarest result of
the pull inside the burst. The rest of a ten-pull lands underneath it, one card
at a time.

The scene is purely additive — the ledger's result list is already in the DOM
behind it, so tapping *Skip* (or tapping anywhere once the star has landed)
only skips the show, never the result. With **reduced motion** on, the star does
not fly at all and the results simply appear.

### The Traveler's Mirror

`Pause → Look at the traveler`, or *Look at the traveler up close* in the
ledger's **Your Look** tab. The world keeps rendering behind the overlay and the
camera orbits the real model wearing the real look:

* drag to turn her, scroll or pinch to zoom right in to her face;
* tap **⟳** for a slow idle turn, **◎** to face her again, **− / +** to zoom;
* the worn look (title, cape, charm, dye, companion) is listed beside her.

On a phone the chase camera itself also zooms now: pinch with two fingers on the
look area. Jump is buffered and forgiving, so a tap a frame early still jumps.
