/**
 * Redux slice for the "Hold the Wall" endurance competition.
 *
 * State machine:
 *   idle → active  (startHoldTheWall dispatched on component mount)
 *   active → complete  (only one player remains standing)
 *
 * AI drop times are computed deterministically from the seed at start so the
 * result is reproducible. The React component schedules the setTimeout calls
 * and dispatches dropPlayer when each AI timer fires.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Earliest an AI player can drop (ms after game start). */
export const AI_DROP_MIN_MS = 10_000;
/** Latest an AI player can drop (ms after game start). */
export const AI_DROP_MAX_MS = 120_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type HoldTheWallStatus = 'idle' | 'active' | 'complete';

export type HoldTheWallPrizeType = 'HOH' | 'POV';

export interface HoldTheWallState {
  status: HoldTheWallStatus;
  prizeType: HoldTheWallPrizeType;
  seed: number;
  /** IDs of all competition participants (human + AI). */
  participantIds: string[];
  /**
   * Deterministic drop time (ms after game start) for each AI participant.
   * Keyed by player ID; the human player has no entry here.
   */
  aiDropSchedule: Record<string, number>;
  /** IDs of players who have dropped, in drop order (first dropped = index 0). */
  droppedIds: string[];
  /** ID of the last player standing once complete, or null while active. */
  winnerId: string | null;
  /**
   * Guard against dispatching applyMinigameWinner more than once.
   * Mirrors the outcomeResolved pattern used by cwgoCompetitionSlice.
   */
  outcomeResolved: boolean;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: HoldTheWallState = {
  status: 'idle',
  prizeType: 'HOH',
  seed: 0,
  participantIds: [],
  aiDropSchedule: {},
  droppedIds: [],
  winnerId: null,
  outcomeResolved: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a deterministic drop schedule for every non-human participant.
 * Each AI is assigned a personal drop time in [AI_DROP_MIN_MS, AI_DROP_MAX_MS).
 */
export function buildAiDropSchedule(
  seed: number,
  participantIds: string[],
  humanId: string | null,
): Record<string, number> {
  const rng = mulberry32(seed);
  const schedule: Record<string, number> = {};
  const range = AI_DROP_MAX_MS - AI_DROP_MIN_MS;
  for (const id of participantIds) {
    if (id !== humanId) {
      schedule[id] = AI_DROP_MIN_MS + Math.floor(rng() * range);
    }
  }
  return schedule;
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const holdTheWallSlice = createSlice({
  name: 'holdTheWall',
  initialState,
  reducers: {
    /**
     * Initialise (or re-initialise) the competition.
     * Computes the deterministic AI drop schedule from the provided seed.
     */
    startHoldTheWall(
      state,
      action: PayloadAction<{
        participantIds: string[];
        humanId: string | null;
        prizeType: HoldTheWallPrizeType;
        seed: number;
      }>,
    ) {
      const { participantIds, humanId, prizeType, seed } = action.payload;
      state.status = 'active';
      state.prizeType = prizeType;
      state.seed = seed;
      state.participantIds = participantIds;
      state.aiDropSchedule = buildAiDropSchedule(seed, participantIds, humanId);
      state.droppedIds = [];
      state.winnerId = null;
      state.outcomeResolved = false;
    },

    /**
     * Mark a player (human or AI) as having dropped off the wall.
     * Idempotent — safe to call if the player already dropped.
     * Automatically transitions to 'complete' when only one player remains.
     */
    dropPlayer(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.status !== 'active') return;
      if (state.droppedIds.includes(id)) return; // already dropped

      state.droppedIds.push(id);

      const aliveIds = state.participantIds.filter((pid) => !state.droppedIds.includes(pid));
      if (aliveIds.length === 1) {
        state.status = 'complete';
        state.winnerId = aliveIds[0];
      } else if (aliveIds.length === 0) {
        // Defensive: all players dropped in the same synchronous batch (e.g. in
        // tests that dispatch multiple dropPlayer actions without yielding). In
        // practice this cannot happen during a real game because AI timeouts fire
        // one at a time and the human can only release once. We award the prize to
        // the most recently added entry in droppedIds (the last one pushed).
        state.status = 'complete';
        state.winnerId = state.droppedIds[state.droppedIds.length - 1] ?? null;
      }
    },

    /** Idempotency guard: prevent the outcome thunk from firing twice. */
    markHoldTheWallOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset to idle (e.g. when navigating away). */
    resetHoldTheWall() {
      return initialState;
    },
  },
});

export const {
  startHoldTheWall,
  dropPlayer,
  markHoldTheWallOutcomeResolved,
  resetHoldTheWall,
} = holdTheWallSlice.actions;

export default holdTheWallSlice.reducer;
