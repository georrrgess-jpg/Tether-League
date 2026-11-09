# 06 — Art, audio, motion, and accessibility

## Art direction

Cheerful miniature robot sport with tactile, simplified 3D shapes. Robots have rounded white shells, navy joints, expressive black face screens, readable team jerseys, compact limbs, and a visible tether emitter. The original reference's sunny harbor, yellow rail anchors, cyan ropes, orange opposition, clean grass, and warm ivory stadium boundaries are the visual foundation.

Use broad material areas and strong silhouettes. The image polish is a target for lighting, composition, and personality; reproduce it efficiently through geometry, baked/simple shading, and controlled effects rather than excessive texture resolution or real-time effects.

## Suggested tokens

| Role | Starting color |
| --- | --- |
| Ink / UI dark | `#17273E` |
| Panel ivory | `#F3F5EF` |
| Player cyan | `#12BCD2` |
| Opponent orange | `#F48A2C` |
| Anchor yellow | `#F6C542` |
| Positive green | `#51C998` |
| Warning coral | `#E96A64` |
| Field green | `#479D83` |

These colors are editable starting points, not verified contrast ratios. Check text/background contrast in implementation. Combine color with jersey numbers, icons, and outline patterns. Team cosmetics may be remapped to clear home/away kits during a match.

## UI system

Rounded ivory panels over navy foundations, a small amount of bevel, bold readable sport typography for titles, and a clean sans serif for body text. Use a modest slant on title logos rather than every label. The main action can be bright yellow or cyan; secondary actions are quieter. Use a consistent spacing scale and large touch targets. Keep labels short and use tooltips or detail panels for explanations.

Menus need selected, hover, pressed, disabled, locked, equipped, loading, and focus states. A purchase button cannot be visually identical to an equipped item. Rebuild text as real UI; generated letterforms and labels are not production assets.

## Robot animation list

Idle breathing/bobbing; run; turn lean; attach anticipation; tether swing lean; release follow-through; soft touch; deliberate kick; bump recoil; save reaction; goal celebration; loss reaction; garage pose. Procedural animation is acceptable and can reduce asset requirements. Expressive faces should support the action without distracting from the ball. The simulation body remains authoritative while the rendered robot leans and hops.

## Effects and timing

- Anchor preview: steady outline with a subtle pulse; candidate changes have hysteresis.
- Tether attach: short line extension and a small snap cue.
- Swing: thin readable arc/trail, strongest near the controlled robot.
- Release: brief velocity trail with no long opaque streak over the ball.
- Kick: compact contact flash plus speed-scaled sound.
- Goal: net response, team-color accent, short celebration; reduced motion removes shake/confetti.
- Menus: brief 120–200 ms fades/slides as a starting range. Do not delay action until a long flourish finishes.
- Rewards: skip/speed-up option; values come from committed result data.

## Audio

Create a coherent small sound set: hover/select/back, tether attach/hum/release, soft touch, kick, wall bounce, goal, countdown, final whistle, reward, unlock, and subdued crowd ambience. Stronger contacts can change volume/pitch within controlled bounds. Avoid harsh repeated high-frequency effects during multiple contacts. Separate master, music, and effects volume; mute should persist.

Music can blend bright electronic rhythm with playful arena energy. Increase intensity subtly near the end of a close match through a layer or transition rather than changing rules. Start playback only after an appropriate user gesture and handle browser audio suspension correctly. Use original, procedural, or properly licensed audio and record sources in asset notes.

## Accessibility and low-power modes

Reduced motion, camera-shake toggle, remappable keys, sensitivity, color identification alternatives, readable ball outline, optional aim/anchor assistance, pauseable tutorials, and audio controls are part of the design. Low quality reduces spectators, shadows, reflections, particles, and render resolution while preserving field markings, anchors, ball clarity, and UI. Avoid relying on transparency alone for essential feedback.
