# Zenquarium 3D: Scenic Containment Plan

**Status:** Proposed; scenery implementation has not started.
**Scope:** Theme-specific visual enclosure without changing the playable habitat.
**Recommendation:** Prototype Tropical Reef first, review the result, then adapt
the approach to the other four worlds.

## Goal and rationale

The aquarium has real swimming boundaries, but its presentation often suggests
an infinite horizon. The goal is a more sheltered, coherent little world: a
believable edge to the habitat, not a wall of vegetation or an obvious glass box.

A softly enclosed composition could strengthen depth and scale cues, make
residents' turns near the bounds feel more natural, and reinforce
"A little world. A deeper calm." This should remain a calm, touch-first game,
especially on smaller screens.

The recommendation is to change scenery placement and silhouette before adding
more detail. Uniformly increasing plant counts is unlikely to solve the problem
and could make the aquarium busier without making it feel more contained.

## Findings from the current implementation

These findings come from source inspection, not a rendered prototype or measured
performance comparison.

- `renderer.js` draws a water-gradient background and a large continuous floor
  that fades into the water. This avoids visible floor cutoffs but encourages
  the open-horizon effect.
- Much of the additional decorative planting and rockwork extends beyond the
  lateral bounds. It does not establish a strong central rear boundary.
- `core.js` generates the deterministic habitat used by navigation and collision.
  The renderer already adds separate `sceneryRocks` and `sceneryPlants`, providing
  a suitable place for cosmetic changes that do not affect swimming.
- Static WebGL scenery is cached and batched. More geometry need not mean more
  draw calls, but it still increases vertex processing and shaded pixels.
- The Canvas 2D fallback projects and draws scenery too; it needs an intentional,
  lightweight version of the same composition.
- Orbit yaw is unrestricted, with pitch, zoom, and fish-follow views. The camera
  can sit outside the swimming volume, and its clearance currently protects
  against terrain, not arbitrary new decorative rocks.
- Portrait and landscape views crop the habitat differently. Rotation must
  continue to reframe the existing world rather than reshape it.

## Proposed visual direction

Use a planted perimeter with broad, low formations and occasional taller
clusters. Layer quieter silhouettes behind the active habitat, keeping the
central swimming area, sandy routes, and prize-placement space readable.
Retain visible water and negative space rather than closing every gap.

The scenery should suggest the actual habitat's edge. A backdrop far beyond the
swimming bounds could leave the same visual mismatch even if it looks fuller.
This is not intended to explain every invisible front, surface, or side limit
with a literal barrier.

| World | Proposed treatment | What to preserve |
|---|---|---|
| Tropical Reef | Layered coral outcrops and reef shoulders around an open sandy channel. Use this for the first prototype. | Colorful residents, recognizable visitor silhouettes, and clear sand. |
| Koi Pond | Rounded mossy stone banks, reeds, and lily roots suggesting a sheltered pond edge. | Warm light, broad koi glides, and an uncluttered center. |
| Deep Ocean | Sparse dark rock formations with restrained luminous accents. | Darkness, distance, and mystery; do not turn it into a dense planted tank. |
| Zen Garden | Low asymmetric stone banks and carefully spaced planting. | Negative space, pale sand, and a restrained composition rather than a wall. |
| Pen & Ink | Layered botanical and rock silhouettes with softer contrast against the lavender water. | Watercolor depth, legible ink forms, and the established lavender cast. |

Use the existing procedural forms and theme palettes. Background detail should
support the fish, not compete with their markings, warnings, or motion.

## Technical approach and boundaries

### Keep the change visual

Build the first iteration in the renderer's decorative scenery layer, outside
the active swimming volume. Derive placement from the supplied bounds, including
older saves with narrower dimensions; do not hardcode only the current tank size.

Keep the simulation habitat, collision obstacles, routes, terrain heightfield,
food behavior, visitor entry paths, and prize-placement rules unchanged. New
decorative shapes must not protrude into playable space and create apparent
solid barriers that fish pass through.

The Start preview and live aquarium should use the same treatment. Do not create
a separate, prettier home backdrop that misrepresents the playable world.

### Preserve camera freedom

A fixed rear wall fails when the camera orbits behind it. A dense ring can hide
the fish from the near side or put the camera inside scenery.

Start with stable world-space geometry, low near-boundary forms, and open
sightlines. Inspect the design through full orbits, pitch and zoom extremes,
and follow mode. Do not attach scenery to the screen, visibly rotate it with
the camera, or restrict existing camera controls to hide a bad composition.

If placement alone cannot preserve visibility, propose a specific near-camera
visibility treatment for review before implementing it. Any such treatment
must avoid obvious popping or a wall that appears to follow the viewer.
Do not assume a broad transparency effect is free or necessary.

### Preserve performance and compatibility

Prefer redistributing existing decorative detail into stronger silhouettes.
Use coarse distant geometry and the existing cache; do not add per-frame mesh
generation, extra particle systems, external assets, or runtime dependencies.

Keep the enclosure recognizable at every quality level. Battery mode should
simplify detail, not lose the defining perimeter entirely. Existing scenery
vertex limits are below 85,000 for battery, 105,000 for balanced, and 125,000 for
high quality in `tests\core.test.js`. Treat these as ceilings, not targets, and
do not increase them merely to accommodate denser scenery.

Preserve resize/cache reuse and the distinction between cosmetic quality and
quality-independent gameplay solids. Retain readable healthy-water colors and
the existing indication of deteriorating water; do not use uniformly heavier
fog as a substitute for composition.

Support both WebGL and Canvas 2D, direct local-file play, and the offline PWA.
No save migration, new setting, or persistent scenery data should be needed.

## Implementation sequence

### 1. Confirm the prototype boundary

- [ ] Agree to a Tropical Reef-only, renderer-focused prototype.
- [ ] Use the low, asymmetric perimeter approach first; leave the other themes
  unchanged while evaluating the shared technique.
- [ ] Confirm any proposed camera-visibility mechanism separately if geometry
  placement cannot preserve the current orbit and follow experience.

**Exit condition:** A clear visual approach that does not require new physical
obstacles or reduced camera freedom.

### 2. Build the Tropical Reef prototype

- [ ] Recompose existing decorative rocks and corals into reef shoulders and
  layered silhouettes near the habitat edge.
- [ ] Preserve the central channel, clear prize sand, and visible visitor entry
  areas; avoid a uniform fence or a symmetrical box.
- [ ] Keep geometry deterministic and cached, with quality-scaled detail.
- [ ] Implement the corresponding Canvas 2D composition.
- [ ] Apply the same scene to the Start preview and gameplay.

**Exit condition:** One complete theme treatment, not five partially tuned ones.

### 3. Review composition before expanding scope

- [ ] Have the user review phone portrait and landscape, then a wider viewport.
- [ ] Review default, full-orbit, elevated, low-angle, zoomed, and fish-follow
  views, including looking back toward the original foreground.
- [ ] Check fish, visitors, food, and prizes against the new silhouettes.
- [ ] Compare battery, balanced, and high quality, plus Canvas 2D.
- [ ] Keep, revise, or reject the approach based on containment, visibility,
  calmness, and the approved performance evidence.

**Exit condition:** User approval of the prototype before rolling the technique
out to all worlds. If it feels cramped, simplify rather than add more detail.

### 4. Adapt the approved approach to the other worlds

- [ ] Give each theme its own composition from the visual-direction table.
- [ ] Preserve especially generous negative space in Deep Ocean and Zen Garden.
- [ ] Keep Pen & Ink's lavender water and layered illustration identity.
- [ ] Repeat the camera and small-screen review for each theme rather than
  assuming the Tropical Reef result generalizes.

**Exit condition:** Five recognizable worlds with a shared sense of containment,
not five recolored versions of the same perimeter.

### 5. Finish documentation and release preparation

- [ ] Update focused renderer/scenery regression source and README descriptions.
- [ ] Review geometry budgets, deterministic placement, mesh reuse, fallback
  data, old saved bounds, and unchanged gameplay habitat.
- [ ] Run only the checks specifically authorized for the implementation session.
- [ ] Increment the current `sw.js` shell-cache version when publishing changed
  application assets. This planning document alone needs no cache bump.
- [ ] Report remaining visual/performance uncertainty accurately before release.

## Acceptance criteria

| Area | Required outcome |
|---|---|
| Containment | The default view suggests a sheltered habitat rather than an uninterrupted central horizon. |
| Readability | Residents, warnings, visitors, food, and prizes remain distinguishable and reachable. |
| Camera | Orbit, pitch, zoom, and follow retain their behavior without new dominant foreground blockers or exposed scenery interiors. |
| Spatial consistency | Cosmetic formations stay outside playable space, respect actual saved bounds, and do not suggest routes fish should reach but cannot. |
| Calmness | Open water and quiet areas remain; no solid vegetation wall or overwhelming detail. |
| Themes | Each world retains its distinct palette, forms, atmosphere, and appropriate amount of negative space. |
| Quality and fallback | All quality levels and Canvas 2D retain the main enclosure without exceeding existing budgets or rebuilding meshes every frame. |
| Compatibility | No changes to swimming bounds, navigation, scoring, save schema, storage identity, PWA identity, or local-file operation. |

Measured frame-time or power claims require an approved comparison on suitable
devices. Source inspection and geometry budgets alone do not establish them.

## Risks and decisions to revisit

| Risk | Preferred response |
|---|---|
| Foreground scenery obscures the game during orbit | Lower or reposition forms first; review any additional visibility mechanism explicitly. |
| Dense scenery makes the game feel smaller or busier | Remove detail and strengthen a few broad silhouettes instead. |
| Background resembles a reachable area beyond invisible bounds | Bring the visual edge closer to the actual bounds without intruding into them. |
| Theme identities converge | Tune composition per world, especially the amount of negative space. |
| Mobile or Canvas rendering cost rises | Reuse the current detail budget and simplify distant forms; do not assume batching makes them free. |

Expected effort is a moderate rendering and art-direction change. Camera
visibility, cross-theme composition, and fallback tuning are the main work,
not a simulation rewrite. Physical walls or changed camera freedoms would be
a separate, larger design decision.

## Handoff: existing work and operational cautions

The commit introducing this plan also carries the previously pending UX work:

- Shorter, touch-first guidance with grouped keyboard shortcuts; home Guide,
  Settings, and Progress keep the preview and music live, while About remains
  modal.
- Records-first lifetime progress, a genuine-new-player welcome, shared
  earned-first discovery collections, and an in-game Lifetime progress link.
- Individual acknowledgements for all twenty discoveries, new-highest-milestone
  wording, and completion/replacement handling.
- Successful exits clear active and queued notices before Start; failed saves
  retain the aquarium, warning, and pending acknowledgements.
- Compact discovery rows, related documentation, and regression-source updates.

These changes were source-reviewed. The user manually reviewed earlier UX
iterations, but the added regression tests have not been run and the latest
exit/compact-row behavior has not been independently browser-verified.
`renderer.js` is unchanged at this handoff; the proposed enclosure does not exist
yet.

Preserve automatic checkpoints, successful-save-only Save & Return, and no
offline simulation. The handoff uses save schema 10, storage key
`zenquarium_zq3d_v1`, and shell cache v45; consult the current files if subsequent
work advances these versions.

**Fish Rescue is explicitly deferred.** The reported occasional trapping and
starvation near rocks or plants has not been reproduced or fixed. Do not add a
rescue achievement, reward the accidental movement problem, or silently fold
pathfinding changes into this scenery work.

**Local execution is restricted.** The user stopped local testing because it
overwhelmed the computer. Do not launch tests, automated browsers, software-WebGL
rendering, previews, servers, or dependency installations without explicit
approval. In particular, do not launch automated Edge tests. A requested local
file URL is not permission to start a server.

Static source inspection and `git diff --check` are appropriate. If execution is
later approved, begin with the smallest relevant existing check, such as
`node .\tests\run-core.js` for renderer-math and scenery coverage; do not infer
permission for the full software-rendered suite. Clearly distinguish checks
that were written from checks that actually ran.

Work in this repository, not the original Zenquarium copy. Preserve unrelated
changes, use the current checkout, and obtain authorization for later commits
and pushes rather than treating this handoff's publishing request as permanent
permission.

### Source map for the next session

| File or surface | Relevance |
|---|---|
| `README.md` | Current product behavior, saving, camera principles, deployment, and optional development checks. |
| `renderer.js`: `environment()` | Floor, shared habitat geometry, outer decorative scenery, and fallback data. |
| `renderer.js`: `setTheme()` | Scenery caching and quality-dependent mesh generation. |
| `renderer.js`: camera, background/fog shaders, WebGL and Canvas drawing | Framing, visibility, depth cues, and both rendering paths. |
| `core.js`: `boundsFor()`, `createHabitat()` | Existing dimensions and deterministic physical habitat; reference only unless scope is explicitly expanded. |
| `tests\core.test.js` | Existing camera, habitat, scenery-budget, fallback, and cache-reuse regression coverage. |
| `app.js`, `styles.css`, `tests\run-input.js`, `tests\responsive.py` | Recently changed UX and its regression source; avoid unrelated changes. |
| `sw.js` | Offline-shell versioning when application assets change. |
