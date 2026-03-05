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

### Per-challenge question order (questionOrder)

`cwgoCompetitionSlice` now generates a `questionOrder: number[]` at competition
start — a deterministic Fisher-Yates shuffle of all question indices seeded from
the per-challenge seed. Each round uses `questionOrder[round % questionOrder.length]`
to pick the next question. This guarantees:

- **Variation**: different seeds (i.e. different challenge invocations) produce
  different question sequences, preventing players from memorising answers.
- **No repetition** (within one competition): the first N rounds are guaranteed
  to show N distinct questions before wrapping.
- **Determinism**: the same seed always produces the same question order.

### Outcome idempotency (outcomeResolved)

`CwgoState` now has an `outcomeResolved: boolean` flag (default `false`).

- `resolveCompetitionOutcome` checks this flag and returns immediately if `true`.
- After successfully dispatching `applyMinigameWinner`, it dispatches
  `markCwgoOutcomeResolved()` which sets `outcomeResolved = true`.
- `startCwgoCompetition` resets `outcomeResolved` to `false` for the next run.
- `applyMinigameWinner` in `gameSlice` also has an idempotency check: if
  `hohId` (or `povWinnerId`) is already set it skips re-applying the winner.

Together these two guards prevent a race condition where the "Claim Prize" button
could be tapped twice (or rendered twice) before the phase transition takes effect.

### Leader tracking

`cwgoCompetitionSlice` persists `leaderId: string | null` in state.
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

### Scaled numeric input

Some questions have very large answers (millions, billions). These questions have a
`scale?: number` field in `CwgoQuestion`. When a question has `scale` set, the input
UI shows a dropdown alongside the number field:

| Option | Multiplier |
|--------|-----------|
| `—` | 1 (no scaling) |
| `K (thousand)` | 1 000 |
| `M (million)` | 1 000 000 |
| `B (billion)` | 1 000 000 000 |
| `T (trillion)` | 1 000 000 000 000 |

The placeholder updates to remind the user decimals are accepted. The value is
computed as `Math.round(parseFloat(input) * scale)` before dispatch.

### Hidden question during choose_duel

The question card is **not shown** during the `choose_duel` phase.  The current
question belongs to the next duel, not the leader-pick screen, so revealing it
early would give away information.  It is revealed once the duel starts
(`duel_input` / `duel_reveal`).

### Close button (MinigameHost)

`MinigameHost` now renders an `✕` button in the top-right corner of the playing
phase.  Clicking it calls `onDone(0, true)` — the same as quitting early.  For
CWGO specifically this will abort the competition without awarding the prize.

### choose_duel mobile scrollability

`LeaderDuelPicker` now wraps its player grid in a `.cwgo-choose__scroll-body`
container (`overflow-y: auto; max-height: 60vh`), and the "Send to Duel" button
is placed in a `.cwgo-choose__footer` sticky container so it remains reachable on
small screens regardless of how many candidates are listed.

### VS separator alignment

The VS separator in `DuelVsCard` and in the duel-reveal grid is now rendered
**between** the two player sides (not appended after them), ensuring it stays
visually centred in all viewports.

### Question bank

The question bank in `cwgoQuestions.ts` has been expanded from 32 to 54 questions
with varied difficulty levels (1–5). Easy questions (difficulty 1) remain for
accessibility; difficulty 3–5 questions add estimation and numeric trivia that
require genuine reasoning.

Large-answer questions include a `scale` hint for the UI:

| ID | Answer | scale |
|----|--------|-------|
| q07 | 4 500 000 000 years | 1 000 000 000 |
| q16 | 40 000 km | 1 000 |
| q22 | 8 800 000 people | 1 000 000 |
| q41 | 380 000 km | 1 000 |
| q52 | 170 000 words | 1 000 |
| q53 | 37 000 000 000 000 cells | 1 000 000 000 000 |
| q54 | 150 000 000 km | 1 000 000 |

### Mobile scrollability

Results lists (`.cwgo-results-wrap`) now have `max-height: 55vh` with
`overflow-y: auto` and `-webkit-overflow-scrolling: touch`.
The Continue button is placed inside a `.cwgo-footer` sticky container
(`position: sticky; bottom: 0`) so it remains reachable even on small screens.

---

## Changelog

### fix/cwgo-winner-sync-and-ui

- **Outcome idempotency**: `resolveCompetitionOutcome` is now guarded by
  `cwgo.outcomeResolved`; `applyMinigameWinner` is guarded by `hohId`/`povWinnerId`.
  Prevents double-dispatch on rapid clicks or concurrent renders.
- **questionOrder shuffle**: per-challenge Fisher-Yates shuffle of all question
  indices replaces single-question XOR selection; question order varies per
  invocation while remaining deterministic for the same seed.
- **leaderId**: `cwgoCompetitionSlice.leaderId` persisted; UI and AI use it
  everywhere instead of `aliveIds[0]`.
- **Scaled input**: number input accepts decimals + multiplier dropdown for
  large-answer questions (`scale` metadata on `CwgoQuestion`).
- **choose_duel UX**: picker grid wrapped in scrollable container; "Send to Duel"
  button moved to sticky footer.
- **Hidden question in choose_duel**: question card hidden during leader-pick phase.
- **MinigameHost close button**: `✕` button (top-right, playing phase) calls
  `onDone(0, true)`.
- **VS separator**: centred between duel sides in both `DuelVsCard` and
  duel-reveal card.
- **Two-player terminal**: `confirmMassElimination` skips `choose_duel` when
  exactly 2 survive; human-leader deadlock prevented with "Start Duel" shortcut.
- **Instrumentation**: `console.log` calls at `startCwgoCompetition`,
  `resolveCompetitionOutcome`, `applyMinigameWinner`, and the champion banner
  render aid debugging and monitoring.
- **Tests**: new unit tests for `outcomeResolved`, `questionOrder`, and
  `parseScaledGuess` in `tests/unit/`.
