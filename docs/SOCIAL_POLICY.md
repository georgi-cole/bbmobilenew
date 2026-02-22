# Social Policy & Influence

Documentation for the `SocialPolicy` and `SocialInfluence` modules in the bbmobilenew social subsystem.

---

## SocialPolicy

**File:** `src/social/SocialPolicy.ts`

Implements deterministic action selection and outcome delta computation for AI players.

### API

#### `chooseActionFor(playerId, context): string`

Selects an action ID for an AI player using a weighted pseudo-random draw.

- **Algorithm:** LCG seeded by `(game.seed XOR playerIdCharSum)`, where `playerIdCharSum` is the sum of char codes in the player ID string.
- **Weights:** Configured in `socialConfig.actionWeights` (e.g. `{ ally: 3, protect: 2, betray: 1, nominate: 2, idle: 1 }`).
- **Determinism:** Same seed + player ID always produces the same action.
- Returns `'idle'` when no weights are configured.

#### `chooseTargetsFor(playerId, actionId, context): string[]`

Returns an array of target player IDs for a given action.

- **Friendly actions** (`ally`, `protect`): prefers players whose `affinity ≥ socialConfig.relationshipThresholds.allyThreshold`.
- **Aggressive actions** (`betray`, `nominate`): prefers players whose `affinity ≤ socialConfig.relationshipThresholds.enemyThreshold`.
- Falls back to the first eligible player when no suitable relationship is found.
- Excludes the actor themselves and players with status `'evicted'` or `'jury'`.
- Returns `[]` when no eligible targets exist.

#### `computeOutcomeDelta(actionId, actorId, targetId, outcome): number`

Returns the signed affinity change resulting from the action's outcome.

| Action category  | Outcome    | Delta                                   |
|------------------|------------|-----------------------------------------|
| friendly         | `success`  | `socialConfig.affinityDeltas.friendlySuccess`  (positive) |
| friendly         | `failure`  | `socialConfig.affinityDeltas.friendlyFailure`  (positive, smaller) |
| aggressive       | `success`  | `socialConfig.affinityDeltas.aggressiveSuccess` (negative) |
| aggressive       | `failure`  | `socialConfig.affinityDeltas.aggressiveFailure` (negative, smaller) |
| unknown          | any        | `0`                                     |

---

## SocialInfluence

**File:** `src/social/SocialInfluence.ts`

Computes nomination and veto bias weights and keeps Redux up to date via `social/influenceUpdated`.

### API

#### `initInfluence(store): void`

Wires the Redux store so `update()` can dispatch actions. Called automatically by `SocialEngine.init()`.

#### `computeNomBias(actorId, nominatedId, state): number`

Returns a nomination bias in `[nomBiasBounds[0], nomBiasBounds[1]]` (default `[-0.15, 0.15]`).

- **Strong ally** (`affinity ≥ allyThreshold`): returns `nomBiasBounds[0]` — actor is reluctant to nominate.
- **Strong enemy** (`affinity ≤ enemyThreshold`): returns `nomBiasBounds[1]` — actor is keen to nominate.
- **Neutral** (between thresholds): proportional mapping, negated so positive affinity yields negative bias: `-(affinity / allyThreshold) × max`.
- **Tag modifiers:**
  - `'target'` tag: `+0.05` (clamped to max).
  - `'shield'` tag: `−0.05` (clamped to min).

#### `computeVetoBias(vetoHolderId, nomineeId, state): number`

Returns a veto-use bias in `[vetoBiasBounds[0], vetoBiasBounds[1]]` (default `[-0.1, 0.2]`).

- **Strong ally** (`affinity ≥ allyThreshold`): returns `vetoBiasBounds[1]` — holder wants to save them.
- **Strong enemy** (`affinity ≤ enemyThreshold`): returns `vetoBiasBounds[0]` — holder won't use the veto.
- **Neutral:** proportional to `affinity / allyThreshold × max`.
- **Tag modifiers:**
  - `'alliance'` tag: `+0.05` (clamped to max).

#### `update(actorId, decisionType, eligibleTargets): void`

Computes bias weights for each target and dispatches `social/influenceUpdated`:

```ts
{ actorId, decisionType, weights: Record<string, number> }
```

Weights are stored in Redux at `state.social.influenceWeights[actorId][decisionType]`.
No-op when no store has been initialised.

---

## Redux state

```ts
// state.social.influenceWeights shape
Record<
  string,            // actorId
  Record<
    string,          // decisionType ('nomination' | 'veto' | ...)
    Record<string, number> // targetId → bias weight
  >
>
```

**Action:** `social/influenceUpdated`
**Selector:** `selectInfluenceWeights(state)` → the full weights map.

---

## SocialEngine integration

`SocialEngine.endPhase()` automatically calls `influenceUpdate` for every AI participant before finalising the phase report:

```ts
for (const actorId of aiParticipants) {
  influenceUpdate(actorId, 'nomination', activePlayers.filter(id => id !== actorId));
}
```

This ensures `state.social.influenceWeights` is populated in Redux at the end of every social phase.

---

## Configuration (`socialConfig`)

| Key | Default | Purpose |
|-----|---------|---------|
| `actionWeights` | `{ ally:3, protect:2, betray:1, nominate:2, idle:1 }` | Weighted pool for `chooseActionFor` |
| `relationshipThresholds.allyThreshold` | `0.5` | Minimum affinity to be treated as an ally |
| `relationshipThresholds.enemyThreshold` | `-0.5` | Maximum affinity to be treated as an enemy |
| `actionCategories.friendlyActions` | `['ally', 'protect']` | Actions producing positive deltas |
| `actionCategories.aggressiveActions` | `['betray', 'nominate']` | Actions producing negative deltas |
| `affinityDeltas.friendlySuccess` | `0.10` | Delta on friendly action success |
| `affinityDeltas.friendlyFailure` | `0.02` | Delta on friendly action failure |
| `affinityDeltas.aggressiveSuccess` | `-0.15` | Delta on aggressive action success |
| `affinityDeltas.aggressiveFailure` | `-0.05` | Delta on aggressive action failure |
| `nomBiasBounds` | `[-0.15, 0.15]` | Clamp range for `computeNomBias` |
| `vetoBiasBounds` | `[-0.10, 0.20]` | Clamp range for `computeVetoBias` |

---

## Debug hooks

In a browser context, the compute functions are exposed on `window` for manual testing in DevTools:

```js
// Nomination bias
window.__socialInfluence.computeNomBias('player1', 'player2', store.getState());

// Veto bias
window.__socialInfluence.computeVetoBias('player1', 'player2', store.getState());
```
