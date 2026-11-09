# Tether League — Complete Design & Build Brief

An original, approachable robot sport built around grappling, momentum, passing, and club progression.

Open `OPEN_GALLERY.html` locally for a clickable gallery of all ten concepts.

## Start here

1. Extract this whole folder into a project directory.
2. Open that directory in Claude Code.
3. Copy the entire contents of `START_HERE_CLAUDE_PROMPT.md` into Claude Code.
4. Keep the ten images in `concept_art/` alongside the documents. Claude should inspect the images before designing the interface.

This is a concept and implementation handoff, not a finished game or a source-code project. The art shows intended atmosphere and screen composition; the written rules define how the sport works. The included JSON is editable starting configuration, not proven game balance.

## What is inside

| File | Purpose |
| --- | --- |
| `START_HERE_CLAUDE_PROMPT.md` | Copy-and-paste instruction that authorizes planning and implementation |
| `CLAUDE.md` | Project context, creative authority, priorities, and working rules |
| `docs/01_GAME_VISION.md` | Audience, identity, gameplay pillars, and player experience |
| `docs/02_MATCH_RULES_AND_PHYSICS.md` | Complete first-version sport, tether behavior, ball handling, and controls |
| `docs/03_MODES_AI_AND_ARENAS.md` | Solo play, teammate/opponent logic, training, and venue layouts |
| `docs/04_PROGRESSION_AND_ECONOMY.md` | Seasons, clubs, unlocks, rewards, saves, and return incentives |
| `docs/05_SCREENS_AND_USER_FLOWS.md` | Required menus, states, navigation, and responsive behavior |
| `docs/06_ART_AUDIO_AND_MOTION.md` | Cohesive style, animation, feedback, audio, and accessibility |
| `docs/07_TECHNICAL_BLUEPRINT.md` | Suggested architecture, simulation boundaries, storage, performance, and replay |
| `docs/08_BUILD_PLAN_AND_ACCEPTANCE.md` | Milestones, completion criteria, validation, and scope decisions |
| `docs/09_CONCEPT_ART_GUIDE.md` | What each of the ten images is meant to communicate |
| `docs/10_CONTENT_CATALOG.md` | Starting robot, team, arena, challenge, and cosmetic content |
| `docs/11_RISKS_AND_DESIGN_DECISIONS.md` | Practical resolutions to difficult design problems |
| `concept_art/01...10*.png` | Ten separate concept images |
| `data/game_config.json` | Suggested initial values and starter content identifiers |
| `data/art_manifest.json` | Image-to-document mapping, generation prompts, and image metadata |
| `PACK_CONTENTS.json` | Delivery inventory and integrity hashes |

## The game in one paragraph

Two teams of two small robots play three-minute matches in a compact arena with opposing goals. Hold a tether to attach to a highlighted fixed anchor, steer through a swing, and release to preserve your momentum. Kick or redirect the ball, combine with a teammate, and recover quickly to defend. Build a club through short seasons, collect expressive cosmetics and balanced robot chassis, and improve through short skill trials. Begin with single-player matches against bots and a fixed, readable camera. Add multiplayer only after the core sport is enjoyable and stable.

## Authority and scope

Claude has full creative and technical authority to implement, simplify, improve, and extend this design. The exact names, colors, layouts, tuning, tools, and content counts may change when there is a better solution. Preserve the recognizable identity: a tether-driven robot team sport, understandable controls, meaningful skill growth, visible club progression, polished feedback, and practical performance on ordinary devices. Routine implementation decisions do not need a new approval step.

## Visual direction

Bright stylized 3D with an elevated fixed camera; white rounded robots, expressive dark screen faces, cyan and orange teams, yellow anchors, ivory/navy interface panels, and a warm seaside home stadium. Readability and responsive play take priority over rendering complexity. Generated images are concept references rather than runtime UI, sprite sheets, exact diagrams, or final balance specifications.

## Release intent

The first complete release should offer an enjoyable offline club career, quick matches, training, robot selection, customization, useful results, and reliable saving. Start by proving one match with one chassis on one court. Broader content should follow that foundation.
