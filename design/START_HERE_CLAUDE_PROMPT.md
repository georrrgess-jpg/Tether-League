# Copy this entire prompt into Claude Code

I want you to plan and build **Tether League**, an original, polished arcade sports game, using the complete design pack in this directory.

You have **full creative and technical authority**. Make the decisions needed to produce the strongest practical game. You may refine mechanics, change layouts, select technology, adjust scope, invent content, and add useful polish. Use your judgment and proceed autonomously on routine decisions. This brief provides a strong starting direction; improve it wherever doing so makes the game more enjoyable, understandable, cohesive, or efficient.

## Read and inspect first

Read `CLAUDE.md`, `README.md`, and every file in `docs/`. Inspect all ten PNG concept images in `concept_art/` and their mapping in `data/art_manifest.json`. Check the actual project environment and existing repository, if any, before choosing dependencies. Do not overwrite unrelated work.

The images establish the visual identity and intended screen types. They are not exact diagrams or final assets. Written mechanics take precedence over incidental visual inconsistencies such as an extra decorative object, a speculative stat, or imperfect generated text. Re-create menus as real responsive interface and create appropriate runtime robot, arena, and effect assets.

## Core game

Build a 2v2 robot ball sport with opposing goals, short matches, and a fixed elevated camera. Players run, hold a tether to attach to a clearly highlighted fixed anchor, steer through a swing, and release with momentum. Tethering connects a robot to an arena anchor, not to the ball or another robot. Deliberate kicks and soft collision touches allow passing, shooting, interceptions, saves, and recoveries.

For the initial release use a mostly planar simulation with stylized 3D visuals. Airborne-looking animation can communicate momentum while keeping gameplay readable. Actual free aerial physics can be reconsidered later. The player controls one robot with an AI teammate against two bots. Design the simulation so additional input sources could be added later, but finish enjoyable offline play first.

## What I care about

- Fun movement and convincing ball interactions from the first minute.
- Intuitive controls with depth from timing, positioning, and teamwork.
- A polished, coherent, professional-looking game inspired by the attached robot-sports art.
- Meaningful progression: club career, divisions, trophies, records, expressive customization, and balanced chassis unlocks.
- Short sessions that produce something satisfying, with clear next goals and no forced waiting.
- Efficient rendering and responsive UI on ordinary PCs, Chromebooks, and phones.
- Functional menus, saves, rewards, settings, training, and match transitions.

## How to work

1. Produce a concise implementation plan and choose an appropriate stack.
2. Build a runnable vertical slice before investing in all the menus: movement, anchor acquisition, tether swing, release, ball physics, kick, goals, match reset, and basic bots.
3. Play and tune the sport. Expose essential values through data/configuration so iteration is quick. If the sport is frustrating or unclear, resolve that before adding more content.
4. Expand into the first complete release described in `docs/08_BUILD_PLAN_AND_ACCEPTANCE.md`: club creation, quick match, a short career, useful bots, training, robot choices, customization, results, saving, and settings.
5. Apply a consistent art and motion system across every screen. Include appropriate original/procedural or properly sourced audio. Respect reduced-motion and mute settings.
6. Validate meaningful game rules, save integrity, progression, responsive layouts, and input behavior. Check the actual runnable build. Fix material problems you uncover.
7. Deliver the playable project, straightforward run/build instructions, a production build when feasible, and a candid completion report.

You may organize work into sensible milestones and maintain a short progress record so the project can resume cleanly. Do not stop after a plan, a static mockup, or a menu with simulated gameplay. Do not claim a feature works when its behavior is a placeholder. If environment limitations prevent a specific capability, complete the independent work and explain the concrete limitation.

Use as much time as needed for quality, while keeping the implementation focused and efficient. Prefer a smaller excellent sport with real progression over a broad set of fragile systems. You are authorized to make the game substantially better than the first concept, provided its tether-driven sports identity remains clear.

Begin now by inspecting this pack, selecting the build approach, and implementing the playable core.
