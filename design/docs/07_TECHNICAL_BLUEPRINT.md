# 07 — Technical blueprint

## Suggested approach

Use TypeScript and a standard modern browser build tool. A practical default is a DOM-based UI layer with a lightweight Three.js scene for the match and garage. React is reasonable for menus if it fits the project; a smaller component approach is also acceptable. A mostly planar simulation can use a suitable 2D rigid-body solver or a small well-tested circle/segment solver. Choose versions from the actual environment and official documentation during implementation.

This is architectural guidance, not a requirement to use a particular library. Avoid a dependency-heavy 3D stack if a simpler implementation produces a better sport on modest devices. The first release does not need a server, account system, AI API, or online matchmaking.

## Module boundaries

| Area | Responsibility |
| --- | --- |
| App/router | Scene navigation, loading, focus, overlays |
| Input | Keyboard, mouse, touch, controller into normalized action commands |
| Simulation | Fixed-step movement, rope constraints, contacts, kicks, match states |
| Bot controller | Same action-command interface as a human, bounded decision rate |
| Rules/events | Goals, clock, attribution, state transitions, result creation |
| Renderer | Interpolated transforms, camera, robot pose, ropes, particles |
| Audio | Event-driven sound, music, user-gesture start, settings |
| Career | Schedule, simulated fixtures, standings, brackets, promotion |
| Progression | Rewards, ownership, XP milestones, transactions |
| Persistence | Validation, migrations, atomic snapshot writes, import/export |
| Content | Chassis, teams, arenas, trials, cosmetics, tuning |
| UI | Real accessible controls and views driven by shared state |

Possible source layout: `src/game/simulation`, `src/game/ai`, `src/game/render`, `src/game/input`, `src/career`, `src/progression`, `src/storage`, `src/ui`, and `src/content`. Use the project's existing conventions if applicable.

## Simulation loop

Start at 60 fixed simulation steps per second with render interpolation. Clamp accumulated time after a long stall, limit catch-up work, and handle focus loss through pause rather than simulating minutes of missed action. Chassis inputs, collisions, tether constraints, ball movement, goal detection, clock updates, and match transitions need a documented stable update order.

A suggested order is: collect normalized commands → update bot decisions if due → apply movement and kicks → integrate/solve bodies and ropes → sweep ball-goal crossings → emit meaningful events → update match state/clock → store snapshot. A goal crossing and final clock tick in the same step must have one defined outcome, as described in match rules.

Keep rendering effects out of physics state. Lean/hop animation must never change the collision radius or fake ball position. Use stable IDs for entities and seeded random sources for career generation and trials. Fixed-step logic helps reproducibility but is not a guarantee of cross-browser floating-point determinism.

## Basic data contracts

- `RobotState`: ID, team, chassis ID, position, velocity, facing/aim, input command, tether state, cooldowns, contribution state.
- `BallState`: position, velocity, last meaningful touch history, active goal crossing guard.
- `MatchState`: unique match ID, optional fixture ID, rules version, arena ID, seed, phase, clock, scores, entities, event list, result status.
- `Fixture`: unique ID, round, home/away IDs, arena, seed, status, final result reference.
- `ClubProfile`: stable club ID, name/badge/colors, chassis selections, cosmetics, trophies, records.
- `SaveGame`: schema version, profile, settings, career state, currency/XP, owned content, trial records/reward flags, committed match IDs, previous valid snapshot reference.

Events should have an ID, match ID, simulation timestamp/tick, type, relevant actors, and minimal payload. Subscribers such as audio and UI must not independently recalculate rewards or alter score. An immutable result is derived once and committed by progression/persistence code.

## Persistence

IndexedDB is suitable for structured saves and optional replay data. A compact localStorage save can work for an initial version if size, validation, and failure handling are covered. Whichever route is selected, write a new complete valid snapshot before replacing the current one, retain a previous valid copy, and use idempotent transactions for results and purchases. Handle quota, private-browser restrictions, and corrupted JSON with useful user feedback.

Keep a short list or index of committed match IDs with the results necessary to prevent reapplication. Ensure season summaries and detailed history do not grow without bound. A reasonable policy is recent detailed results plus compact historical season summaries and all-time records.

## Replays

Optional first release enhancement: record a short ring buffer of actual simulation transforms, tether states, scores, and meaningful events. On a goal, preserve a few seconds; on match completion, enable only available clips. Snapshot playback is often more reliable than reconstructing from inputs across browsers. Use bounded memory and interpolation, clear motion trails when scrubbing, and keep replay state isolated from live match/career transactions.

Replay lab in concept 04 is a later visualization target. If not implemented, hide or clearly disable its entry. Do not ship a fake working replay button. Career rewards must never run from replay events.

## Performance and assets

Target responsive 60 fps on ordinary laptops when practical, with a stable lower-cost option around 30 fps on weaker hardware. These are goals to measure, not guarantees. Cap device pixel ratio, minimize draw calls/materials, instance spectators, pool short effects, avoid allocations in hot loops, and disable costly scene decoration at low quality. Keep physics simple with only four robots, one ball, boundaries, and fixed anchors.

Use one main camera, modest shadows or blob shadows, and stylized lighting. Menu previews can render on demand or at a reduced rate. Pause hidden scenes and audio. Load core gameplay first and defer optional backgrounds. Generate procedural meshes and simple material variants where that serves the art direction. Concept PNGs are not optimized game textures or final UI assets.

## Build delivery

Provide dependency manifest/lockfile, source, asset provenance notes, readable local setup/run/build instructions, and a production build. If a PWA/offline install is added, version assets and avoid stale caches breaking updates. Deployment or app-store packaging is separate from this design-pack handoff. Keep environment requirements explicit and avoid embedding secrets.
