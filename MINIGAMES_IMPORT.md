# Minigames Import – Developer Guide

This document covers the minigame pool architecture imported from
[georgi-cole/bbmobile](https://github.com/georgi-cole/bbmobile) into **bbmobilenew**.

---

## Directory layout

```
src/
  minigames/
    legacy/           # Verbatim JS modules from bbmobile/js/minigames/
    registry.ts       # Game metadata & helper functions
    scoring.ts        # Scoring adapters (raw → canonical 0-1000 score)
    LegacyMinigameWrapper.tsx  # React wrapper that mounts a legacy module
    compat-bridge.ts  # Window globals expected by legacy modules
  components/
    MinigameRules/    # Rules modal shown before each game
    MinigameHost/     # Full-screen host: rules → countdown → game → results
  store/
    challengeSlice.ts # Challenge orchestration & telemetry
```

---

## Minigame Registry (`registry.ts`)

### Entry fields

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Unique identifier |
| `title` | string | Display name |
| `description` | string | One-line description |
| `instructions` | string[] | Bullet points shown in Rules modal |
| `metricKind` | `count \| time \| accuracy \| endurance \| hybrid \| points` | What the raw value measures |
| `metricLabel` | string | Label shown on results screen |
| `timeLimitMs` | number | Auto-end time (0 = game controls its own end) |
| `authoritative` | boolean | Game nominates its own winner |
| `scoringAdapter` | string | Adapter name (see below) |
| `scoringParams` | object | Extra parameters for the adapter |
| `modulePath` | string | Filename inside `src/minigames/legacy/` |
| `legacy` | boolean | Always true for bbmobile-imported games |
| `weight` | number | Relative selection weight |
| `category` | `arcade \| endurance \| logic \| trivia` | Gameplay category |
| `retired` | boolean | Excluded from random selection when true |

### Helper functions

```ts
import { getAllGames, getGame, pickRandomGame, getPoolByFilter } from './registry';

// All entries (including retired)
getAllGames();

// Specific entry
getGame('snake');

// Random pick (seeded, weighted, optional category filter)
pickRandomGame(seed, { category: 'logic', excludeKeys: ['tetris'] });

// Filtered pool
getPoolByFilter({ retired: false, category: 'arcade' });
```

---

## Scoring Adapters (`scoring.ts`)

All adapters return `{ score: number (0-1000), points: number }`.
**Higher score is always better** — adapters invert time-based metrics automatically.

| Adapter | Use case |
|---------|----------|
| `raw` | Score/accuracy already higher-is-better (0–100 normalized to 0–1000) |
| `rankPoints` | Assign points by finishing rank (configurable table) |
| `timeToPoints` | Lower completion time → higher score |
| `lowerBetter` | Alias for `timeToPoints` |
| `binary` | Win/lose (raw ≥ threshold → full score) |
| `authoritative` | Game sets its own winner; raw value treated as canonical score |

### Usage

```ts
import { computeScore, computeScores, normalizeForRanking } from './scoring';

// Single player
computeScore('raw', 75, { minRaw: 0, maxRaw: 100 });
// → { score: 750, points: 75 }

// All players, sorted by rank
computeScores('lowerBetter', [
  { playerId: 'p1', rawValue: 1200 },  // ms
  { playerId: 'p2', rawValue: 980 },
], { targetMs: 500, maxMs: 5000 });

// Normalize for ranking (e.g. AI pre-simulation)
normalizeForRanking(rawResults, { adapter: 'raw' });
```

---

## Legacy Wrapper (`LegacyMinigameWrapper.tsx`)

The wrapper dynamically imports the legacy module (code-split via Vite glob)
and mounts it into a `div` by calling:

```js
module.render(container, onComplete, options);
```

Props:

| Prop | Type | Description |
|------|------|-------------|
| `game` | `GameRegistryEntry` | Registry entry |
| `options` | `Record<string, unknown>` | Forwarded to `module.render()` |
| `onComplete` | `(result) => void` | Called when game ends normally |
| `onQuit` | `(partial) => void` | Called when user presses ✕ |

An **✕ button** is always rendered over the game. When pressed it calls `onQuit`
with whatever partial score was last reported via `onProgress`.

Legacy modules can also trigger quit programmatically:

```js
// Inside legacy module
window.closeGame();
```

---

## MinigameHost (`MinigameHost.tsx`)

Drop-in full-screen component that orchestrates the full flow:

```tsx
<MinigameHost
  game={game}                // GameRegistryEntry
  gameOptions={{ seed: 42 }} // forwarded to legacy module
  onDone={(rawValue, partial) => { /* apply winner */ }}
  skipRules={false}          // debug: skip rules modal
  skipCountdown={false}      // debug: skip 3s ready
/>
```

### Flow

1. **Rules modal** – shows instructions, metric, time limit
2. **3-second countdown** – "Get Ready → 3 → 2 → 1 → GO!"
3. **Playing** – `LegacyMinigameWrapper` is mounted
4. **Results** – shows final score, "Continue ▶" calls `onDone`

---

## Challenge Slice (`challengeSlice.ts`)

### Thunks

#### `startChallenge(seed, participants, opts?)`

Picks a game from the pool (deterministically), creates a `PendingChallenge`
in state, and returns the selected `GameRegistryEntry`.

```ts
const game = dispatch(startChallenge(game.seed, aliveIds, { category: 'logic' }));
// → state.challenge.pending is now set
// → render <MinigameHost game={game} … />
```

#### `completeChallenge(rawResults)`

Computes canonical scores, determines the winner, and records a telemetry run.
Returns the winner's player ID.

```ts
const winnerId = dispatch(
  completeChallenge([
    { playerId: 'p1', rawValue: 82 },
    { playerId: 'p2', rawValue: 71 },
  ]),
);
```

### Telemetry

Every completed challenge is appended to `state.challenge.history` (max 50 entries):

```ts
{
  id, gameKey, seed, participants,
  rawScores, canonicalScores,
  winnerId, timestamp, authoritative
}
```

This allows reproducing any run by replaying with the same `seed` and participants.

---

## Debug Controls

Visit any page with `?debug=1` to open the DebugPanel.
Under **🎮 Minigame Debug**:

- **Force Game** — select a specific game instead of random pick
- **Seed** — override the RNG seed
- **Skip Rules Modal** — jump straight to countdown
- **Fast-forward Ready Timer** — skip the 3-second countdown

---

## Rewriting a Legacy Module into React

Legacy modules expose a `render(container, onComplete, options)` API.
To convert one to a native React component:

1. Create `src/minigames/<key>/<Key>.tsx`
2. Accept `{ options, onComplete, onQuit }` props
3. Update the registry entry: set `legacy: false` and point `modulePath` to the new component
4. Update `LegacyMinigameWrapper` to detect non-legacy entries and render the React component directly

---

## Per-game notes

| Game | Notes |
|------|-------|
| `tetris` | Open-ended; `timeLimitMs: 0`. Uses `authoritative` scoring adapter. |
| `snake` | Open-ended; `timeLimitMs: 0`. Uses `authoritative` scoring adapter. |
| `minesweeps` | Open-ended; `timeLimitMs: 0`. Uses `authoritative` scoring adapter. |
| `holdWall` | Endurance; no time limit. Game ends when last player drops. |
| `tiltLabyrinth` | Requires device motion (`DeviceOrientationEvent`); may not work on desktop. |
| `rainBarrelBalance` | Same device-motion requirement as `tiltLabyrinth`. |
| `swipeMaze` | Uses swipe gestures; `lowerBetter` adapter (lower time wins). |
| `buzzerSprintRelay` | Uses `lowerBetter` adapter; fastest completion wins. |
| `flashFlood` | Uses `lowerBetter` adapter; fastest reaction wins. |

---

## Running QA locally

```bash
# Normal dev server
npm run dev

# Launch with debug panel
open http://localhost:5173?debug=1

# In Debug panel → 🎮 Minigame Debug:
#   Force Game: <select a game>
#   Skip Rules Modal: ✓
#   Fast-forward Ready Timer: ✓
#   Apply → navigate to HOH/POV comp phase to trigger challenge
```

For long-running games (Tetris, Snake) open the game, play for a bit, then
press ✕ to exit early and verify partial scores are applied.

---

## "Don't Go Over" (CWGO) — React Minigame Notes

`key: dontGoOver` is a fully React-implemented minigame (`implementation: 'react'`,
`reactComponentKey: 'ClosestWithoutGoingOver'`). It is wired through
`MinigameHost → ClosestWithoutGoingOverComp` and uses the Redux
`cwgoCompetitionSlice` for all state management.

### prizeType propagation

`prizeType` (`'HOH'` or `'POV'`) is now captured at challenge-creation time and
stored on `PendingChallenge.prizeType` in `challengeSlice`. `GameScreen` passes
`prizeType: game.phase === 'pov_comp' ? 'POV' : 'HOH'` to `startChallenge` opts,
and `MinigameHost` reads `pendingChallenge.prizeType` (falling back to a
live re-derivation from `game.phase` for backward compatibility). This ensures the
correct label is shown even if `game.phase` transitions while the competition is
in progress.

### Per-invocation seed

`challengeSlice` maintains a monotonic `nextNonce` counter (initialised to 1,
incremented on every `startChallenge` call). When `debug.forceSeed` is absent,
the per-challenge seed is mixed with the nonce:

```ts
perChallengeSeed = mulberry32((challengeSeed ^ nextNonce) >>> 0)() * 0x100000000 >>> 0
```

This means identical `game.seed` values across a single week produce different
question orders and AI behaviour on each challenge invocation. `debug.forceSeed`
bypasses the nonce and uses the derived `challengeSeed` directly for
reproducibility.

### Leader tracking

`cwgoCompetitionSlice` now persists `leaderId: string | null` in state.
- Set to the mass-round winner after `revealMassResults`.
- Updated to the duel winner after `revealDuelResults`.
- Reset to `null` on `startCwgoCompetition`.

`ClosestWithoutGoingOverComp` reads `cwgo.leaderId ?? cwgo.aliveIds[0]` everywhere
it previously used `cwgo.aliveIds[0]` as the leader. The AI auto-pick
(`handleAILeaderPickDuel`) and `LeaderDuelPicker` both respect `leaderId`.

### Two-player terminal fix

Both the AI-leader path and the human-leader path now handle the edge case where
`aliveIds.length === 2` (occurs when a duel reduces 3 → 2 and we re-enter
`choose_duel`):

- **AI-leader**: `handleAILeaderPickDuel` dispatches
  `chooseDuelPair([alive[0], alive[1]])` immediately.
- **Human-leader**: when `aliveIds.length === 2` and the human is the leader,
  `LeaderDuelPicker` is bypassed and a simple "Start Duel" button is shown instead,
  which dispatches `chooseDuelPair([aliveIds[0], aliveIds[1]])`. This prevents the
  permanent-disabled-button deadlock that previously occurred because
  `LeaderDuelPicker` only showed 1 candidate (the non-leader), making it impossible
  to select 2 players.

### Question bank

The question bank in `cwgoQuestions.ts` has been expanded from 32 to 54 questions
with varied difficulty levels (1–5). Easy questions (difficulty 1) remain for
accessibility; difficulty 3–5 questions add estimation and numeric trivia that
require genuine reasoning.

### Mobile scrollability

Results lists (`.cwgo-results-wrap`) now have `max-height: 55vh` with
`overflow-y: auto` and `-webkit-overflow-scrolling: touch`.
The Continue button is placed inside a `.cwgo-footer` sticky container
(`position: sticky; bottom: 0`) so it remains reachable even on small screens.
