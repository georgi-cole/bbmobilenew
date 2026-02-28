# Spectator Mode — Non-Destructive Implementation

## Overview

`SpectatorView` is a fully non-destructive React overlay that plays a cinematic
visualization (trivia, hold-wall, or maze) whenever the human player watches
AI competitors finish a Final 3 competition.

Key safety properties:
- **Read-only access** — SpectatorView never writes authoritative winner state.
  It listens to Redux `hohId`, the `minigame:end` CustomEvent, and
  `window.game.__authoritativeWinner`, but it does not dispatch any game-logic
  actions other than `openSpectator` / `closeSpectator`.
- **advance() guard** — `spectatorActive` is set in the Redux store on mount.
  While it is truthy, `advance()` returns early (no phase transitions can race
  past the overlay).
- **15 s floor** — The overlay stays visible for at least 15 seconds from mount
  (`MIN_FLOOR_MS = 15000`), even if the simulation sequence ends sooner.
- **Skip button** — The "Skip to Results" button is disabled until
  `sequenceComplete` is true (the full visualization has played through).
  Clicking Skip bypasses the 15 s floor and triggers an immediate reveal.

---

## Architecture

### Redux / Store

| Symbol | Description |
|---|---|
| `GameState.spectatorActive` | `SpectatorActiveState \| null` — set while the overlay is mounted. |
| `openSpectator(payload)` | Sets `spectatorActive`; no-op if already set (deduplication). |
| `closeSpectator()` | Clears `spectatorActive`, unblocking `advance()`. |
| `GameState.cfg.enableSpectatorReact` | Runtime feature flag (see [Feature Flags](#feature-flags)). |

`advance()` in `gameSlice.ts` early-returns when `state.spectatorActive` is truthy:

```typescript
if (state.spectatorActive) return;
```

### SpectatorView component (`src/components/ui/SpectatorView/SpectatorView.tsx`)

- **Mount**: dispatches `openSpectator({ competitorIds, minigameId, variant, startedAt })`.
- **Unmount**: dispatches `closeSpectator()` (unless already dispatched by `onReconciled`).
- **Authoritative winner sources** (read-only):
  1. `game.hohId` from Redux store (via `useAppSelector`).
  2. `window.game.__authoritativeWinner` (legacy global, validated against `competitorIds`).
  3. `minigame:end` CustomEvent (`detail.winnerId` or `detail.winner`).
  4. `spectator:show` CustomEvent (`detail.winnerId`).
- **`initialWinnerId` prop**: stored and used at the END of the simulation so the
  correct winner is revealed; does NOT skip the sequence.

### progressEngine hook (`src/components/ui/SpectatorView/progressEngine.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `SIM_DURATION_MS` | 6000 ms | Duration of the speculative progress simulation. |
| `RECONCILE_DURATION_MS` | 1200 ms | Delay before setting phase to `revealed`. |
| `MIN_FLOOR_MS` | 15000 ms | Minimum total overlay duration. |

**Phase progression:**

```
mount → 'simulating' (0–6 s) → 'reconciling' → 'revealed' → onReconciled()
```

- `sequenceComplete` becomes `true` when the 6 s simulation ends.
- `skip()` (exposed from the hook) cancels any pending floor timer and
  immediately schedules the reveal with `RECONCILE_DURATION_MS` delay.
- The floor is applied as: `revealDelay = max(RECONCILE_DURATION_MS, MIN_FLOOR_MS - elapsed)`.

### Variant components

| Variant | File | Description |
|---|---|---|
| `holdwall` | `HoldWallVariant.tsx` | Animated endurance wall climb with per-lane progress bars. |
| `trivia` | `TriviaVariant.tsx` | Cycling BB-themed trivia questions with live leaderboard. |
| `maze` | `MazeVariant.tsx` | Grid-maze runner with trail dots and frontier cell pulsing. |

### GameScreen wiring (`src/screens/GameScreen/GameScreen.tsx`)

- `spectatorReactEnabled` combines the compile-time flag
  (`FEATURE_SPECTATOR_REACT`) with the runtime flag
  (`game.cfg?.enableSpectatorReact !== false`).
- `spectatorF3Active` is set when the human is NOT a finalist in `final3_comp3`.
  `SpectatorView.onDone` dispatches `advance()` so the game engine computes the
  winner and continues after the spectacle.
- `spectatorLegacyPayload` is set by the `spectator:show` CustomEvent from the
  legacy adapter.  `SpectatorView` is rendered with a portal to `document.body`.

---

## Feature Flags

### Compile-time flag

Set the environment variable before building to disable the SpectatorView
entirely:

```bash
VITE_FEATURE_SPECTATOR_REACT=false npm run build
```

Defined in `src/config/featureFlags.ts` as `FEATURE_SPECTATOR_REACT`.

### Runtime flag (`game.cfg.enableSpectatorReact`)

The runtime flag allows toggling the overlay per-season or per-week without
redeploying. It is stored in `GameState.cfg` and defaults to `true` when omitted.

**Disable at runtime (via game state):**

```typescript
// In a game-setup action or test fixture:
dispatch(updateCfg({ enableSpectatorReact: false }));
```

**Combined check used in GameScreen:**

```typescript
const spectatorReactEnabled =
  FEATURE_SPECTATOR_REACT && game.cfg?.enableSpectatorReact !== false;
```

---

## QA Steps

### Smoke test — Final 3 spectator mode

1. Start a new game season.
2. Navigate to Week 8–9 (Final 3 week).
3. Ensure the human player did NOT win Final 3 Part 1 or Part 2.
4. On `final3_comp3`, the SpectatorView overlay should appear.
5. **Verify**:
   - Overlay shows competitor names and progress bars / visualization.
   - The **Skip to Results** button is **disabled** for the first ~6 seconds.
   - After 6 seconds the Skip button becomes **enabled**.
   - Without pressing Skip: overlay stays for at least 15 seconds, then
     automatically closes and the game advances.
   - With Skip pressed after 6 s: overlay closes promptly (~1.2 s) without
     waiting for the 15 s floor.
   - The `advance()` action (Continue button) is **blocked** while the overlay is
     open — the Continue button must not be clickable.

### Verify no authoritative writes

1. Open the Redux DevTools while the overlay is visible.
2. Confirm that only `game/openSpectator` and `game/closeSpectator` are dispatched
   by the SpectatorView component.
3. Confirm that `game.hohId` and all winner-related state is set AFTER the overlay
   closes (driven by `advance()` in `handleSpectatorF3Done`).

### Toggle the feature flag

**Disable via env var (build time):**

```bash
VITE_FEATURE_SPECTATOR_REACT=false npm run dev
```

Reach `final3_comp3` as spectator — the overlay must NOT appear; `advance()`
should fire normally.

**Disable via runtime cfg:**

```typescript
// In browser console (development build):
window.__store?.dispatch({ type: 'game/setCfg', payload: { enableSpectatorReact: false } });
```

---

## Non-goals / Safety Constraints

- The SpectatorView **never writes** authoritative winner state (`hohId`,
  `f3Part1WinnerId`, etc.).
- Existing minigame code is untouched; this is purely additive.
- `advance()` guards (`state.spectatorActive` check) are the only change to the
  game reducer; they return early without modifying any other state.
- The floor can be bypassed by the user via the Skip button but never
  auto-bypassed by the system.
