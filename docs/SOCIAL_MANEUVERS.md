# Social Maneuvers

The Social Maneuvers subsystem provides the core data and APIs for executing social actions during a Big Brother phase, deducting player resources, computing affinity outcomes, and persisting everything to Redux state.

## Resource Roles

The social economy uses three distinct **banked resources** and a separate **relationship state**.

### Banked resources

| Resource  | Bank field                  | Slice reducers                               | Role |
|-----------|-----------------------------|----------------------------------------------|------|
| Energy    | `state.social.energyBank`   | `setEnergyBankEntry`, `applyEnergyDelta`     | Action stamina — always spent to perform any social action. |
| Influence | `state.social.influenceBank`| `setInfluenceBankEntry`, `applyInfluenceDelta`| Social/political capital — earned from rapport actions; spent on political-leverage actions. |
| Info      | `state.social.infoBank`     | `setInfoBankEntry`, `applyInfoDelta`          | Intelligence capital — earned by observing/whispering; spent on intel-sensitive actions. |

### Relationship state (not a spendable resource)

`affinity`, `trust`, `resentment`, and relationship **tags** (`alliance`, `betrayal`, `target`, etc.) live in `state.social.relationships` and are managed by `updateRelationship`.  They are **not** currencies — they drive AI targeting, veto bias, nomination preference, and outcome modifiers.  Banked resources and relationship state are intentionally separate.

## Multi-Resource Costs

Actions can cost **energy**, **influence**, and **info** — all tracked separately in Redux (see table above).

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

## Action Kind

Each action has an optional `kind` field that declares its role in the resource economy.  The `kind` is informational metadata — it does not gate execution, but documents the intended cost/yield contract.

| Kind            | Primary cost       | Primary yield      | Purpose |
|-----------------|--------------------|--------------------|---------|
| `rapport`       | energy             | influence (small)  | Build goodwill / improve relationship state |
| `intel_gain`    | energy             | info               | Observe, eavesdrop, gather intelligence |
| `intel_spend`   | energy + info      | influence          | Convert intel into social leverage (info → influence) |
| `political_spend`| energy + influence| influence / tags   | Spend capital on board position |
| `aggressive`    | energy             | influence / tags   | Disrupt, damage, or escalate |

> **Design rule:** an action should not both *cost* and *yield* the same resource unless the conversion is intentional and documented.

## Action Catalog

| Action | Kind | Energy | Influence cost | Info cost | Yields (on success) | Notes |
|---|---|---|---|---|---|---|
| `compliment` | rapport | 1 | — | — | influence +2 pts | Friendly; no resource cost beyond energy |
| `whisper` | intel_gain | 1 | — | — | info +100 pts | Gives info, costs only energy |
| `observe` | intel_gain | 1 | — | — | info +100 pts | Targetless; watch and listen |
| `proposeAlliance` | political_spend | 3 | — | 200 pts | influence +6 pts | Tags relationship 'alliance' |
| `group_chat` | rapport | 2 | — | — | influence +3 pts | Targetless; broad goodwill |
| `share_intel` | intel_spend | 1 | — | 200 pts | influence +6 pts | Converts info → influence; no info refund |
| `pitch_target` | political_spend | 2 | 100 pts | 100 pts | influence +4 pts | LOH only; primaryPlusSubject |
| `suggest_replacement` | political_spend | 2 | 100 pts | 100 pts | influence +4 pts | LOH/POS only; primaryPlusSubject |
| `vote_rally` | political_spend | 2 | 500 pts | — | influence +4 pts | Requires high influence |
| `favor_request` | political_spend | 1 | 200 pts | — | influence +3 pts | Requires 200 influence |
| `rally_votes_against` | political_spend | 2 | 200 pts | — | influence +3 pts | Requires nominees on the block |
| `warn_about_player` | intel_spend | 1 | — | 100 pts | influence +2 pts | Converts info → influence; no info refund |
| `rumor` | aggressive | 2 | — | 100 pts | influence +5 pts | Tags 'rumor'; aggressive |
| `startFight` | aggressive | 3 | — | — | influence +4 pts | Tags 'conflict'; aggressive |
| `betray` | aggressive | 3 | — | — | influence +4 pts | Tags 'betrayal'; aggressive |
| `ally` | rapport | 3 | — | — | — | Tags 'alliance'; AI only; energy-only cost (no influence required) |
| `protect` | rapport | 2 | — | — | — | Friendly |
| `nominate` | political_spend | 1 | — | — | — | Strategic; AI only |
| `idle` | — | 0 | — | — | — | Targetless; costs nothing; no-op |

## Event Deltas

The `socialMiddleware` wires game events to resource deltas automatically:

| Event | Triggered by | Delta |
|---|---|---|
| LOH win | phase → loh_results; completeMinigame/applyMinigameWinner during loh_comp | +5 energy to winner |
| POS win | phase → pos_results; completeMinigame/applyMinigameWinner during pos_comp | +3 energy to winner |
| Survived nomination | advance() → live_vote | +4 energy to nominees still on block |
| New alliance formed | `social/updateRelationship` with 'alliance' tag | +2 energy + 200 influence to both parties |
| Saved by POS | advance() removes player from nomineeIds | +2 energy to saved player |
| Competition skipped | `game/skipMinigame` | -3 energy to all alive players |
| Zero score (minigame) | `game/completeMinigame` with human score = 0 | -2 energy to human player |
| Broke alliance | `social/updateRelationship` with 'betrayal' tag | -3 energy to actor |

## Diary Room Only

Social summaries are posted exclusively to the Diary Room via `game/addSocialSummary` (tvFeed entries with `type: 'diary'`).  
The main TV feed does **not** receive social summary events; `GameScreen` no longer dispatches `addTvEvent` when a social report is available.

---

## `normalizeActionCosts(action)`

Returns the complete `{ energy, influence, info }` cost object for any action.

- `influence` costs are **denominated** to ×10 (`2.0 → 20`)
- `info` costs remain in the legacy ×100 bank-point scale (`2.0 → 200`)

```ts
import { normalizeActionCosts } from './social/smExecNormalize';

normalizeActionCosts(getActionById('compliment')!);
// → { energy: 1, influence: 0, info: 0 }

normalizeActionCosts(getActionById('proposeAlliance')!);
// → { energy: 3, influence: 0, info: 200 }

normalizeActionCosts(getActionById('vote_rally')!);
// → { energy: 2, influence: 50, info: 0 }
```

## `normalizeActionYields(action)`

Returns the `{ influence, info }` yields for an action as integer points scaled by the legacy ×100 bank-point scale:

```ts
import { normalizeActionYields } from './social/smExecNormalize';

normalizeActionYields(getActionById('compliment')!);
// → { influence: 2, info: 0 }

normalizeActionYields(getActionById('whisper')!);
// → { influence: 0, info: 100 }

normalizeActionYields(getActionById('share_intel')!);
// → { influence: 6, info: 0 }   // intel_spend: converts info → influence only
```

## `normalizeAuxCost(value, field)`

Extract a single auxiliary cost field (`'influence'` or `'info'`) **as the raw float value** from a cost value.  
Returns `0` for plain numbers (energy-only costs) or absent/invalid fields.  
`normalizeActionCosts` applies denominated influence scaling (×10) and legacy info scaling (×100) on top of this.

---

## Files

| File | Purpose |
|------|---------|
| `src/social/socialActions.ts` | Canonical `SOCIAL_ACTIONS` array with action definitions |
| `src/social/smExecNormalize.ts` | Cost/yield normalization helpers (denominated influence costs, ×100 yields/info) |
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
