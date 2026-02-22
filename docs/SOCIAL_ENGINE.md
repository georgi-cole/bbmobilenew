# Social Engine

The Social Engine is a lightweight port of the BBMobile social engine that manages
budget computation and phase orchestration for the social phases (`social_1` and
`social_2`) of each game week.

## Architecture

```
src/social/
├── SocialEngine.ts      — Core engine (init, startPhase, endPhase, debug helpers)
├── socialConfig.ts      — Budget computation configuration
├── socialMiddleware.ts  — Redux middleware: hooks engine into game phase lifecycle
├── socialSlice.ts       — Redux slice: engineReady, engineComplete, setLastReport
├── constants.ts         — DEFAULT_ENERGY, SOCIAL_INITIAL_STATE
├── types.ts             — SocialState, SocialPhaseReport, SocialEnergyBank, …
└── index.ts             — Public re-exports
```

## Lifecycle

1. **App bootstrap** (`src/main.tsx`): `SocialEngine.init(store)` — passes the
   Redux store so the engine can dispatch actions and read state.

2. **Phase start** (`social_1` or `social_2`): `socialMiddleware` intercepts
   `game/setPhase`, `game/forcePhase`, or `game/advance` and calls
   `SocialEngine.startPhase(phaseName)`.
   - Computes a deterministic energy budget for each active AI player using a
     linear-congruential PRNG seeded by `state.game.seed`.
   - Dispatches `social/engineReady` with the computed budgets, which are stored
     in `state.social.energyBank`.

3. **Phase end** (when leaving a social phase): `socialMiddleware` calls
   `SocialEngine.endPhase(phaseName)`.
   - Generates a `SocialPhaseReport` summarizing the phase.
   - Dispatches `social/engineComplete` (signal) and `social/setLastReport`
     (persists the report into `state.social.lastReport`).

## Redux State

All social engine state lives under `state.social` (type `SocialState`):

| Field | Type | Description |
|---|---|---|
| `energyBank` | `Record<string, number>` | Per-player energy budgets set at phase start |
| `lastReport` | `SocialPhaseReport \| null` | Report from the most recent social phase |
| `relationships` | `RelationshipsMap` | Player relationship graph (future PRs) |
| `sessionLogs` | `unknown[]` | Raw event log (future PRs) |

## Selectors

```ts
import { selectSocialBudgets, selectLastSocialReport } from './social/socialSlice';

// In a component or thunk:
const budgets = selectSocialBudgets(store.getState());
const report  = selectLastSocialReport(store.getState());
```

## Debug APIs

When the app runs in development mode the Redux store is attached to `window.store`.
You can use the browser DevTools console to inspect and trigger the engine:

```js
// Manually trigger a social phase (e.g. from the DebugPanel):
window.store.dispatch({ type: 'game/setPhase', payload: 'social_1' });

// Read current budgets:
SocialEngine.getBudgets();
// → { "hg-1": 7, "hg-2": 6, ... }

// Read the last phase report:
SocialEngine.getLastReport();
// → { id: "social_1_w3_...", week: 3, summary: "...", players: [...], timestamp: ... }

// Check whether a phase is currently active:
SocialEngine.isPhaseActive();
// → true | false
```

Note: `SocialEngine` is not currently exposed on `window` but can be imported
directly in any module via `import { SocialEngine } from './social/SocialEngine'`.

## Configuration

`src/social/socialConfig.ts` controls budget computation:

| Key | Default | Description |
|---|---|---|
| `targetSpendPctRange` | `[0.5, 0.9]` | Fraction of DEFAULT_ENERGY to spend |
| `minActionsPerPlayer` | `1` | Minimum social actions per AI player |
| `maxActionsPerPlayer` | `4` | Maximum social actions per AI player |

`DEFAULT_ENERGY` (= `5`) is defined in `src/social/constants.ts`.

## Future Work

- Detailed AI decision loops (choosing targets, maneuver types) — later PRs.
- Relationship graph updates based on phase actions.
- Session log population with typed `SocialEvent` entries.
