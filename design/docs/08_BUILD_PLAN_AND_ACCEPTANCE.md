# 08 — Build plan and acceptance

## Milestone A: playable sport

Build one Harbor Park court, one chassis, fixed camera, run/aim input, legal anchor preview, attach/swing/release, free ball, kick, walls/goals, 2v2 bots, scoring, match clock, pause, and restart. Use a small debug overlay for speed, tether candidate/state, and active bot roles. Debug UI is not part of normal product presentation.

**Pass condition:** A player can complete a real match, make an intentional swing shot, pass, recover toward goal, and restart. Scores and state resets are correct. Bot movement provides recognizable opposition. The ball remains readable and inputs feel responsive. Play the prototype and adjust it before moving on.

## Milestone B: coherent club loop

Add club setup/home, Quick Match, pre-match, results, earned currency/XP, persistence, settings, a six-team career with schedule/standings/playoffs, and one short tutorial. Implement one shared state source for menu summaries.

**Pass condition:** A player can start a club, complete multiple fixtures, reload with progress intact, finish a season, and receive the correct promotion/trophy outcome. Losses and elimination produce useful next steps. No duplicate rewards or repeated simulation of AI fixtures.

## Milestone C: breadth with purpose

Add the four sidegrade chassis, teammate tendencies, six skill trials, useful cosmetics, unlock previews, and four arenas with conservative geometry changes. Improve bot tether use and difficulty. Build a garage test drive and clear tutorial retries.

**Pass condition:** Chassis change handling without rendering the starter obsolete; every trial can start/finish/retry and records persist; every venue is playable and fair; selection/purchase/equip flows work with insufficient funds and locked content. Each arena has reachable anchors and no persistent ball traps.

## Milestone D: complete release polish

Unify menus using the concept-art identity; add robot expression, sound, crowd ambience, goal feedback, earned milestone animation, responsive layouts, touch input, accessibility settings, save export/import, and performance tiers. Add replay only if it can be delivered reliably within the release.

**Pass condition:** All primary routes work, visible buttons do what they promise, save failure is handled, production build runs, and no major console/runtime failures remain in exercised flows. Verify tested viewport layouts and record what devices were actually available. Do not infer phone performance from a desktop viewport alone.

## Meaningful rule validation

Automate or reproducibly verify high-risk behavior rather than writing tests that only duplicate constant values:

- Tether acquisition respects preview/range, attachment never retargets, release preserves tangent velocity, cooldown works, near-zero rope distance remains finite, and pause does not grant a free boost.
- Frame-rate changes do not materially change movement/ball behavior over equivalent simulated time.
- A fast ball crossing a goal scores once, outside-mouth crossings do not score, reset clears velocities, and tied regulation enters overtime correctly.
- Final-clock/goal same-tick ordering is stable. Own goals affect team score correctly. Jitter does not award repeated saves or assists.
- Six-team schedule has thirty fixtures, each club ten matches, no self-fixtures, and exactly one home/away meeting per opponent pair.
- Standings reflect committed fixtures; playoffs use the correct seeds; eliminated-player seasons still finish; promotion only follows the defined championship outcome.
- Reopening results, replaying a clip, refreshing, or double-clicking Continue does not duplicate credits/XP or fixtures.
- Purchase ownership, balance, equip state, export/import, schema migration, invalid data, and storage failure are handled without erasing a valid save.

## Manual playtest checklist

Can a new player identify the ball, own robot, opponent goal, and selected anchor immediately? Can they explain why their release moved in that direction? Can they score without advanced moves? Is passing useful? Does the teammate cover when the player attacks? Can either team become trapped defending forever? Is a loss understandable and recoverable? Does the next attainable reward remain visible without obscuring play? Are touch controls comfortable and keyboard focus reliable?

## Required delivery evidence

Provide commands actually used for build/checks, a concise test summary, representative screenshots, key tuning changes from playtests, and known limitations. Distinguish automated checks, manual tests, emulated viewport checks, and actual-device checks. State deferred features candidly.

## Scope flexibility

Claude may revise content counts and sequencing to improve the result. If time or environment forces a smaller delivery, finish and accurately describe a coherent playable milestone. Preserve the eventual progression structure and leave clean extension points. The objective is a game with real functionality, not a broad static interface.
