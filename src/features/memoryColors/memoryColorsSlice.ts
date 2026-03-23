/**
 * Redux slice for the "Memory Colors" sequence-memory competition.
 *
 * State machine:
 *
 *   idle
 *    └─ initMemoryColors ───────────────────────────────→ showing
 *         └─ (sequence reveal completes) ──────────────→ input
 *              ├─ recordInput (correct, round not complete) → input
 *              ├─ recordInput (correct, round complete) ──→ round_cleared
 *              │    └─ startNextRound ─────────────────→ showing
 *              ├─ recordInput (wrong, 1st mistake) ─────→ warning_beat
 *              │    └─ resumeAfterWarning ──────────────→ input
 *              └─ recordInput (wrong, 2nd mistake) ─────→ complete
 *
 * Rules:
 *  - 4 color pads (indices 0-3).
 *  - Sequence starts at length 3; +1 each round.
 *  - Player gets exactly 1 mistake total.
 *  - First mistake: warning, run continues.
 *  - Second mistake: run ends immediately.
 *
 * Ranking (higher is better):
 *  1. roundsCleared (more = better)
 *  2. failedAtStep (deeper progress in failed round = better)
 *  3. mistakesUsed (fewer = better)
 *  4. totalResponseMs (lower = better)
 *  5. Deterministic seeded tiebreak
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryColorsCompetitionType = 'HOH' | 'POV';

export type MemoryColorsPhase =
  | 'idle'
  | 'showing'         // sequence reveal in progress
  | 'input'           // waiting for human input
  | 'warning_beat'    // first-mistake warning animation
  | 'round_cleared'   // round just completed successfully
  | 'complete';       // game over

/** Per-player canonical result. */
export interface MemoryColorsPlayerResult {
  /** Number of full rounds successfully completed. */
  roundsCleared: number;
  /** Deepest correct step reached inside the failed round (0 if no failed round). */
  failedAtStep: number;
  /** Mistakes used: 0 or 1. */
  mistakesUsed: number;
  /** Total input response time in ms. */
  totalResponseMs: number;
  /** Derived numeric score (higher = better). Used by applyMinigameWinner scores map. */
  score: number;
}

export interface MemoryColorsState {
  phase: MemoryColorsPhase;
  participantIds: string[];
  competitionType: MemoryColorsCompetitionType | null;
  seed: number;
  humanPlayerId: string | null;

  /** Current round (1-indexed). */
  round: number;
  /** Current sequence of color indices (0-3). */
  sequence: number[];
  /** Index of the next expected input from the player. */
  inputIndex: number;
  /** When current step started (for response-time tracking); -1 = not tracking. */
  stepStartMs: number;
  /** Accumulated response time for current run (ms). */
  totalResponseMs: number;
  /** Mistakes used in current human run (0 or 1). */
  mistakesUsed: number;

  /** Pre-computed AI player results keyed by participantId. */
  aiResults: Record<string, MemoryColorsPlayerResult>;

  /** Human's final result (set when human run ends). */
  humanResult: MemoryColorsPlayerResult | null;

  /** Final canonical ranking (best → worst). Populated at phase === 'complete'. */
  finalRanking: string[];
  winnerId: string | null;
  lastPlaceId: string | null;

  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const NUM_COLORS = 4;
export const INITIAL_SEQUENCE_LENGTH = 3;

// ─── RNG helpers ─────────────────────────────────────────────────────────────

/** XOR salts to isolate different RNG streams. */
const SALT_SEQUENCE = 0xabcdef01;
const SALT_AI = 0x12345678;
const SALT_TIEBREAK = 0xdeadcafe;

/**
 * Generate the color sequence for a given round using a seeded RNG.
 * Sequences grow by 1 color each round: round 1 = length 3, round N = length 2+N.
 */
export function generateSequence(seed: number, round: number): number[] {
  const length = INITIAL_SEQUENCE_LENGTH + (round - 1);
  const rng = mulberry32((seed ^ SALT_SEQUENCE ^ (round * 0x9e3779b9)) >>> 0);
  return Array.from({ length }, () => Math.floor(rng() * NUM_COLORS));
}

/** Derive a numeric tiebreak score in [0, 1) for a player, seeded deterministically. */
function tiebreakScore(seed: number, playerId: string): number {
  let hash = (seed ^ SALT_TIEBREAK) >>> 0;
  for (let i = 0; i < playerId.length; i++) {
    hash ^= playerId.charCodeAt(i);
    hash = (Math.imul(hash, 0x01000193)) >>> 0;
  }
  return (hash >>> 0) / 0x100000000;
}

/**
 * Derive a canonical numeric score from per-player result data.
 * Higher is always better.
 * Encoding:
 *   score = roundsCleared * 1_000_000
 *         + failedAtStep  *    10_000
 *         + (1 - mistakesUsed) * 1_000     (fewer mistakes = higher)
 *         + (1 - clampedResponseFraction) * 100  (lower time = higher)
 */
export function computePlayerScore(result: Omit<MemoryColorsPlayerResult, 'score'>): number {
  const responseFraction = Math.min(result.totalResponseMs / 300_000, 1); // cap at 5 min
  return (
    result.roundsCleared * 1_000_000 +
    result.failedAtStep * 10_000 +
    (1 - result.mistakesUsed) * 1_000 +
    Math.round((1 - responseFraction) * 100)
  );
}

/**
 * Simulate an AI player's run deterministically from seed.
 *
 * AI performance model:
 *  - Each AI has a "skill" in [0.5, 1.0] derived from seed + playerId.
 *  - Higher skill → more rounds cleared, fewer mistakes, faster responses.
 */
export function simulateAiResult(seed: number, playerId: string): MemoryColorsPlayerResult {
  const rng = mulberry32((seed ^ SALT_AI) >>> 0);
  // Consume some RNG calls so different players diverge.
  for (let i = 0; i < playerId.length; i++) rng();

  // Skill in [0.5, 1.0]
  const skill = 0.5 + rng() * 0.5;
  const madeFirstMistake = rng() > skill * 0.7;
  const mistakesUsed = madeFirstMistake ? 1 : 0;

  // Rounds cleared: most AIs clear 2–8 rounds depending on skill.
  const maxExpectedRounds = Math.floor(skill * 12);
  const roundsCleared = Math.max(0, Math.floor(rng() * maxExpectedRounds));

  // If they failed mid-round, how far did they get?
  const failedRoundLength = INITIAL_SEQUENCE_LENGTH + roundsCleared;
  const failedAtStep = madeFirstMistake
    ? Math.floor(rng() * failedRoundLength)
    : 0;

  // Response time: faster with higher skill
  const baseMs = 400 + rng() * 300; // 400–700ms per step
  const totalSteps = roundsCleared > 0
    ? Array.from({ length: roundsCleared }, (_, i) => INITIAL_SEQUENCE_LENGTH + i)
        .reduce((sum, len) => sum + len, 0)
    : failedAtStep;
  const totalResponseMs = Math.round(totalSteps * baseMs);

  const result: Omit<MemoryColorsPlayerResult, 'score'> = {
    roundsCleared,
    failedAtStep,
    mistakesUsed,
    totalResponseMs,
  };
  return { ...result, score: computePlayerScore(result) };
}

/**
 * Compute the full canonical ranking for all participants.
 * Returns participant IDs sorted best → worst.
 */
export function computeRanking(
  participantIds: string[],
  resultsById: Record<string, MemoryColorsPlayerResult>,
  seed: number,
): string[] {
  return [...participantIds].sort((a, b) => {
    const ra = resultsById[a];
    const rb = resultsById[b];
    if (!ra && !rb) return tiebreakScore(seed, a) - tiebreakScore(seed, b);
    if (!ra) return 1;
    if (!rb) return -1;

    // Higher score = better
    const scoreDiff = rb.score - ra.score;
    if (scoreDiff !== 0) return scoreDiff;

    // Deterministic tiebreak
    return tiebreakScore(seed, b) - tiebreakScore(seed, a);
  });
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: MemoryColorsState = {
  phase: 'idle',
  participantIds: [],
  competitionType: null,
  seed: 0,
  humanPlayerId: null,

  round: 1,
  sequence: [],
  inputIndex: 0,
  stepStartMs: -1,
  totalResponseMs: 0,
  mistakesUsed: 0,

  aiResults: {},
  humanResult: null,
  finalRanking: [],
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const memoryColorsSlice = createSlice({
  name: 'memoryColors',
  initialState,
  reducers: {
    /**
     * Initialise (or re-initialise) the competition.
     * Pre-computes AI results from seed, generates first sequence, transitions idle → showing.
     */
    initMemoryColors(
      state,
      action: PayloadAction<{
        participantIds: string[];
        competitionType: MemoryColorsCompetitionType;
        seed: number;
        humanPlayerId: string | null;
      }>,
    ) {
      const { participantIds, competitionType, seed, humanPlayerId } = action.payload;

      Object.assign(state, {
        ...initialState,
        participantIds,
        competitionType,
        seed,
        humanPlayerId,
        round: 1,
        sequence: generateSequence(seed, 1),
        phase: 'showing' as MemoryColorsPhase,
      });

      // Pre-compute AI results for all non-human participants.
      const aiResults: Record<string, MemoryColorsPlayerResult> = {};
      for (const id of participantIds) {
        if (id !== humanPlayerId) {
          aiResults[id] = simulateAiResult(seed, id);
        }
      }
      state.aiResults = aiResults;
    },

    /**
     * Transition from showing → input phase (called by component after reveal finishes).
     */
    beginInput(state) {
      if (state.phase !== 'showing') return;
      state.phase = 'input';
      state.inputIndex = 0;
      state.stepStartMs = -1;
    },

    /** Update the timestamp when the current input step started (for timing). */
    setStepStartMs(state, action: PayloadAction<number>) {
      state.stepStartMs = action.payload;
    },

    /**
     * Record a human input (color index tap).
     *
     * Transitions:
     *  - correct + round not complete → stays 'input', advances inputIndex
     *  - correct + round complete     → 'round_cleared'
     *  - wrong + mistakesUsed === 0   → 'warning_beat', mistakesUsed = 1
     *  - wrong + mistakesUsed === 1   → 'complete' (end of run)
     */
    recordInput(
      state,
      action: PayloadAction<{ colorIndex: number; now: number }>,
    ) {
      if (state.phase !== 'input') return;

      const { colorIndex, now } = action.payload;

      // Accumulate response time for this step.
      if (state.stepStartMs >= 0) {
        state.totalResponseMs += Math.max(0, now - state.stepStartMs);
      }
      state.stepStartMs = now;

      const expected = state.sequence[state.inputIndex];
      const isCorrect = colorIndex === expected;

      if (isCorrect) {
        state.inputIndex += 1;
        if (state.inputIndex >= state.sequence.length) {
          // Round complete!
          state.phase = 'round_cleared';
        }
        // else stay in 'input'
      } else {
        // Wrong input
        if (state.mistakesUsed === 0) {
          state.mistakesUsed = 1;
          state.phase = 'warning_beat';
        } else {
          // Second mistake — end run
          const failedAtStep = state.inputIndex;
          const roundsCleared = state.round - 1;
          const result: Omit<MemoryColorsPlayerResult, 'score'> = {
            roundsCleared,
            failedAtStep,
            mistakesUsed: state.mistakesUsed,
            totalResponseMs: state.totalResponseMs,
          };
          state.humanResult = { ...result, score: computePlayerScore(result) };
          state.phase = 'complete';
          memoryColorsSlice.caseReducers._finalizeOutcome(state);
        }
      }
    },

    /**
     * Resume after the first-mistake warning animation completes.
     * Resets input state to the beginning of the current sequence and re-shows it.
     */
    resumeAfterWarning(state) {
      if (state.phase !== 'warning_beat') return;
      state.phase = 'showing';
      state.inputIndex = 0;
      state.stepStartMs = -1;
    },

    /**
     * Start the next round after round_cleared.
     * Increments round, regenerates sequence, transitions → showing.
     */
    startNextRound(state) {
      if (state.phase !== 'round_cleared') return;
      state.round += 1;
      state.sequence = generateSequence(state.seed, state.round);
      state.inputIndex = 0;
      state.stepStartMs = -1;
      state.phase = 'showing';
    },

    /**
     * Called when the human clears a round and opts to end (e.g. ran out of time).
     * Also called internally on round_cleared → complete if a time cap is hit.
     */
    endRunAfterRoundCleared(state) {
      if (state.phase !== 'round_cleared') return;
      const roundsCleared = state.round; // they cleared this round
      const result: Omit<MemoryColorsPlayerResult, 'score'> = {
        roundsCleared,
        failedAtStep: 0,
        mistakesUsed: state.mistakesUsed,
        totalResponseMs: state.totalResponseMs,
      };
      state.humanResult = { ...result, score: computePlayerScore(result) };
      state.phase = 'complete';
      memoryColorsSlice.caseReducers._finalizeOutcome(state);
    },

    /** Internal: compute finalRanking, winnerId, lastPlaceId. Called after humanResult is set. */
    _finalizeOutcome(state) {
      if (!state.humanResult) return;
      const allResults: Record<string, MemoryColorsPlayerResult> = {
        ...state.aiResults,
      };
      if (state.humanPlayerId) {
        allResults[state.humanPlayerId] = state.humanResult;
      }

      const ranking = computeRanking(state.participantIds, allResults, state.seed);
      state.finalRanking = ranking;
      state.winnerId = ranking[0] ?? null;
      state.lastPlaceId = ranking[ranking.length - 1] ?? null;
    },

    /** Idempotency guard: prevent the outcome thunk from firing twice. */
    markMemoryColorsOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset slice to idle. */
    resetMemoryColors() {
      return { ...initialState };
    },
  },
});

export const {
  initMemoryColors,
  beginInput,
  setStepStartMs,
  recordInput,
  resumeAfterWarning,
  startNextRound,
  endRunAfterRoundCleared,
  markMemoryColorsOutcomeResolved,
  resetMemoryColors,
} = memoryColorsSlice.actions;

export default memoryColorsSlice.reducer;
