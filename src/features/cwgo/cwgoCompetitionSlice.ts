/**
 * Redux slice for the "Closest Without Going Over" (CWGO) competition.
 *
 * State machine flow:
 *   idle → mass_input → mass_reveal → (if >2 alive) choose_duel → duel_input
 *        → duel_reveal → (repeat until 1 alive) → complete
 *   OR:  mass_reveal → complete (if 1 alive after mass)
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';
import { CWGO_QUESTIONS } from './cwgoQuestions';
import {
  generateAIGuess,
  computeWinnerClosestWithoutGoingOver,
  computeMassElimination,
  computeSortedResultsForReveal,
} from './cwgoHelpers';
import type { CwgoGuessEntry, CwgoResult } from './cwgoHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CwgoStatus =
  | 'idle'
  | 'mass_input'
  | 'mass_reveal'
  | 'choose_duel'
  | 'duel_input'
  | 'duel_reveal'
  | 'complete';

export type CwgoPrizeType = 'HOH' | 'POV';

export interface CwgoState {
  status: CwgoStatus;
  prizeType: CwgoPrizeType;
  seed: number;
  /** IDs of players still competing. */
  aliveIds: string[];
  /** Current question index into CWGO_QUESTIONS. */
  questionIdx: number;
  /** Guesses submitted for the current round (keyed by playerId). */
  guesses: Record<string, number>;
  /** Sorted results for the current reveal phase. */
  revealResults: CwgoResult[];
  /** IDs eliminated in the latest round. */
  lastEliminated: string[];
  /** Round counter (used for seeding RNG per-round). */
  round: number;
  /** IDs of the two players currently dueling. */
  duelPair: [string, string] | null;
  /** ID of the winner of the latest duel. */
  duelWinnerId: string | null;
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: CwgoState = {
  status: 'idle',
  prizeType: 'HOH',
  seed: 0,
  aliveIds: [],
  questionIdx: 0,
  guesses: {},
  revealResults: [],
  lastEliminated: [],
  round: 0,
  duelPair: null,
  duelWinnerId: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pick a question index deterministically from the seed and round. */
function pickQuestionIdx(seed: number, round: number): number {
  const rng = mulberry32((seed ^ (round * 0x9e3779b9)) >>> 0);
  return Math.floor(rng() * CWGO_QUESTIONS.length);
}

/** Auto-fill AI guesses for all non-human aliveIds using seeded RNG. */
function fillAIGuesses(
  guesses: Record<string, number>,
  aliveIds: string[],
  humanIds: Set<string>,
  answer: number,
  seed: number,
  round: number,
): Record<string, number> {
  const updated = { ...guesses };
  let aiSeed = (seed ^ (round * 0x5851f42d)) >>> 0;
  for (const id of aliveIds) {
    if (!humanIds.has(id) && updated[id] === undefined) {
      // Derive a per-player skill from the seeded RNG so AI performance varies.
      const aiSkill = mulberry32(aiSeed)();
      // Advance seed before generating the guess so skill and guess use independent RNG sequences.
      aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0;
      updated[id] = generateAIGuess(answer, aiSkill, aiSeed);
      // Advance seed for next AI player
      aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0;
    }
  }
  return updated;
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const cwgoSlice = createSlice({
  name: 'cwgo',
  initialState,
  reducers: {
    /** Start a new CWGO competition with the given players and prize type. */
    startCwgoCompetition(
      state,
      action: PayloadAction<{
        participantIds: string[];
        prizeType: CwgoPrizeType;
        seed: number;
      }>,
    ) {
      const { participantIds, prizeType, seed } = action.payload;
      state.status = 'mass_input';
      state.prizeType = prizeType;
      state.seed = seed;
      state.aliveIds = [...participantIds];
      state.round = 0;
      state.guesses = {};
      state.revealResults = [];
      state.lastEliminated = [];
      state.duelPair = null;
      state.duelWinnerId = null;
      state.questionIdx = pickQuestionIdx(seed, 0);
    },

    /**
     * Set guesses for one or more players.
     * Typically called by the human player submitting their guess,
     * or by AI fill logic.
     */
    setGuesses(state, action: PayloadAction<Record<string, number>>) {
      state.guesses = { ...state.guesses, ...action.payload };
    },

    /**
     * Auto-fill AI guesses for all non-human alive players using seeded RNG.
     * humanIds is the set of player IDs that are human-controlled.
     */
    autoFillAIGuesses(
      state,
      action: PayloadAction<{ humanIds: string[] }>,
    ) {
      const { humanIds } = action.payload;
      const question = CWGO_QUESTIONS[state.questionIdx];
      if (!question) return;
      const humanSet = new Set(humanIds);
      state.guesses = fillAIGuesses(
        state.guesses,
        state.aliveIds,
        humanSet,
        question.answer,
        state.seed,
        state.round,
      );
    },

    /**
     * Transition from mass_input → mass_reveal.
     * Computes sorted results for display.
     */
    revealMassResults(state) {
      if (state.status !== 'mass_input') return;
      const question = CWGO_QUESTIONS[state.questionIdx];
      if (!question) return;

      const entries: CwgoGuessEntry[] = state.aliveIds.map((id) => ({
        playerId: id,
        guess: state.guesses[id] ?? 0,
      }));

      state.revealResults = computeSortedResultsForReveal(entries, question.answer);
      state.status = 'mass_reveal';
    },

    /**
     * Confirm the mass elimination — moves eliminated players out of aliveIds.
     * Transitions to: complete (1 alive), choose_duel (>2 alive), or duel_input (==2 alive).
     */
    confirmMassElimination(state) {
      if (state.status !== 'mass_reveal') return;
      const question = CWGO_QUESTIONS[state.questionIdx];
      if (!question) return;

      const entries: CwgoGuessEntry[] = state.aliveIds.map((id) => ({
        playerId: id,
        guess: state.guesses[id] ?? 0,
      }));

      const { eliminated, surviving } = computeMassElimination(
        entries,
        question.answer,
        state.aliveIds,
      );

      state.lastEliminated = eliminated;
      state.aliveIds = surviving;
      state.guesses = {};
      state.round += 1;

      if (surviving.length <= 1) {
        state.status = 'complete';
      } else if (surviving.length === 2) {
        // Go straight to duel
        state.duelPair = [surviving[0], surviving[1]];
        state.questionIdx = pickQuestionIdx(state.seed, state.round);
        state.status = 'duel_input';
      } else {
        // Advance question so the pick screen doesn't show the previous question
        state.questionIdx = pickQuestionIdx(state.seed, state.round);
        state.status = 'choose_duel';
      }
    },

    /**
     * Set the duel pair (called by leader or AI leader logic).
     * Transitions from choose_duel → duel_input.
     */
    chooseDuelPair(state, action: PayloadAction<[string, string]>) {
      if (state.status !== 'choose_duel') return;
      state.duelPair = action.payload;
      state.questionIdx = pickQuestionIdx(state.seed, state.round);
      state.guesses = {};
      state.status = 'duel_input';
    },

    /**
     * Transition from duel_input → duel_reveal.
     * Computes sorted results for the duel pair.
     */
    revealDuelResults(state) {
      if (state.status !== 'duel_input') return;
      if (!state.duelPair) return;
      const question = CWGO_QUESTIONS[state.questionIdx];
      if (!question) return;

      const entries: CwgoGuessEntry[] = state.duelPair.map((id) => ({
        playerId: id,
        guess: state.guesses[id] ?? 0,
      }));

      state.revealResults = computeSortedResultsForReveal(entries, question.answer);
      state.duelWinnerId =
        computeWinnerClosestWithoutGoingOver(entries, question.answer);
      state.status = 'duel_reveal';
    },

    /**
     * Confirm duel result — eliminates the loser from aliveIds.
     * Transitions to: complete (1 alive), choose_duel (>2 alive).
     */
    confirmDuelElimination(state) {
      if (state.status !== 'duel_reveal') return;
      if (!state.duelPair || !state.duelWinnerId) return;

      const loser = state.duelPair.find((id) => id !== state.duelWinnerId);
      if (loser) {
        state.aliveIds = state.aliveIds.filter((id) => id !== loser);
        state.lastEliminated = [loser];
      }

      state.duelPair = null;
      state.guesses = {};
      state.round += 1;

      if (state.aliveIds.length <= 1) {
        state.status = 'complete';
      } else {
        // Advance question so the pick screen doesn't show the previous duel's question
        state.questionIdx = pickQuestionIdx(state.seed, state.round);
        state.status = 'choose_duel';
      }
    },

    /** Reset to idle (e.g. when navigating away). */
    resetCwgo() {
      return initialState;
    },
  },
});

export const {
  startCwgoCompetition,
  setGuesses,
  autoFillAIGuesses,
  revealMassResults,
  confirmMassElimination,
  chooseDuelPair,
  revealDuelResults,
  confirmDuelElimination,
  resetCwgo,
} = cwgoSlice.actions;

export default cwgoSlice.reducer;
