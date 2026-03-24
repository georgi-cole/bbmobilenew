/**
 * Redux slice for the "Tilt Labyrinth" scored minigame competition.
 *
 * Flow:
 *   idle     — not started
 *   playing  — human is playing; AI scores are pre-computed
 *   complete — human has submitted a score; winner/lastPlace determined
 *
 * Scoring (lower-is-better / time-based):
 *  - Scores are completion times in milliseconds.
 *  - Lower time = better. Winner = fastest (lowest ms). Last place = slowest (highest ms).
 *  - AI scores are pre-computed via simulateAiPerformance before initTiltLabyrinth
 *    and passed into the slice as aiScores.
 *
 * Authoritative outcome:
 *  - Once the human submits their time, setHumanScore computes winner + lastPlaceId
 *    from all player scores (human + AI). resolveTiltLabyrinthOutcome then dispatches
 *    applyMinigameWinner with the authoritative winner and lastPlaceId.
 *  - outcomeResolved guard prevents double-dispatch.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TiltLabyrinthPrizeType = 'HOH' | 'POV';
export type TiltLabyrinthPhase = 'idle' | 'playing' | 'complete';

export interface TiltLabyrinthParticipant {
  id: string;
  name: string;
  isHuman: boolean;
}

export interface TiltLabyrinthState {
  phase: TiltLabyrinthPhase;
  competitionType: TiltLabyrinthPrizeType;
  seed: number;

  participants: TiltLabyrinthParticipant[];
  humanPlayerId: string | null;

  /** Pre-computed AI completion times in ms (keyed by player ID). Set on init. */
  aiScores: Record<string, number>;
  /** Human's actual completion time in ms, set when the game ends. */
  humanScore: number | null;
  /** All final scores (AI + human). Populated when phase transitions to 'complete'. */
  finalScores: Record<string, number>;

  winnerId: string | null;
  lastPlaceId: string | null;

  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: TiltLabyrinthState = {
  phase: 'idle',
  competitionType: 'HOH',
  seed: 0,
  participants: [],
  humanPlayerId: null,
  aiScores: {},
  humanScore: null,
  finalScores: {},
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive winner (lowest time) and last place (highest time) from a completion-time map.
 * Lower time = better performance for a timed maze game.
 *
 * When fewer than 2 eligible participants exist, or when all scores are identical
 * (all players tied), lastPlaceId is returned as null to prevent it from equalling
 * the winner. In practice this means the store falls back to score-based derivation,
 * which is acceptable because authoritative data cannot distinguish tied finishers.
 */
function deriveWinnerAndLastPlace(
  scores: Record<string, number>,
  participantIds: string[],
): { winnerId: string | null; lastPlaceId: string | null } {
  const eligible = participantIds.filter((id) => id in scores);
  if (eligible.length === 0) return { winnerId: null, lastPlaceId: null };
  if (eligible.length === 1) return { winnerId: eligible[0], lastPlaceId: null };

  let winnerId = eligible[0];
  let lastPlaceId = eligible[0];

  for (const id of eligible) {
    // Lower score (time) = better → winner has the minimum
    if (scores[id] < scores[winnerId]) winnerId = id;
    // Higher score (time) = worse → last place has the maximum
    if (scores[id] > scores[lastPlaceId]) lastPlaceId = id;
  }

  // Guard: winner and last place must differ; if all scores are identical they
  // would be the same player. Return null so the store can fall back safely.
  if (winnerId === lastPlaceId) return { winnerId, lastPlaceId: null };

  return { winnerId, lastPlaceId };
}

// ─── Slice ────────────────────────────────────────────────────────────────────

export interface InitTiltLabyrinthPayload {
  participantIds: string[];
  participantNames: Record<string, string>;
  humanPlayerId: string | null;
  competitionType: TiltLabyrinthPrizeType;
  seed: number;
  /** Pre-computed AI completion times in ms, keyed by player ID. Human's ID must NOT be included. */
  aiScores: Record<string, number>;
}

const tiltLabyrinthSlice = createSlice({
  name: 'tiltLabyrinth',
  initialState,
  reducers: {
    /**
     * Initialise a new Tilt Labyrinth competition.
     * Should be dispatched by TiltLabyrinthComp on mount (once).
     */
    initTiltLabyrinth(state, action: PayloadAction<InitTiltLabyrinthPayload>) {
      const { participantIds, participantNames, humanPlayerId, competitionType, seed, aiScores } =
        action.payload;

      state.phase = 'playing';
      state.competitionType = competitionType;
      state.seed = seed;
      state.humanPlayerId = humanPlayerId;
      state.aiScores = aiScores;
      state.humanScore = null;
      state.finalScores = {};
      state.winnerId = null;
      state.lastPlaceId = null;
      state.outcomeResolved = false;

      state.participants = participantIds.map((id) => ({
        id,
        name: participantNames[id] ?? id,
        isHuman: id === humanPlayerId,
      }));
    },

    /**
     * Record the human's final completion time (ms) and determine winner + last place.
     * Transitions phase to 'complete'.
     * Lower time = better (faster maze completion).
     */
    setHumanScore(state, action: PayloadAction<number>) {
      if (state.phase !== 'playing') return;

      const humanScore = action.payload;
      state.humanScore = humanScore;

      // Build full score map: AI scores + human score
      const allScores: Record<string, number> = { ...state.aiScores };
      if (state.humanPlayerId) {
        allScores[state.humanPlayerId] = humanScore;
      }
      state.finalScores = allScores;

      const participantIds = state.participants.map((p) => p.id);
      const { winnerId, lastPlaceId } = deriveWinnerAndLastPlace(allScores, participantIds);
      state.winnerId = winnerId;
      state.lastPlaceId = lastPlaceId;
      state.phase = 'complete';
    },

    /** Mark the outcome as resolved — prevents the thunk from dispatching twice. */
    markTiltLabyrinthOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset slice to initial state (called on component unmount or next competition). */
    resetTiltLabyrinth() {
      return { ...initialState };
    },
  },
});

export const {
  initTiltLabyrinth,
  setHumanScore,
  markTiltLabyrinthOutcomeResolved,
  resetTiltLabyrinth,
} = tiltLabyrinthSlice.actions;
export default tiltLabyrinthSlice.reducer;
