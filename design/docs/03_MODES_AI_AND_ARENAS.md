# 03 — Modes, bots, and arenas

## Mode priorities

**Quick Match:** Choose an unlocked arena, chassis, teammate tendency, and difficulty. One match is enough to enjoy the game. Offer rematch and change setup from results. Quick matches earn bounded credits/XP but do not alter career standings.

**Club Career:** Six-club divisions, a ten-match double round robin, and a four-team playoff. Provide a clear next fixture, standings, trophy history, and persistent club growth. Match results must update a real schedule rather than randomly changing menu numbers.

**Academy:** Interactive movement, tether, kick, passing, and defense lessons. Teach one skill per step with a retry affordance and demonstrated goal. Tutorials must be playable; a static three-panel image is only a visual reference.

**Skill Trials:** Short deterministic scenarios with bronze, silver, and gold medals, personal bests, and quick restart. Start with six challenges described in the content catalog. Store scores by trial and rules version so balance changes do not mix incompatible records.

**Optional later modes:** Local versus, replay lab, daily seeded challenge, and online multiplayer. These are not required to prove or finish the first offline release. A daily seed should rotate content without making missed days costly.

## Bot design

Bots use the same acceleration, tether range/cooldown, collision, kick reach, and ball information as the player. Difficulty affects reaction time, anticipation, aim error, commitment, and recovery quality. It must not secretly grant extra speed or a larger kick radius.

At a bounded decision frequency, each team assigns CHALLENGER and SUPPORT roles using ball travel time, defensive risk, and teammate position. Keep role hysteresis so both robots do not repeatedly swap jobs or chase the same ball. The challenger contests possession; support offers a pass, covers midfield, or protects the goal. A nearby loose ball does not justify abandoning an exposed goal with both robots.

Suggested behavior states: kickoff, approach ball, align kick, pass, shoot, support lane, intercept, recover, defend goal, and unstuck. Choose movement targets in open space. Predict short ball trajectories using wall rebounds. A basic bot can run effectively before tether planning is added; a complete release should use tether opportunities for recovery and attack.

For a tether plan, sample reachable anchors and short attach durations, approximate resulting movement, and compare arrival time/risk with running. Use a deliberately limited sample count. Do not run expensive path searches for every robot on every rendered frame. Avoid a full analytical solution if a stable local heuristic feels good.

Teammate tendencies adjust preferences, not competence ceilings:

| Tendency | Behavior |
| --- | --- |
| Supportive | Offers safe passing lanes, stays available, covers after a player attack |
| Aggressive | Makes forward runs when defensive coverage exists |
| Defensive | Holds a deeper supporting position and prioritizes interceptions |

Start the player with Supportive. Show a short human-readable explanation before selection. A teammate should recognize an obvious pass opportunity and clear a ball near its own goal. Bots should recover from wall traps and contact loops. Include an unstuck timer with a new movement target, never a visible teleport during normal play.

## Difficulty proposals

| Setting | Reaction delay | Aim error | Tactical behavior |
| --- | --- | --- | --- |
| Rookie | About 0.30–0.45 s | Generous | Clear mistakes, simple runs, forgiving pressure |
| Club | About 0.18–0.30 s | Moderate | Uses passes, basic prediction, occasional tether recovery |
| Pro | About 0.10–0.20 s | Small | Better coverage, rebounds, and selected swing attacks |

Tune these values through actual games. Difficulty should be selectable; career tiers can offer stronger default opponents with a clearly displayed assist option. Do not covertly force a target win rate or manipulate late-game outcomes.

## Arenas

**Harbor Park:** Standard 34×22 field, eight anchors, simple walls, clear opposite goals. Warm seaside identity. Required for the first prototype.

**Foundry Court:** Narrower 32×18 field, consistent goal width and collision rules. Same eight-anchor structure rescaled to preserve access. Industrial surroundings; shorter passing lanes and wall rebounds feel useful.

**Skyline Stadium:** Wider 34×26 field, anchors repositioned so valid swing routes remain available. More space for support runs. No falling off the rooftop; boundary walls are ordinary playable walls.

**Championship Dome:** Standard dimensions and symmetric competitive geometry, championship presentation, clear field lighting, and trophy ceremony backdrop. Distinct identity can come from art rather than added hazards.

All initial competitive courts are symmetric. Decorative spectators and machines do not collide with play. Field variation must be tested for reachable anchors, fair kickoff positions, ball traps, and goalkeeper camping. Moving anchors, bumpers, and temporary goals belong to a future explicitly labelled arcade ruleset.
