# Assets and provenance

Tether League ships no image, model or audio files of its own.

| Asset | Source | Licence |
| --- | --- | --- |
| Robots, arenas, ball, effects | Generated at runtime from Three.js primitives and canvas-drawn textures (`src/game/render/`) | Original to this project |
| Club badges, icons, arena diagrams | Inline SVG written for this project (`src/ui/badge.ts`, `src/ui/dom.ts`, `src/ui/screens/prematch.ts`) | Original to this project |
| Sound effects and music | Synthesised at runtime with WebAudio oscillators and noise (`src/audio/audio.ts`) | Original to this project |
| Kanit typeface | `@fontsource/kanit` (Cadson Demak) | SIL Open Font License 1.1 |
| Nunito typeface | `@fontsource-variable/nunito` (Vernon Adams and contributors) | SIL Open Font License 1.1 |
| Three.js | `three` | MIT |

The ten concept images in `design/concept_art/` came with the design pack as visual direction. They are
kept for reference only and are not loaded by the game.

Screenshots in `docs/screenshots/` were captured from this build.
