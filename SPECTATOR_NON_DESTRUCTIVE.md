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
- **10 s run phase** — The simulation visualization runs for `SIM_DURATION_MS = 10000 ms`.
- **1.2 s reveal phase** — After the run phase (or immediately on skip), the
  `revealPhase` plays for `RECONCILE_DURATION_MS = 1200 ms` before onDone fires.
- **Immediate skip** — The "Skip to Results" button is enabled from the very first
  render. Clicking Skip at any point immediately cancels the simulation and
  schedules the reveal with `RECONCILE_DURATION_MS` delay.
- **expectedWinnerId prop** — Pre-computed winner ID resolved before the
  spectator opens; the reveal always matches this player.
- **openSpectator deduplication** — If `spectatorActive` is already set when
  `openSpectator` is dispatched, the action is a no-op.
- **Final-3 ceremony** — After Part-3 spectator completes, `awaitingFinal3Plea`
  triggers the `Final3Ceremony` overlay (coronation → pleas → HOH decision →
  eviction animation).

---

## Architecture

### Redux / Store

| Symbol | Description |
|---|---|
| `GameState.spectatorActive` | `SpectatorActiveState \| null` — set while the overlay is mounted. |
| `openSpectator(payload)` | Sets `spectatorActive`; **no-op if already set** (deduplication). |
| `closeSpectator()` | Clears `spectatorActive`, unblocking `advance()`. |
| `GameState.awaitingFinal3Plea` | `boolean` — set by `advance()` for Part-3 AI HOH to trigger ceremony. |
| `setAwaitingFinal3Plea(bool)` | Sets / clears the `awaitingFinal3Plea` flag. |
| `finalizeFinal3Decision({ hohWinnerId, evicteeId })` | Evicts the chosen player, crowns HOH, clears `awaitingFinal3Plea`, and sets `phase = 'week_end'`. |
| `GameState.cfg.enableSpectatorReact` | Runtime feature flag (see [Feature Flags](#feature-flags)). |

`advance()` in `gameSlice.ts` early-returns when any blocking flag is truthy:

```typescript
if (state.spectatorActive || state.awaitingFinal3Plea) return;
```

`SpectatorActiveState` now includes:

| Field | Description |
|---|---|
| `competitorIds` | Player IDs visible in the overlay. |
| `variant` | Visual variant (`holdwall` \| `trivia` \| `maze`). |
| `expectedWinnerId` | Pre-computed authoritative winner ID. |
| `placement` | `'fullscreen'` (portal) or `'embed'` (inline). |
| `startedAt` | Unix timestamp (ms) recorded when the overlay was opened. |

### SpectatorView component (`src/components/ui/SpectatorView/SpectatorView.tsx`)

- **Mount**: dispatches `openSpectator({ competitorIds, minigameId, variant, expectedWinnerId, placement, startedAt })`.
- **Unmount**: dispatches `closeSpectator()` (unless already dispatched by `onReconciled`).
- **Skip**: enabled immediately on mount; cancels the sim tick and schedules
  the reveal after `RECONCILE_DURATION_MS` (1.2 s).
- **Embed placement**: when `placement='embed'`, the overlay renders inline in
  the current DOM node instead of via a portal to `document.body`. Used for
  the minigame panel in Final-3 parts.
- **Authoritative winner sources** (read-only):
  1. `expectedWinnerId` prop (highest priority — pre-computed before open).
  2. `game.hohId` from Redux store (via `useAppSelector`).
  3. `window.game.__authoritativeWinner` (legacy global, validated against `competitorIds`).
  4. `minigame:end` CustomEvent (`detail.winnerId` or `detail.winner`).
  5. `spectator:show` CustomEvent (`detail.winnerId`).

### progressEngine hook (`src/components/ui/SpectatorView/progressEngine.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `SIM_DURATION_MS` | 10000 ms | Duration of the run phase (visualization). |
| `RECONCILE_DURATION_MS` | 1200 ms | Duration of the reveal phase. |

**Phase progression:**

```
mount → 'simulating' (0–10 s) → 'reconciling' (1.2 s) → 'revealed' → onReconciled()
```

- `skip()` — available immediately (no `sequenceComplete` gate). Cancels the
  sim tick and schedules reconcile after `RECONCILE_DURATION_MS`.
- `revealDelay` is always `RECONCILE_DURATION_MS` — no minimum floor timer.

### Final3Ceremony component (`src/components/Final3Ceremony/Final3Ceremony.tsx`)

Triggered when `game.awaitingFinal3Plea` is true and `game.phase === 'final3_decision'`.

Ceremony sequence:
1. **Coronation animation** (2.8 s) — crown drop animation for the Final HOH.
2. **Plea overlay** — reuses `ChatOverlay`; nominees make their final pleas.
3. **HOH decision**:
   - Human HOH → `TvDecisionModal` to choose evictee.
   - AI HOH → deterministic seeded RNG pick (same algorithm as legacy advance()).
4. **Announcement** — `ChatOverlay` reveals the eviction decision.
5. Dispatches `finalizeFinal3Decision({ hohWinnerId, evicteeId })` + `advance()`.

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
  winner and crowns the Final HOH.
- `showFinal3Ceremony` is true when `game.awaitingFinal3Plea && phase === 'final3_decision'`.
  `Final3Ceremony` handles the post-Part-3 coronation and eviction ceremony.
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
   - The **Skip to Results** button is **enabled immediately** (no waiting).
   - Without pressing Skip: overlay runs for ~10 s, then reveal plays (~1.2 s),
     then closes and `advance()` fires → Final-3 ceremony starts.
   - With Skip pressed immediately: overlay transitions to reveal (~1.2 s),
     then closes and `advance()` fires → Final-3 ceremony starts.
   - The `advance()` action (Continue button) is **blocked** while the overlay is
     open — the Continue button must not be clickable.

### Verify Final-3 ceremony

After the Part-3 spectator closes:
1. **Coronation animation** — Crown drops onto the Final HOH's name.
2. **Plea overlay** — Both remaining nominees make their pleas.
3. **Eviction** — AI HOH picks deterministically; announcement ChatOverlay plays.
4. Game advances to `week_end` → `jury` phase.

### Verify no authoritative writes

1. Open the Redux DevTools while the spectator overlay is visible.
2. Confirm that only `game/openSpectator` and `game/closeSpectator` are dispatched
   by the SpectatorView component.
3. Confirm that `game.hohId` and winner-related state is set AFTER the spectator
   closes (driven by `advance()` in `handleSpectatorF3Done`).

### Toggle the feature flag

**Disable via env var (build time):**

```bash
VITE_FEATURE_SPECTATOR_REACT=false npm run dev
```

Reach `final3_comp3` as spectator — the overlay must NOT appear; `advance()`
should fire normally.

---

## Non-goals / Safety Constraints

- The SpectatorView **never writes** authoritative winner state (`hohId`,
  `f3Part1WinnerId`, etc.).
- Existing minigame code is untouched; this is purely additive.
- `advance()` guards (`state.spectatorActive`, `state.awaitingFinal3Plea`) are
  the only changes to the game reducer guard block.
- `openSpectator` is deduplicated: no-op if `spectatorActive` is already set.
- Skip is available immediately from mount; no `sequenceComplete` gate.
- The 15 s minimum floor timer has been removed; `revealDelay` is always 1.2 s.
- The human HOH minigame path (`final3_comp3_minigame` → `applyF3MinigameWinner`)
  is unchanged; `awaitingFinal3Eviction` still triggers `TvDecisionModal` for
  that path. `awaitingFinal3Plea` only applies to the Part-3 spectator path.
