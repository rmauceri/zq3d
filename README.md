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
- **Five distinct worlds**: Koi Pond is a warm pond with surface lilies,
  leaf shadows, river stones, and contrasting koi patches. Tropical Reef
  clusters branching, plate, boulder, and fan corals around pale sand lanes,
  with turquoise shallows fading into cobalt depth. Deep Ocean pairs dark
  negative space and violet haze with cyan, pink, lime, and amber fluorescent
  anemones, fans, and mineral spires; eyes, lures, dotted bodies, and fin edges
  give its residents different luminous signatures with slow, subtle pulses.
  Zen Garden is a blue-water-and-ivory sanctuary: asymmetric moss islands,
  fine raked sand, fuller ribbon-plant clusters, and an open center. Its Pearl Medaka,
  White Cloud Minnow, Celestial Pearl Danio, and Threadfin Rainbowfish have
  delicate silhouettes, pale stripes, pearl spots, and flowing filaments,
  rather than being another koi pond. Pen & Ink is a dimensional,
  watercolor-washed aquarium with blue water against warm sand, fuller
  leafy clusters, varying line weights, shaded pigment, stippling, and cross-hatching.
  Both worlds use clearer healthy water rather than a pale veil of haze;
  deteriorating water still visibly clouds the tank.
  Its residents are now Brushstroke Betta, Zebra Danio, Lyretail Killifish,
  and Glass Catfish: flowing fans, striped schoolers, forked tails, and fine
  barbels rather than recolored reef fish.
  Species, prices, personalities,
  visitor variants, and musical scales follow the existing application and master
  specification, with a swimming **Barreleye** replacing the Deep Ocean resident
  jellyfish so it cannot be confused with the dangerous Crystal Jelly visitor.
- **Living residents**: eight personality traits with individual intensities,
  loose three-dimensional schools, body-size-aware personal space, gentle boundary
  steering, curiosity, hunger, recovery, predation, reproduction, and babies that
  grow into adults. Sustained cruising, investigation, resting, socializing,
  foraging, and evasion replace constant random retargeting. Residents investigate
  plant edges, follow short routes along formations and the lower channel,
  rest near shelter pockets, navigate shared solid rock volumes,
  and notice nearby visitors and hazards. Bounded acceleration, turns, banking,
  and effort-linked fins keep motion readable. Schoolmates suggest a heading
  without replacing every fish's route with the same destination.
  Koi glide through long propulsion/coasting cycles, small fast species dart
  and coast, angelfish and flowing-finned species pause and reposition, and
  deep-water hunters move deliberately. Each resident has a stable individual
  pace and independent rhythm derived from its identity; lazy trait intensity
  affects pace. Food and danger override the leisurely cycles.
  Contented fish occasionally slow and tilt upward to release a short ribbon
  of mouth bubbles, with pulsing mouths and gently supporting fins. Bursts are
  independently timed and interrupted by feeding or danger; released bubbles
  keep rising and fade without becoming saved progress.
- **The existing game**: a starting score of 100 and two fish; 0.5 points per
  healthy adult per second; the health streak, 20 one-time achievements, five
  victory milestones, care costs, repeatable bonuses, dangerous visitors, and
  optional Zen care.
- **Synthesized sound**: filtered water, theme-specific pads and melodies, subtle
  stereo positioning, procedural reverberation, and gentle event sounds. Sound
  starts only after a user interaction and can be muted or adjusted.
  Fish bubbles restore the original Zenquarium's soft ascending bloop, panned
  to the visible fish rather than attached to every background particle.
  The water bed uses a DC-free, band-limited loop with settled filter state;
  background layers enter gradually and tones reach silence before stopping.
  Deep Ocean retains its low supporting chord but places the melody two octaves
  higher (260–524 Hz), with a gentler midrange texture instead of a sub-bass sweep.
  Audio requests the browser's playback-oriented buffer rather than its
  low-latency interactive default. This offers more scheduling headroom, but
  cannot guarantee elimination of device/browser output underruns.
- **Touch, mouse, and keyboard**: drag to orbit, scroll/pinch to zoom, inspect and
  follow a fish, or hide the interface without losing access to care warnings.
- **A quiet interface**: one compact status control and a collapsible command
  bar: Feed, Clean, Add fish, Pause/Resume, Zen care, and Volume.
  A small chevron hides the bar without pausing the aquarium. Menu lives in the
  upper right and opens a non-modal flyout for residents, progress, camera
  buttons, prizes, settings, and the field guide. Menu's child panels stay
  anchored beneath the same upper-right button. Health-widget panels and their
  child screens stay beneath the upper-left health widget.
  The preview identifies the selected world at its top with the theme name and
  two short descriptive lines, retained on small screens instead of a renderer badge.
  Phones and small tablets use a preview-first welcome screen with brief copy
  and a single-line portrait title that leaves more room for the aquarium,
  all five world choices visible without scrolling, and side-by-side preview/content in
  landscape, with a narrow introduction pane and unnumbered world choices.
  Enter aquarium starts the selected world directly; Resume keeps the saved
  aquarium. Starting anew records the previous session while preserving
  achievements and best scores. The in-tank dock uses a single compact icon-and-label row without
  secondary descriptions, retaining 44-pixel touch targets and clear water
  status. Safe-area spacing keeps controls clear of device edges.
  The fish catalog is four compact purchase buttons, each with a fish preview,
  name, and price, without a heading or a separate Add button. Compact headings, tighter
  spacing, bounded panel widths, and independently scrolling content apply to
  residents, status, settings, the field guide, prizes, and confirmations.
  Panels and flyouts use outside-tap/Escape dismissal without redundant close
  icons. Cancel remains available for confirmations.
  Routine discoveries and bonuses accumulate in **Recent moments**, rather
  than repeated popups. Feed, clean, orbit, or defend a resident without
  dismissing a tray. Critical care remains available alongside non-interactive,
  creature-specific defense hints.
- **A stable habitat**: deterministic scenery is shared by rendering and
  simulation at every quality level. Gentle three-dimensional currents carry
  food. Screen rotation reframes the view instead of reshaping the aquarium or
  moving its residents; older saves keep their original habitat dimensions.
- **Living residents**: broad koi glides, dart-and-coast small fish, precise
  angelfish hovering, and poised deep-water swimming keep travel aligned with
  the body, with shallow climbs and little banking. Residents approach plant
  edges and shelters, arrive, inspect or rest, then depart; urgent food and
  threats interrupt rather than spend their dwell time. Rocks and substantial
  stems guide navigation; soft leaves can brush a passing resident.
- **Layered scenery and steadier timing**: fish-scale interior formations and outer
  foreground/background planting frame larger windows without crowding the
  swimming lanes. Cosmetic density scales with quality while solid habitat
  stays identical. Resizing reuses meshes; quality changes rebuild scenery
  without rebuilding residents or visitors. Music uses bounded Web Audio
  clock lookahead instead of depending on animation-frame timing.
- **Organic scenery without extra animation load**: eroded, asymmetric rock
  silhouettes, curved leaves, uneven coral branches, and varying plant widths,
  heights, and lean are generated once into the cached scene mesh. Broad raised
  sand banks reach toward the side and rear bounds around a winding lower channel.
  Larger stone neighborhoods span several adult body lengths, with taller,
  broader plant groves reaching into the swimming column and lily root curtains;
  Tropical, Deep, and Ink formations include real openings that smaller fish
  can explore. Fish clearance, crab footing, settled food, camera clearance,
  and prize picking share the terrain heightfield. Prizes require level sand.
  Quality levels bound the cosmetic detail; no extra
  WebGL draw calls, particles, or per-frame mesh rebuilding are required.
  Bottom stones are partially buried and arch caps visibly intersect their
  supporting stones even after erosion. Zen and Ink sand retains directional
  slope shading rather than flattening the hills into uniform pale washes.
  The camera is a window, not an enclosure: zoom and orbit never resize the
  habitat, and residents can naturally leave and reenter a cropped view.
  Default framing fills the viewport with active water instead of fitting the
  outer decorative margins; narrow screens crop the sides and wide screens
  crop vertically. Ambient bubbles and motes occupy the same terrain-aware
  water volume as the residents, without additional particle counts.
  Offscreen attack warnings indicate that a visitor needs attention without
  recentering the camera or attaching an obstructive label to the creature.
- **New challenge creatures**: themed crabs scavenge fallen food and pinch nearby
  fish; eels stalk, visibly coil, and lunge. Each has its own defense, not just a
  differently colored version of the original visitors.
- **Earned tank prizes**: an interactive bubbling chest, pearl oyster, watchlight
  lantern, and stone arch, with theme-specific wood, metal, and shell palettes.
  Each new aquarium earns its own collection; resuming
  retains that round's unlocks and sand placements, with no new currency.
- **Simple food drops and catalog**: tap Feed once, then click anywhere in the
  water to place food there; double-tap Feed for a normal center/surface drop.
  The live fish catalog includes species illustrations
  and dismisses with an outside tap, Escape, or its close button.

### Controls

| Action | Control |
|---|---|
| Drop food | Tap Feed, then click/tap the water; double-tap Feed for a normal drop. Keyboard: `F`, then arrows/`Enter`; `Escape` cancels |
| Clean / add fish | Dock buttons; `C`, `B` |
| Menu | Menu button; `M` |
| Pause / resume | Menu; `Space` when not activating another focused control |
| Orbit / elevate camera | Drag; arrow keys; camera buttons in Menu |
| Zoom | Pinch, wheel, `+` / `-`, or Menu camera buttons |
| Reset camera | Menu; `R` |
| Inspect / follow | Menu > **Residents & following**; choose **Follow** |
| Stop following | Menu or status details > **Stop following**; drag to orbit |
| Status / progress | Compact points-and-condition control; Menu > **Status & progress** |
| Fend off jellyfish, squid, or octopus | Press on it, drag outward, release; three swipes. Keyboard: `X` |
| Defend against a crab | Press on it and alternate left/right swipes three times. Keyboard: `J`, `L`, `J` (or `L`, `J`, `L`) |
| Defend against an eel | Press and hold on it for 0.7 seconds during its 2.6-second coil warning. Keyboard: hold `H` |
| Tank prizes | Menu; `T`; or the field guide's **Tank prizes** tab |
| Enjoy a placed prize | Tap it in the water, or **Enjoy this prize** in its tray |
| Move a prize | Drag it along the sand, or choose **Move** in its tray, use arrows, and `Enter`; `Escape` cancels |
| Tap glass | Click or tap the aquarium, including directly over a fish; `G` for keyboard; no tray or dialog |
| Immerse / exit | Menu > **Immerse**; `I`; visible exit button or `Escape` |
| Help, discoveries, audio, saves | Menu > **Field guide**, **Recent moments**, or **Settings** |

Routine trays do **not** stop simulation, mute audio, cover the aquarium with a
backdrop, or trap keyboard focus. The fish catalog is a separate light-dismiss,
non-modal dialog; it stays live for repeated purchases and shows previews,
prices, and capacity. Outside dismissal consumes that tap rather than tapping
the glass. Fish inspectors show live activity, health, fullness,
growth, and new arrivals. Status details and discoveries also refresh in place. Trays
leave space for care warnings and small, non-interactive creature hints, including on phones.
Explicit pause and confirmation dialogs stop simulation and audio.
Milestones appear as compact nonblocking notices: Continue dismisses the notice,
and Stop ends the round with a victory in one click. The aquarium and audio
continue while the notice is showing. Dialogs and live trays support outside-tap
dismissal without accidentally interacting with the tank underneath; Escape and
close buttons remain available. The catalog, all in-tank menu trays, dialogs,
and compact score HUD share an 84%-opaque theme-colored panel surface:
the aquarium remains visible while text and quieter descriptions stay readable.
Nested cards use a light tint instead of stacking opaque backgrounds; no
expensive backdrop blur is used.
Pen & Ink keeps a dark welcome-screen palette like the other themes, switching
to its artistic light palette only inside the aquarium. Excessive glass tapping
still causes stress. Creature defenses never count as glass taps.

Glass taps are the primary interaction, not a shortcut into fish details. A tap
on a placed prize still performs its specific action. A glass tap stirs every
undefended visitor, interrupting recovery and prompting renewed pursuit without
shortening a live attack warning or counting as a defense. Brief creature clicks
do the same; repeated tapping still stresses the fish. On a mouse, swiping means clicking and holding on the creature,
dragging outward, then releasing; it does not require a fast flick. Touch uses
the same motion with a finger. A drag starting on a creature is reserved for
defense; dragging empty water or using two fingers controls the camera.
Cancelled gestures, multitouch, and defenses do not count as glass taps. Camera elevation, zoom, and
following share safe limits that keep the viewpoint and near clipping plane above
the sand. The floor covers the full viewing range and fades into the water rather
than ending at a visible edge, including in compatibility mode.

### New challenges and earned prizes

Crabs and eels have unique variants in every theme, including a Glass Crab and
Gulper Eel in the deep, and an Etched Crab and Brushstroke Eel in Pen & Ink.

**Crabs** remain near the bottom, prefer low-swimming prey, and steal settled
food. A 2.8-second claw warning selects prey, followed by a
1.2-second lunge that intercepts the moving fish rather than its old
position. Crabs jump up to 2.4 world units off the sand to grab elevated prey,
then land; their body still clears solid habitat throughout the leap.
Crabs continue pursuing between attacks. Fish react at close claw range,
rather than always fleeing a slow crab long before it can reach them.
Contact is checked throughout movement, not only
at the end of the lunge. Fish within claw reach can be caught; fish above
the claws or behind solid rock remain safe. Every completed strike stirs up five
units of dirt, even if the fish escape, so an ignored crab repeatedly worsens
water quality. A small sand plume marks the disturbance. Three alternating
left/right swipes send them away and stop further strikes and sand damage.
Repeating a direction does not advance the defense; a short 0.35-second cooldown
prevents accidental repeated input. Their brighter theme-specific shells stand
out against planting: coral, amber, fluorescent pink/cyan, gold, and colored ink.

**Eels** stalk near the rocks, select prey, and coil for 2.6 active
seconds before an electric pulse and short dash. A contracting in-world ring
and brief hint signal the defense window. Hold on the eel continuously for 0.7
seconds while it coils to discharge it safely and send it retreating. Brief taps,
late holds, movement away, or interrupted holds do not earn a defense. The pulse
travels with the lunging eel as a visible expanding three-dimensional field.
Any fish whose body crosses that field perishes immediately; there is no
partial-damage recovery loophole or generic eel bite. Eels keep swimming through recovery and can translate out of blocked
turns while keeping their whole body clear of solid habitat. Entered visitors
continue their attack cycle near the tank edges instead of freezing there.

**Jellyfish, squid, and octopus** warn before releasing their characteristic
spines or ink clouds. Jellyfish drop drifting spines; squid and octopus release
ink. Their bodies do not deal a generic contact kill. Windup remains a warning
window before attacks. Spines check contact along the visible
trails, including the fish's body, rather than only tiny endpoint dots.
Ink uses the same three expanding and fading blob volumes in simulation and both
renderers. **Contact with ink or a stinger kills a fish**, not just water quality.
Three outward swipes fend them off. Each partial
swipe interrupts preparation briefly, but does not remove an existing hazard.
Undefended creatures remain and attack repeatedly; they do not simply leave on a
timer. Attacks are local. Rocks can block claw reach;
they do not grant immunity to ink, spines, or an electric field that visibly touches a fish on the
other side. Soft vegetation cannot shield fish.
Fish can evade into shelter. Warning rings, defense-progress dots, and the eel's
charging/discharge cue appear in the water in both renderers. Reduced motion
keeps these signals readable without relying on rapid flashes. Encounter help
appears away from the creature near the dock for four active seconds, fades over
one second, and returns for each new attack warning or rejected defense gesture.
Its first display waits until the creature has entered the aquarium, rather than
expiring during its approach. Help stays above care alerts and returns after a
tray closes. A successful defense produces an explicit departure message. Help does not
track or cover the creature. Rings, progress dots, and charging cues continue;
keyboard equivalents remain available in the guide.
Gesture feedback belongs to that specific encounter and is cleared when the
creature changes, a defense succeeds, or the aquarium is paused or restarted.

Every fish loss uses the same departure: it rolls upside down, floats upward,
then fades and disappears after four active seconds. Both renderers show this,
including the compatibility renderer; pausing also pauses the departure.

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
there is room and clear sand; others remain in the collection until a space is freed. They can
be put away and placed without losing the unlock. All four have actual 3D
geometry plus compatibility-renderer equivalents. Interactions are cosmetic and
never mint points or confer a hidden advantage.

The chest has planked woodwork, a curved hinged lid, metal bands, rivets, and a
latch. The oyster has a sculpted ribbed shell and a separate pearl, drawn only
when the shell opens far enough; a closed shell never displays its pearl.
Reduced motion keeps ambient lids closed until explicitly enjoyed.

Unlock conditions use this round's score, babies, and successful defenses, not
lifetime records. New rounds start without prizes; saved rounds retain their
collection, placement choices, and positions. Lifetime statistics and
discoveries remain intact. Earlier saves transfer their existing collection
into the resumed round only.

Placed prizes share their world positions with simulation collision handling.
Fish and visiting creatures navigate around the chest, oyster, lantern, and arch
supports; eel clearance includes its full body, and other visitors include their
legs or tentacles. Chest and oyster volumes reserve room for their opening
animations, while the arch's central passage stays open. Placing, putting away,
earning, moving, or reloading a prize updates those solids immediately; prizes kept in
the collection do not obstruct the tank. Dragging or keyboard movement shows a
translucent placement preview. The original remains solid until confirmation;
cancelled drags, pinches, pause, and invalid destinations never change saved
positions. Moves reject rocks, stems, other prizes, and the habitat boundary,
with an explanation. A put-away prize keeps its position; if that spot becomes
occupied, placing it again finds open sand.

One Feed tap arms the next water click without opening a panel, reticle, or
confirmation. The Feed button reads **Click water**, and the mouse cursor becomes
a crosshair. That click is mapped into the current view's water plane and places
flakes immediately at the clicked height and position, not above a selected
moving fish. A quick second Feed tap instead makes one normal surface drop near
the center. Each successful drop costs five points, never twice for a double-tap.
Flakes then sink and drift naturally. Camera drags, pinches, pointer cancellation,
pause, and Escape cancel the pending drop without spending. Food-full or
unaffordable drops report the usual care message and leave no pending drop.
Zen care remains automatic and retains normal surface feeding.

Care is paced for observation rather than constant button presses. Fullness
decays at 0.6 points per second (slower for nearby social schools), giving a full
fish at least fifty seconds before it starts seeking food. A manual five-point
drop provides at least one flake per hungry resident. A healthy, well-fed adult male
and female of the same species can reproduce after approaching and circling
for four seconds, with an initial 25-to-45-second breeding respite. Each parent
needs fullness above 60% and health above 70%, with water above 50%. Threats,
poor water, or a full aquarium interrupt courtship. Sparse healthy tanks
have substantially better birth odds than before; each birth renews a shared
respite that lengthens with population, and birth odds decrease toward capacity.
The base courtship chance is about 5% per eligible second before the population
reduction. A brief, nonblocking announcement welcomes a baby and shows its bonus;
urgent loss or defense messages take precedence.
Resuming a sparse saved round also bounds breeding timers. Purchases remain the
deliberate way to build a large population.

Every fish receives a seeded random male/female assignment, including babies.
Sex persists as fish grow and across saves. Males have species-specific color
accents in both WebGL and Canvas rendering: strongly contrasting fin colors,
broad saturated flank ribbons, and larger, brighter existing spots, stripes,
and patches rather than added generic vertical bands. Patterned males also
carry their accent color into their fins so the difference remains visible
on a phone. Examples include turquoise betta fins, sapphire orange-koi patches,
and mint lantern-fish photophores. Zen Garden's male White Cloud Minnows,
Celestial Pearl Danios, and Threadfin Rainbowfish use softer rose-pink accents
to suit the calm theme.
Deep Ocean males have cyan, coral, mint,
or violet luminous accents; male Neon Tetras have a lemon front ribbon and
coral-red rear ribbon, while females retain the original blue/red colors. Accents grow
stronger as babies mature, and females keep their original colors and patterns.
Residents shows sex and adult male/female counts by species.

Adult male Brushstroke Bettas can become territorial when they meet in actual
3D space with no solid scenery between them. They flare their fins for four
seconds before fighting; eight further seconds without intervention costs one
fish its life. Tap near either rival or between them to separate them. Protective
taps take priority over an overlapping visitor, never add stress, and never wake
visitors. **K** separates the active rivals even outside the camera view. A small
temporary cue follows the pair or points toward them offscreen. Separated males
retreat and have a ninety-second settling period. Females, babies, and other
species do not initiate these fights. Zen care separates rivals automatically.
Courtship, fights, and settling timers all freeze on pause or backgrounding.

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
  Its roster slot, price, size, speed, and shy/explorer traits are unchanged.
  Crystal Jelly remains a challenge visitor with its original behavior.

Water deterioration retains the original dirt and overcrowding model. Cleaning
clears accumulated dirt and repairs up to 30 points of direct water damage.
Stress/ink damage remains real instead of being overwritten by the next dirt
calculation. Zen care uses ordinary purchase and care rules; it is not a sandbox
or an invulnerability mode.

## Device, privacy, and offline behavior

- A versioned, validated localStorage envelope at **`zenquarium_zq3d_v1`** holds
  settings, discoveries, statistics, and a complete resumable aquarium.
  The stable key now contains schema version 10. This development update
  deliberately requires a fresh aquarium rather than migrating earlier saves.
  An explicit notice directs you to **Settings → Start fresh aquarium**.
  Earlier data stays untouched until you confirm resetting zq3d; export first
  if you want a backup. Resetting removes the previous aquarium and discoveries.
- Saves include fish traits, growth, hunger, health, destinations, food, visitor
  state, live hazards, seeded randomness, sex, social cooldowns, courtships,
  territorial disputes, breeding timers, and pending milestones.
  Challenge phases, defense progress, prize unlocks, placements, active
  decoration effects, resident intentions, habitat routes, visit phases and dwell timers,
  banking, and the last 40 recent
  moments also survive a save/reload.
  Encounter warnings, defense progress, and electric-pulse hit records persist.
  Active holds are cancelled when pausing or reloading. Social encounters resume
  with their saved phase and remaining intervention window, not wall-clock time.
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
| `core.js` | Pure seeded simulation, shared habitat, currents, balancing, themes, achievements, save validation |
| `renderer.js` | Procedural meshes, shaders, camera, picking, quality and fallback |
| `audio.js` | Procedural audio, routing, event sounds and lifecycle |
| `app.js` | Input, UI, persistence, install/update flow and lifecycle |
| `manifest.webmanifest`, `sw.js`, `icons/` | Separate PWA identity and offline shell |
| `tools/generate-icons.ps1` | Reproducible PNG icon generation on Windows |
| `tests/core.test.js`, `tests/run-core.js`, `tests/verify.py` | Non-browser simulation/renderer-math checks and optional browser coverage |

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
report outside the application. Simulation and renderer-math checks run **without opening any browser**:

```powershell
node .\tests\run-core.js
node .\tests\run-audio.js
```

The optional non-browser DOM/input runner uses jsdom (a development-only
dependency, never loaded by the game). Set `ZQ_JSDOM` to an existing jsdom package
directory if it is installed outside the repository, then run
`node .\tests\run-input.js`. It exercises real mouse/touch gesture handlers,
keyboard defenses, cancellation, camera isolation, and hint-only encounter UI
against the real simulation with graphics/audio stubs. It also checks feedback
ownership through creature replacement, queued events, pause/resume, and restart.

Browser verification is optional and should only be launched when explicitly
desired; local visual review can be done by opening `index.html` in Edge.
For deeper audio isolation, `python .\tests\analyze-audio.py --signal` renders
30 seconds of the production Web Audio graph offline for each theme, checking
peaks, clipping, finite samples, and sample curvature around water-loop seams.
`python .\tests\analyze-audio.py --headful --meter` compares a single sine tone,
water, water with reverb, pads, full audio, and the running game in fresh pages
and contexts. The optional meter examines the real-time signal before device
output; playback statistics examine delivery failures after rendering.
These are diagnostics, not assertions of audible quality: curvature is a
heuristic, host load varies between samples, and underrun reports are batched
and cannot establish millisecond-level correlation with individual frames.
The harness retains normal browser background-throttling behavior rather than
Playwright's usual exemptions. `--background` requests a separate foreground
window, but the result must report `backgroundVerified: true` before treating
it as a focus-loss comparison; window activation is not reliable on every host.
No existing browser profile is used and nothing is uploaded.

For audio investigation, `python .\tests\diagnose-audio.py --theme deep`
uses installed Edge and Python Playwright in a fresh, headless browser profile,
served only over loopback. It compares full playback, isolated water/music,
disconnected reverb, and disabled drawing, reporting frame timing, long tasks,
audio render capacity, and output underruns when Edge exposes playback stats.
`--audio-only` runs the soundscape with simulation paused. These counters can
identify output starvation but do not establish what a person hears or prove
which system component caused a stall; samples run sequentially under varying
host load and are not a controlled latency benchmark.

`python .\tests\responsive.py` performs bounded Edge layout checks across phone
and small-tablet portrait/landscape sizes, measuring preview visibility, start
and resume accessibility, all world choices without scrolling, compact controls,
widget-specific panel anchoring, and rotation.
It also exercises whole-row catalog purchases, command-bar hide/show, direct
Zen care, pause and volume controls, residents,
settings, progress, prizes, discoveries, the field guide, confirmations, pause,
and session summaries, checking panel bounds, scrolling, and touch targets.

`python .\tests\social.py` checks actual WebGL and forced Canvas rendering for
male markings on every species, requiring substantial color contrast over at
least 12% of each adult fish's visible area at desktop and phone resolutions,
with a gentler contrast threshold for Zen Garden's three soft rose-pink species,
not merely a few changed pixels. It also checks territorial fin flares and touch
interventions across phone/tablet orientations. It also verifies that older
development saves remain untouched until an explicit reset, other localStorage
keys survive, and fresh aquariums save successfully. An optional directory
argument writes representative screenshots and unobstructed female/male
comparisons in phone portrait and landscape.

Coverage includes exact scoring thresholds, all themes, purchase and reproduction
caps, hazard survival, malformed snapshots, deterministic simulation, simulated
ten-minute sessions, live non-modal trays, crab/eel defenses, prize progression,
development-save rejection, mobile layouts, context loss, pause/resume, storage
failures, concurrent windows, and an actual offline browser reload. Regression
checks also measure 3D fish spacing and volume coverage across every theme at
desktop/phone sizes, camera and near-plane clearance through full orbits and
following, direct mouse/touch glass taps, pinch/drag isolation, theme colors, and
Deep Ocean resident identity. Non-browser coverage includes shared habitat geometry,
rock clearance, sustained intentions, threat awareness, acceleration/turn/bank
bounds, current drift, stable rotation, and deterministic save continuation.
Additional checks cover body/travel alignment, species rhythms, completed
habitat approaches and interrupted dwell time, crab footprints and eel body
clearance during lunges, mesh reuse and scenery quality levels, and audio-clock
lookahead/cancellation using a fake audio context. These checks do not measure
real-device frame rate, audio playback quality, or visual composition.
Encounter coverage also verifies recurring warned attacks, actual ink/stinger
losses, electric damage thresholds and per-pulse hit records, rock shelter,
late/interrupted holds, completed departures, and save roundtrips. Real-swimming
scenarios isolate encounter harm from hunger and ordinary water decay; crab
checks cover warned ground strikes, added sand pollution, interruption, cleaning,
and the end of that added pollution after successful defense.
Prize checks compare collision volumes to rendered mesh vertices and animated
lid sweeps, exercise actual creature entrances and departures, and verify full
body clearance, detour progress, placement/removal, and old saved overlaps.
Social checks cover seeded persistent sexes, species-specific male coloration,
visible birth announcements, adult breeding eligibility, real
courtship swimming across all species, interruptions, true 3D territorial
proximity and obstacle separation, warning/fight timing, protective-tap priority,
cooldowns, Zen care, pause/background behavior, and saved encounter continuation.
The browser harness additionally checks the quiet shell's default
viewport-coverage budget and menu-based controls. Responsive checks cover the
six-button command bar's touch targets and collapsed state. Emulation
does not replace final hands-on iOS Safari and Android device testing.
