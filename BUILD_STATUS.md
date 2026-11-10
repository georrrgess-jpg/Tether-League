# Build status

Last updated: 2026-11-09. Release scope: the complete offline single-player game described in
`design/docs/08_BUILD_PLAN_AND_ACCEPTANCE.md` (milestones A to D), minus the items listed under
"Not done".

## Stack

| Piece | Choice |
| --- | --- |
| Language / build | TypeScript 7.0, Vite 8.3 |
| Rendering | Three.js 0.187, one shared WebGL renderer for match and menu stage |
| UI | Plain DOM (small `h()` helper), CSS, inline SVG icons and badges |
| Physics | Own planar circle solver, 60 Hz fixed step with 2 substeps |
| Audio | Procedural WebAudio (no samples) |
| Fonts | Kanit, Nunito (bundled, OFL) |
| Storage | `localStorage`, one validated snapshot plus the previous valid one |
| Tests | Vitest 5.1, Node environment |

Production bundle: about 813 kB JS (227 kB gzipped), 46 kB CSS, no image assets.

## Implemented

- Match: run, anchor preview with hysteresis, attach / swing / reel / release, hold cap with warning,
  cooldown, free ball with drag, wall and post rebounds, corner cuts, deliberate kicks with momentum,
  aim assist, goals with swept detection, kickoff resets, three-minute clock, sudden-death overtime,
  pause, skippable celebrations, statistics (goals, assists, saves, shots, passes, interceptions).
- Bots: challenger / support roles with hysteresis, ball prediction with rebounds, shooting, lead
  passes, clearances, dribbling, guard positions, tether routes for recovery and attack, unstuck logic,
  three declared difficulty tiers blended per division, three teammate tendencies, five club styles.
- Career: 5 divisions, 12 AI clubs, 30-fixture seasons, simulated other fixtures (once), standings,
  1v4 / 2v3 playoffs, promotion on winning the final, repeat seasons, trophies, history.
- Progression: credits, club XP and levels, level rewards (free cosmetic picks, credits, chassis),
  contribution bonus that counts saves / passes / interceptions, purchases, trial medal rewards.
- Modes: Club Career, Quick Match (arena, opponent, difficulty, length), Academy (5 lessons),
  6 Skill Trials, test drive.
- Content: 4 chassis, 4 arenas (one with midfield gantry anchors), 5 faces, 5 jersey patterns,
  4 trails, 4 celebrations, 6 selectable badges, 12 club colours.
- Screens: club setup, home, play chooser, season hub, pre-match, live HUD, pause, results, garage,
  arena selection, academy, trial result, club customisation with records, settings.
- Input: mouse + keyboard, keyboard only, touch (stick, hold tether, tap / drag kick), gamepad;
  remappable keys.
- Accessibility and comfort: reduced motion, optional camera shake, high contrast, text size, ball
  outline, team identity by ring style and jersey as well as colour, away kits on colour clashes.
- Saves: versioned schema, per-field validation, migration table, backup snapshot, export / import,
  explicit reset, clear messages when storage fails.

## Validation

Commands used: `npm run check`, `npm run build`, `npm run sim`, `npm run feasibility`, plus
Playwright scripts against the dev server and the production preview.

**Automated (179 tests, about 1.5 s)**: tether acquisition, no retargeting, release preserving
velocity, speed cap, auto-release, cooldown, rope stability, pause detach without boost; ball drag
against the analytic law, prediction against the stepped path, goals scoring once, misses not scoring,
containment stress on every arena; kickoff resets, overtime, goal and clock on the same tick, own
goals, assists, save jitter; schedule invariants, standings, playoff seeding, season outcomes,
determinism; idempotent result commits, level rewards, purchases, trial medals; save round trip,
corruption fallback, write failure, validation, migration, export / import.

The suite found three real defects, all fixed: a save credited for a deflected shot that still
scored; a soft-lock after a damaged season was rebuilt; free picks accepting ids like `constructor`.

**Headless simulation**: bot-vs-bot matches on all arenas finish without NaN, stalls (longest
still-ball streak under 2 s) or deadlocks. Goals per three-minute match: Rookie about 3.4, Club about
5.0, Pro about 6.8. Pro beats Rookie 8 of 8. With a stand-in player, a Rookie-level player plus the
teammate wins 6 of 8 in the Rookie League; a passive player loses every match. Every tether trial
layout was confirmed achievable by brute-force input search.

**Browser, automated input (headless Chromium, software GL)**: first run, club creation, the three
onboarding lessons completed through the real input path, a career match from pre-match to committed
results, reload on the results page (no second payout), a full season through the real commit path
(champion, trophy, promotion, next season), garage purchase and equip, customisation preview / free
pick / purchase / save / cancel, a trial run to its result screen, key rebinding, export, import,
recovery from a corrupted snapshot, and the production build. No console errors in these flows.
Render stats in a match: about 210 draw calls at low / medium, 340 at high; no geometry or texture
growth across repeated matches.

**Emulated viewports**: 1366x768, 1920x1080, 844x390 (touch, landscape), 390x844 (portrait menus).
Screenshots are in `docs/screenshots/`.

**Not verified**: no human has played this build. Feel, difficulty and trial medal thresholds come
from simulation and reasoning, not playtests. No real phone, Chromebook or gamepad was available, so
device performance, touch comfort and gamepad mapping are untested. Frame rate was not measured on
real hardware (software GL is not representative). Audio was checked against a mock context, never
heard.

## Design decisions and changes from the brief

- **Smaller pitch, larger robots.** Harbor Park is 30x20 (brief: 34x22) and robots are drawn 1.75x
  their collision circle (radius 0.62, brief 0.48). At the fixed camera the brief's proportions made
  robots too small to read, especially on phones.
- **Twelve anchors, longer range.** Four end-line anchors beside the goals were added to the eight
  sideline anchors, and range is 11.2 (brief 9.5), so some anchor is reachable from anywhere.
  Skyline Stadium adds two overhead midfield anchors.
- **Rope behaviour.** Slack is taken up immediately (ratchet), steering toward the anchor reels in
  and steering away pays out. The first snap converts 70% of outward speed into swing speed, and a
  standing start gets a 3.2 u/s push, so attaching never stops you dead.
- **Kicks.** Standing kick 8.2, plus 0.76 per unit of approach speed, cap 16.2 (brief: 5 + 0.8v,
  cap 16). The brief's base was too weak to pass with. Assisted passes are weighted by distance.
- **Momentum.** Above run speed robots decelerate at 3.6 u/s^2 with limited steering, so a release
  carries about 11 units. Robots are hard-capped at 10.5 u/s, the ball at 18.
- **Corner cuts** on every arena keep the ball out of dead corners.
- **Bots** guard their goal unless their team clearly reaches the ball first. This took bot-vs-bot
  scoring from about 17 goals a match to about 5.
- **Career level option.** "Relaxed" lowers opponent level by half a tier and is shown on the
  pre-match screen. Nothing adjusts outcomes covertly.
- **Quick matches** pay 60% rewards. Abandoned matches pay nothing and leave the fixture unplayed.
- **Chassis** unlock free at club levels 4 / 6 / 8 or by purchase (400 / 500 / 500).
- **Camera**: fixed, looking north from the south side; cyan (player) attacks right.
- **Update order** is documented at the top of `src/game/sim/world.ts` and `match.ts`.

## Not done

- Replays (no replay button is shown), online or local versus, daily challenges.
- Mid-match resume: refreshing during a match restarts that fixture (explained in the pause menu).
- Club home decorations beyond the trophy shelf and club-coloured banner.
- Music is one menu track and one match track; there is no audio beyond synthesis.
- Bots kick often under pressure (about 1.5 kicks per second in Pro matches), which can look frantic.
- Robot models are procedural primitives; there are no authored meshes or textures.

## Resuming work

Tuning lives in `src/content/tuning.ts`; re-run `npm run sim` and `npm test` after changing it.
Trial layouts are in `src/game/scenarios/trialData.ts`; bump `rulesVersion` in
`src/content/trials.ts` when rules or thresholds change. Save schema changes need a migration in
`src/storage/save.ts`.
