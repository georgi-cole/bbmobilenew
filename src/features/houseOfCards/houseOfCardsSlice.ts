/**
 * Redux slice for the "House of Cards" memory-match competition.
 *
 * State machine:
 *   idle → active (startHouseOfCards dispatched on component mount)
 *   active → complete (when all pairs are found or time runs out)
 *
 * Gameplay: Memory-match race with lane-race progress presentation.
 *
 * Ranking policy (most important first):
 *   1. Finishers rank above non-finishers.
 *   2. Among finishers: higher Clash Score wins.
 *   3. Tiebreak: faster completion time (lower completionTimeMs).
 *   4. Tiebreak: fewer mistakes.
 *   5. Among non-finishers: more pairs matched ranks higher.
 *   6. Stable deterministic fallback by participant order.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of pairs on the board. */
export const TOTAL_PAIRS = 10;
/** Tile counts for the four elimination rounds and the shared final. */
export const HOUSE_OF_CARDS_TILE_COUNTS = [8, 12, 16, 20, 24] as const;
/** Time limit in milliseconds. */
export const GAME_TIME_LIMIT_MS = 60_000;
/** Minimum plausible AI finish time for a 20-card memory match game (ms).
 * A fast human can clear 10 pairs in ~14s with solid pattern recall. */
export const AI_MIN_FINISH_MS = 14_000;
/** Maximum plausible AI finish time (ms). */
export const AI_MAX_FINISH_MS = 55_000;

/** Point values for scoring. */
export const SCORE_MATCH = 100;
export const SCORE_MISTAKE_PENALTY = 20;
export const SCORE_STREAK_BONUS = 25;
export const SCORE_SPEED_BONUS_MAX = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

export type HouseOfCardsStatus = 'idle' | 'active' | 'complete';
export type HouseOfCardsPrizeType = 'LOH' | 'POS';

/**
 * Per-player outcome data for canonical ranking.
 * All fields are needed to fully rank players and derive last place.
 */
export interface PlayerOutcome {
  playerId: string;
  /** Number of pairs successfully matched. */
  matchedPairs: number;
  /** Number of incorrect flip attempts. */
  mistakes: number;
  /** Total flips taken (matches × 2 + mismatches × 2). */
  turnsTaken: number;
  /** Whether the player completed all pairs within the time limit. */
  didFinish: boolean;
  /** Time in ms from game start to completing all pairs (null if did not finish). */
  completionTimeMs: number | null;
  /** Best consecutive-match streak achieved. */
  streakBest: number;
  /** Final computed Clash Score displayed in the UI. */
  clashScore: number;
  /** Final rank (1 = winner). Set after all players are ranked. */
  finalRank: number;
}

export interface HouseOfCardsState {
  status: HouseOfCardsStatus;
  prizeType: HouseOfCardsPrizeType;
  seed: number;
  /** IDs of all competition participants (human + AI). */
  participantIds: string[];
  /**
   * Deterministic AI result for each non-human participant.
   * Keyed by player ID. The human player's outcome is filled in on completion.
   */
  aiOutcomes: Record<string, PlayerOutcome>;
  /** Human player's partial outcome (updated live during gameplay). */
  humanOutcome: PlayerOutcome | null;
  /** Final ordered standings (best → worst) derived from all outcomes. */
  standings: PlayerOutcome[];
  /** ID of the competition winner (null while active). */
  winnerId: string | null;
  /** ID of the last-place finisher (null while active). */
  lastPlaceId: string | null;
  /** Guard against dispatching applyMinigameWinner more than once. */
  outcomeResolved: boolean;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: HouseOfCardsState = {
  status: 'idle',
  prizeType: 'LOH',
  seed: 0,
  participantIds: [],
  aiOutcomes: {},
  humanOutcome: null,
  standings: [],
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the Clash Score from raw outcome data.
 *
 * Formula:
 *   base     = matchedPairs × SCORE_MATCH
 *   streaks  = streakBest × SCORE_STREAK_BONUS
 *   speed    = (1 - completionTimeMs / GAME_TIME_LIMIT_MS) × SCORE_SPEED_BONUS_MAX  (finishers only)
 *   penalty  = mistakes × SCORE_MISTAKE_PENALTY
 *   total    = base + streaks + speed - penalty  (min 0)
 */
export function computeClashScore(outcome: Omit<PlayerOutcome, 'clashScore' | 'finalRank'>): number {
  const base = outcome.matchedPairs * SCORE_MATCH;
  const streakBonus = outcome.streakBest * SCORE_STREAK_BONUS;
  const speedBonus =
    outcome.didFinish && outcome.completionTimeMs !== null
      ? Math.round((1 - outcome.completionTimeMs / GAME_TIME_LIMIT_MS) * SCORE_SPEED_BONUS_MAX)
      : 0;
  const penalty = outcome.mistakes * SCORE_MISTAKE_PENALTY;
  return Math.max(0, base + streakBonus + speedBonus - penalty);
}

/**
 * Sort outcomes into final standings using the ranking policy documented at
 * the top of this file. Returns a new array ordered best → worst.
 */
export function rankOutcomes(outcomes: Omit<PlayerOutcome, 'finalRank'>[], participantIds: string[]): PlayerOutcome[] {
  const sorted = [...outcomes].sort((a, b) => {
    // 1. Finishers rank above non-finishers.
    if (a.didFinish !== b.didFinish) return a.didFinish ? -1 : 1;
    if (a.didFinish && b.didFinish) {
      // 2. Higher Clash Score wins.
      if (b.clashScore !== a.clashScore) return b.clashScore - a.clashScore;
      // 3. Faster completion time.
      const aTime = a.completionTimeMs ?? GAME_TIME_LIMIT_MS;
      const bTime = b.completionTimeMs ?? GAME_TIME_LIMIT_MS;
      if (aTime !== bTime) return aTime - bTime;
      // 4. Fewer mistakes.
      if (a.mistakes !== b.mistakes) return a.mistakes - b.mistakes;
    } else {
      // Non-finishers: more matched pairs ranks higher.
      if (a.matchedPairs !== b.matchedPairs) return b.matchedPairs - a.matchedPairs;
      // Then fewer mistakes.
      if (a.mistakes !== b.mistakes) return a.mistakes - b.mistakes;
    }
    // 6. Stable deterministic fallback by original participant order.
    return participantIds.indexOf(a.playerId) - participantIds.indexOf(b.playerId);
  });
  return sorted.map((o, i) => ({ ...o, finalRank: i + 1 }));
}

/**
 * Simulate a deterministic AI outcome for a single participant.
 *
 * AI skill is modelled on a normal-ish distribution seeded per-participant.
 * Higher seed offsets produce stronger players. This keeps results reproducible
 * across re-renders and test runs.
 */
export function simulateAiOutcome(
  playerId: string,
  seed: number,
  participantIndex: number,
): Omit<PlayerOutcome, 'clashScore' | 'finalRank'> {
  // 0x9e3779b9 is the Fibonacci hashing constant (golden-ratio-derived) used to
  // spread participant indices across the 32-bit seed space, ensuring each AI
  // player gets a substantially different RNG sequence even with adjacent indices.
  const rng = mulberry32(seed ^ (participantIndex * 0x9e3779b9));

  // Skill: 0.0 (weak) → 1.0 (strong)
  const skill = 0.2 + rng() * 0.8; // range [0.2, 1.0)

  // Determine if AI finishes within time
  const finishChance = 0.4 + skill * 0.5; // 40%–90% chance of finishing
  const didFinish = rng() < finishChance;

  // Matched pairs (1–TOTAL_PAIRS for non-finishers, always TOTAL_PAIRS for finishers)
  const matchedPairs = didFinish ? TOTAL_PAIRS : Math.max(1, Math.floor(rng() * skill * TOTAL_PAIRS));

  // Mistakes (stronger players make fewer mistakes)
  const mistakes = Math.floor(rng() * (1 - skill) * 12);

  // Turns taken
  const turnsTaken = matchedPairs * 2 + mistakes * 2;

  // Completion time (ms) — only set if finished.
  // Clamped to [AI_MIN_FINISH_MS, AI_MAX_FINISH_MS] so completions never
  // appear unrealistically fast at game start.
  const completionTimeMs = didFinish
    ? Math.min(
        AI_MAX_FINISH_MS,
        Math.max(
          AI_MIN_FINISH_MS,
          Math.floor(AI_MIN_FINISH_MS + (1 - skill) * (AI_MAX_FINISH_MS - AI_MIN_FINISH_MS) + rng() * 4_000),
        ),
      )
    : null;

  // Streak best (stronger players get longer streaks)
  const streakBest = Math.floor(rng() * skill * 5) + (didFinish ? 1 : 0);

  return {
    playerId,
    matchedPairs,
    mistakes,
    turnsTaken,
    didFinish,
    completionTimeMs,
    streakBest,
  };
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const houseOfCardsSlice = createSlice({
  name: 'houseOfCards',
  initialState,
  reducers: {
    /**
     * Initialise (or re-initialise) the competition.
     * Simulates deterministic AI outcomes from the provided seed.
     */
    startHouseOfCards(
      state,
      action: PayloadAction<{
        participantIds: string[];
        humanId: string | null;
        prizeType: HouseOfCardsPrizeType;
        seed: number;
      }>,
    ) {
      const { participantIds, humanId, prizeType, seed } = action.payload;
      state.status = 'active';
      state.prizeType = prizeType;
      state.seed = seed;
      state.participantIds = participantIds;
      state.winnerId = null;
      state.lastPlaceId = null;
      state.outcomeResolved = false;
      state.standings = [];
      state.humanOutcome = null;

      // Simulate deterministic AI outcomes.
      const aiOutcomes: Record<string, PlayerOutcome> = {};
      participantIds.forEach((id, idx) => {
        if (id !== humanId) {
          const partial = simulateAiOutcome(id, seed, idx);
          aiOutcomes[id] = {
            ...partial,
            clashScore: computeClashScore(partial),
            finalRank: 0, // filled in by finaliseOutcome
          };
        }
      });
      state.aiOutcomes = aiOutcomes;
    },

    /**
     * Called by the React component when the human player finishes.
     * Computes the full standings and sets winnerId / lastPlaceId.
     */
    finaliseOutcome(
      state,
      action: PayloadAction<{
        matchedPairs: number;
        mistakes: number;
        turnsTaken: number;
        completionTimeMs: number | null;
        streakBest: number;
        humanId: string;
      }>,
    ) {
      if (state.status !== 'active') return;

      const { matchedPairs, mistakes, turnsTaken, completionTimeMs, streakBest, humanId } =
        action.payload;

      const didFinish = completionTimeMs !== null;

      const humanPartial = {
        playerId: humanId,
        matchedPairs,
        mistakes,
        turnsTaken,
        didFinish,
        completionTimeMs,
        streakBest,
      };
      const humanOutcome: PlayerOutcome = {
        ...humanPartial,
        clashScore: computeClashScore(humanPartial),
        finalRank: 0,
      };
      state.humanOutcome = humanOutcome;

      // Gather all outcomes and rank them.
      const allOutcomes: Omit<PlayerOutcome, 'finalRank'>[] = [
        humanOutcome,
        ...Object.values(state.aiOutcomes),
      ];
      const ranked = rankOutcomes(allOutcomes, state.participantIds);
      state.standings = ranked;
      state.winnerId = ranked[0]?.playerId ?? null;
      state.lastPlaceId = ranked[ranked.length - 1]?.playerId ?? null;
      state.status = 'complete';
    },

    /** Complete the five-round tournament using the already-authoritative order. */
    completeHouseOfCardsTournament(
      state,
      action: PayloadAction<{ standings: Array<Omit<PlayerOutcome, 'finalRank'>> }>,
    ) {
      if (state.status !== 'active') return;
      state.standings = action.payload.standings.map((outcome, index) => ({
        ...outcome,
        finalRank: index + 1,
      }));
      state.winnerId = state.standings[0]?.playerId ?? null;
      state.lastPlaceId = state.standings[state.standings.length - 1]?.playerId ?? null;
      state.status = 'complete';
    },

    /** Idempotency guard: prevent the outcome thunk from firing twice. */
    markHouseOfCardsOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset to idle (e.g. when navigating away). */
    resetHouseOfCards() {
      return initialState;
    },
  },
});

export const {
  startHouseOfCards,
  finaliseOutcome,
  completeHouseOfCardsTournament,
  markHouseOfCardsOutcomeResolved,
  resetHouseOfCards,
} = houseOfCardsSlice.actions;

export default houseOfCardsSlice.reducer;
