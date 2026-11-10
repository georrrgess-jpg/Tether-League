# Tether League: working notes

Browser game (TypeScript, Vite, Three.js, plain DOM UI). The original brief and concept art are in
`design/`; `BUILD_STATUS.md` records what exists, what was verified and the decisions taken. Read it
before changing rules or scope.

## Commands

- `npm run dev`: dev server. `npm run build`: type-check and production build. `npm run preview`.
- `npm run check`: type-check and the 179-test rule suite. Run it before committing.
- `npm run sim -- <matches> <arena> <difficultyA> <difficultyB>`: headless bot matches for tuning.
- `npm run feasibility`: confirms the tether trial layouts are achievable.

## Rules of the codebase

- `src/game/sim/` is pure and deterministic per seed: no DOM, no rendering, no `Math.random`.
  Rendering reads simulation state and never writes it.
- Humans and bots both produce `Command` objects. Bots must not get different physics.
- All gameplay numbers live in `src/content/tuning.ts`; content is data in `src/content/`.
- Rewards are paid only inside `commitMatch`, `commitTrial` and `commitLesson`
  (`src/progression/progression.ts`), which are idempotent. Screens display committed records.
- Save schema changes need a migration and validation in `src/storage/save.ts`.
- UI text is real DOM. Do not ship a control that does nothing; hide or label unavailable features.
- `window.__tether` exposes the app for automated checks only.

## Known gaps

No human playtest yet, no real-device testing, no replays, no multiplayer. See `BUILD_STATUS.md`.
