# Tether League: project instructions

You are authorized to build this game, not merely discuss a hypothetical implementation. Read `START_HERE_CLAUDE_PROMPT.md` and the documents before making major architecture choices. View all ten images in `concept_art/`; use `docs/09_CONCEPT_ART_GUIDE.md` to interpret them.

## Creative authority

You have full creative authority over game design, technology, UI composition, content, tuning, animation, audio, and polish. Add worthwhile features, remove weak ones, improve this brief, and select suitable libraries. Treat numerical values and sketches as hypotheses. Resolve normal ambiguity yourself and record important decisions in the project. Ask only when a missing external requirement truly prevents work.

## Product commitments

- The signature action is attach to a fixed anchor, swing, release with momentum, and interact with the ball.
- The main sport is 2v2 with readable goals, short matches, a useful teammate, and meaningful defense.
- Keep the first version approachable through simple controls, helpful feedback, and active tutorials.
- Build visible progression around a club, earned cosmetics, seasons, records, and balanced chassis choices.
- Prioritize a smooth browser experience on modest PCs, Chromebooks, and phones. Use a fixed camera and restrained scene complexity.
- Finish a coherent single-player game before taking on online networking.
- UI shown in concept art must become real interactive interface. Build real buttons, text, states, navigation, and save behavior.
- Progression must use actual completed match events; do not present fabricated results as working systems.

## Work sequence

Make a concise implementation plan, then begin. The first delivery milestone is a runnable match prototype with real input, tethering, ball interactions, scoring, bots, and restart. Play and tune it before building a large menu system. Continue through the scoped release plan unless a material blocker requires an explicit handoff.

## Engineering expectations

Use a clear simulation/render separation, fixed-step game logic, data-driven tuning, maintainable components, and versioned save data. Select current stable dependency versions after checking the actual environment and relevant official documentation. Do not assume dependency versions from this brief. Provide simple local run/build instructions and a working production build. No external AI service is needed for game logic.

Verify the important game behavior and user flows. Be candid about unfinished systems, untested devices, and deferred features. Do not claim network multiplayer, mobile-device performance, or replay correctness without evidence. Create a short `BUILD_STATUS.md` with implemented features, validation, and remaining work at milestones.

## Style priorities

Keep the cheerful robot-sports identity from the images. Use readable team colors, obvious anchor targeting, expressive faces, subtle motion, responsive input, and short transitions. Offer reduced motion and remappable inputs. Use names and icons alongside color. Make the next useful action prominent on each screen.
