# Social Maneuvers

The Social Maneuvers subsystem provides the core data and APIs for executing social actions during a Big Brother phase, deducting player energy, computing affinity outcomes, and persisting everything to Redux state.

## Files

| File | Purpose |
|------|---------|
| `src/social/socialActions.ts` | Canonical `SOCIAL_ACTIONS` array with action definitions |
| `src/social/smExecNormalize.ts` | Cost normalization helpers |
| `src/social/SocialEnergyBank.ts` | Per-player energy bank backed by Redux |
| `src/social/SocialManeuvers.ts` | Core API: `getActionById`, `executeAction`, etc. |
| `src/social/socialSlice.ts` | Redux reducers and selectors for energy, logs, relationships |

---

## API Reference

### `getActionById(id: string)`

Returns the `SocialActionDefinition` for the given action id, or `undefined` if not found.

```ts
import { getActionById } from './social/SocialManeuvers';

const act = getActionById('compliment');
// { id: 'compliment', title: 'Compliment', category: 'friendly', baseCost: 1 }
```

### `getAvailableActions(actorId: string, state?)`

Returns all actions the actor can currently afford (energy ≥ action cost).

```ts
import { getAvailableActions } from './social/SocialManeuvers';

const actions = getAvailableActions('player1');
// [ ...actions where baseCost <= player1 current energy ]
```

### `computeActionCost(actorId, action, targetId, state?)`

Returns the normalised energy cost for the actor to perform the action. Trait modifiers are stubbed for future expansion.

### `executeAction(actorId, targetId, actionId, options?)`

Main entry point for performing a social action. Synchronous and deterministic.

```ts
import { executeAction } from './social/SocialManeuvers';

const result = executeAction('player1', 'player2', 'compliment');
// { success: true, delta: 0, newEnergy: 4 }

// Force a failure outcome:
const result2 = executeAction('player1', 'player2', 'rumor', { outcome: 'failure' });
// { success: true, delta: 0, newEnergy: 2 }
```

#### Returns `ExecuteActionResult`

```ts
interface ExecuteActionResult {
  success: boolean; // false when actor lacks energy or action is unknown
  delta: number;    // affinity delta applied to source→target relationship
  newEnergy: number; // actor's energy after the action
}
```

#### Edge cases

- **Unknown action id** → `{ success: false, delta: 0, newEnergy: <current> }`
- **Insufficient energy** → `{ success: false, delta: 0, newEnergy: <current> }` (no state mutation)
- **Store not initialised** → `{ success: false, delta: 0, newEnergy: 0 }` immediately; no state mutations occur

---

## Session Log Shape

Each entry appended to `state.social.sessionLogs` has the following shape:

```ts
{
  actionId:  string;             // e.g. 'compliment'
  actorId:   string;             // performing player id
  targetId:  string;             // receiving player id
  cost:      number;             // energy deducted
  delta:     number;             // affinity change applied
  outcome:   'success' | 'failure';
  newEnergy: number;             // actor's energy after deduction
  timestamp: number;             // Date.now() at execution time
}
```

---

## Redux State Shape

The relevant fields in `state.social` (from `SocialState`):

```ts
{
  energyBank:   Record<string, number>;        // playerId → remaining energy
  relationships: RelationshipsMap;             // source → target → { affinity, tags }
  sessionLogs:  SocialActionLogEntry[];        // append-only action log
}
```

### Selectors

```ts
import { selectEnergyBank, selectSessionLogs } from './social/socialSlice';

const energy = useAppSelector(selectEnergyBank);    // Record<string, number>
const logs   = useAppSelector(selectSessionLogs);   // SocialActionLogEntry[]
```

---

## Debug Examples

When the dev server is running (`npm run dev`) the store is exposed as `window.store` and the maneuvers helpers are exposed as `window.__socialManeuvers`.

```js
// In the browser DevTools console:

// Look up an action
window.__socialManeuvers.getActionById('compliment');

// Check what actions a player can currently afford
window.__socialManeuvers.getAvailableActions('player1');

// Compute cost for a specific action
window.__socialManeuvers.computeActionCost('player1', window.__socialManeuvers.getActionById('ally'), 'player2');

// Execute a social action
window.__socialManeuvers.executeAction('player1', 'player2', 'compliment');

// Inspect state
window.store.getState().social.energyBank;
window.store.getState().social.sessionLogs;
window.store.getState().social.relationships;
```

---

## Initialisation

`SocialManeuvers` is initialised automatically when `SocialEngine.init(store)` is called at app bootstrap (`src/main.tsx`). You do not need to call `initManeuvers` manually in production code.

For tests, initialise directly:

```ts
import { configureStore } from '@reduxjs/toolkit';
import socialReducer from '../../src/social/socialSlice';
import { initManeuvers } from '../../src/social/SocialManeuvers';

const store = configureStore({ reducer: { social: socialReducer } });
initManeuvers(store);
```
