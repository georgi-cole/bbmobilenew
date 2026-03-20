/**
 * wildcardWesternSlice.ts – Redux slice for Wildcard Western elimination game.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { dealCards, getFirstPair, getNextQuestion, selectRandomPair } from './helpers';
import { WILDCARD_QUESTIONS } from './wildcardWesternQuestions';
import { mulberry32 } from '../../store/rng';

// ─── Timing constants ─────────────────────────────────────────────────────────
/** Milliseconds the buzz window stays open before auto-timeout. */
export const BUZZ_WINDOW_MS = 10_000;
/** Milliseconds the answer window stays open after a buzz. */
export const ANSWER_WINDOW_MS = 8_000;

// ─── Seed offset constants ────────────────────────────────────────────────────
/** XOR offset applied when shuffling the question order on init. */
const QUESTION_SHUFFLE_SEED_OFFSET = 12345;
/** XOR offset applied when dealing cards. */
const CARD_DEAL_SEED_OFFSET = 99999;
/** Multiplier applied to duelNumber when selecting a random pair. */
const RANDOM_PAIR_SEED_MULTIPLIER = 7777;

export type WildcardWesternPhase =
  | 'idle'
  | 'intro'
  | 'cardDeal'
  | 'cardReveal'
  | 'pairIntro'
  | 'duelQuestion'
  | 'buzzOpen'
  | 'answerOpen'
  | 'resolution'
  | 'chooseElimination'
  | 'chooseNextPair'
  | 'randomPairSelection'
  | 'finalDuel'
  | 'gameOver'
  | 'complete';

export type DuelOutcome = 'correct' | 'wrong' | 'timeout' | 'nobuzz' | null;

export interface WildcardWesternState {
  phase: WildcardWesternPhase;
  prizeType: 'HOH' | 'POV';
  seed: number;
  duelNumber: number;

  participantIds: string[];
  aliveIds: string[];
  eliminatedIds: string[];
  humanPlayerId: string | null;

  cardsByPlayerId: Record<string, number>;

  currentPair: [string, string] | null;
  duelResolved: boolean;

  currentQuestionId: string | null;
  questionOrder: string[];
  questionCursor: number;

  buzzedBy: string | null;
  buzzWindowUntil: number;
  answerWindowUntil: number;

  selectedAnswerIndex: number | null;

  controllerId: string | null;
  eliminationChooserId: string | null;

  lastDuelOutcome: DuelOutcome;
  lastEliminatedId: string | null;

  winnerId: string | null;
  outcomeResolved: boolean;
}

const initialState: WildcardWesternState = {
  phase: 'idle',
  prizeType: 'HOH',
  seed: 0,
  duelNumber: 0,

  participantIds: [],
  aliveIds: [],
  eliminatedIds: [],
  humanPlayerId: null,

  cardsByPlayerId: {},

  currentPair: null,
  duelResolved: false,

  currentQuestionId: null,
  questionOrder: [],
  questionCursor: 0,

  buzzedBy: null,
  buzzWindowUntil: 0,
  answerWindowUntil: 0,

  selectedAnswerIndex: null,

  controllerId: null,
  eliminationChooserId: null,

  lastDuelOutcome: null,
  lastEliminatedId: null,

  winnerId: null,
  outcomeResolved: false,
};

const wildcardWesternSlice = createSlice({
  name: 'wildcardWestern',
  initialState,
  reducers: {
    initWildcardWestern(
      state,
      action: PayloadAction<{
        participantIds: string[];
        prizeType: 'HOH' | 'POV';
        seed: number;
        humanPlayerId: string | null;
      }>,
    ) {
      const { participantIds, prizeType, seed, humanPlayerId } = action.payload;
      state.phase = 'intro';
      state.prizeType = prizeType;
      state.seed = seed;
      state.duelNumber = 0;
      state.participantIds = participantIds;
      state.aliveIds = [...participantIds];
      state.eliminatedIds = [];
      state.humanPlayerId = humanPlayerId;
      state.cardsByPlayerId = {};
      state.currentPair = null;
      state.duelResolved = false;
      state.currentQuestionId = null;

      const rng = mulberry32(seed + QUESTION_SHUFFLE_SEED_OFFSET);
      const allIds = WILDCARD_QUESTIONS.map((q) => q.id);
      const shuffled = [...allIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      state.questionOrder = shuffled;
      state.questionCursor = 0;

      state.buzzedBy = null;
      state.buzzWindowUntil = 0;
      state.answerWindowUntil = 0;
      state.selectedAnswerIndex = null;
      state.controllerId = null;
      state.eliminationChooserId = null;
      state.lastDuelOutcome = null;
      state.lastEliminatedId = null;
      state.winnerId = null;
      state.outcomeResolved = false;
    },

    advanceIntro(state) {
      if (state.phase === 'intro') {
        state.phase = 'cardDeal';
      }
    },

    dealCardsAction(state) {
      if (state.phase !== 'cardDeal') return;
      const rng = mulberry32(state.seed + CARD_DEAL_SEED_OFFSET);
      state.cardsByPlayerId = dealCards(state.participantIds, rng);
      state.phase = 'cardReveal';
    },

    advanceCardReveal(state) {
      if (state.phase !== 'cardReveal') return;
      const [low, high] = getFirstPair(state.cardsByPlayerId, state.aliveIds);
      state.currentPair = [low, high];
      state.phase = 'pairIntro';
    },

    advancePairIntro(state) {
      if (state.phase !== 'pairIntro') return;
      state.duelNumber += 1;
      state.duelResolved = false;

      const result = getNextQuestion(
        state.questionOrder,
        state.questionCursor,
        state.seed,
        state.duelNumber,
      );
      state.currentQuestionId = result.question.id;
      state.questionCursor = result.newCursor;
      if (result.newOrder) {
        state.questionOrder = result.newOrder;
      }

      state.buzzedBy = null;
      state.selectedAnswerIndex = null;
      state.buzzWindowUntil = Date.now() + BUZZ_WINDOW_MS;
      state.answerWindowUntil = 0;

      state.phase = 'buzzOpen';
    },

    playerBuzz(state, action: PayloadAction<{ playerId: string }>) {
      if (state.phase !== 'buzzOpen') return;
      if (state.buzzedBy !== null) return;
      if (!state.currentPair || !state.currentPair.includes(action.payload.playerId)) return;

      state.buzzedBy = action.payload.playerId;
      state.answerWindowUntil = Date.now() + ANSWER_WINDOW_MS;
      state.phase = 'answerOpen';
    },

    buzzTimeout(state) {
      if (state.phase !== 'buzzOpen') return;
      if (state.duelResolved) return;

      state.duelResolved = true;
      state.lastDuelOutcome = 'nobuzz';

      if (state.aliveIds.length === 2) {
        // Final 2: redraw question, don't eliminate
        state.phase = 'pairIntro';
        state.duelResolved = false;
        return;
      }

      // Both eliminated
      if (state.currentPair) {
        state.eliminatedIds.push(...state.currentPair);
        state.aliveIds = state.aliveIds.filter((id) => !state.currentPair!.includes(id));
        state.lastEliminatedId = null;
      }

      state.phase = 'resolution';
    },

    playerAnswer(state, action: PayloadAction<{ answerIndex: 0 | 1 | 2 }>) {
      if (state.phase !== 'answerOpen') return;
      if (state.duelResolved) return;

      state.duelResolved = true;
      state.selectedAnswerIndex = action.payload.answerIndex;

      const question = WILDCARD_QUESTIONS.find((q) => q.id === state.currentQuestionId);
      if (!question) {
        state.phase = 'resolution';
        return;
      }

      const correct = question.correctIndex === action.payload.answerIndex;
      state.lastDuelOutcome = correct ? 'correct' : 'wrong';

      if (!state.currentPair || !state.buzzedBy) {
        state.phase = 'resolution';
        return;
      }

      const [p1, p2] = state.currentPair;
      const opponent = state.buzzedBy === p1 ? p2 : p1;

      if (correct) {
        // Buzzer wins, opponent eliminated
        state.eliminatedIds.push(opponent);
        state.aliveIds = state.aliveIds.filter((id) => id !== opponent);
        state.lastEliminatedId = opponent;
      } else {
        // Buzzer loses, buzzer eliminated
        state.eliminatedIds.push(state.buzzedBy);
        state.aliveIds = state.aliveIds.filter((id) => id !== state.buzzedBy);
        state.lastEliminatedId = state.buzzedBy;
      }

      state.phase = 'resolution';
    },

    answerTimeout(state) {
      if (state.phase !== 'answerOpen') return;
      if (state.duelResolved) return;

      state.duelResolved = true;
      state.lastDuelOutcome = 'timeout';

      if (state.buzzedBy) {
        state.eliminatedIds.push(state.buzzedBy);
        state.aliveIds = state.aliveIds.filter((id) => id !== state.buzzedBy);
        state.lastEliminatedId = state.buzzedBy;
      }

      state.phase = 'resolution';
    },

    advanceResolution(state) {
      if (state.phase !== 'resolution') return;

      // Check win condition
      if (state.aliveIds.length === 1) {
        state.winnerId = state.aliveIds[0];
        state.phase = 'gameOver';
        return;
      }

      if (state.aliveIds.length === 2) {
        state.phase = 'finalDuel';
        // In finalDuel mode, next pair is always the final 2
        state.currentPair = [state.aliveIds[0], state.aliveIds[1]];
        state.phase = 'pairIntro';
        return;
      }

      // Normal case: determine who controls next
      if (state.lastDuelOutcome === 'nobuzz') {
        // Both eliminated, random pair
        state.phase = 'randomPairSelection';
      } else if (state.lastDuelOutcome === 'correct') {
        // Winner chooses elimination then next pair
        const winner = state.currentPair?.find((id) => state.aliveIds.includes(id));
        if (winner) {
          state.controllerId = winner;
          state.eliminationChooserId = winner;
          state.phase = 'chooseElimination';
        } else {
          state.phase = 'randomPairSelection';
        }
      } else {
        // Wrong or timeout: survivor chooses next pair
        const survivor = state.currentPair?.find((id) => state.aliveIds.includes(id));
        if (survivor) {
          state.controllerId = survivor;
          state.phase = 'chooseNextPair';
        } else {
          state.phase = 'randomPairSelection';
        }
      }
    },

    playerChooseElimination(state, action: PayloadAction<{ targetId: string }>) {
      if (state.phase !== 'chooseElimination') return;
      const { targetId } = action.payload;

      if (targetId === state.eliminationChooserId) return;
      if (!state.aliveIds.includes(targetId)) return;

      state.eliminatedIds.push(targetId);
      state.aliveIds = state.aliveIds.filter((id) => id !== targetId);
      state.lastEliminatedId = targetId;

      // Check win condition after elimination
      if (state.aliveIds.length === 1) {
        state.winnerId = state.aliveIds[0];
        state.phase = 'gameOver';
        return;
      }

      state.phase = 'chooseNextPair';
    },

    playerChooseNextPair(state, action: PayloadAction<{ pair: [string, string] }>) {
      if (state.phase !== 'chooseNextPair') return;
      const { pair } = action.payload;

      if (!state.aliveIds.includes(pair[0]) || !state.aliveIds.includes(pair[1])) return;
      if (pair[0] === pair[1]) return;

      state.currentPair = pair;
      state.phase = 'pairIntro';
    },

    randomPairChosen(state) {
      if (state.phase !== 'randomPairSelection') return;
      const rng = mulberry32(state.seed + state.duelNumber * RANDOM_PAIR_SEED_MULTIPLIER);
      state.currentPair = selectRandomPair(state.aliveIds, rng);
      state.phase = 'pairIntro';
    },

    advanceGameOver(state) {
      if (state.phase === 'gameOver') {
        state.phase = 'complete';
      }
    },

    markWildcardWesternOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    resetWildcardWestern() {
      return initialState;
    },
  },
});

export const {
  initWildcardWestern,
  advanceIntro,
  dealCardsAction,
  advanceCardReveal,
  advancePairIntro,
  playerBuzz,
  buzzTimeout,
  playerAnswer,
  answerTimeout,
  advanceResolution,
  playerChooseElimination,
  playerChooseNextPair,
  randomPairChosen,
  advanceGameOver,
  markWildcardWesternOutcomeResolved,
  resetWildcardWestern,
} = wildcardWesternSlice.actions;

export default wildcardWesternSlice.reducer;
