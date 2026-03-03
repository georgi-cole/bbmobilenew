# Score System

This document describes the scoring formula used by the bbmobilenew leaderboard, event mapping, how to tune weights, and the server-ready architecture.

---

## Scoring Events & Default Points

| Event | Points (default) | Where recorded |
|---|---|---|
| HOH competition win | +10 per win | `applyHohWinner()` in `gameSlice.ts` |
| POV competition win | +8 per win | `applyPovWinner()` in `gameSlice.ts` |
| Made jury | +5 | `buildArchive()` in `GameOver.tsx` |
| Battle Back win (returned to house) | +8 per win | `completeBattleBack()` in `gameSlice.ts` |
| Survived double eviction week | +7 | `buildArchive()` (set via `survivedDoubleEviction` flag) |
| Survived triple eviction week | +10 | `buildArchive()` (set via `survivedTripleEviction` flag) |
| Won Public's Favorite Player | +25 | `buildArchive()` — reads `favoritePlayer.winnerId` |
| Won the game (Season Winner) | +100 | `buildArchive()` — `finalPlacement === 1` |
| Runner-up | +50 | `buildArchive()` — `finalPlacement === 2` |
| Won Final HOH (Part 3 of Final 3) | +15 | `applyF3MinigameWinner()` / `advance()` final3_comp3 path |

### Special Rule — Won Both Public's Favorite AND the Game

When the **same player** wins both the game (`finalPlacement === 1`) and the Public's Favorite Player vote (`wonPublicFavorite === true`), their combined award for those two events is **50 points total** — NOT the sum of 100 + 25.

This is implemented in `computeScoreBreakdown()` in `src/scoring/computeLeaderboard.ts`.  The `wonBothGameAndFavorite` weight (default **50**) replaces both `wonGame` and `wonPublicFavorite` in this case.

---

## Architecture

### Scoring module (`src/scoring/`)

| File | Purpose |
|---|---|
| `types.ts` | `ScoringWeights` and `ScoreBreakdown` interfaces |
| `weights.ts` | `DEFAULT_WEIGHTS` constant and `mergeWeights()` helper |
| `computeLeaderboard.ts` | `computeScoreBreakdown()`, `computeLeaderboardScore()`, `computeSeasonLeaderboard()` |
| `computeAllTime.ts` | `computeAllTimeLeaderboard()` — aggregates across season archives |

All compute functions are **pure** (no side effects, no Redux dependency) and accept an optional `weights` parameter so both client and server can produce consistent scores.

### Raw stat fields on `PlayerSeasonSummary`

`PlayerSeasonSummary` (in `src/store/seasonArchive.ts`) stores the raw boolean/integer data:

| Field | Type | Description |
|---|---|---|
| `hohWins` | `number` | HOH competition wins this season |
| `povWins` | `number` | POV competition wins this season |
| `timesNominated` | `number` | Times nominated for eviction |
| `madeJury` | `boolean` | Reached jury house |
| `battleBackWins` | `number` | Battle Back competition wins |
| `survivedDoubleEviction` | `boolean` | Survived a double-eviction week |
| `survivedTripleEviction` | `boolean` | Survived a triple-eviction week |
| `wonPublicFavorite` | `boolean` | Won America's Favorite Player vote |
| `wonFinalHoh` | `boolean` | Won the Final HOH (Part 3 of Final 3) |
| `weeksAlive` | `number` | Weeks survived in the house |
| `leaderboardScore` | `number` | Pre-computed total (for display without recompute) |

Fields missing from older archives are treated as `0` / `false` in all compute functions.

### Stat increment locations (no double-counting)

Stats are incremented **exactly once**, at the authoritative mutation site:

- **`hohWins`** — `applyHohWinner()` helper (called by `completeMinigame`, `applyMinigameWinner`, and `advance()` hoh_results).
- **`povWins`** — `applyPovWinner()` helper (called by `completeMinigame`, `applyMinigameWinner`, and `advance()` pov_results).
- **`timesNominated`** — `finalizeNominations`, `commitNominees` (human paths) and the `nomination_results` case of `advance()` (AI path).  `incrementTimesNominated()` is the shared helper.
- **`battleBackWins`** — `completeBattleBack()` reducer.
- **`wonFinalHoh`** — `markFinalHohWinner()` helper, called from `advance()` `final3_comp3` and `applyF3MinigameWinner()` `final3_comp3_minigame`.

---

## Tuning Weights

Override individual weights without modifying the defaults using `mergeWeights()`:

```ts
import { mergeWeights, DEFAULT_WEIGHTS } from './src/scoring/weights';
import { computeSeasonLeaderboard } from './src/scoring/computeLeaderboard';

const customWeights = mergeWeights({
  perHohWin: 15,   // increase HOH value
  madeJury: 10,    // increase jury value
});

const leaderboard = computeSeasonLeaderboard(summaries, customWeights);
```

`mergeWeights` does **not** mutate `DEFAULT_WEIGHTS`.

---

## Server Path

`archivePersistence.ts` exposes an `enabled` flag:

```ts
export let enabled = true; // set to false to disable localStorage
```

When `enabled = false`, `saveSeasonArchives` is a no-op and `loadSeasonArchives` returns `undefined`.  To swap in a server backend:

1. Set `enabled = false` in `archivePersistence.ts`.
2. Implement `saveSeasonArchives` / `loadSeasonArchives` as async wrappers calling your API.
3. Pass `weights` from server config to `computeSeasonLeaderboard` / `computeAllTimeLeaderboard` so scores are identical on client and server.

---

## Migration Notes

Archives created before the scoring system was introduced may be missing the new fields (`hohWins`, `povWins`, `madeJury`, etc.).  All compute functions treat missing fields as `0` / `false`, so older archives will simply show a score of `0` until they are replayed or manually backfilled.
