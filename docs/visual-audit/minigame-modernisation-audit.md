# Minigame visual modernisation audit

## Audit status — re-capture in progress

The initial 30 July 2026 visual assessment is superseded. Its screenshot route disabled `requestAnimationFrame` before minigames mounted. Several boards use that callback to draw their first frame, so Capitalization, Find Your Twin, and Tilt Labyrinth were incorrectly captured as empty.

The visual freeze now pauses CSS motion only and leaves `requestAnimationFrame` available. Corrected mobile WebKit captures confirm that all three disputed games render normally. The `current/manifest.json` is deliberately marked `"incomplete"` until the entire six-profile bank has been regenerated with the fixed capture method.

Do not use the previous redesign ranking as a decision document. A revised recommendation will follow the complete corrected bank.

## Confirmed corrected examples

- Capitalization: globe and continent selection render.
- Find Your Twin: platform scene, player, hazards, pickups, and controls render.
- Tilt Labyrinth: maze, collectibles, hazards, key, and exit render.

The screenshot workflow remains deterministic: fixed seed, four players, rules/countdown skipped, QA controls hidden, and CSS animations paused. It now waits for two paint frames before capture.
