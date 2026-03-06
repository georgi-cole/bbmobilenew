# Hold the Wall — Minigame Documentation

## Overview

**Hold the Wall** is a fully React + Redux-implemented endurance minigame in `bbmobilenew`. Players press and hold a wall panel; the last player standing wins the competition prize (HOH or POV).

This implementation replaces the legacy JavaScript bundle (`src/minigames/legacy/hold-wall.js`) that previously caused duplicate countdowns, duplicate rules displays, and missing houseguest logic.

---

## Architecture

### Server-authoritative design

All game-state transitions are driven by the Redux store (`holdTheWallSlice`), not by independent client-side timers. The single 3-second countdown is provided by `MinigameHost` **before** `HoldTheWallComp` mounts — the component itself has no countdown logic.

### File layout

```
src/
  features/holdTheWall/
    holdTheWallSlice.ts   — Redux state machine (idle → active → complete)
    thunks.ts             — resolveHoldTheWallOutcome (prize awarding, idempotent)
  components/HoldTheWallComp/
    HoldTheWallComp.tsx   — React UI component
    HoldTheWallComp.css   — Styles
tests/
  unit/hold-the-wall/
    holdTheWallSlice.test.ts   — 21 unit tests for the slice
  minigameHost.holdWall.test.tsx — 2 routing smoke tests for MinigameHost
src/games/hold-the-wall/
  README.md               — This file
```

### State machine

```
idle ──startHoldTheWall──▶ active ──(one player remains)──▶ complete
```

- `idle`: initial / reset state
- `active`: competition running; human holds the wall, AI drop timeouts are scheduled
- `complete`: winner determined; `resolveHoldTheWallOutcome` thunk awards prize once

### Key Redux actions

| Action | Description |
|---|---|
| `startHoldTheWall({ participantIds, humanId, prizeType, seed })` | Initialise competition, compute AI drop schedule |
| `dropPlayer(playerId)` | Mark a player as dropped; transitions to `complete` when only 1 remains |
| `markHoldTheWallOutcomeResolved()` | Idempotency guard — prevents double prize dispatch |
| `resetHoldTheWall()` | Return to `idle` (cleanup on unmount) |

---

## Game mechanics

### Human player
- Tap/click and **hold** the wall panel to stay in.
- Releasing (pointer up / pointer leave) immediately calls `dropPlayer(humanId)`.

### AI houseguests
- Each AI is assigned a personal drop time in `[AI_DROP_MIN_MS, AI_DROP_MAX_MS)` (default 10 s – 120 s) computed deterministically from the competition `seed` using the `mulberry32` PRNG.
- `HoldTheWallComp` schedules one `setTimeout` per AI on mount. When the timer fires it dispatches `dropPlayer(aiId)`.
- Because drop times are seeded, the same seed always produces the same AI behavior — useful for replaying or testing a specific game run.

### Win condition
- The last player (human or AI) who has not dropped wins.
- `dropPlayer` automatically transitions `status → complete` and sets `winnerId` when `participantIds.length - droppedIds.length === 1`.

### Prize awarding
`resolveHoldTheWallOutcome` (thunk) is dispatched once `status === complete`. It validates the current game phase matches the `prizeType` (`hoh_comp` for HOH, `pov_comp` for POV) and calls `applyMinigameWinner(winnerId)`. The `outcomeResolved` flag prevents double dispatch even if the component re-renders.

---

## Configuration flags

| Constant | Default | Description |
|---|---|---|
| `AI_DROP_MIN_MS` | 10 000 ms | Minimum time before any AI drops |
| `AI_DROP_MAX_MS` | 120 000 ms | Maximum time before any AI drops |

Both constants are exported from `holdTheWallSlice.ts` and can be adjusted for difficulty tuning. The default range (10 s – 2 min) is consistent with the original legacy implementation.

---

## Registry entry

```typescript
// src/minigames/registry.ts
holdWall: {
  key: 'holdWall',
  title: 'Hold the Wall',
  implementation: 'react',
  reactComponentKey: 'HoldTheWall',
  authoritative: true,
  scoringAdapter: 'authoritative',
  legacy: false,
  // …
}
```

The `reactComponentKey: 'HoldTheWall'` value is matched in `MinigameHost` to render `HoldTheWallComp`.

---

## Legacy removal

The legacy bundle `src/minigames/legacy/hold-wall.js` is no longer registered or executed. The registry entry that previously pointed to it (`modulePath: 'hold-wall.js'`, `legacy: true`) has been replaced with the React entry above. The legacy file is retained in `src/minigames/legacy/` as a historical reference only; it is never imported or loaded by the current codebase.

**Issues fixed by this replacement:**
- ✅ Single server-driven countdown (from `MinigameHost`, not the game itself)
- ✅ Single rules display (from `MinigameHost MinigameRules`, not the game)
- ✅ Houseguests (all `participantIds` passed from `MinigameHost`) displayed correctly
- ✅ Prize awarded exactly once via `resolveHoldTheWallOutcome` idempotency guard
- ✅ Deterministic AI behavior (seeded RNG, no `Math.random()`)

---

## Rollback instructions

If you need to temporarily revert to the legacy implementation:

1. In `src/minigames/registry.ts`, change the `holdWall` entry back to:
   ```typescript
   holdWall: {
     key: 'holdWall',
     title: 'Hold Wall',
     implementation: undefined,  // or remove the field
     reactComponentKey: undefined,
     modulePath: 'hold-wall.js',
     authoritative: false,
     scoringAdapter: 'raw',
     legacy: true,
     // …
   }
   ```
2. Remove the `HoldTheWall` branch from `MinigameHost.tsx`.
3. The legacy JS bundle at `src/minigames/legacy/hold-wall.js` is still present and will be picked up by `LegacyMinigameWrapper`.

> **Note:** Rollback restores the duplicate-countdown and duplicate-rules bugs. It is recommended only as a temporary measure pending a hotfix.

---

## Running tests

```bash
# Unit tests for the slice only
npx vitest run tests/unit/hold-the-wall/holdTheWallSlice.test.ts

# MinigameHost routing smoke tests
npx vitest run tests/minigameHost.holdWall.test.tsx

# Full test suite
npm test
```
