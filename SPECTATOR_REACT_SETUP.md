# SpectatorView React Setup

## Overview

`SpectatorView` is a fullscreen, authoritative-first spectator mode overlay for the bbmobilenew React/TypeScript app. It replaces and augments the older bbmobile spectator overlay with three polished visual variants and a clean reconciliation model that guarantees the authoritative game winner is always displayed correctly.

---

## Files Added / Modified

| Path | Type | Description |
|------|------|-------------|
| `src/components/ui/SpectatorView/SpectatorView.tsx` | ADD | Main fullscreen React component |
| `src/components/ui/SpectatorView/progressEngine.ts` | ADD | Simulation + reconciliation hook |
| `src/components/ui/SpectatorView/HoldWallVariant.tsx` | ADD | "Hold the Wall" visual variant |
| `src/components/ui/SpectatorView/TriviaVariant.tsx` | ADD | "Trivia Challenge" visual variant |
| `src/components/ui/SpectatorView/MazeVariant.tsx` | ADD | "Maze Run" visual variant |
| `src/components/ui/SpectatorView/styles.css` | ADD | Fullscreen overlay styles |
| `src/components/ui/SpectatorView/index.ts` | ADD | Barrel export |
| `src/compat/legacySpectatorAdapter.js` | ADD | `window.Spectator.show()` compatibility shim |
| `src/config/featureFlags.ts` | MODIFY | Added `FEATURE_SPECTATOR_REACT` |
| `src/screens/GameScreen/GameScreen.tsx` | MODIFY | Wiring for Final 3 spectator + legacy event listener |
| `src/components/ui/SpectatorView/__tests__/SpectatorView.test.tsx` | ADD | Unit tests |

---

## Feature Flag

```
VITE_FEATURE_SPECTATOR_REACT=false   # disable (default: enabled)
```

Set in `.env` or `.env.local` to toggle the React spectator. When disabled, the legacy code path (no overlay) is used unchanged.

---

## Component API

```tsx
import SpectatorView from './components/ui/SpectatorView';

<SpectatorView
  competitorIds={['p1', 'p2']}    // Required: player IDs competing
  minigameId="final3_comp3"        // Optional: identifier for debugging
  variant="holdwall"               // Optional: 'holdwall' | 'trivia' | 'maze'
  onDone={() => dispatch(advance())} // Called once reveal animation completes
  showImmediately={false}          // Skip entry animation
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `competitorIds` | `string[]` | required | Player IDs competing |
| `minigameId` | `string` | `undefined` | Optional identifier for the competition |
| `variant` | `'holdwall' \| 'trivia' \| 'maze'` | `'holdwall'` | Visual style |
| `onDone` | `() => void` | `undefined` | Called once the winner is revealed and the animation completes |
| `showImmediately` | `boolean` | `false` | Skip entry fade-in animation |

---

## Authoritative Detection Order

The component resolves the winner from multiple sources, in priority order:

1. **`window.game.__authoritativeWinner`** — synchronous check at mount time (legacy path)
2. **Redux store** — `useAppSelector(s => s.game.hohId)` — preferred when the game core sets the winner in the store
3. **`'minigame:end'` CustomEvent** — fired by legacy minigame code or via `window.Spectator.end()`
4. **`'spectator:show'` CustomEvent** — optional `winnerId` in event detail
5. **Simulation timeout** — after ~6 s the simulation picks a pseudo-random winner (entertainment fallback)

Once any source provides the winner, the simulation reconciles smoothly to that player.

---

## Visual Variants

### HoldWall (`holdwall`)
Competitors climb a vertical wall; progress bars fill upward. The winner's bar surges to 100% with a gold colour change and crown icon.

### Trivia (`trivia`)
Leaderboard-style scoreboard with horizontal progress bars that grow with each tick. Competitors are sorted by score in real time.

### Maze (`maze`)
Horizontal maze grid where competitor dots advance along a path. Doors open randomly during simulation. The winner's dot glows gold.

---

## Legacy Adapter API

The `legacySpectatorAdapter.js` shim installs `window.Spectator` for use by legacy minigame code without modifying any existing files.

### `window.Spectator.show(options)`

Opens the React spectator overlay by dispatching a `'spectator:show'` CustomEvent.

```js
window.Spectator.show({
  competitorIds: ['p1', 'p2'],   // required
  variant: 'trivia',             // optional
  minigameId: 'my_minigame',     // optional
  winnerId: 'p1',                // optional: authoritative winner if already known
});
```

### `window.Spectator.end(options)`

Signals the authoritative result by dispatching `'minigame:end'`. SpectatorView reconciles to the winner.

```js
window.Spectator.end({ winnerId: 'p2' });
```

---

## Integration: Final 3 Flow

GameScreen automatically shows `SpectatorView` when:

- `game.phase === 'final3_comp3'` **AND**
- The human player is **not** `game.f3Part1WinnerId` **AND**
- The human player is **not** `game.f3Part2WinnerId`

In this scenario the human has lost both Part 1 and Part 2 competitions and is watching the two AI finalists compete. When the spectator overlay is triggered:

1. `advance()` is dispatched immediately to compute the authoritative AI winner (`game.hohId` is set).
2. `SpectatorView` mounts with the finalist player IDs and reads `game.hohId` from Redux.
3. The reconciliation animation plays, revealing the winner.
4. `onDone` fires → the overlay is dismissed and the game continues from the already-advanced state.

---

## QA Checklist

### Authoritative-first behaviour

- [ ] Open the app with Final 3 Part 3 as an AI-only competition (human lost both Part 1 and Part 2). Verify SpectatorView appears and reveals the correct Final HOH (same as `game.hohId` after advance).
- [ ] Manually call `window.Spectator.show({ competitorIds: ['p1','p2'] })` in the browser console. Verify the overlay appears.
- [ ] While the overlay is running, call `window.Spectator.end({ winnerId: 'p1' })`. Verify the overlay reconciles to `p1` and dismisses.

### Race condition: winner arrives before / after mount

- [ ] Set `window.game = { __authoritativeWinner: 'p2' }` before SpectatorView mounts. Verify it reconciles immediately to `p2`.
- [ ] Allow SpectatorView to mount without a winner, then dispatch `minigame:end` after 2 s. Verify smooth reconciliation.
- [ ] Let the simulation time out (7–8 s total) without any authoritative result. Verify a winner is revealed and `onDone` fires.

### Accessibility

- [ ] Open SpectatorView and tab through it. Verify all interactive elements are reachable via keyboard and the overlay is announced as a dialog (`role="dialog"`, `aria-modal="true"`).
- [ ] Screen reader: verify the `aria-live="polite"` status message announces phase changes ("Competition in progress…", "Revealing winner…", winner name).
- [ ] Press **Space** or **Enter** while `phase === 'simulating'`. Verify the overlay skips to the reveal.

### Game flow: no regression

- [ ] Play through a full week (HOH → POV → Eviction). Verify SpectatorView never appears.
- [ ] Play as a human finalist in Final 3 Part 3 (`final3_comp3_minigame` phase). Verify SpectatorView does **not** appear (MinigameHost should run instead).
- [ ] After SpectatorView completes, verify the game continues normally (next phase loads, FAB reappears).

### Feature flag

- [ ] Set `VITE_FEATURE_SPECTATOR_REACT=false` in `.env.local` and restart. Verify SpectatorView never appears in any scenario.

---

## Manual Test Scenarios

### Scenario A — Spectator Final 3 Part 3

1. Create a game where the human player is `user` (id) and loses both Final 3 Part 1 and Part 2.
2. Advance to `final3_comp3`. SpectatorView should appear automatically.
3. Observe the HoldWall simulation for ~6 s.
4. After the winner is revealed, verify the overlay dismisses and the game transitions to `week_end` → `jury`.

### Scenario B — Legacy adapter

1. Open the browser console during gameplay.
2. Run:
   ```js
   window.Spectator.show({ competitorIds: ['p1', 'p2'], variant: 'trivia' });
   ```
3. Verify the trivia overlay appears.
4. Run `window.Spectator.end({ winnerId: 'p1' })` and verify it reconciles.

### Scenario C — Keyboard skip

1. Open SpectatorView (any method).
2. While the simulation is running (within first 6 s), press Space.
3. Verify the overlay jumps to the reveal animation immediately.

---

## Developer Notes

- Console logging in dev builds uses `[SpectatorView]` and `[legacySpectatorAdapter]` prefixes.
- `progressEngine.ts` is fully self-contained; import `useSpectatorSimulation` to reuse in other phases (jury battleback, ineligible competitor scenarios).
- Portal rendering (`createPortal(…, document.body)`) ensures correct stacking without touching parent `z-index` hierarchies.
- Styles use `var(--color-*)` tokens from `index.css` for consistent theming.
