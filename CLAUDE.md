# Tether League: working notes

Browser game (TypeScript, Vite, Three.js, plain DOM UI). The original brief and concept art are in
`design/`; `BUILD_STATUS.md` records what exists, what was verified and the decisions taken. Read it
before changing rules or scope.

## Commands

- `npm run dev`: dev server. `npm run build`: type-check and production build. `npm run preview`.
- `npm run check`: type-check and the 202-test rule suite. Run it before committing.
- `npm run sim -- <matches> <arena> <difficultyA> <difficultyB>`: headless bot matches for tuning.
- `npm run feasibility`: confirms the tether trial layouts are achievable.
- `npm run swingcheck`: smart-swing aim accuracy, time gain over running, bot swing use, trial scores.

## Rules of the codebase

- `src/game/sim/` is pure and deterministic per seed: no DOM, no rendering, no `Math.random`.
  Rendering reads simulation state and never writes it.
- Humans and bots both produce `Command` objects. Bots must not get different physics.
- Swing decisions (anchor, direction, when to let go) live in `src/game/sim/swing.ts` and are shared by the
  player's smart swing and the bots. Change the planner there, not in two places.
- Keep swing visuals minimal (highlighted anchor, rope, green rope cue). Players found extra preview
  lines and rings confusing; do not add them back without asking.
- Swings must start toward the player's target (movement direction first, then a recently used cursor,
  then facing). `tools/swingdir.ts` and `tests/pass.test.ts` guard this; keep them at 0% backwards.
- All gameplay numbers live in `src/content/tuning.ts`; content is data in `src/content/`.
- Rewards are paid only inside `commitMatch`, `commitTrial` and `commitLesson`
  (`src/progression/progression.ts`), which are idempotent. Screens display committed records.
- Save schema changes need a migration and validation in `src/storage/save.ts`.
- UI text is real DOM. Do not ship a control that does nothing; hide or label unavailable features.
- `window.__tether` exposes the app for automated checks only.

## Known gaps

No human playtest yet, no real-device testing, no replays, no multiplayer. See `BUILD_STATUS.md`.
