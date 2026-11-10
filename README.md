# Tether League

A 2v2 robot ball sport for the browser. Run, hold a tether to swing from a fixed anchor, let go to launch
with your momentum, and kick, pass and defend your way through a club career.

Single-player, offline, no accounts. Built from the design pack in [`design/`](design/README.md).

![Club home](docs/screenshots/01_club_home.jpg)
![Match](docs/screenshots/02_match.jpg)

## Run it

Requires Node 20.19+ or 22.12+ (developed on Node 22).

```bash
npm install
```

```bash
npm run dev
```

Open the printed local URL. For a production build:

```bash
npm run build
```

```bash
npm run preview
```

`dist/` is a static site (relative paths), so it can be hosted from any folder on any static host.

## Controls

| Action | Mouse + keyboard | Keyboard only | Touch | Gamepad |
| --- | --- | --- | --- | --- |
| Move / steer a swing | WASD or arrows | same | drag the left side | left stick |
| Aim | mouse pointer | follows movement | drag the KICK button | right stick |
| Tether (hold, release to launch) | right mouse | Space / Left Shift | hold TETHER | triggers / bumpers |
| Kick | left mouse | J / Enter | tap KICK | A / X |
| Pick another anchor | point at it | Q / E | move toward it | move toward it |
| Pause | Esc / P | Esc / P | pause button | Start |

Keys can be rebound in Settings. F3 toggles a debug overlay during play.

## What is in the game

- **The sport**: three-minute 2v2 matches with sudden-death overtime, a free ball, deliberate kicks whose
  power grows with your momentum, soft body touches, saves, passes and interceptions.
- **Tethering**: one highlighted anchor at a time, a real rope constraint, steerable swing, release along
  your direction of travel, hold timer and cooldown.
- **Club career**: five divisions of six clubs, a ten-match double round robin, four-team playoffs,
  promotion by winning the final, trophies and season history.
- **Quick Match**, **Academy** (five playable lessons), **six Skill Trials** with medals and personal bests,
  and a free **test drive** for every chassis.
- **Four chassis** (sidegrades), **four arenas**, earned cosmetics (faces, jerseys, trails, celebrations,
  badges), club colours, name and numbers.
- **Saves** in the browser with a backup snapshot, export/import and validation.
- **Settings**: audio, quality tiers, reduced motion, high contrast, text size, aim assist, aim mode,
  rebinding, touch layout.

## Project commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Rule validation suite (179 tests) |
| `npm run check` | Type-check plus tests |
| `npm run sim -- 10 harbor_park club pro` | Headless bot-vs-bot matches for tuning |
| `npm run feasibility` | Brute-force check that trial layouts are achievable |

## Layout

```
src/content/      tuning values, chassis, arenas, clubs, cosmetics, trials (all data)
src/game/sim/     fixed-step simulation and match rules (no DOM, deterministic per seed)
src/game/ai/      bots (same command interface as the player)
src/game/render/  Three.js views: robots, arenas, effects, menu stage
src/game/input/   keyboard, mouse, touch, gamepad -> commands
src/game/scenarios/  trials, lessons, test drive
src/career/       schedule, standings, playoffs
src/progression/  rewards, levels, purchases, idempotent result commits
src/storage/      save schema, validation, migration, snapshots, settings
src/ui/           DOM screens and styles
tests/            rule validation
tools/            headless tuning and validation scripts
design/           the original design pack and concept art
```

See [`BUILD_STATUS.md`](BUILD_STATUS.md) for what was verified, the design decisions taken, and what is
not done. Asset provenance is in [`ASSETS.md`](ASSETS.md).
