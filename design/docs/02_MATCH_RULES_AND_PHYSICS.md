# 02 — Match rules, input, and physics

All numerical values below and in `data/game_config.json` are starting hypotheses for tuning. Keep them centralized. The specification describes behavior; it does not claim that an untested value is balanced.

## Coordinate system and geometry

Use a rectangular planar field, initially 34 units long on x and 22 units wide on z, centered at the origin. Goals lie at x = -17 and x = +17; each opening is centered on z = 0 and is 6 units wide. Goal depth is 2 units outside the main field. Cyan attacks +x, orange attacks -x. Represent robots as circles with radius 0.48 and the ball as a circle with radius 0.38 in the gameplay plane. Render robots, goals, ropes, and stands in stylized 3D.

Place eight fixed anchors along the two sidelines: x = -12, -4, 4, 12 at z = -11.5 and z = 11.5. Their rendered height is decorative; the initial rope constraint uses the projected x/z positions. Keep goal openings free of anchors and collision obstacles. Screen directions must be mapped through the camera basis into world directions.

The image's airborne robot pose is a visual goal for expressive movement. Initial gameplay has no independent jump height, ball loft, or aerial collision layer. A later true-3D expansion must reconsider collisions, targeting, camera, and fairness together.

## Match structure

- Two teams, two robots each, one ball, three-minute regulation.
- Player controls one cyan robot; teammate and orange pair use bots.
- Opening kickoff and every goal reset use symmetric legal spawn points and a short countdown.
- Goals count when the entire ball crosses the goal plane inside its opening. Sweep crossing checks between physics steps so a fast ball cannot skip the detector.
- Award a single goal once; lock further scoring during the goal/reset state.
- Pause the game clock during pause, countdown, goal celebration, and reset. At zero, finish the current simulation step, settle any goal crossing in that step, then resolve the match.
- Tied regulation enters sudden-death overtime; first valid goal wins. Career games have no draw. Overtime can continue until a goal.
- Walls bounce the ball; players cannot leave the play area through a goal mouth. Use separate player containment and ball-goal collision rules.
- A goal celebration should be brief and skippable. Reset positions and velocities before restarting.

## PC input

| Input | Meaning |
| --- | --- |
| WASD / configurable arrows | Move; while tethered, steer tangentially |
| Mouse position | Aim kick and prefer an anchor |
| Hold right mouse | Attach one tether to the previewed valid anchor |
| Release right mouse | Detach and preserve current velocity |
| Left mouse | Attempt a deliberate kick if the ball is in reach |
| Escape | Pause; release all held inputs safely |

Prevent browser context menu only inside the active game canvas. Do not capture shortcuts while the player is editing a text field or navigating menus. Support keyboard-only aiming with a configurable aim mode and cycling valid anchors. Keep controller mapping data separate from actions; an optional mapping is left stick move, right stick aim, trigger tether, face button kick.

On touch, use left movement stick, right-side aimed kick control, and a tether hold button. If no explicit aim is supplied, preview a sensible anchor using movement direction; do not switch the selected anchor after a tether is attached. Tapping kick without a drag uses facing direction or an assisted goal direction. Provide an adjustable touch-control layout and generous hit targets.

## Running and contact

Accelerate toward requested ground velocity; avoid instant direction changes. Suggested maximum run speed is 5 units/s, with acceleration 22 units/s² and braking 26 units/s². Normalize diagonal input. Handle contact using consistent mass/impulse rules, modest penetration correction, and friction. Passive touches should be softer than deliberate kicks.

Robots can bump and displace one another but cannot stun-lock, damage, or permanently disable opponents. Chassis affect handling and momentum within bounded ranges. Do not let a heavy robot become an immovable goalkeeper. Ball and robot speed limits remain distinct.

## Anchor preview and acquisition

Every frame, project the cursor/aim into the field and score anchors by angular closeness, reachable distance, and small hysteresis favoring the currently previewed candidate. Reject anchors beyond the acquisition range, initially 9.5 units. Highlight exactly one candidate with an outline and small linking hint. Show an unobtrusive unavailable state when none is legal.

On press, attach only to the previewed anchor if still valid. Store that anchor ID until release. Holding the button must never silently retarget. Do not attach to the ball, another player, a screen element, or a distant arbitrary point. An invalid press does not consume a cooldown; a brief visual response explains failure.

## Tether state machine

States: READY → ATTACHED → COOLDOWN → READY. Pause/input loss detaches safely without generating a new launch impulse. A release within ATTACHED preserves physical velocity, with optional small controlled assistance rather than a fixed giant speed boost.

At attach, initialize rope length from planar anchor-to-player distance, bounded by minimum 2.0 and maximum 9.5. Apply a short inward assist so a nearly stationary beginner can start moving. Reeling can gently shorten the rope, initially 1.8 units/s, until the minimum. Attachment lasts at most about 1.6 seconds before auto-release; clearly signal the final interval if this cap remains after playtesting. Start with 0.35 seconds of reattachment cooldown.

When taut, constrain radial distance and remove only velocity that moves outward through the constraint. Preserve tangent velocity. Use input projected onto the tangent to steer and build a controlled swing. Clamp total tether speed initially at 10.5 units/s. Release moves along the instantaneous tangent/current velocity, not toward the cursor or anchor. If the player reaches the anchor/minimum radius, use stable constraints rather than teleporting or dividing by a near-zero distance.

Resolve player/wall and rope constraints consistently, with a small bounded iteration count. An anchor on the sideline should never drag a robot outside the arena. Start without physical rope wrapping or rope-body collision. The visible line should remain legible when projected over walls.

## Ball and kick

Use a free-moving ball, no possession lock. Start with ball mass 0.35, wall restitution about 0.82, continuous time-based drag, and maximum speed 18 units/s. Use swept collision or substeps for high-speed robot/ball and ball/wall interactions. Avoid frame-dependent drag.

A manual kick requires ball distance within roughly 1.15 units, legal aim, and a ready cooldown around 0.28 seconds. Kick toward aim; add a capped contribution from the robot's forward velocity. A starting formula is base impulse/speed contribution 5 plus 0.8 times forward approach speed, capped at a deliberate-shot speed around 16. The implementer must adapt force/impulse units to the actual solver rather than adding incompatible quantities.

Allow a small input buffer, around 0.1 seconds, to forgive near-contact timing; cancel it on pause, scene exit, and match end. Do not kick through a wall or let a kick magnetically teleport the ball. Soft touches, intended passes, and momentum shots should look and sound different. Shot/passing assistance may gently reduce aim error, with a clear setting and no teleporting trajectories.

## Statistics and event attribution

Record timestamped deliberate touches and meaningful contact events. Goals credit the last attacking touch unless an own-goal rule applies; show own goals explicitly and credit the team score correctly. Assists can credit the preceding distinct teammate deliberate touch within six seconds, with no intervening opponent control. Never grant a self-assist. If an event cannot be attributed reliably, leave the individual award unset while preserving the team goal.

Define shots as deliberate attacking attempts whose projected short trajectory intersects the goal mouth, using conservative thresholds. Define saves from a defending touch that interrupts a goal-bound ball, with a debounce and a short prediction window. A blocked pass is an interception only after genuine change of controlled possession. Do not count repeated contact jitter as multiple contributions. These metrics are feedback, not requirements for correct match outcomes.

## Feedback and accessibility

Use an anchor outline, short rope wind-up effect, readable ball shadow, subtle touch flash, and different kick sounds. Keep live tactical paths optional; the diagrammatic paths in concept 04 belong to training/replay. Team identity includes icon/jersey distinction in addition to color. Reduced motion removes camera shake and shortens decorative motion. Fixed camera, paused tutorials, remappable inputs, adjustable sensitivity, and touch targets support a broad audience.
