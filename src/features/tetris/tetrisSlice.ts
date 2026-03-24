/**
 * Redux slice for the "Tetris" scored minigame competition.
 *
 * Flow:
 *   idle     — not started
 *   playing  — human is playing; AI scores are pre-computed
 *   complete — human has submitted a score; winner/lastPlace determined
 *
 * Scoring:
 *  - Standard Tetris scoring: 1 line=100pts, 2=300, 3=500, 4=800 (Tetris!), × level.
 *  - Higher score = better. Winner = highest score. Last place = lowest score.
 *  - AI scores are pre-computed via simulateAiPerformance on slice init.
 *
 * Authoritative outcome:
 *  - Once the human submits their score, setHumanScore computes winner + lastPlaceId
 *    from all player scores (human + AI). resolveTetrisOutcome then dispatches
 *    applyMinigameWinner with the authoritative winner and lastPlaceId.
 *  - outcomeResolved guard prevents double-dispatch.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TetrisPrizeType = 'HOH' | 'POV';
export type TetrisPhase = 'idle' | 'playing' | 'complete';

export interface TetrisParticipant {
  id: string;
  name: string;
  isHuman: boolean;
}

export interface TetrisState {
  phase: TetrisPhase;
  competitionType: TetrisPrizeType;
  seed: number;

  participants: TetrisParticipant[];
  humanPlayerId: string | null;

  /** Pre-computed AI scores (keyed by player ID). Set on init. */
  aiScores: Record<string, number>;
  /** Human's actual score, set when the game ends. */
  humanScore: number | null;
  /** All final scores (AI + human). Populated when phase transitions to 'complete'. */
  finalScores: Record<string, number>;

  winnerId: string | null;
  lastPlaceId: string | null;

  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: TetrisState = {
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

/** Derive winner (highest score) and last place (lowest score) from a score map. */
function deriveWinnerAndLastPlace(
  scores: Record<string, number>,
  participantIds: string[],
): { winnerId: string | null; lastPlaceId: string | null } {
  const eligible = participantIds.filter((id) => id in scores);
  if (eligible.length === 0) return { winnerId: null, lastPlaceId: null };

  let winnerId = eligible[0];
  let lastPlaceId = eligible[0];

  for (const id of eligible) {
    if (scores[id] > scores[winnerId]) winnerId = id;
    if (scores[id] < scores[lastPlaceId]) lastPlaceId = id;
  }

  return { winnerId, lastPlaceId };
}

// ─── Slice ────────────────────────────────────────────────────────────────────

export interface InitTetrisPayload {
  participantIds: string[];
  participantNames: Record<string, string>;
  humanPlayerId: string | null;
  competitionType: TetrisPrizeType;
  seed: number;
  /** Pre-computed AI scores, keyed by player ID. Human's ID must NOT be included. */
  aiScores: Record<string, number>;
}

const tetrisSlice = createSlice({
  name: 'tetris',
  initialState,
  reducers: {
    /**
     * Initialise a new Tetris competition.
     * Should be dispatched by TetrisComp on mount (once).
     */
    initTetris(state, action: PayloadAction<InitTetrisPayload>) {
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
     * Record the human's final score and determine winner + last place.
     * Transitions phase to 'complete'.
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
    markTetrisOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset slice to initial state (called on component unmount or next competition). */
    resetTetris() {
      return { ...initialState };
    },
  },
});

export const { initTetris, setHumanScore, markTetrisOutcomeResolved, resetTetris } =
  tetrisSlice.actions;
export default tetrisSlice.reducer;
