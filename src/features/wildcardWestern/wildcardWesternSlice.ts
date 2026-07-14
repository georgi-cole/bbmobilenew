/**
 * wildcardWesternSlice.ts – Redux slice for Wildcard Western elimination game.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { dealCards, getNextQuestion, selectRandomPair } from './helpers';
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
  | 'leagueResults'
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
  stage: 'league' | 'final';
  prizeType: 'LOH' | 'POS';
  seed: number;
  duelNumber: number;

  participantIds: string[];
  aliveIds: string[];
  eliminatedIds: string[];
  humanPlayerId: string | null;
  /** League points in stage one and lives in the final. */
  playerScores: Record<string, number>;
  leagueScores: Record<string, number>;
  leagueRankings: string[];
  leagueOpponentIds: string[];
  leagueOpponentIndex: number;
  finalistIds: string[] | null;

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
  lastDuelWinnerId: string | null;
  lastDuelLoserId: string | null;

  winnerId: string | null;
  outcomeResolved: boolean;
}

const initialState: WildcardWesternState = {
  phase: 'idle',
  stage: 'league',
  prizeType: 'LOH',
  seed: 0,
  duelNumber: 0,

  participantIds: [],
  aliveIds: [],
  eliminatedIds: [],
  humanPlayerId: null,
  playerScores: {},
  leagueScores: {},
  leagueRankings: [],
  leagueOpponentIds: [],
  leagueOpponentIndex: 0,
  finalistIds: null,

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
  lastDuelWinnerId: null,
  lastDuelLoserId: null,

  winnerId: null,
  outcomeResolved: false,
};

function hashWildcardId(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function simulateWildcardLeague(ids: string[], humanId: string | null, seed: number): Record<string, number> {
  const scores = Object.fromEntries(ids.map((id) => [id, 0]));
  const aiIds = ids.filter((id) => id !== humanId);
  for (let first = 0; first < aiIds.length; first += 1) {
    for (let second = first + 1; second < aiIds.length; second += 1) {
      const a = aiIds[first];
      const b = aiIds[second];
      const rng = mulberry32((seed ^ hashWildcardId(`league:${a}:${b}`)) >>> 0);
      const winner = rng() < 0.5 ? a : b;
      const loser = winner === a ? b : a;
      scores[winner] += 1;
      scores[loser] -= 1;
    }
  }
  return scores;
}

function rankWildcardLeague(ids: string[], scores: Record<string, number>, seed: number): string[] {
  return [...ids].sort((a, b) =>
    (scores[b] ?? 0) - (scores[a] ?? 0)
    || hashWildcardId(`${seed}:${a}`) - hashWildcardId(`${seed}:${b}`),
  );
}

function wildcardFinalists(rankings: string[], scores: Record<string, number>): string[] {
  if (rankings.length <= 3) return [...rankings];
  const cutoff = scores[rankings[2]] ?? 0;
  return rankings.filter((id) => (scores[id] ?? 0) >= cutoff);
}

function finishWildcardLeague(state: WildcardWesternState) {
  state.leagueScores = { ...state.playerScores };
  state.leagueRankings = rankWildcardLeague(state.participantIds, state.leagueScores, state.seed);
  state.finalistIds = wildcardFinalists(state.leagueRankings, state.leagueScores);
  state.aliveIds = [...state.finalistIds];
  const finalistSet = new Set(state.finalistIds);
  state.eliminatedIds = state.leagueRankings.filter((id) => !finalistSet.has(id)).reverse();
  state.currentPair = null;
  state.phase = 'leagueResults';
}

function recordWildcardDuel(state: WildcardWesternState, winnerId: string, loserId: string) {
  state.lastDuelWinnerId = winnerId;
  state.lastDuelLoserId = loserId;
  state.lastEliminatedId = null;
  state.controllerId = winnerId;
  if (state.stage === 'league') {
    state.playerScores[winnerId] = (state.playerScores[winnerId] ?? 0) + 1;
    state.playerScores[loserId] = (state.playerScores[loserId] ?? 0) - 1;
    return;
  }
  const nextLives = Math.max(0, (state.playerScores[loserId] ?? 3) - 1);
  state.playerScores[loserId] = nextLives;
  if (nextLives === 0) {
    state.aliveIds = state.aliveIds.filter((id) => id !== loserId);
    if (!state.eliminatedIds.includes(loserId)) state.eliminatedIds.push(loserId);
    state.lastEliminatedId = loserId;
  }
}

const wildcardWesternSlice = createSlice({
  name: 'wildcardWestern',
  initialState,
  reducers: {
    initWildcardWestern(
      state,
      action: PayloadAction<{
        participantIds: string[];
        prizeType: 'LOH' | 'POS';
        seed: number;
        humanPlayerId: string | null;
      }>,
    ) {
      const { participantIds, prizeType, seed, humanPlayerId } = action.payload;
      state.phase = 'intro';
      state.stage = 'league';
      state.prizeType = prizeType;
      state.seed = seed;
      state.duelNumber = 0;
      state.participantIds = participantIds;
      state.aliveIds = [...participantIds];
      state.eliminatedIds = [];
      state.humanPlayerId = humanPlayerId;
      state.playerScores = simulateWildcardLeague(participantIds, humanPlayerId, seed);
      state.leagueScores = { ...state.playerScores };
      state.leagueRankings = [];
      state.leagueOpponentIds = humanPlayerId
        ? participantIds.filter((id) => id !== humanPlayerId).sort((a, b) => hashWildcardId(`${seed}:${a}`) - hashWildcardId(`${seed}:${b}`))
        : [];
      state.leagueOpponentIndex = 0;
      state.finalistIds = null;
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
      state.lastDuelWinnerId = null;
      state.lastDuelLoserId = null;
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
      const opponent = state.leagueOpponentIds[0];
      if (state.humanPlayerId && opponent) {
        state.currentPair = [state.humanPlayerId, opponent];
        state.phase = 'pairIntro';
      } else {
        finishWildcardLeague(state);
      }
    },

    startWildcardFinal(state) {
      if (state.phase !== 'leagueResults' || !state.finalistIds?.length) return;
      state.stage = 'final';
      state.aliveIds = [...state.finalistIds];
      for (const id of state.aliveIds) state.playerScores[id] = 3;
      state.controllerId = state.leagueRankings.find((id) => state.aliveIds.includes(id)) ?? state.aliveIds[0] ?? null;
      state.currentPair = null;
      state.lastDuelWinnerId = null;
      state.lastDuelLoserId = null;
      state.lastEliminatedId = null;
      state.phase = state.aliveIds.length <= 1 ? 'gameOver' : 'chooseNextPair';
      if (state.aliveIds.length <= 1) state.winnerId = state.aliveIds[0] ?? null;
    },

    advancePairIntro(state) {
      if (state.phase !== 'pairIntro' && state.phase !== 'finalDuel') return;
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
      state.buzzWindowUntil = 0;
      state.answerWindowUntil = 0;

      state.phase = 'duelQuestion';
    },

    openBuzzWindow(state) {
      if (state.phase !== 'duelQuestion') return;
      state.buzzWindowUntil = Date.now() + BUZZ_WINDOW_MS;
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
      if (state.currentPair) {
        const rng = mulberry32((state.seed ^ Math.imul(state.duelNumber + 1, 0x9e3779b9)) >>> 0);
        const winner = state.currentPair[rng() < 0.5 ? 0 : 1];
        const loser = state.currentPair.find((id) => id !== winner)!;
        recordWildcardDuel(state, winner, loser);
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
        recordWildcardDuel(state, state.buzzedBy, opponent);
      } else {
        recordWildcardDuel(state, opponent, state.buzzedBy);
      }

      state.phase = 'resolution';
    },

    answerTimeout(state) {
      if (state.phase !== 'answerOpen') return;
      if (state.duelResolved) return;

      state.duelResolved = true;
      state.lastDuelOutcome = 'timeout';

      if (state.buzzedBy) {
        const opponent = state.currentPair?.find((id) => id !== state.buzzedBy);
        if (opponent) recordWildcardDuel(state, opponent, state.buzzedBy);
      }

      state.phase = 'resolution';
    },

    advanceResolution(state) {
      if (state.phase !== 'resolution') return;

      if (state.stage === 'league') {
        state.leagueOpponentIndex += 1;
        const nextOpponent = state.leagueOpponentIds[state.leagueOpponentIndex];
        if (state.humanPlayerId && nextOpponent) {
          state.currentPair = [state.humanPlayerId, nextOpponent];
          state.phase = 'pairIntro';
        } else {
          finishWildcardLeague(state);
        }
        return;
      }

      // Check win condition
      if (state.aliveIds.length === 1) {
        state.winnerId = state.aliveIds[0];
        state.phase = 'gameOver';
        return;
      }

      state.controllerId = state.lastDuelWinnerId;
      state.phase = 'chooseNextPair';
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
  startWildcardFinal,
  advancePairIntro,
  openBuzzWindow,
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
