# zq3d

**A little world. A deeper calm.**

A standalone, dependency-free 3D aquarium with the heart of
[Zenquarium](https://github.com/rmauceri/zenquarium). This repository is independent
of the original game.

## Open the aquarium

Play at **https://rmauceri.github.io/zq3d/**, or open `index.html` directly in a
modern browser. All graphics, species, music, and effects are generated locally.
No build, account, CDN, or internet connection is needed for local-file play.

For installation and service-worker offline support, serve the **repository root**
over HTTPS or localhost. For example, from the repository root:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Visit **http://localhost:8080/**. Install using the browser's app menu, the
Install button in Settings when offered, or **Share > Add to Home Screen** on
iPhone/iPad. An ordinary HTTP LAN address is not a secure context and cannot enable
service workers. Production hosting can mount this folder under any subpath;
all app assets and the worker scope are relative.

The service worker preloads the complete application, including PNG install icons.
After a successful first visit, installed or browser-tab sessions can reload
offline. Updates wait for **Save & reload**, rather than replacing a running game.
Before publishing changes to any precached application file, increment the shell
version in `sw.js`. Documentation-only changes do not require a cache-version bump.

### Publishing and moving between devices

GitHub Pages publishes the repository root from `main`. The `.nojekyll` file
keeps the static application unchanged, and pushes to `main` automatically
redeploy to **https://rmauceri.github.io/zq3d/** over HTTPS.

Saves are local to each browser/device, not synchronized through GitHub. To move
an aquarium from local-file testing or another device, export its JSON backup
in Settings and restore it in the destination browser or installed app.

## A different perspective, the same principles

- **Actual WebGL geometry**, not flat images on CSS cards: deforming fish bodies
  and fins, species markings, curved tentacles, rocks, plants, a perspective camera,
  depth occlusion, moving caustics, underwater fog, light shafts, and bubbles.
- **Five complete worlds**: Koi Garden, Tropical Reef, Deep Ocean, Zen Garden,
  and a light, cross-hatched Pen & Ink aquarium. Species, prices, personalities,
  visitor variants, and musical scales follow the existing application and master
  specification, with a swimming **Barreleye** replacing the Deep Ocean resident
  jellyfish so it cannot be confused with the dangerous Crystal Jelly visitor.
- **Living residents**: eight personality traits with individual intensities,
  loose three-dimensional schools, body-size-aware personal space, gentle boundary
  steering, curiosity, hunger, recovery, predation, reproduction, and babies that
  grow into adults. Schoolmates suggest a heading without replacing every fish's
  route with the same destination.
- **The existing game**: a starting score of 100 and two fish; 0.5 points per
  healthy adult per second; the health streak, 20 one-time achievements, five
  victory milestones, care costs, repeatable bonuses, dangerous visitors, and
  optional Zen care.
- **Synthesized sound**: filtered water, theme-specific pads and melodies, subtle
  stereo positioning, procedural reverberation, and gentle event sounds. Sound
  starts only after a user interaction and can be muted or adjusted.
- **Touch, mouse, and keyboard**: drag to orbit, scroll/pinch to zoom, inspect and
  follow a fish, or hide the interface without losing access to care warnings.
- **Uninterrupted care**: Zenquarium's theme-specific colors, a quiet translucent
  HUD, collapsible dock, and
  non-modal shop, inspectors, settings, field guide, and prize collection. Feed,
  clean, orbit, or defend a resident without dismissing a tray.
- **New challenge creatures**: themed crabs scavenge fallen food and pinch nearby
  fish; eels stalk, visibly coil, and lunge. Each has its own defense, not just a
  differently colored version of the original visitors.
- **Earned tank prizes**: an interactive bubbling chest, pearl oyster, watchlight
  lantern, and stone arch. Unlocks and placements persist across themes and
  sessions, with no new currency or purchases.

### Controls

| Action | Control |
|---|---|
| Feed / clean / add fish | Dock buttons; `F`, `C`, `B` |
| Pause / resume | Pause button; `Space` when not activating another focused control |
| Orbit / elevate camera | Drag; arrow keys; camera buttons |
| Zoom | Pinch, wheel, `+` / `-`, or zoom buttons |
| Reset camera | Reset button; `R` |
| Inspect / follow | Open **Residents** in the HUD; choose **Follow** |
| Guide an original visitor away | Tap it, or use the visitor's care-alert button |
| Defend against a crab | Alternate the left and right decoys three times |
| Defend against an eel | Flash the light during its 2.6-second coil warning |
| Tank prizes | Prizes button; `T`; or the field guide's **Tank prizes** tab |
| Enjoy a placed prize | Tap it in the water, or **Enjoy this prize** in its tray |
| Minimize controls | Chevron above the dock; press it again to restore controls |
| Tap glass | Click or tap the aquarium, including directly over a fish; `G` for keyboard; no tray or dialog |
| Immerse / exit | Immerse button; `I`; visible exit button or `Escape` |
| Help, discoveries, audio, saves | Field guide and Settings in the header |

Routine trays do **not** stop simulation, mute audio, cover the aquarium with a
backdrop, or trap keyboard focus. The shop stays open for repeated purchases and
shows live prices/capacity; fish inspectors show live health, fullness, growth,
and new arrivals. Score details and discoveries also refresh in place. Trays
leave space for care warnings and creature-defense buttons, including on phones.
Explicit pause, confirmation dialogs, and milestones stop simulation and audio.
Milestones still require a continue-or-finish decision. Excessive glass tapping
still causes stress; three taps on an original visitor within five seconds still
provoke stingers or ink.

Glass taps are the primary interaction, not a shortcut into fish details. A tap
on a visitor or placed prize still performs its specific action. Dragging and
two-finger pinching do not count as glass taps. Camera elevation, zoom, and
following share safe limits that keep the viewpoint and near clipping plane above
the sand. The floor covers the full viewing range and fades into the water rather
than ending at a visible edge, including in compatibility mode.

### New challenges and earned prizes

Crabs and eels have unique variants in every theme, including a Glass Crab and
Gulper Eel in the deep, and an Etched Crab and Brushstroke Eel in Pen & Ink.

**Crabs** remain near the bottom, steal settled food, stir up dirt, and can catch
nearby fish. Three alternating left/right distractions send them away. Repeating
the same claw restarts the sequence; a short 0.35-second cooldown prevents
accidental double taps. Either tap alternate sides of the creature or use the
keyboard-accessible decoy buttons.

**Eels** stalk near the rocks, lock a lunge destination, and coil for 2.6 active
seconds before a short dash. The alert and a pulsing in-world cue signal the
defense window. A light flash during the coil sends the eel retreating; flashing
outside that window does not earn a defense. Eels honor the existing eight-second
kill cooldown and pause with the rest of the simulation.

Zen care handles food, cleaning, and population, **not creature defenses**. The
original sighting/departure rewards and death penalties apply to the new visitors.
Creature Collector still means seeing the original jellyfish, octopus, and squid;
crabs and eels do not inadvertently satisfy it.

| Prize | Earn it by | In-world interaction |
|---|---|---|
| Bubble Chest | Reaching 1,000 points | Opens its hinged lid and releases extra bubbles |
| Pearl Oyster | Welcoming a first baby fish | Opens its ribbed shell to reveal the pearl |
| Watchlight Lantern | Repelling an eel during its coil | Sends up a soft luminous pulse |
| Tidekeeper Arch | Completing a crab's alternating defense | Releases a bubbling current beneath the arch |

Three prizes can be placed at once. An earned prize is automatically placed if
there is room; others remain in the collection until a space is freed. They can
be put away and placed without losing the unlock. All four have actual 3D
geometry plus compatibility-renderer equivalents. Interactions are cosmetic and
never mint points or confer a hidden advantage.

### Rules and deliberate clarifications

[`zenquarium-spec.txt`](zenquarium-spec.txt) and
[`scoring-rules.md`](scoring-rules.md) are the balancing references. Where
the original code and documents disagree, zq3d uses the documented behavior:

- Purchase prices are the existing **per-species** values, including the
  Tropical Reef's 10-point Neon Tetra, not the old generic "Buy Fish: 15" table.
- Positive bonuses receive the current multiplier; costs and penalties do not.
- First Fish requires a purchase, rather than being awarded for the starter fish.
- Perfect Tank checks all resident fish above 90% health with at least five fish.
- Clean Sweep checks water above 70% **before** the cleaning action.
- Pacifist's completion bonus is included in the recorded final score.
- Master requires the population and biodiversity conditions continuously for
  three minutes; it is not simply three minutes since starting.
- Hunger, streaks, breeding probability, visitor attacks, and cooldowns use
  active simulation time, never background wall-clock timers.
- The Deep Ocean's 20-point resident is a **Barreleye**, with a finned swimming
  body and upward-looking luminous eyes, rather than a second jellyfish.
  Its roster slot, price, size, speed, and shy/explorer traits are unchanged;
  existing version-1 and version-2 saves retain the fish's identity and condition.
  Crystal Jelly remains a challenge visitor with its original behavior.

Water deterioration retains the original dirt and overcrowding model. Cleaning
clears accumulated dirt and repairs up to 30 points of direct water damage.
Stress/ink damage remains real instead of being overwritten by the next dirt
calculation. Zen care uses ordinary purchase and care rules; it is not a sandbox
or an invulnerability mode.

## Device, privacy, and offline behavior

- A versioned, validated localStorage envelope at **`zenquarium_zq3d_v1`** holds
  settings, discoveries, statistics, and a complete resumable aquarium.
  The stable key now contains schema version 2; valid version-1 saves are
  upgraded in memory without discarding progress.
- Saves include fish traits, growth, hunger, health, destinations, food, visitor
  state, live hazards, seeded randomness, breeding timers, and pending milestones.
  New challenge phases, defense progress, prize unlocks, placements, and active
  decoration effects also survive a save/reload.
- Autosaves happen every 12 active seconds, on important actions, and when
  backgrounding. **Time does not advance while away.**
- Returning from the background requires explicit resume. Rendering and sound
  are suspended; screen wake lock is opt-in and released while inactive.
- Malformed saves are left untouched. Storage denial or capacity errors are
  visible; Settings can export/restore JSON backups. Concurrent windows pause
  instead of silently overwriting a newer save.
- Quality automatically steps down on slower rendering. Manual High, Balanced,
  and 30-FPS Battery Saver are available. Device reduced-motion preferences are
  respected and can be overridden.
- WebGL loss pauses the game and rebuilds GPU resources on restoration.
  Browsers without usable WebGL get an explicitly labeled, playable Canvas 2D
  perspective renderer; this compatibility mode is not claimed to be WebGL 3D.
- No telemetry, external requests, notification permissions, downloaded audio,
  account storage, cookies, or IndexedDB are used.

**Hosting privacy:** Gameplay and saves remain on the device. GitHub Pages records
visitor IP addresses for hosting security; see
[GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).

**Coexistence:** zq3d has its own manifest identity, relative worker scope
(`/zq3d/` on GitHub Pages), save key, and `zq3d-shell-` cache prefix. It does not
import the original game's scores or in-progress sessions. Apps hosted on the
same origin share browser cache storage, so every worker must clean up only its
own caches. A separately deployed original Zenquarium worker should restrict
cleanup to its `zenquarium-` caches; this repository does not modify that app.

## Files

| File | Responsibility |
|---|---|
| `index.html`, `styles.css` | Responsive, accessible application shell |
| `core.js` | Pure seeded simulation, balancing, themes, achievements, save validation |
| `renderer.js` | Procedural meshes, shaders, camera, picking, quality and fallback |
| `audio.js` | Procedural audio, routing, event sounds and lifecycle |
| `app.js` | Input, UI, persistence, install/update flow and lifecycle |
| `manifest.webmanifest`, `sw.js`, `icons/` | Separate PWA identity and offline shell |
| `tools/generate-icons.ps1` | Reproducible PNG icon generation on Windows |
| `tests/core.test.js`, `tests/verify.py` | Deterministic rules and browser coverage |

The UI retains the shared `--cp-*` design tokens, populated by the selected
Zenquarium palette on both the welcome screen and in play: warm koi colors,
tropical greens, deep-ocean blues, quiet charcoal/copper, or parchment and ink.
An explicit `clawpilotTheme=light` or `clawpilotTheme=dark` URL selects the shared
neutral interface instead. Scene colors remain part of the inherited game-theme
configuration. Scripts use ordered browser
IIFEs, not ES-module fetches, so opening the HTML file remains supported.

## Development checks

The game has **no runtime or build dependencies**. The optional browser
verification harness requires Python and Playwright plus an installed Edge or
Chrome. It starts a loopback-only temporary server and closes it and its browser
when finished. The full suite uses software-rendered 3D and can be CPU-intensive;
run it only when that load is acceptable. Publishing the static site does not
require running local rendering tests.

Run the optional full suite with:

```powershell
python -m pip install playwright
python .\tests\verify.py --browser msedge
```

Use `--browser chrome` for Chrome, or `--browser chromium` after installing
Playwright's Chromium. `--artifacts <directory>` writes screenshots and a JSON
report outside the application. The pure game checks can also run with
`node .\tests\core.test.js` when Node is available.

Coverage includes exact scoring thresholds, all themes, purchase and reproduction
caps, hazard survival, malformed snapshots, deterministic simulation, simulated
ten-minute sessions, live non-modal trays, crab/eel defenses, prize progression,
version-one save upgrades, mobile layouts, context loss, pause/resume, storage
failures, concurrent windows, and an actual offline browser reload. Regression
checks also measure 3D fish spacing and volume coverage across every theme at
desktop/phone sizes, camera and near-plane clearance through full orbits and
following, direct mouse/touch glass taps, pinch/drag isolation, theme colors, and
existing Deep Ocean saves. Emulation
does not replace final hands-on iOS Safari and Android device testing.
