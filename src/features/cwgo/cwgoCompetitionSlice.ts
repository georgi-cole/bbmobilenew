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
  aiExactAnswerProbability,
  aiSkillRangeForDifficulty,
  computeWinnerClosestWithoutGoingOver,
  computeMassElimination,
  computeSortedResultsForReveal,
} from './cwgoHelpers';
import type { CwgoGuessEntry, CwgoResult } from './cwgoHelpers';

// ─── Question-order helpers ───────────────────────────────────────────────────

/**
 * Generate a deterministic full-permutation shuffle of all question indices.
 * Uses Fisher-Yates with a seeded RNG so the same seed always yields the same
 * order, but different seeds yield different orders.
 */
function generateQuestionOrder(seed: number): number[] {
  const order = Array.from({ length: CWGO_QUESTIONS.length }, (_, i) => i);
  const rng = mulberry32((seed ^ 0x6c62272e) >>> 0);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swapVal = order[i];
    order[i] = order[j];
    order[j] = swapVal;
  }
  return order;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CwgoStatus =
  | 'idle'
  | 'mass_input'
  | 'mass_reveal'
  | 'league_results'
  | 'choose_duel'
  | 'duel_input'
  | 'duel_reveal'
  | 'complete';

export type CwgoPrizeType = 'LOH' | 'POS';

export interface CwgoState {
  status: CwgoStatus;
  stage: 'league' | 'final';
  prizeType: CwgoPrizeType;
  seed: number;
  allPlayerIds: string[];
  humanPlayerId: string | null;
  /** League points in stage one and remaining lives in the final. */
  playerScores: Record<string, number>;
  leagueScores: Record<string, number>;
  leagueRankings: string[];
  finalistIds: string[] | null;
  /** IDs of players still competing. */
  aliveIds: string[];
  /** Current question index into CWGO_QUESTIONS. */
  questionIdx: number;
  /**
   * Shuffled permutation of all question indices for this competition.
   * Generated deterministically from the seed at competition start.
   * Used so that question order varies per challenge invocation.
   */
  questionOrder: number[];
  /** Guesses submitted for the current round (keyed by playerId). */
  guesses: Record<string, number>;
  /** Sorted results for the current reveal phase. */
  revealResults: CwgoResult[];
  /** IDs eliminated in the latest round. */
  lastEliminated: string[];
  /**
   * Cumulative elimination order across all rounds and duels.
   * Index 0 = first player eliminated (worst finisher).
   * Used to set lastHohCompFinisherId accurately for the third-nominee rule.
   */
  eliminationOrder: string[];
  /** Round counter (used for seeding RNG per-round). */
  round: number;
  /** IDs of the two players currently dueling. */
  duelPair: [string, string] | null;
  /** ID of the winner of the latest duel. */
  duelWinnerId: string | null;
  /** ID of the current leader (winner of the last mass round or duel). */
  leaderId: string | null;
  /**
   * True once resolveCompetitionOutcome has successfully dispatched the winner.
   * Guards against double-dispatch (idempotency).
   */
  outcomeResolved: boolean;
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: CwgoState = {
  status: 'idle',
  stage: 'league',
  prizeType: 'LOH',
  seed: 0,
  allPlayerIds: [],
  humanPlayerId: null,
  playerScores: {},
  leagueScores: {},
  leagueRankings: [],
  finalistIds: null,
  aliveIds: [],
  questionIdx: 0,
  questionOrder: [],
  guesses: {},
  revealResults: [],
  lastEliminated: [],
  eliminationOrder: [],
  round: 0,
  duelPair: null,
  duelWinnerId: null,
  leaderId: null,
  outcomeResolved: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick a question index from the pre-generated questionOrder.
 * Falls back to the XOR-based deterministic pick if questionOrder is empty.
 */
function pickQuestionFromOrder(questionOrder: number[], round: number): number {
  if (questionOrder.length > 0) {
    return questionOrder[round % questionOrder.length];
  }
  // Legacy fallback (should not happen with a properly initialised state)
  const rng = mulberry32((round * 0x9e3779b9) >>> 0);
  return Math.floor(rng() * CWGO_QUESTIONS.length);
}

function hashPlayerId(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rankLeague(playerIds: string[], scores: Record<string, number>, seed: number): string[] {
  return [...playerIds].sort((a, b) =>
    (scores[b] ?? 0) - (scores[a] ?? 0)
    || hashPlayerId(`${seed}:${a}`) - hashPlayerId(`${seed}:${b}`),
  );
}

function selectFinalists(rankings: string[], scores: Record<string, number>): string[] {
  if (rankings.length <= 3) return [...rankings];
  const cutoffScore = scores[rankings[2]] ?? 0;
  return rankings.filter((id) => (scores[id] ?? 0) >= cutoffScore);
}

function simulateAiLeague(playerIds: string[], humanPlayerId: string | null, seed: number): Record<string, number> {
  const scores = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const aiIds = playerIds.filter((id) => id !== humanPlayerId);
  for (let first = 0; first < aiIds.length; first += 1) {
    for (let second = first + 1; second < aiIds.length; second += 1) {
      const a = aiIds[first];
      const b = aiIds[second];
      const rng = mulberry32((seed ^ hashPlayerId(`cwgo:${a}:${b}`)) >>> 0);
      const winner = rng() < 0.5 ? a : b;
      const loser = winner === a ? b : a;
      scores[winner] += 1;
      scores[loser] -= 1;
    }
  }
  return scores;
}

/** Auto-fill AI guesses for all non-human aliveIds using seeded RNG. */
function fillAIGuesses(
  guesses: Record<string, number>,
  aliveIds: string[],
  humanIds: Set<string>,
  answer: number,
  seed: number,
  round: number,
  difficulty: number,
): Record<string, number> {
  const updated = { ...guesses };
  const skillRange = aiSkillRangeForDifficulty(difficulty);
  let aiSeed = (seed ^ (round * 0x5851f42d)) >>> 0;
  for (const id of aliveIds) {
    if (!humanIds.has(id) && updated[id] === undefined) {
      // Derive a per-player skill from the seeded RNG, scaled into the band the
      // question's difficulty allows (easy questions → weaker AI).
      const knowledgeRoll = mulberry32(aiSeed)();
      const aiSkill = skillRange.min + mulberry32(aiSeed ^ 0xa511e9b3)() * (skillRange.max - skillRange.min);
      // Advance seed before generating the guess so skill and guess use independent RNG sequences.
      aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0;
      updated[id] = knowledgeRoll < aiExactAnswerProbability(difficulty)
        ? answer
        : generateAIGuess(answer, aiSkill, aiSeed);
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
        humanPlayerId?: string | null;
      }>,
    ) {
      const { participantIds, prizeType, seed, humanPlayerId = null } = action.payload;
      // Defensive: if seed is zero or missing, generate one from Date.now() to
      // avoid every challenge with an unset seed producing the same question.
      const safeSeed = seed && seed !== 0
        ? seed
        : ((mulberry32(Date.now() >>> 0)() * 0x100000000) >>> 0);
      const questionOrder = generateQuestionOrder(safeSeed);
      state.status = 'mass_input';
      state.stage = 'league';
      state.prizeType = prizeType;
      state.seed = safeSeed;
      state.allPlayerIds = [...participantIds];
      state.humanPlayerId = humanPlayerId;
      state.playerScores = simulateAiLeague(participantIds, humanPlayerId, safeSeed);
      state.leagueScores = { ...state.playerScores };
      state.leagueRankings = [];
      state.finalistIds = null;
      state.aliveIds = [...participantIds];
      state.round = 0;
      state.questionOrder = questionOrder;
      state.guesses = {};
      state.revealResults = [];
      state.lastEliminated = [];
      state.eliminationOrder = [];
      state.duelPair = null;
      state.duelWinnerId = null;
      state.leaderId = null;
      state.outcomeResolved = false;
      state.questionIdx = pickQuestionFromOrder(questionOrder, 0);
      console.log('[cwgo] startCwgoCompetition', { safeSeed, prizeType, participants: participantIds.length });
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
        question.difficulty,
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
      // Track the mass-round winner as the leader for the duel-pick phase.
      const massWinnerId = computeWinnerClosestWithoutGoingOver(entries, question.answer);
      if (massWinnerId) state.leaderId = massWinnerId;
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

      if (state.stage === 'league') {
        const humanId = state.humanPlayerId;
        if (humanId && state.aliveIds.includes(humanId)) {
          for (const opponentId of state.aliveIds) {
            if (opponentId === humanId) continue;
            const winner = computeWinnerClosestWithoutGoingOver(
              entries.filter((entry) => entry.playerId === humanId || entry.playerId === opponentId),
              question.answer,
            );
            const loser = winner === humanId ? opponentId : humanId;
            if (winner) {
              state.playerScores[winner] = (state.playerScores[winner] ?? 0) + 1;
              state.playerScores[loser] = (state.playerScores[loser] ?? 0) - 1;
            }
          }
        }
        state.leagueScores = { ...state.playerScores };
        state.leagueRankings = rankLeague(state.allPlayerIds, state.leagueScores, state.seed);
        state.finalistIds = selectFinalists(state.leagueRankings, state.leagueScores);
        state.aliveIds = [...state.finalistIds];
        const finalistSet = new Set(state.finalistIds);
        const nonFinalists = state.leagueRankings.filter((id) => !finalistSet.has(id));
        state.eliminationOrder = [...nonFinalists].reverse();
        state.lastEliminated = [...nonFinalists];
        state.status = 'league_results';
        return;
      }

      const { eliminated, surviving } = computeMassElimination(
        entries,
        question.answer,
        state.aliveIds,
      );

      state.lastEliminated = eliminated;
      state.eliminationOrder.push(...eliminated);
      state.aliveIds = surviving;
      state.guesses = {};
      state.round += 1;

      if (surviving.length <= 1) {
        state.status = 'complete';
      } else if (surviving.length === 2) {
        // Go straight to duel
        state.duelPair = [surviving[0], surviving[1]];
        state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round);
        state.status = 'duel_input';
      } else {
        // Advance question so the pick screen doesn't show the previous question
        state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round);
        state.status = 'choose_duel';
      }
    },

    startCwgoFinal(state) {
      if (state.status !== 'league_results' || !state.finalistIds?.length) return;
      state.stage = 'final';
      state.aliveIds = [...state.finalistIds];
      for (const id of state.aliveIds) state.playerScores[id] = 3;
      state.leaderId = state.leagueRankings.find((id) => state.aliveIds.includes(id)) ?? state.aliveIds[0] ?? null;
      state.guesses = {};
      state.lastEliminated = [];
      state.round += 1;
      state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round);
      if (state.aliveIds.length <= 1) {
        state.status = 'complete';
      } else if (state.aliveIds.length === 2) {
        state.duelPair = [state.aliveIds[0], state.aliveIds[1]];
        state.status = 'duel_input';
      } else {
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
      state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round);
      // Clear any previous guesses and move into duel input phase
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
      const winnerId = computeWinnerClosestWithoutGoingOver(entries, question.answer);
      state.duelWinnerId = winnerId;
      if (winnerId) state.leaderId = winnerId;
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
        const nextLives = Math.max(0, (state.playerScores[loser] ?? 3) - 1);
        state.playerScores[loser] = nextLives;
        if (nextLives === 0) {
          state.aliveIds = state.aliveIds.filter((id) => id !== loser);
          state.lastEliminated = [loser];
          state.eliminationOrder.push(loser);
        } else {
          state.lastEliminated = [];
        }
      }

      state.leaderId = state.duelWinnerId;

      state.duelPair = null;
      state.guesses = {};
      state.round += 1;

      if (state.aliveIds.length <= 1) {
        state.status = 'complete';
      } else {
        // Advance question so the pick screen doesn't show the previous duel's question
        state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round);
        state.status = 'choose_duel';
      }
    },

    /** Reset to idle (e.g. when navigating away). */
    resetCwgo() {
      return initialState;
    },

    /**
     * Mark the competition outcome as resolved so resolveCompetitionOutcome
     * cannot fire a second time (idempotency guard).
     */
    markCwgoOutcomeResolved(state) {
      state.outcomeResolved = true;
    },
  },
});

export const {
  startCwgoCompetition,
  setGuesses,
  autoFillAIGuesses,
  revealMassResults,
  confirmMassElimination,
  startCwgoFinal,
  chooseDuelPair,
  revealDuelResults,
  confirmDuelElimination,
  resetCwgo,
  markCwgoOutcomeResolved,
} = cwgoSlice.actions;

export default cwgoSlice.reducer;
