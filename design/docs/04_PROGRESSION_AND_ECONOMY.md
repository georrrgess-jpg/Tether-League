# 04 — Club progression, rewards, and saving

## Club identity

Create a name, badge, primary/secondary colors, jersey pattern, robot numbers, and selected chassis. Offer a strong default: Harbor Sparks, cyan/navy, robots 07 and 11. Opponents use contrasting presentation; if custom colors clash, apply an accessible away kit automatically and explain it briefly.

The home scene grows with accomplishments: extra trophy shelf space, a better workshop, banners, and a more lively stadium. These are earned visual milestones. Gameplay strength primarily comes from learning and chassis tradeoffs.

## Career structure

Initial division ladder: Rookie League → Harbor Division → Metro Division → Premier Division → Championship League. Names and count can be revised. Each division contains the player's club and five AI clubs.

Each club plays each other twice: ten regular-season games per club, thirty league games total. A round contains three fixtures. After the player's fixture, simulate the other two unplayed fixtures for that round using seeded ratings and declared team tendencies. Mark each fixture complete exactly once; never resimulate previous rounds on opening the screen.

Regular-season matches use sudden death if regulation ties. Standings award 3 points for a win, 0 for a loss. Sort by points, goal difference, goals scored, then stable seeded club order. Because every fixture produces a winner, W+L must equal played. Present this simple ruleset clearly in a small league-help panel.

Top four reach semifinals: 1 versus 4 and 2 versus 3, followed by a final. If the player misses the playoffs or is eliminated, simulate remaining fixtures and still show the champion. Winning the playoff final earns the division trophy and promotion. Other finishes allow another season in the same division. Preserve cosmetics, credits, and history between seasons. Do not force a full save reset after a loss.

The final division can repeat as a championship defense with season records. The game should remain useful after all content unlocks through competition, trials, and personal records.

## Rewards

One earned currency: Credits. Club XP is a progress meter, not a spendable currency. Proposed match rewards:

| Source | Credits | Club XP |
| --- | --- | --- |
| Complete a normal match | 50 | 80 |
| Win bonus | +30 | +40 |
| Qualifying contribution bonus | Up to +20 | Up to +30 |
| First division championship | +300 | +250 |
| First bronze/silver/gold medal per trial | 20 / 30 / 50 | 20 / 30 / 50 |

Contribution bonuses must recognize passes, saves, and interceptions, not only goals. Award a bounded tier once per match. Short tutorials and abandoned matches do not produce the full match reward. Repeated trial attempts can improve records; first-medal rewards pay once per medal. If a player goes directly to gold, award any unclaimed lower tiers once as well.

Starting price bands: face/jersey cosmetics 100–200 credits, trails/celebrations 250–400, alternative chassis 400–600. Give the first small cosmetic choice after onboarding or one completed match. Tune pacing using match length and actual earnings. Avoid long empty stretches where the player sees no attainable goal.

Suggested cumulative XP milestones are 150, 400, 800, 1,500, and 2,500; award a small cosmetic choice or club decoration at each. After that, repeat a transparent level requirement such as 500 XP per level. Store claimed milestone IDs so an import/reload does not repeat grants. The developer may replace this curve after measuring actual match earnings. Arena access can begin with Harbor Park, unlock Foundry after finishing the first season, Skyline after the Harbor Division title, and the Dome on reaching Premier Division. Trials can preview arenas without granting their career unlock.

Unlock alternative chassis through club milestones and a clear direct purchase, with an optional academy route. Preview and test-drive locked chassis. Each is a sidegrade; unlocks do not multiply kick power or tether range beyond readable bounds. Exact milestone and price can change during balancing.

## Return incentives

- A clear next fixture and promotion objective.
- One pinned, achievable cosmetic or trial goal.
- Career season history and earned trophy display.
- Personal bests in trials and honest performance records.
- New opponents and venue presentation as the club advances.

Keep all permanent rewards reachable through ordinary play. There is no need for forced waiting, attendance penalties, energy bars, or premium currency in this release.

## Result commit and resume

Every match has a unique stable match ID and every career fixture a fixture ID. On completion, construct an immutable result record, calculate rewards, update fixture/standings/history and balances, then persist a committed result marker. Reopening results, skipping animation, refreshing, or returning from a replay must not award rewards twice. UI reward animations read committed data; they do not issue payments themselves.

Save club profile, owned/equipped content, wallet, XP, career schedule/results, histories, records, tutorial flags, medal reward flags, controls, settings, and schema version. Validate IDs and finite numeric ranges when loading. Keep one previous valid snapshot. If saving fails, show a clear notice and offer export; do not claim success. Provide export/import and explicit new-career confirmation. Preserve unrelated saves during migrations.

Pause on focus loss. For the first release, a mid-match refresh may restart the same uncompleted fixture without rewards; explain this behavior in the pause menu. Never mark a fixture complete just because the game closed. A later mid-match resume needs a complete consistent simulation snapshot.
