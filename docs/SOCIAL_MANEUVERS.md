# Social Maneuvers

The Social Maneuvers subsystem provides the core data and APIs for executing social actions during a Big Brother phase, deducting player resources, computing affinity outcomes, and persisting everything to Redux state.

## Multi-Resource Costs

Actions can cost **energy**, **influence**, and **info** — all tracked separately in Redux:

| Resource | Bank field | Slice reducers |
|---|---|---|
| Energy | `state.social.energyBank` | `setEnergyBankEntry`, `applyEnergyDelta` |
| Influence | `state.social.influenceBank` | `setInfluenceBankEntry`, `applyInfluenceDelta` |
| Info | `state.social.infoBank` | `setInfoBankEntry`, `applyInfoDelta` |

### Cost shape

`baseCost` on a `SocialActionDefinition` can be a plain number (energy only) or a full cost object:

```ts
// Energy-only (backward compatible)
baseCost: 2

// Multi-resource
baseCost: { energy: 1, info: 1 }
baseCost: { energy: 3, influence: 1 }
baseCost: { energy: 2, influence: 1, info: 2 }
```

When `baseCost` is a plain number, influence and info costs default to `0`.

### Yields

Actions may optionally declare `yields` — resources granted to the actor on **successful** execution:

```ts
yields: { influence: 1 }     // earns 1 influence on success
yields: { influence: 1, info: 1 }
```

### `normalizeActionCosts(action)`

Returns the complete `{ energy, influence, info }` cost object for any action:

```ts
import { normalizeActionCosts } from './social/smExecNormalize';

normalizeActionCosts(getActionById('compliment')!);
// → { energy: 1, influence: 0, info: 0 }

normalizeActionCosts(getActionById('proposeAlliance')!);
// → { energy: 3, influence: 1, info: 0 }
```

### `normalizeAuxCost(value, field)`

Extract a single auxiliary cost field (`'influence'` or `'info'`) from a cost value. Returns `0` for plain numbers (energy-only costs) or absent/invalid fields.

---

## Files

| File | Purpose |
|------|---------|
| `src/social/socialActions.ts` | Canonical `SOCIAL_ACTIONS` array with action definitions |
| `src/social/smExecNormalize.ts` | Cost normalization helpers |
| `src/social/SocialEnergyBank.ts` | Per-player energy bank backed by Redux |
| `src/social/SocialManeuvers.ts` | Core API: `getActionById`, `canAfford`, `executeAction`, etc. |
| `src/social/socialSlice.ts` | Redux reducers and selectors for energy, influence, info, logs, relationships |

---

## API Reference

### `getActionById(id: string)`

Returns the `SocialActionDefinition` for the given action id, or `undefined` if not found.

```ts
import { getActionById } from './social/SocialManeuvers';

const act = getActionById('compliment');
// { id: 'compliment', title: 'Compliment', category: 'friendly', baseCost: 1 }
```

### `canAfford(actorId, costs, state?)`

Returns `true` when the actor has sufficient energy, influence **and** info to cover `costs`. Reads from the provided state snapshot, or falls back to the Redux store.

```ts
import { canAfford } from './social/SocialManeuvers';
import { normalizeActionCosts } from './social/smExecNormalize';

const action = getActionById('proposeAlliance')!;
const affordable = canAfford('player1', normalizeActionCosts(action));
// false if player1 has 0 influence
```

### `getAvailableActions(actorId: string, state?)`

Returns all actions the actor can currently afford (all three resources checked).

```ts
import { getAvailableActions } from './social/SocialManeuvers';

const actions = getAvailableActions('player1');
// [ ...actions where all resource costs <= player1 current balances ]
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
```

#### Execution steps

1. Validates action exists and actor can afford all resources (energy + influence + info).
2. Deducts energy, influence, and info from their respective banks.
3. Applies `yields` (influence/info) to the actor on a successful outcome.
4. Dispatches `updateRelationship` and `recordSocialAction`.

#### Returns `ExecuteActionResult`

```ts
interface ExecuteActionResult {
  success: boolean; // false when actor lacks resources or action is unknown
  delta: number;    // affinity delta applied to source→target relationship
  newEnergy: number; // actor's energy after the action
}
```

#### Edge cases

- **Unknown action id** → `{ success: false, delta: 0, newEnergy: <current> }`
- **Insufficient resources** → `{ success: false, delta: 0, newEnergy: <current> }` (no state mutation)
- **Store not initialised** → `{ success: false, delta: 0, newEnergy: 0 }` immediately; no state mutations occur

---

## Session Log Shape

Each entry appended to `state.social.sessionLogs` has the following shape:

```ts
{
  actionId:      string;             // e.g. 'compliment'
  actorId:       string;             // performing player id
  targetId:      string;             // receiving player id
  cost:          number;             // energy deducted (backward-compatible)
  costs:         { energy, influence, info };  // full multi-resource costs
  delta:         number;             // affinity change applied
  outcome:       'success' | 'failure';
  newEnergy:     number;             // actor's energy after deduction (backward-compatible)
  balancesAfter: { energy, influence, info };  // all balances after mutations
  yieldsApplied: { influence?, info? };        // resource yields granted (if any)
  timestamp:     number;             // Date.now() at execution time
}
```

---

## Redux State Shape

The relevant fields in `state.social` (from `SocialState`):

```ts
{
  energyBank:    Record<string, number>;        // playerId → remaining energy
  influenceBank: Record<string, number>;        // playerId → remaining influence
  infoBank:      Record<string, number>;        // playerId → remaining info
  relationships: RelationshipsMap;             // source → target → { affinity, tags }
  sessionLogs:   SocialActionLogEntry[];        // append-only action log
}
```

### Selectors

```ts
import { selectEnergyBank, selectInfluenceBank, selectInfoBank, selectSessionLogs } from './social/socialSlice';

const energy    = useAppSelector(selectEnergyBank);    // Record<string, number>
const influence = useAppSelector(selectInfluenceBank); // Record<string, number>
const info      = useAppSelector(selectInfoBank);      // Record<string, number>
const logs      = useAppSelector(selectSessionLogs);   // SocialActionLogEntry[]
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

// Check full affordability
window.__socialManeuvers.canAfford('player1', { energy: 1, influence: 1, info: 0 });

// Execute a social action
window.__socialManeuvers.executeAction('player1', 'player2', 'compliment');

// Inspect state
window.store.getState().social.energyBank;
window.store.getState().social.influenceBank;
window.store.getState().social.infoBank;
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

---

## Backwards Compatibility

- A plain-number `baseCost` is treated as energy; influence and info default to `0`.
- `normalizeActionCost(action)` (energy-only) is preserved alongside the new `normalizeActionCosts(action)`.
- `SocialActionLogEntry.cost` and `SocialActionLogEntry.newEnergy` are preserved; `costs` and `balancesAfter` are additive new fields.
