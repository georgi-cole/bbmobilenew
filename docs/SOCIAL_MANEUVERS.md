# Social Maneuvers

The Social Maneuvers subsystem provides the core data and APIs for executing social actions during a Big Brother phase, deducting player resources, computing affinity outcomes, and persisting everything to Redux state.

## Multi-Resource Costs

Actions can cost **energy**, **influence**, and **info** — all tracked separately in Redux:

| Resource | Bank field | Slice reducers |
|---|---|---|
| Energy | `state.social.energyBank` | `setEnergyBankEntry`, `applyEnergyDelta` |
| Influence | `state.social.influenceBank` | `setInfluenceBankEntry`, `applyInfluenceDelta` |
| Info | `state.social.infoBank` | `setInfoBankEntry`, `applyInfoDelta` |

## Integer-Point Scale

Influence and Info are stored as **integer points scaled by 100** (i.e. 1.00 influence == 100 pts).  
Action definitions use **fractional floats for readability**; conversion to integer points happens at runtime via `normalizeActionCosts` and `normalizeActionYields`.

| Human-readable | Integer pts |
|---|---|
| 1.00 influence | 100 |
| 5.00 influence | 500 |
| 0.02 influence | 2 |
| 2.00 info | 200 |

### Cost shape

`baseCost` on a `SocialActionDefinition` can be a plain number (energy only) or a full cost object using float values:

```ts
// Energy-only (backward compatible)
baseCost: 2

// Multi-resource (float values → converted to integer pts at runtime)
baseCost: { energy: 1, info: 1.0 }      // info cost = 100 pts
baseCost: { energy: 3, info: 2.0 }      // info cost = 200 pts
baseCost: { energy: 2, influence: 5.0 } // influence cost = 500 pts
```

When `baseCost` is a plain number, influence and info costs default to `0`.

### Yields

Actions may optionally declare `yields` — resources granted to the actor on **successful** execution.  
Float values are converted to integer points at runtime:

```ts
yields: { influence: 0.02 }    // earns 2 pts influence on success
yields: { info: 1.0 }          // earns 100 pts info on success
yields: { influence: 0.06 }    // earns 6 pts influence on success
```

## Action Catalog

| Action | Energy | Influence cost | Info cost | Yields (on success) | Notes |
|---|---|---|---|---|---|
| `compliment` | 1 | — | — | influence +2 pts | Friendly; no resource cost beyond energy |
| `whisper` | 1 | — | — | info +100 pts | Gives info, costs only energy |
| `observe` | 1 | — | — | info +100 pts | Targetless; watch and listen |
| `proposeAlliance` | 3 | — | 200 pts | influence +6 pts | Tags relationship 'alliance' |
| `group_chat` | 2 | — | — | influence +3 pts | Targetless; broad goodwill |
| `vote_rally` | 2 | 500 pts | — | influence +4 pts | Requires high influence |
| `favor_request` | 1 | 200 pts | — | influence +3 pts | Call in a favour |
| `rumor` | 2 | — | 100 pts | influence +5 pts | Tags 'rumor'; aggressive |
| `startFight` | 3 | — | — | influence +4 pts | Tags 'conflict'; aggressive |
| `betray` | 3 | — | — | influence +4 pts | Tags 'betrayal'; aggressive |
| `ally` | 3 | — | — | — | Tags 'alliance' |
| `protect` | 2 | — | — | — | Friendly |
| `nominate` | 1 | — | — | — | Strategic |
| `idle` | 0 | — | — | — | Targetless; costs nothing |

## Event Deltas

The `socialMiddleware` wires game events to resource deltas automatically:

| Event | Triggered by | Delta |
|---|---|---|
| HOH win | phase → hoh_results; completeMinigame/applyMinigameWinner during hoh_comp | +5 energy to winner |
| POV win | phase → pov_results; completeMinigame/applyMinigameWinner during pov_comp | +3 energy to winner |
| Survived nomination | advance() → live_vote | +4 energy to nominees still on block |
| New alliance formed | `social/updateRelationship` with 'alliance' tag | +2 energy + 200 influence to both parties |
| Saved by POV | advance() removes player from nomineeIds | +2 energy to saved player |
| Competition skipped | `game/skipMinigame` | -3 energy to all alive players |
| Zero score (minigame) | `game/completeMinigame` with human score = 0 | -2 energy to human player |
| Broke alliance | `social/updateRelationship` with 'betrayal' tag | -3 energy to actor |

## Diary Room Only

Social summaries are posted exclusively to the Diary Room via `game/addSocialSummary` (tvFeed entries with `type: 'diary'`).  
The main TV feed does **not** receive social summary events; `GameScreen` no longer dispatches `addTvEvent` when a social report is available.

---

## `normalizeActionCosts(action)`

Returns the complete `{ energy, influence, info }` cost object for any action, with influence/info as integer points scaled by ×100:

```ts
import { normalizeActionCosts } from './social/smExecNormalize';

normalizeActionCosts(getActionById('compliment')!);
// → { energy: 1, influence: 0, info: 0 }

normalizeActionCosts(getActionById('proposeAlliance')!);
// → { energy: 3, influence: 0, info: 200 }

normalizeActionCosts(getActionById('vote_rally')!);
// → { energy: 2, influence: 500, info: 0 }
```

## `normalizeActionYields(action)`

Returns the `{ influence, info }` yields for an action as integer points scaled by ×100:

```ts
import { normalizeActionYields } from './social/smExecNormalize';

normalizeActionYields(getActionById('compliment')!);
// → { influence: 2, info: 0 }

normalizeActionYields(getActionById('whisper')!);
// → { influence: 0, info: 100 }
```

## `normalizeAuxCost(value, field)`

Extract a single auxiliary cost field (`'influence'` or `'info'`) **as the raw float value** from a cost value.  
Returns `0` for plain numbers (energy-only costs) or absent/invalid fields.  
`normalizeActionCosts` applies the ×100 scaling on top of this.

---

## Files

| File | Purpose |
|------|---------|
| `src/social/socialActions.ts` | Canonical `SOCIAL_ACTIONS` array with action definitions |
| `src/social/smExecNormalize.ts` | Cost/yield normalization helpers (including ×100 scaling) |
| `src/social/SocialEnergyBank.ts` | Per-player energy bank backed by Redux |
| `src/social/SocialManeuvers.ts` | Core API: `getActionById`, `canAfford`, `executeAction`, etc. |
| `src/social/socialSlice.ts` | Redux reducers and selectors for energy, influence, info, logs, relationships |
| `src/social/socialMiddleware.ts` | Phase lifecycle + event delta dispatching |

---

## API Reference

### `getActionById(id: string)`

Returns the `SocialActionDefinition` for the given action id, or `undefined` if not found.

### `canAfford(actorId, costs, state?)`

Returns `true` when the actor has sufficient energy, influence **and** info to cover `costs`. Reads from the provided state snapshot, or falls back to the Redux store.

```ts
import { canAfford } from './social/SocialManeuvers';
import { normalizeActionCosts } from './social/smExecNormalize';

const action = getActionById('proposeAlliance')!;
const affordable = canAfford('player1', normalizeActionCosts(action));
// false if player1 has < 200 info
```

### `getAvailableActions(actorId: string, state?)`

Returns all actions the actor can currently afford (all three resources checked).

### `executeAction(actorId, targetId, actionId, options?)`

Main entry point for performing a social action. Synchronous and deterministic.

#### Execution steps

1. Validates action exists and actor can afford all resources (energy + influence + info).
2. Deducts energy, influence, and info from their respective banks.
3. Applies `yields` (influence/info, scaled to integer pts) to the actor on a successful outcome.
4. Dispatches `updateRelationship` and `recordSocialAction`.

#### Returns `ExecuteActionResult`

```ts
interface ExecuteActionResult {
  success: boolean;   // false when actor lacks resources or action is unknown
  delta: number;      // affinity delta applied to source→target relationship
  newEnergy: number;  // actor's energy after the action
  summary: string;    // human-readable outcome string
}
```

---

## Session Log Shape

```ts
{
  actionId:      string;
  actorId:       string;
  targetId:      string;
  cost:          number;                        // energy deducted (backward-compatible)
  costs:         { energy, influence, info };   // full multi-resource costs (integer pts)
  delta:         number;
  outcome:       'success' | 'failure';
  newEnergy:     number;
  balancesAfter: { energy, influence, info };   // all balances after mutations
  yieldsApplied: { influence?, info? };         // integer pt yields granted (if any)
  timestamp:     number;
}
```

---

## Redux State Shape

```ts
{
  energyBank:    Record<string, number>;   // playerId → energy
  influenceBank: Record<string, number>;   // playerId → influence (integer pts)
  infoBank:      Record<string, number>;   // playerId → info (integer pts)
  relationships: RelationshipsMap;
  sessionLogs:   SocialActionLogEntry[];
}
```

---

## Backwards Compatibility

- A plain-number `baseCost` is treated as energy; influence and info default to `0`.
- `normalizeActionCost(action)` (energy-only) is preserved alongside `normalizeActionCosts`.
- `SocialActionLogEntry.cost` and `SocialActionLogEntry.newEnergy` are preserved.


Actions can cost **energy**, **influence**, and **info** — all tracked separately in Redux:

| Resource | Bank field | Slice reducers |
|---|---|---|
| Energy | `state.social.energyBank` | `setEnergyBankEntry`, `applyEnergyDelta` |
| Influence | `state.social.influenceBank` | `setInfluenceBankEntry`, `applyInfluenceDelta` |
| Info | `state.social.infoBank` | `setInfoBankEntry`, `applyInfoDelta` |

### Cost shape
