# 05 — Screens and user flows

## Main routes

First run → club setup → optional active tutorial → club home → next fixture → pre-match → match → committed results → league hub/home.

Returning run → club home with next useful action. Quick Match and Academy remain reachable in at most two navigation steps. Browser Back and in-app Back should agree where practical. A match has a pause confirmation before leaving; menu navigation preserves selected content and scroll position.

## Required screens

| Screen | Primary action | Secondary information and states |
| --- | --- | --- |
| Club setup | Create club | Name, defaults, badge/colors, edit validation |
| Club home | Play next match | Current club, next opponent, progress, trophy shelf |
| Play chooser | Start mode | Career, Quick Match, Academy/Trials; label future modes honestly |
| League hub | Play fixture | Standings, schedule, playoff bracket, league rules, season history |
| Pre-match | Start match | Arena, opponent, chassis, teammate tendency, difficulty/assistance |
| Live match | Play sport | Score, clock, team identification, candidate anchor, minimal hints |
| Pause | Resume | Controls, settings, restart/leave behavior and uncommitted fixture status |
| Results | Continue/rematch | Real score, useful stats, rewards, next milestone, replay availability |
| Robot garage | Equip/test drive | Four chassis, qualitative tradeoffs, owned/locked state, direct purchase |
| Arena select | Confirm arena | Clear unlocked states and meaningful geometry descriptions |
| Academy/trials | Start lesson/trial | Skill groups, medals, personal best, retry |
| Customization | Save appearance | Preview, owned items, earned-credit purchases, cancel |
| Settings | Apply/return | Input, audio, graphics, accessibility, save export/import |

## Home hierarchy

The next match is the largest action. Club identity and two robot previews establish ownership. Progress is compact: next milestone, season progress, and a trophy shelf. Navigation should be a small stable set: Play, Club, Garage, Academy, Settings. Avoid adding a separate top-level destination for every cosmetic category.

Concept art may show illustrative clubs, balances, or cup titles that differ across screens. Real menus must share one data source. The club name is editable, not a fixed label embedded into a background.

## Match interface

Keep score and timer at the top, a small player indicator, and the legal anchor preview. Avoid permanently showing the whole garage, quest list, minimap, reward currency, or a large trajectory diagram on the field. Contextual input hints fade when mastered and can be recalled. Pause remains obvious on touch.

The same camera orientation must apply to input mapping, team attack direction, HUD, and tutorials. A small camera rotation for presentation should not invert controls. The ball should remain easy to locate through shadows, outline/accessibility settings, and restrained background contrast.

## Results

Lead with score and outcome, then meaningful contributions and progression. Give team play credit. Show a loss with the same useful navigation and earned completion rewards as a win. Continue Season is the primary career action; Rematch is primary in Quick Match. Watch Replay is enabled only when a working replay exists. A first-time result celebration can be richer, while repeated transitions stay short and skippable.

## Garage and customization

Use a large robot preview with concise tradeoffs. Explain locked requirements and price. Test drive is available before purchase. Equip state updates immediately in a preview but applies to the next match; it should not silently mutate an active match. Cosmetic selections have visible save/cancel behavior. A purchase transaction validates ownership and balance and cannot execute twice from repeated clicks.

## Responsive behavior

Design landscape play for wide screens and phones with a respectful rotate suggestion if needed; never trap users on an empty orientation screen. For portrait menus, stack the next-action card above robot preview and move navigation to a compact bottom bar. Keep primary actions visible without covering content. Touch controls avoid goal HUD and device safe areas. Use real responsive text and components, not a single scaled screenshot.

Validate representative layouts such as 1366×768 Chromebook, 1280×720 compact desktop, 1920×1080 desktop, roughly 844×390 phone landscape, and 390×844 phone portrait menus. These are layout test sizes, not claims of device performance. Honor reduced motion, text scaling, keyboard navigation, visible focus, and a high-contrast option.

## Empty, error, and loading states

Show first trophy/record empty states with an attainable next goal. Locked venues should explain the unlock. Disable expensive preview effects while loading without disabling navigation unnecessarily. Handle lost WebGL context with a recovery path. A failed save/import should preserve the current profile. Import validates before overwriting, and destructive reset requires explicit confirmation. Pause clears held input, pointer capture, and pending kicks.
