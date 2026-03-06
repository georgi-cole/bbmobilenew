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
    HoldTheWallComp.tsx   — React UI component (hourglass + expanded brick wall)
    HoldTheWallComp.css   — Styles (brick background, expanded wall layout)
  ui/games/HoldTheWall/
    Hourglass.tsx         — CSS-animated hourglass timer component
    Hourglass.css         — Sand-flow and flip animations
    effects/
      EffectsScheduler.ts — Deterministic randomised effect scheduler
      EffectsOverlay.tsx  — Visual overlay for active distraction effects
      effects.css         — Effect overlay styles
    hooks/
      useHoldTheWallEffects.ts — React hook consuming controller events
tests/
  unit/hold-the-wall/
    holdTheWallSlice.test.ts             — 21 unit tests for the slice
    GameController.holdTimeout.test.ts   — 12 tests for 2-second rule + effects
    GameController.effectsScheduler.test.ts — 11 tests for EffectsScheduler
  unit/ui/hold-the-wall/
    effects.hook.test.ts  — useHoldTheWallEffects hook tests
    Hourglass.test.tsx    — Hourglass component tests
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

# GameController hold-timeout tests (2-second rule + effect events)
npx vitest run tests/unit/hold-the-wall/GameController.holdTimeout.test.ts

# EffectsScheduler tests (deterministic scheduling, intensity, conflict avoidance)
npx vitest run tests/unit/hold-the-wall/GameController.effectsScheduler.test.ts

# Hourglass component tests
npx vitest run tests/unit/ui/hold-the-wall/Hourglass.test.tsx

# useHoldTheWallEffects hook tests
npx vitest run tests/unit/ui/hold-the-wall/effects.hook.test.ts

# MinigameHost routing smoke tests
npx vitest run tests/minigameHost.holdWall.test.tsx

# Full test suite
npm test
```

---

## Distraction Effects

Hold the Wall supports a set of optional distraction effects. Effects can be triggered **manually** by production ops (via `emitEffectStart`/`emitEffectStop`) or **automatically** by the client-side `EffectsScheduler` during an active round.

### Effect types

| effectType  | Description |
|---|---|
| `vibrate`  | Triggers `navigator.vibrate` to simulate device shaking. Respects availability (no-op if unsupported). |
| `rain`     | Animated raindrop particle overlay rendered on top of the game UI. |
| `wind`     | Horizontal gust lines + subtle lateral sway applied to alive participant avatars. |
| `paint`    | Paint-spill animation sliding down from the top of the screen with drip particles. |
| `fakeCall` | Fake iPhone incoming-call modal overlay (visually distracting; non-blocking for game input). Caller name is configurable. |
| `sound`    | Reserved for audio playback hooks (e.g. Howler). No visual representation. |

### Event payloads

```typescript
// EFFECT_START
{
  gameId: string;      // the game session id
  effectType: EffectType;
  params: {
    // vibrate
    pattern?: number[];          // Vibration on/off pattern in ms. Default: [150,80,150,80,150]

    // rain
    intensity?: number;          // 0.5–2.0 multiplier for drop density. Default: 1

    // fakeCall
    caller?: string;             // Caller name shown in the overlay. Default: "Unknown"

    // (other effects accept no params currently)
    [key: string]: unknown;
  };
}

// EFFECT_STOP
{
  gameId: string;
  effectType: EffectType;
}
```

### How production can trigger effects manually

```typescript
import { HoldTheWallGameController } from 'src/games/hold-the-wall/GameController';

// Obtain (or create) the controller for the running game session.
const ctrl = new HoldTheWallGameController(gameId);

// Start rain effect with heavy intensity
ctrl.emitEffectStart('rain', { intensity: 1.8 });

// Start vibration with a custom pattern
ctrl.emitEffectStart('vibrate', { pattern: [300, 100, 300] });

// Show a fake incoming call from "Julie Chen"
ctrl.emitEffectStart('fakeCall', { caller: 'Julie Chen' });

// Stop effects
ctrl.emitEffectStop('rain');
ctrl.emitEffectStop('fakeCall');
```

In a Socket.IO environment, forward `emitEffectStart` / `emitEffectStop` calls over the
game's realtime channel by listening to the controller's `EFFECT_START` / `EFFECT_STOP` events
and publishing them to connected clients.

### Automatic randomised effects (EffectsScheduler)

When `HoldTheWallComp` enters the `active` state it creates an `EffectsScheduler` that
automatically fires distraction effects at random points during the round.

#### Scheduling config

| Parameter | Type | Default | Description |
|---|---|---|---|
| `seed` | `number` | `Date.now()` | PRNG seed.  Same seed → same effect timeline (deterministic for tests). |
| `intensity` | `number` | `1` | Probability multiplier.  `0` = no auto-effects, `2` = double probability. |
| `roundDurationMs` | `number` | `120 000` | Expected round length used to space effects across the window. |

#### How to pass seed/intensity

```typescript
// Deterministic (e.g., for a test / replay):
const ctrl = new HoldTheWallGameController('game-abc', { seed: 12345, intensity: 1 });

// Or create the scheduler directly:
import { EffectsScheduler } from 'src/ui/games/HoldTheWall/effects/EffectsScheduler';
const scheduler = new EffectsScheduler(ctrl, /* seed */ 12345, /* intensity */ 1.5);
scheduler.start();   // call when round becomes active
scheduler.stop();    // call on cleanup
scheduler.destroy(); // call to also unsubscribe from controller events
```

#### Conflict avoidance

The scheduler subscribes to the controller's `EFFECT_START` / `EFFECT_STOP` events so it
always knows which effects are currently active.  If an effect is already active when the
scheduler's timer fires (because production triggered it manually), the scheduler silently
skips scheduling that effect type.

### Client integration

The client hook `useHoldTheWallEffects` (at
`src/ui/games/HoldTheWall/hooks/useHoldTheWallEffects.ts`) automatically subscribes to the
controller events and returns `{ activeEffects, isAutoDropped }`. The `EffectsOverlay` component
(at `src/ui/games/HoldTheWall/effects/EffectsOverlay.tsx`) consumes `activeEffects` and renders
the appropriate visual layers. Both are integrated into `HoldTheWallComp`.

---

## First-2-seconds auto-drop rule

If the human player does not initiate a hold action (press the wall button) within the first
**2 000 ms** of `ACTIVE_ROUND` start, the `HoldTheWallGameController` automatically emits
`PLAYER_ELIMINATED` with `reason: 'no_initial_hold'`. The component listens for this event
and dispatches `dropPlayer(humanId)` so the Redux store reflects the authoritative result.

A visual banner (`htw-auto-drop-banner`) and inline notice (`htw-auto-drop-notice`) are shown
to the eliminated player so they understand why they were dropped.

The deadline can be overridden for testing:

```typescript
ctrl.startRound(humanId, 5000); // 5-second window instead of 2 seconds
```

`INITIAL_HOLD_DEADLINE_MS` (= `2000`) is exported from `GameController.ts` for reference in tests.

---

## Hourglass UI

The numeric `elapsedMs` timer has been replaced with a CSS-animated `Hourglass` component
(`src/ui/games/HoldTheWall/Hourglass.tsx`).

### Behaviour

- Sand drains from the top chamber to the bottom chamber over `cycleDurationMs` (default **7 s**).
- When the top is empty the hourglass flips 180° and the cycle repeats — the animation loops
  indefinitely while the round is active.
- No precise elapsed time is shown; users can see progress within a cycle but cannot infer
  the exact number of seconds played.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `cycleDurationMs` | `number` | `7000` | Duration (ms) of one sand-drain cycle. |
| `running` | `boolean` | `true` | When `false` the CSS animation is paused. |
| `roundKey` | `string \| number` | — | Change this value to force a React remount and restart the animation from the beginning. |

### Animation restart on new round

`HoldTheWallComp` passes a `roundKey` derived from a counter that increments each time
`htw.status` transitions to `active`, ensuring the hourglass resets at the start of every
new round.

---

## Wall UI

The wall panel (`htw-wall--expanded`) now fills the remaining viewport height below the
participant area:

- Width: 100% of the container (up to 540 px).
- Height: grows to fill remaining space (`flex: 1`), minimum 180 px.
- Visual: **brick-wall pattern** implemented with three stacked CSS `repeating-linear-gradient`
  layers on a terracotta base colour (`#8b3a22`).  The pattern tiles staggered mortar lines
  to simulate alternating brick rows.
- On mobile the wall takes up most of the screen, giving players a large tap target to hold.
- The `EffectsOverlay` sits above the wall with `pointer-events: none` so visual effects
  never block the hold interaction.

