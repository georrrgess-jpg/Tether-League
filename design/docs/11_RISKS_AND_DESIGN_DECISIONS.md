# 11 — Risks and practical design decisions

## A tether that only decorates a dash

Risk: clicking an anchor instantly launches the robot toward it, removing the sport's identity. Resolution: preserve a real planar rope relationship, tangent motion, steerable swing, and release direction. An initial beginner assist is acceptable, but it should not replace the mechanism. Compare arrival and recovery choices against simply running.

## A physics toy that is hard to aim

Risk: momentum is entertaining but deliberate passes and saves feel accidental. Resolution: bounded speed, readable anchor preview, generous early contact timing, modest optional aim help, useful braking, and active tutorials. Tune control before adding difficult arenas or new chassis.

## Ambiguous 3D height

Risk: the image's airborne pose implies free aerial controls and leads to a much larger physics problem. Resolution: first release uses planar gameplay with decorative height/lean. Markers, shadows, and ball position remain aligned with the ground plane. If true aerial play is later chosen, treat it as a considered rules expansion.

## Goal camping and contact loops

Risk: a heavy robot blocks the goal indefinitely, or opponents pin each other against walls. Resolution: limited mass differences, consistent displacement, useful rebounds/passes, open goal approaches, and unstuck logic. Avoid artificial invincible keeper states. Observe games with bots and a passive player to identify deadlocks.

## Team AI undermining the sport

Risk: all four robots chase the ball, teammates steal shots, and bot tethering looks arbitrary. Resolution: explicit challenger/support roles, commitment time, open-space targets, actual pass windows, and recovery rules. Add tether planning after running/kicking behavior works. Favor understandable mistakes over invisible advantages.

## Progression that changes competitive fairness

Risk: unlocks make the initial robot obsolete. Resolution: small sidegrade chassis changes, cosmetic club growth, skill-based progression, and test drives. Difficulty is declared, and match outcomes come from play. Earned rewards should recognize support contributions as well as scoring.

## Career arithmetic and reward duplication

Risk: generated art's sample standings are copied literally, or results issue rewards on every visit. Resolution: documented schedule/rules, shared authoritative state, stable fixture/match IDs, a committed-result ledger, and validation of season invariants. Images are references, not saved data.

## Premature networking

Risk: online synchronization consumes the project before the sport is fun. Resolution: common input-command abstraction, fixed-step core, bounded replay data, and clean state boundaries provide future options. Complete and validate offline play first; do not label bot matches as online.

## Excessive visual cost

Risk: replicating every concept-art detail produces poor Chromebook/phone performance. Resolution: simple meshes, restrained shadows, instance spectators, short effects, modest resolution, and real DOM UI. Preserve silhouettes, materials, team contrast, and composition rather than photographic detail.

## Broad scope without a finished loop

Risk: many attractive menus lead to incomplete matches and fake progression. Resolution: milestone A proves the sport; milestone B proves a real season/reward/save loop. Expand content only on that foundation. Claude has authority to simplify and improve the pack to achieve a coherent, honest delivery.

## Decisions the developer should record

Record the actual stack and versions, camera orientation, chosen physics solver/update order, tuned tether behavior, assistance defaults, final chassis modifiers, validated career rules, storage/migration strategy, replay availability, performance measurements, tested devices, and any scope changes. Keep this short and actionable so development can resume cleanly.
