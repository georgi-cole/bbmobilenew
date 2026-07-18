# Game interface design system

This system governs the active game screen: the faux TV, activity log, avatar roster, action dock, status chips, and bottom navigation.

## Product principles

1. The faux TV is the primary stage. Supporting controls should be quieter.
2. One surface should look like one surface. Avoid borders and shadows around every child control.
3. State must be communicated by words or icons as well as colour.
4. Touch targets remain at least 44px. Focus is always visible for keyboard players.
5. Motion explains a change in state; it is not ambient decoration.

## Token families

- `--game-space-*`: 4px spacing scale.
- `--game-radius-*`: nested corner-radius scale.
- `--game-surface-*`: canvas, grouped, raised, and interactive surfaces.
- `--game-text-*`: primary, secondary, and tertiary hierarchy.
- `--game-accent`, `--game-success`, `--game-warning`, `--game-danger`: semantic state colours.
- `--game-shadow-*`: three elevation levels.
- `--game-motion-*`: fast, standard, and slow state transitions.
- `--game-focus-*`: shared keyboard-focus treatment.

## Existing primitives

- `.game-button`: actions and menu commands.
- `GameTopChip`: compact phase and context labels.
- `StatusPill`: semantic player and game statuses.
- `.game-ui-surface`: standard grouped surface.
- `.game-ui-eyebrow`: section and broadcast eyebrow.
- `.game-ui-focusable`: shared visible-focus treatment.

New game-screen components should use semantic tokens instead of introducing new raw colours, radii, shadows, or transition timings. Mode-specific minigames may retain their own art direction while reusing accessibility and interaction tokens.