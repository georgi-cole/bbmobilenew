/**
 * Redux slice for the "Risk Wheel" multi-round elimination competition.
 *
 * State machine:
 *
 *   idle
 *    └─ initRiskWheel ─────────────────────────────────────→ awaiting_spin
 *         └─ performSpin ──────────────────────────────────→ spin_result
 *              │ (666 landed)
 *              └─ (phase = six_six_six, effect computed)
 *                   └─ advanceFrom666 ────────────────────→ awaiting_decision | turn_complete
 *              │ (normal result)
 *              └─ advanceFromSpinResult ─────────────────→ awaiting_decision | turn_complete
 *                   └─ (decision phase, human only)
 *                        └─ playerStop ───────────────────→ turn_complete
 *                        └─ playerSpinAgain ──────────────→ awaiting_spin
 *         └─ advanceFromTurnComplete ─────────────────────→ awaiting_spin (next player)
 *                                                          └─ round_summary (all done)
 *              └─ advanceFromRoundSummary ──────────────→ awaiting_spin (round N+1)
 *                                                        └─ complete (after round 3)
 *
 * Rounds: 3. Scores reset each round. Eliminate based on round scores.
 * After Round 3, highest scorer among remaining players wins.
 *
 * Seeded RNG: mulberry32 from src/store/rng.ts. A sequential rngCallCount
 * drives the main spin RNG; a separate aiDecisionCallCount drives AI decisions
 * to avoid entanglement with spin outcomes.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32, seededPickN } from '../../store/rng';

// ─── Types ────────────────────────────────────────────────────────────────────

/** XOR salt separating AI-decision RNG from spin RNG to avoid entanglement. */
const AI_DECISION_RNG_SALT = 0xdeadbeef;

export type RiskWheelCompetitionType = 'HOH' | 'POV';

export type RiskWheelPhase =
  | 'idle'
  | 'awaiting_spin'       // current player should spin (button shown)
  | 'spin_result'         // sector landed, showing result
  | 'six_six_six'         // special 666 animation phase
  | 'awaiting_decision'   // human can choose stop or spin again
  | 'turn_complete'       // player's turn done
  | 'round_summary'       // all players finished, showing scores + eliminations
  | 'complete';           // game over, winner decided

export type SectorType = 'points' | 'bankrupt' | 'skip' | 'zero' | 'devil';

export interface WheelSector {
  type: SectorType;
  /** Numeric point value (for 'points' type). */
  value?: number;
  /** Display label shown on the wheel. */
  label: string;
}

export interface RiskWheelState {
  competitionType: RiskWheelCompetitionType;
  phase: RiskWheelPhase;

  /** All participants in the game (never changes). */
  allPlayerIds: string[];
  /** Players still active (not yet eliminated). */
  activePlayerIds: string[];
  /** Players who have been eliminated. */
  eliminatedPlayerIds: string[];

  humanPlayerId: string | null;

  /** Number of players at the start of the game (determines ruleset). */
  initialPlayerCount: number;

  /** Current round (1, 2, or 3). */
  round: number;

  /** Scores for current round, keyed by playerId. */
  roundScores: Record<string, number>;
  /** Players who have completed their turn this round. */
  playersCompletedThisRound: string[];

  /** Index into activePlayerIds of the player whose turn it is. */
  currentPlayerIndex: number;
  /** Number of spins used so far this turn (0–3). */
  currentSpinCount: number;

  /** Index into WHEEL_SECTORS for the most recent spin. */
  lastSectorIndex: number | null;
  /** Whether 666 added or subtracted this spin. */
  last666Effect: 'add' | 'subtract' | null;

  /** Players eliminated at end of the most recent round (for animation). */
  eliminatedThisRound: string[];

  /** Final winner id (set when phase === 'complete'). */
  winnerId: string | null;

  /** Master seed for all RNG. */
  seed: number;
  /** Sequential counter driving the main spin RNG. */
  rngCallCount: number;
  /** Separate counter for AI decision RNG. */
  aiDecisionCallCount: number;

  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
}

// ─── Wheel sectors ────────────────────────────────────────────────────────────

export const WHEEL_SECTORS: WheelSector[] = [
  // Positive
  { type: 'points', value: 10,   label: '10'   },
  { type: 'points', value: 30,   label: '30'   },
  { type: 'points', value: 50,   label: '50'   },
  { type: 'points', value: 100,  label: '100'  },
  { type: 'points', value: 150,  label: '150'  },
  { type: 'points', value: 200,  label: '200'  },
  { type: 'points', value: 500,  label: '500'  },
  { type: 'points', value: 750,  label: '750'  },
  { type: 'points', value: 1000, label: '1000' },
  // Neutral
  { type: 'zero',  label: '0'     },
  { type: 'skip',  label: 'SKIP'  },
  // 3.14 is a deliberate joke: label shows π but awards 3 pts (funny low value).
  { type: 'points', value: 3, label: '3.14' },
  // Negative
  { type: 'points', value: -100, label: '-100' },
  { type: 'points', value: -200, label: '-200' },
  // Special
  { type: 'bankrupt', label: 'BANKRUPT' },
  { type: 'devil',    label: '666'      },
];

// ─── Pure helper functions (exported for tests) ───────────────────────────────

/** Advance a seeded RNG by `count` steps and return the NEXT value. */
function rngAt(seed: number, count: number): number {
  const rng = mulberry32(seed >>> 0);
  for (let i = 0; i < count; i++) rng();
  return rng();
}

/**
 * Pick a sector index from the wheel using the sequential RNG counter.
 */
export function pickSectorIndex(seed: number, callCount: number): number {
  const v = rngAt(seed, callCount);
  return Math.floor(v * WHEEL_SECTORS.length);
}

/**
 * Resolve the 666 effect (+666 or -666) using the next RNG call.
 */
export function resolve666Effect(seed: number, callCount: number): 'add' | 'subtract' {
  return rngAt(seed, callCount) < 0.5 ? 'add' : 'subtract';
}

/**
 * Compute how many players to eliminate at the end of `round`, given the
 * original `initialPlayerCount` at game start and current `activeCount`.
 *
 * Special rules:
 *   4 players: R1 → 1, R2 → 1, R3 → 0 (winner = highest score)
 *   3 players: R1 → 1, R2 → 0, R3 → 1 (winner remains)
 *   2 players: R1 → 0, R2 → 0, R3 → 1 (winner remains)
 *   ≥5 players: eliminate floor(activeCount / 2) each round
 */
export function computeEliminationCount(
  initialPlayerCount: number,
  round: number,
  activeCount: number,
): number {
  if (initialPlayerCount === 4) {
    if (round === 1 || round === 2) return 1;
    return 0;
  }
  if (initialPlayerCount === 3) {
    if (round === 1) return 1;
    if (round === 2) return 0;
    return 1;
  }
  if (initialPlayerCount === 2) {
    if (round < 3) return 0;
    return 1;
  }
  // Default (≥5 players): eliminate bottom 50% rounded down
  return Math.floor(activeCount / 2);
}

/**
 * Determine which players to eliminate at the end of a round.
 * Sorts by round score ascending. If there is a tie at the cutoff,
 * randomly picks among the tied players using a seeded RNG.
 *
 * Returns eliminated player IDs.
 */
export function computeEliminatedPlayers(
  activePlayerIds: string[],
  roundScores: Record<string, number>,
  eliminationCount: number,
  tieBreakSeed: number,
): string[] {
  if (eliminationCount <= 0) return [];
  if (eliminationCount >= activePlayerIds.length) return [...activePlayerIds];

  const sorted = [...activePlayerIds].sort(
    (a, b) => (roundScores[a] ?? 0) - (roundScores[b] ?? 0),
  );

  // Score at the cutoff boundary (the eliminationCount-th lowest)
  const cutoffScore = roundScores[sorted[eliminationCount - 1]] ?? 0;

  // Players with score strictly below the cutoff (definitely eliminated)
  const definitelyOut = sorted
    .slice(0, eliminationCount)
    .filter((id) => (roundScores[id] ?? 0) < cutoffScore);

  // Players tied exactly at the cutoff score
  const atCutoff = sorted.filter((id) => (roundScores[id] ?? 0) === cutoffScore);

  const needFromTied = eliminationCount - definitelyOut.length;

  if (needFromTied <= 0) return definitelyOut;
  if (needFromTied >= atCutoff.length) return [...definitelyOut, ...atCutoff];

  // Random selection among tied players
  const rng = mulberry32(tieBreakSeed >>> 0);
  const pickedFromTied = seededPickN(rng, atCutoff, needFromTied);
  return [...definitelyOut, ...pickedFromTied];
}

/**
 * Determine the AI's decision after a spin (stop or spin again).
 *
 * Heuristic:
 *   score ≤ 0        → spin (always)
 *   score < 200      → spin (always)
 *   score ≥ 500      → stop (always)
 *   200 ≤ score < 500 → 50 % chance to stop (seeded)
 */
export function aiShouldStop(
  seed: number,
  aiDecisionCallCount: number,
  score: number,
): boolean {
  if (score <= 0) return false;
  if (score < 200) return false;
  if (score >= 500) return true;
  // Moderate range: 50 % seeded coin flip
  return rngAt(seed ^ AI_DECISION_RNG_SALT, aiDecisionCallCount) < 0.5;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: RiskWheelState = {
  competitionType: 'HOH',
  phase: 'idle',
  allPlayerIds: [],
  activePlayerIds: [],
  eliminatedPlayerIds: [],
  humanPlayerId: null,
  initialPlayerCount: 0,
  round: 1,
  roundScores: {},
  playersCompletedThisRound: [],
  currentPlayerIndex: 0,
  currentSpinCount: 0,
  lastSectorIndex: null,
  last666Effect: null,
  eliminatedThisRound: [],
  winnerId: null,
  seed: 0,
  rngCallCount: 0,
  aiDecisionCallCount: 0,
  outcomeResolved: false,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Apply a sector result to the current player's round score and advance spin/phase. */
function applySector(
  state: RiskWheelState,
  sectorIndex: number,
  rngCallsConsumed: number,
): void {
  const sector = WHEEL_SECTORS[sectorIndex];
  const currentId = state.activePlayerIds[state.currentPlayerIndex];

  state.lastSectorIndex = sectorIndex;
  state.last666Effect = null;
  state.rngCallCount += rngCallsConsumed;
  state.currentSpinCount += 1;

  if (sector.type === 'bankrupt') {
    state.roundScores[currentId] = 0;
    state.phase = 'turn_complete';
  } else if (sector.type === 'skip') {
    // Keep current score, end turn
    state.phase = 'turn_complete';
  } else if (sector.type === 'zero') {
    // No change; decide based on spin count
    if (state.currentSpinCount >= 3) {
      state.phase = 'turn_complete';
    } else {
      state.phase = 'awaiting_decision';
    }
  } else if (sector.type === 'devil') {
    // Consume next RNG call for the 666 effect
    const effect = resolve666Effect(state.seed, state.rngCallCount);
    state.rngCallCount += 1;
    state.last666Effect = effect;
    state.roundScores[currentId] =
      (state.roundScores[currentId] ?? 0) + (effect === 'add' ? 666 : -666);
    state.phase = 'six_six_six';
  } else if (sector.type === 'points') {
    state.roundScores[currentId] = (state.roundScores[currentId] ?? 0) + (sector.value ?? 0);
    if (state.currentSpinCount >= 3) {
      state.phase = 'turn_complete';
    } else {
      state.phase = 'awaiting_decision';
    }
  }
}

/** Advance to the next player's turn or round summary. */
function advancePlayerOrRound(state: RiskWheelState): void {
  const currentId = state.activePlayerIds[state.currentPlayerIndex];

  // Mark this player as done for the round
  if (!state.playersCompletedThisRound.includes(currentId)) {
    state.playersCompletedThisRound.push(currentId);
  }

  // Find next player who hasn't completed their turn
  let nextIndex = -1;
  for (let i = 0; i < state.activePlayerIds.length; i++) {
    const candidateId = state.activePlayerIds[i];
    if (!state.playersCompletedThisRound.includes(candidateId)) {
      nextIndex = i;
      break;
    }
  }

  if (nextIndex === -1) {
    // All players done — go to round summary
    state.phase = 'round_summary';
    // Compute eliminations
    const elimCount = computeEliminationCount(
      state.initialPlayerCount,
      state.round,
      state.activePlayerIds.length,
    );
    const tieBreakSeed = (state.seed ^ (state.round * 0xabcdef12)) >>> 0;
    state.eliminatedThisRound = computeEliminatedPlayers(
      state.activePlayerIds,
      state.roundScores,
      elimCount,
      tieBreakSeed,
    );
  } else {
    state.currentPlayerIndex = nextIndex;
    state.currentSpinCount = 0;
    state.lastSectorIndex = null;
    state.last666Effect = null;
    state.phase = 'awaiting_spin';
  }
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const riskWheelSlice = createSlice({
  name: 'riskWheel',
  initialState,
  reducers: {
    /**
     * Initialise a new Risk Wheel competition.
     */
    initRiskWheel(
      state,
      action: PayloadAction<{
        participantIds: string[];
        competitionType: RiskWheelCompetitionType;
        seed: number;
        humanPlayerId: string | null;
      }>,
    ) {
      const { participantIds, competitionType, seed, humanPlayerId } = action.payload;

      // Reset all fields explicitly to avoid Immer frozen-object issues
      state.phase = 'idle';
      state.allPlayerIds = [];
      state.activePlayerIds = [];
      state.eliminatedPlayerIds = [];
      state.humanPlayerId = null;
      state.initialPlayerCount = 0;
      state.round = 1;
      state.roundScores = {};
      state.playersCompletedThisRound = [];
      state.currentPlayerIndex = 0;
      state.currentSpinCount = 0;
      state.lastSectorIndex = null;
      state.last666Effect = null;
      state.eliminatedThisRound = [];
      state.winnerId = null;
      state.rngCallCount = 0;
      state.aiDecisionCallCount = 0;
      state.outcomeResolved = false;

      state.competitionType = competitionType;
      state.seed = seed >>> 0;
      state.humanPlayerId = humanPlayerId;

      state.allPlayerIds = [...participantIds];
      state.activePlayerIds = [...participantIds];
      state.initialPlayerCount = participantIds.length;

      if (participantIds.length === 0) {
        state.phase = 'complete';
        return;
      }

      // Initialise round scores to 0
      for (const id of participantIds) {
        state.roundScores[id] = 0;
      }

      state.round = 1;
      state.currentPlayerIndex = 0;
      state.phase = 'awaiting_spin';
    },

    /**
     * Perform a spin for the current player.
     * Picks a sector, applies effects, and advances phase.
     */
    performSpin(state) {
      if (state.phase !== 'awaiting_spin') return;

      const sectorIndex = pickSectorIndex(state.seed, state.rngCallCount);
      applySector(state, sectorIndex, 1);
    },

    /**
     * Advance from `spin_result` (after the UI has shown the result).
     * Moves to awaiting_decision or turn_complete.
     * Should only be called after non-666 results.
     */
    advanceFromSpinResult(state) {
      if (state.phase !== 'spin_result') return;
      // phase was already set by applySector — this is a no-op kept for symmetry
      // in case we add a dedicated spin_result phase later.
    },

    /**
     * Advance from the 666 animation phase.
     * After the animation, determine whether the player can continue.
     */
    advanceFrom666(state) {
      if (state.phase !== 'six_six_six') return;
      if (state.currentSpinCount >= 3) {
        state.phase = 'turn_complete';
      } else {
        state.phase = 'awaiting_decision';
      }
    },

    /**
     * Human player chooses to stop and bank their score.
     */
    playerStop(state) {
      if (state.phase !== 'awaiting_decision') return;
      state.phase = 'turn_complete';
    },

    /**
     * Human player chooses to spin again.
     */
    playerSpinAgain(state) {
      if (state.phase !== 'awaiting_decision') return;
      state.phase = 'awaiting_spin';
    },

    /**
     * AI player decides whether to stop or spin again.
     * Should only be dispatched when the current player is an AI.
     */
    aiDecide(state) {
      if (state.phase !== 'awaiting_decision') return;
      const currentId = state.activePlayerIds[state.currentPlayerIndex];
      if (currentId === state.humanPlayerId) return; // safety guard

      const score = state.roundScores[currentId] ?? 0;
      const stop = aiShouldStop(state.seed, state.aiDecisionCallCount, score);
      state.aiDecisionCallCount += 1;

      if (stop) {
        state.phase = 'turn_complete';
      } else {
        state.phase = 'awaiting_spin';
      }
    },

    /**
     * Advance from turn_complete to the next player's turn or round_summary.
     */
    advanceFromTurnComplete(state) {
      if (state.phase !== 'turn_complete') return;
      advancePlayerOrRound(state);
    },

    /**
     * Advance from round_summary to the next round or complete.
     */
    advanceFromRoundSummary(state) {
      if (state.phase !== 'round_summary') return;

      // Apply eliminations
      for (const id of state.eliminatedThisRound) {
        state.activePlayerIds = state.activePlayerIds.filter((p) => p !== id);
        if (!state.eliminatedPlayerIds.includes(id)) {
          state.eliminatedPlayerIds.push(id);
        }
      }

      if (state.round >= 3 || state.activePlayerIds.length <= 1) {
        // Game over
        if (state.activePlayerIds.length === 1) {
          state.winnerId = state.activePlayerIds[0];
        } else if (state.activePlayerIds.length > 1) {
          // Determine winner by highest round score
          const winner = state.activePlayerIds.reduce((best, id) =>
            (state.roundScores[id] ?? 0) > (state.roundScores[best] ?? 0) ? id : best,
          );
          state.winnerId = winner;
        } else {
          state.winnerId = null;
        }
        state.phase = 'complete';
        return;
      }

      // Start next round
      state.round += 1;
      state.roundScores = {};
      state.playersCompletedThisRound = [];
      state.eliminatedThisRound = [];
      for (const id of state.activePlayerIds) {
        state.roundScores[id] = 0;
      }
      state.currentPlayerIndex = 0;
      state.currentSpinCount = 0;
      state.lastSectorIndex = null;
      state.last666Effect = null;
      state.phase = 'awaiting_spin';
    },

    /**
     * Mark the competition outcome as resolved (thunk guard).
     */
    markRiskWheelOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /**
     * Reset slice to idle.
     */
    resetRiskWheel() {
      return { ...initialState };
    },
  },
});

export const {
  initRiskWheel,
  performSpin,
  advanceFromSpinResult,
  advanceFrom666,
  playerStop,
  playerSpinAgain,
  aiDecide,
  advanceFromTurnComplete,
  advanceFromRoundSummary,
  markRiskWheelOutcomeResolved,
  resetRiskWheel,
} = riskWheelSlice.actions;

export default riskWheelSlice.reducer;
