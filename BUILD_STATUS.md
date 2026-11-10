# Build status

Last updated: 2026-11-10 (big update: scoring balance, progression, visual overhaul, UI polish). Release scope: the complete offline single-player game described in
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

**Automated (242 tests, about 5 s)**: tether acquisition, no retargeting, release preserving
velocity, touch stick with any touch id (iOS ids can be negative), speed cap, auto-release, cooldown, rope stability, pause detach without boost; ball drag
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
lane and gate, and every Bank Shot, was confirmed achievable by brute-force input search; that
search led to three layout fixes (a lane that almost nothing could reach, bank shots that needed
swing-kick power, and starting spots that saved shots without moving).

**Browser, automated input (headless Chromium, software GL)**: first run, club creation, all five
lessons and the Pass Window, Bank Shot and Counterattack trials completed through the real input
path by a scripted autopilot, a career match from pre-match to committed
results, reload on the results page (no second payout), a full season through the real commit path
(champion, trophy, promotion, next season), garage purchase and equip, customisation preview / free
pick / purchase / save / cancel, a trial run to its result screen, key rebinding, export, import,
recovery from a corrupted snapshot, and the production build. No console errors in these flows.
Render stats in a match: about 210 draw calls at low / medium, 340 at high; no geometry or texture
growth across repeated matches.

**Emulated viewports**: 1366x768, 1920x1080, 844x390 (touch, landscape), 390x844 (portrait menus).
Screenshots are in `docs/screenshots/`.

**Not verified**: no human has played this build. Feel and difficulty come from simulation and
reasoning, not playtests. Trial gold thresholds sit near what the scripted autopilot scored (Pass
Window 14, Bank Shot 8.97 s, Counterattack 5.55 s); Swing School, Clean Release and Last-Second Save
thresholds are estimates. No real phone, Chromebook or gamepad was available, so
device performance, touch comfort and gamepad mapping are untested. Frame rate was not measured on
real hardware (software GL is not representative). Audio was checked against a mock context, never
heard.

### Flow update: lively walls, gentler difficulty, menus, robot polish (2026-11-10)

- Mechanics (`src/game/sim/world.ts`, `tuning.ts`): lively walls (restitution 0.82 -> 0.9 plus a
  1.3 u/s outward boost above 2.2 u/s normal speed, capped at max ball speed; posts keep 0.74);
  wall pass (`bankPass`: when an opponent is within 1.15 of the straight lane, the pass banks off a
  side wall if both legs are clear and the route is deliverable at full pace); one-touch strike
  (first-time shot within 1.4 s of a teammate pass, x1.14 pace); kick buffer 0.16 s; rushed kicks
  harsher (power 0.5, error 0.4 rad, cooldown 0.95 s). Bots use the same pass and wall code.
- Difficulty: division levels 0 / 0.25 / 0.45 / 0.65 / 0.85 (were up to 1.9); teammate at
  `mateLevel` (opponent + 0.35, min 1.2); comeback boost after 1/2/3+ career defeats (-0.12/-0.25/
  -0.4, `careerMatchInfo().ease`, shown as a chip); mercy rule when opponents lead by 3+
  (`BotDirector.setTeamEase`, decision quality only). `tools/balance.ts` mirrors both rules.
  Measured (24 matches per cell) average stand-in win %: Harbor 96, Metro 79, Premier 71,
  Championship 63 (strongest club 50); beginner stand-in 79/63/42/25. Mash goals about 0.2-0.6 per
  match outside Rookie League. Sweep: 24 matches, no problems, 1 own goal.
- Opponent shirt numbers never match the player's team.
- Robots (`robotView.ts`, `textures.ts`, `menuStage.ts`): rope held by the hand on the anchor's
  side at the real anchor height; celebrations without hands through heads; blended hop/spin;
  Bulwark pads follow the arm; jet flames only when moving fast; cleaner head stripe, Glider wings,
  Scout boot fins; readable trim/eyes/numbers on light and navy colours; capped texture caches;
  podium rebuilds after fonts load. Draw calls 320/199/195 (high/medium/low).
- Menus (`src/ui/**`): section accent colours, rail/compact rail/bottom tab bar/icon rail by
  viewport, action dock for primary actions, CSS animations (off with reduced motion), comeback
  chip, touch controls in the pause menu, phone HUD layout without overlaps. Checked 15 screens x 6
  viewports with no horizontal overflow or console errors.
- Touch: stick works with any touch id (iOS can report negative ids) and steers on press.
- Not verified on real devices; no human playtest.

### Big update, stages 2–4: visuals, progression, UI (2026-11-10)

- Visual overhaul (`src/game/render/`): ACES filmic tone mapping; one RoomEnvironment PMREM per
  renderer (`Gfx.environment()`, rebuilt after a lost context) for reflections. Robots rebuilt with
  merged per-material geometry cached per chassis (about 30 draw calls each): clear-coat shells,
  glowing visor, eyes, collar and joint rings, panel seams, jet pack whose flames scale with speed and
  swinging, stronger chassis silhouettes (scout antenna and fins, bulwark armour, glider wings), larger
  outlined jersey numbers. Eight head accessories ("toppers") render and animate (spring antenna,
  propeller, floating halo). Arenas: mown grass with blade texture and worn goalmouths, scrolling LED
  boards that flash after goals, rounded goal frames with a sagging diamond net, floodlights and light
  beams, instanced crowd with team-biased colours and waving flags, per-venue touches (bunting,
  embers, tower beacons, camera flashes). Menu stage: reflective turntable, light sweep, spotlight.
  Draw calls in a match: high 305–328 (was 340), medium 185–207, low 181–203. Triangles rose to
  ~140k (low) and ~250–330k (high), mostly robot detail; no real-GPU frame timing was possible here.
- Progression (`src/content/progression.ts`, `src/progression/`): a 40-level Club Road with a concrete
  reward per level (credits, cosmetics, chassis at 4/6/8, titles, colours, Champion Crown at 40, then
  120 credits per level); three rotating seeded objectives (quick / session / chase tier, no timers,
  one free swap per completed match); 31 achievements with bronze/silver/gold tiers; chassis mastery
  (10 levels each, cosmetic rewards only); season prize money by position and playoff stage; 23 new
  badges, club titles and earned colours; earned-only items via an `unlock` field. Everything pays only
  inside the idempotent commit functions. Save schema v2 with a migration that grants existing
  progress without paying twice. New Progress screen, next-goal card on home, "Progress this match" on
  results, Topper and title options in club customisation. Pacing (`tools/economy.ts`, 150 bot
  matches): about a level per match for levels 1–5, every ~2 for 6–15, every ~3 after; every
  5-match session had a level-up or objective; credits about 180 per match including bonuses. Known
  limit: a heavy spender owns the whole shop by about match 30; more shop cosmetics would add sinks.
- UI: see stage 1 notes; also fixed the results layout so stats, progress and rewards never overlap.

### Big update, stage 1: scoring balance, own goals, difficulty (2026-11-10)

Reported: mashing shoot scored easily; frequent own goals; bot difficulty needed tuning.
Measured with `tools/balance.ts` (full matches, stand-ins for the player) and `tools/sweep.ts`.

- Spam scoring. A player that runs at the ball and presses kick every tick scored 10–13 goals a match
  and won 100% even in the top division. Causes: the defending bots' second robot pushed up whenever
  its team touched the ball, leaving the net empty (70% of spam goals had no defender within 6 units);
  every touch could be an instant full-power poke; keyboard kicks snapped into the goal from up to
  5 units outside the posts. Fixes: support robots only push up with real possession and no opponent
  near the ball; a keeper reaction steps into the path of goal-bound shots after the bot's reaction
  time; contested loose balls are tackled directly; mashed kicks (the button pressed repeatedly) are
  rushed: 68% power, up to 15° error and a 0.7 s recovery, with a HUD note; kicking against your own
  run keeps 72% power; keyboard goal snapping only tidies shots already within about 1 unit of a post
  (3 with strong assist). After: mashing at 8 presses/s scores 0.75–0.85 goals a match and wins
  25% at the middle division and above (Rookie League stays forgiving).
- Own goals. Bots rarely scored own goals; the player did, because a keyboard kick (or a click with a
  cursor untouched for 3 s) went the way you were running, which while defending is your own net.
  Fixes: those kicks never go backward (clearance to the wing or a pass to an open teammate ahead); an
  own-goal guard in the simulation turns a kick into our own goal mouth into a clearance while aim
  assist is on (with assist off you can still own-goal); defending bots loop round the ball instead of
  running through it; softer body touches (ball/robot restitution 0.3 to 0.12). After: 2 own goals in
  72 matches (298 goals), both genuine body-contact accidents; the sweep saw 0 in 32 bot matches.
- Difficulty. Stand-in win rates by division (Rookie / Harbor / Metro / Premier / Championship):
  beginner-level 88 / 50 / 19 / 13 / 6%, average 100 / 75 / 63 / 31 / 31%, strong 100 / 100 / 63 /
  63 / 44%. Goals per match 3–6 at every level (previously up to 10–12 at Pro).
- Sweep: 32 seeded matches across all arenas with random chassis, styles and tiers: no NaN, nothing
  out of bounds, no stuck ball (longest still 1.1 s), no robot pinned over 4 s, every match finished
  with a winner and consistent goal credit.
- UI: polish layer (`src/ui/styles/polish.css`): content cascade on screen entry, panel depth, button
  light sweep and breathing primary action, nav accent, versus badges, table and progress-bar sheen,
  scoreboard gloss, clock pulse in the last 10 s, score flip, team-coloured match-open wipe. Pre-match
  shows the opponent's position, record and form, what a match and a win pay, and a controls strip
  for the current device and key bindings. The garage compares each chassis against the equipped one.
- Tests: `tests/scoring.test.ts` (mashing, double taps, bots never mash, own-goal guard with and
  without assist, mash balance and own-goal rate in seeded matches).

### Swing direction, pass button, ball and goal celebration update (2026-11-10)

Reported: swings often went backwards ("because of my orientation or the way I hook onto the rim").

- Causes found: (1) while moving with the keyboard, the swing aimed at wherever the mouse cursor was
  resting, often behind the robot; (2) the planner allowed swings that start away from the target and
  loop round; (3) with no planned route the simulation guessed the direction from momentum; (4) current
  momentum could override the planned direction when hooking on.
- Fixes: swings go the way you move (standing still: a recently used cursor, else facing; a pad's
  right stick always wins); player swings must start toward the target and wrap at most 2.2 rad; a
  forward-only fallback picks the anchor when no planned launch exists, and if nothing in reach starts
  forward no anchor is highlighted; the planned direction always wins on attach.
- `tools/swingdir.ts` (about 1,000 random trips per arena, tap standing / tap running / hold running):
  backwards or sideways starts went from 3–10% to 0–0.3%. In the browser with real input (cursor parked
  behind the robot, run right, tap Space) every swing went right.
- Pass button (K / F, gamepad B / Y, touch PASS): a led, weighted pass to the teammate whatever the
  aim, buffered 0.22 s. Without the ball it calls for a pass and the bot teammate plays it at its next
  touch unless closely marked. Bots now pass through the same command.
- Ball: a 32-panel ball computed on the sphere (no pole stretching) at 1024x512 with anti-aliased
  seams, a bump map and a clear-coat finish, drawn 1.2x its collision size, with a streak when hit
  above 10.5 u/s.
- Goal celebration: 0.45 s of slow motion as the ball hits the net, shockwave rings at the goal mouth,
  three fireworks and a flash of goal light in the scoring colours, a gold spotlight pulse on the
  scorer, a camera push-in toward the goal (eases back at kickoff), and a team-coloured letter-by-letter
  banner with stripe sweep. Reduced motion keeps the rings, spotlight, slow motion and a static banner,
  and drops the camera push-in, fireworks, confetti, shake and the sweep.
- Swing School medals are now 12 / 8 / 5 s (rules version 4) after the faster forward swings.
- 202 tests pass (7 new: pass and forward-swing). Lessons, trials, a career match and the purchase /
  customisation / save flows were re-run in the browser with no console errors.

### Smart swing update (2026-11-10)

Problem reported: the tether was confusing, gave little benefit, and the bots barely used it. A first
version added preview lines, rings and mid-pitch anchors; feedback was that this was more cluttered
and confusing, so those were removed and the controls simplified. Measured on the current version:

- Real mouse input in the browser (point, quick right-click): launches at 8–12 u/s within 0.2–0.6°
  of the cursor. A manual hold shows the green rope cue. A second tap during an automatic swing lets
  go on that tick, and automatic swings never stay on the rope longer than about 1.2 s (tests).
- `tools/swingcheck.ts` (random trips of 7+ units, one tap, no other input, edge anchors only): a
  planned swing exists for 47% (Harbor Park), 65% (Foundry) and 75% (Skyline) of trips, median launch
  error 0.4°, and those swings beat running by about 1.3–1.5 s. Elsewhere a tap still does a short
  swing from the highlighted anchor.
- Bots (`tools/swingstats.ts`, Harbor Park): Club robots swing about 17 times a match each, about 90%
  of releases above 8 u/s, with swing shots and swing goals. Rookie robots swing rarely.
- Balance: a Rookie-level stand-in player plus teammate wins 16 of 20 in the first division; a
  passive player loses every match. Goals per bot-vs-bot match: about 2 (Rookie), 5 (Club), 10 (Pro).
- Trials: Swing School 7.7 s with simple taps (medals now 14 / 9.5 / 6.5 s), Clean Release is
  manual-only, Counterattack gold 4.5 s. These trials have a new rules version, so older personal
  bests are set aside; medal rewards already paid are kept.
- All lessons, Pass Window, Bank Shot, Counterattack and a career match were completed again in the
  browser with no console errors. 195 automated tests pass, including 16 swing tests.

## Design decisions and changes from the brief

- **Smaller pitch, larger robots.** Harbor Park is 30x20 (brief: 34x22) and robots are drawn 1.75x
  their collision circle (radius 0.62, brief 0.48). At the fixed camera the brief's proportions made
  robots too small to read, especially on phones.
- **Twelve anchors, longer range.** Four end-line anchors beside the goals were added to the eight
  sideline anchors, and range is 11.2 (brief 9.5). Skyline Stadium adds two overhead midfield
  anchors. Four extra mid-pitch anchors were tried (they raised swing coverage from about 50% to 85%
  of trips) and removed after player feedback that the extra rings made it hard to tell which anchor
  you would swing from.
- **Rope behaviour.** The swing drives itself: movement input never brakes, steers or reverses it.
  Slack is taken up immediately, the rope reels in slowly and conserves angular momentum (the swing
  speeds up as it shortens), the first snap converts 85% of outward speed, and attaching from a
  standstill starts at 5.5 u/s.
- **Kicks.** Standing kick 8.2, plus 0.76 per unit of approach speed, cap 16.2 (brief: 5 + 0.8v,
  cap 16). The brief's base was too weak to pass with. Assisted passes are weighted by distance.
- **Momentum.** For 0.5 s after a release robots barely slow (1.3 u/s^2) whatever the input, then
  decelerate at 3.2 u/s^2 with limited steering, so a full-speed launch carries about 20 units.
  Robots are hard-capped at 12.2 u/s (swing top speed), the ball at 18.
- **Smart swing** (`src/game/sim/swing.ts`). For a target T and anchor C, the launch is the tangent
  from the swing circle through T, so the planner tries every anchor in range and both directions,
  rejects arcs that leave the pitch, and picks the fastest arrival. A tap uses the plan and lets go
  automatically on the tangent; automatic swings are limited to about one second, and a second tap
  lets go at once. A hold is fully manual. Target: cursor or aim stick, else movement direction, else
  the ball. Q / E still override the anchor. Smart swing can be turned off in Settings; Clean Release
  always plays manual.
- **Swing visuals are deliberately minimal**: the one anchor you would grab is highlighted, the rope
  shows while you swing, and the rope glows green (with a soft click) when a manual swing is lined up
  with your aim. A planned-arc preview, a launch line, a target ring and a hold-timer ring were tried
  and removed after player feedback that they cluttered the pitch. An optional faint anchor line is
  off by default.
- **Bots** use the same planner and release rule. A bot swings when it beats running by at least
  0.55 s and 20%, after a rest of 7–11 s (Rookie), 4–6.5 s (Club) or 3–5 s (Pro).
- **Corner cuts** on every arena keep the ball out of dead corners.
- **Bots** guard their goal unless their team clearly reaches the ball first. This took bot-vs-bot
  scoring from about 17 goals a match to about 5 (about 8 at Club since the swing update).
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
