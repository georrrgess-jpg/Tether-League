# 09 — The ten concept images

All ten PNGs are individual design references produced for this pack using built-in image generation and the supplied original Tether League screenshot as the style reference. They show an intended visual language, not final game assets, authoritative rules diagrams, or tested responsive layouts. Exact generation prompts are included in `data/art_manifest.json`.

| Image | Screen / mechanic | What to carry into the build |
| --- | --- | --- |
| `01_club_home.png` | Main menu and persistent club | One large next-match action, two expressive robots, small stable navigation, trophy progression |
| `02_match_swing_attack.png` | Tether attack and ball play | Readable field, four players, one ball, fixed anchors, obvious score/clock, restrained motion feedback |
| `03_tether_training.png` | Aim → hold → release | Progressive explanation and an active practice exercise; readable fixed-anchor selection and tangent release |
| `04_teamwork_defense.png` | Cover, interception, open-space pass | Defensive teamwork and optional replay/training overlays, separated from normal live HUD |
| `05_robot_garage.png` | Chassis selection and test drive | Distinct silhouettes, useful qualitative tradeoffs, equip/test-drive actions, clear ownership |
| `06_league_hub.png` | Season progression | Next fixture, shared standings/schedule data, four-team playoff bracket, visible long goal |
| `07_match_results.png` | Outcome, earned rewards, records | Useful contributions, concise reward progress, meaningful Continue action, honest replay availability |
| `08_arena_selection.png` | Venue collection and variation | Distinct environments, selected/unlocked states, clear venue identity, conservative play geometry |
| `09_skill_trials.png` | Repeatable mastery challenges | Playable preview, quick start/retry, earned medals, personal bests |
| `10_club_customization.png` | Player ownership and appearance | Clear category tabs, live preview, earned items, readable team colors, save/cancel behavior |

## How to interpret generated details

- Written sport rules and the editable config supersede artistic arrows, rope poses, anchor counts, arbitrary scores, and stat bars.
- Concept 01 may include a decorative club/robot pose with a tether near a ball. Live gameplay tethers attach to fixed arena anchors only.
- Concept 06 contains illustrative standings, fixture scores, division labels, and a progress strip. Implement the documented no-draw points rules and championship-based promotion; do not reproduce inconsistent sample arithmetic or a literal win-counter shortcut.
- A camera may be angled differently across illustrations. Ship a consistent gameplay camera and correct input mapping; menu backgrounds and replay cameras can vary.
- Traces and projected lanes in concepts 02–04 explain mechanics. Keep normal match overlays minimal and contextual.
- The garage bars are qualitative composition examples. Derive actual displayed attributes from the implemented chassis data.
- The coin balance, XP, cosmetics, names, and scores shown in different images are separate mock states. Drive real screens from one saved club.
- A three-panel training image needs an actual playable exercise behind it. A replay reference needs real recorded state before a replay button is enabled.

## Cohesion checklist

Keep rounded white robots with dark expressive face screens; distinctive cyan/orange teams and yellow anchors; navy/ivory panels; bright readable fields; clean short labels; compact hierarchy; and cheerful sporting personality. Adapt layouts to devices and implementation constraints. Re-create essential UI and models rather than displaying full concept screenshots as the application.
