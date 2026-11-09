# 10 — Starting content catalog

Everything here is editable starting content. Stable machine-readable IDs should survive display-name changes.

## Chassis

| ID | Name | Strength | Cost / weakness |
| --- | --- | --- | --- |
| `all_rounder` | All-Rounder | Consistent control and contact | No specialized advantage; starter |
| `scout` | Scout | Quick acceleration and turning | Lower collision mass and weaker momentum retention |
| `bulwark` | Bulwark | Stable challenges and defending | Slower acceleration/recovery; still displaceable |
| `glider` | Glider | Carries release momentum well | Slower braking and wider turning behavior |

Start with the same collision radius, kick reach, tether acquisition range, and manual-kick rules. Differentiate acceleration, mass, braking, and drag in small bounded amounts. Suggested relative values are in the JSON. Confirm through matches rather than assuming symmetry of tradeoffs guarantees balance.

## Rookie clubs

| ID | Name | Identity | Tendency |
| --- | --- | --- | --- |
| `harbor_sparks` | Harbor Sparks | Cyan/navy seaside home team | Player-defined |
| `ember_works` | Ember Works | Orange workshop team | Direct pressure and rebounds |
| `tide_runners` | Tide Runners | Teal/ivory wave badge | Passing and width |
| `skyline_bots` | Skyline Bots | Violet/blue skyline badge | Wide support runs |
| `iron_comets` | Iron Comets | Red/navy comet badge | Stable defense and counters |
| `sunset_gears` | Sunset Gears | Gold/plum gear badge | Balanced play |

The player's club name and badge are customizable. Team IDs remain stable. Select accessible match kits when team colors clash. Higher divisions can introduce new identities or improved tactical versions of these clubs; full creative authority applies.

## Trials

| ID | Name | Objective | Scoring |
| --- | --- | --- | --- |
| `swing_school` | Swing School | Traverse three anchor gates in sequence | Completion time; misses add a clear penalty |
| `clean_release` | Clean Release | Launch through a marked target lane | Successful releases in a fixed attempt count |
| `bank_shot` | Bank Shot | Score after contacting the marked wall segment | Time to three valid goals |
| `pass_window` | Pass Window | Pass through gates to a moving bot receiver | Completed deliberate passes in 45 seconds |
| `last_second_save` | Last-Second Save | Stop six seeded goal-bound shots | Saves, with gold requiring high consistency |
| `counterattack` | Counterattack | Intercept, recover, and score before reset | Best valid sequence time |

Show the exact success condition before each trial, indicate valid targets in play, and report failure constructively. Define medal thresholds after actual playtests. Use fixed seeds/versions for comparable personal bests. Trial reset clears ball/robot state and pending input.

## Cosmetics

Starter set: Basic Eyes face, Plain Kit, Standard Cable, Friendly Wave celebration, Harbor Shield badge. Early unlocks: Star Face, Stripe Kit, Comet Trail. Further possibilities: Pixel Smile, Chevron Kit, Spark Ribbon, Victory Spin, Sunburst Badge. Distinguish owned, locked, affordable, selected, and equipped.

Cosmetic trails cannot become opaque, hide the ball, or impersonate the opponent. Faces should be expressive and legible at both menu and match scale. A badge/jersey unlock should appear in relevant home and result scenes, making it feel owned rather than forgotten in a collection grid.

## Club visual milestones

Onboarding: small clean workshop and one blank banner. First season completion: a season pennant. First championship: engraved trophy and team photo. Higher promotions: a larger shelf, brighter practice court, upgraded club banner, and more lively home-stand presentation. Always tie displayed trophies to saved earned records.

## Content authoring

Store names, IDs, unlock conditions, prices, chassis modifiers, arena dimensions/anchors, and trial rules as data. Keep text concise and editable. If assets are sourced externally, maintain provenance and license notes. Use the images for direction and make runtime assets suitable for the renderer.
