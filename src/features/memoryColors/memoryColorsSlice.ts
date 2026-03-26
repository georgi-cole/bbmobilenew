/**
 * Redux slice for the "Memory Colors" sequence-memory competition.
 *
 * Rules:
 *  - Pool of 20 named colors.
 *  - Round 1 sequence length = 5.
 *  - Each new round adds exactly 1 more color.
 *  - Sequence reveal shows the colors in order, then the player reconstructs
 *    the exact order from the full color pool.
 *  - The run ends on the 3rd total mistake.
 *
 * Ranking priority (higher is better):
 *  1. furthestRoundReached
 *  2. fewer mistakesUsed
 *  3. lower totalResponseMs
 *  4. deeper failedAtStep in the last round
 *  5. deterministic seeded tiebreak
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';

export type MemoryColorsCompetitionType = 'HOH' | 'POV';

export type MemoryColorsPhase =
  | 'idle'
  | 'showing'
  | 'input'
  | 'warning_beat'
  | 'round_cleared'
  | 'complete';

export interface MemoryColorDef {
  name: string;
  hex: string;
  emoji: string;
}

export interface MemoryColorsPlayerResult {
  /** Number of fully cleared rounds. */
  roundsCleared: number;
  /** Highest round the player reached. */
  furthestRoundReached?: number;
  /** Deepest correct step reached inside the failed/current round. */
  failedAtStep: number;
  /** Total mistakes used: 0..MAX_MISTAKES. */
  mistakesUsed: number;
  /** Total input response time in ms. */
  totalResponseMs: number;
  /** Derived numeric score (higher = better). */
  score: number;
}

export interface MemoryColorsState {
  phase: MemoryColorsPhase;
  participantIds: string[];
  competitionType: MemoryColorsCompetitionType | null;
  seed: number;
  humanPlayerId: string | null;
  round: number;
  sequence: number[];
  inputIndex: number;
  stepStartMs: number;
  totalResponseMs: number;
  mistakesUsed: number;
  aiResults: Record<string, MemoryColorsPlayerResult>;
  humanResult: MemoryColorsPlayerResult | null;
  finalRanking: string[];
  winnerId: string | null;
  lastPlaceId: string | null;
  outcomeResolved: boolean;
}

export const MEMORY_COLOR_POOL: readonly MemoryColorDef[] = [
  { name: 'Scarlet', hex: '#d62839', emoji: '��' },
  { name: 'Baby Blue', hex: '#7ec8f5', emoji: '🩵' },
  { name: 'Milky Grass', hex: '#8ccf63', emoji: '🌿' },
  { name: 'Blood Orange', hex: '#f25c1d', emoji: '🟠' },
  { name: 'Sky Cyan', hex: '#51d7f9', emoji: '🌤️' },
  { name: 'Honey Gold', hex: '#f2b134', emoji: '🍯' },
  { name: 'Rose Quartz', hex: '#efb0c9', emoji: '🌸' },
  { name: 'Midnight Plum', hex: '#5a2d82', emoji: '🍇' },
  { name: 'Sea Foam', hex: '#75d5c3', emoji: '🌊' },
  { name: 'Terracotta Glow', hex: '#d97852', emoji: '🏺' },
  { name: 'Lavender Mist', hex: '#b8a0f8', emoji: '💜' },
  { name: 'Mint Frost', hex: '#a8f0d1', emoji: '🌱' },
  { name: 'Amber Dusk', hex: '#d48b32', emoji: '🌅' },
  { name: 'Powder Cloud', hex: '#d9ecff', emoji: '☁️' },
  { name: 'Neon Coral', hex: '#ff6f61', emoji: '🪸' },
  { name: 'Sage Whisper', hex: '#9dbb8a', emoji: '🍃' },
  { name: 'Ocean Ink', hex: '#22577a', emoji: '🌌' },
  { name: 'Peach Glimmer', hex: '#ffb088', emoji: '🍑' },
  { name: 'Lemon Silk', hex: '#ffe680', emoji: '🍋' },
  { name: 'Berry Bloom', hex: '#b2397f', emoji: '🫐' },
] as const;

export const NUM_COLORS = MEMORY_COLOR_POOL.length;
export const INITIAL_SEQUENCE_LENGTH = 5;
export const MAX_MISTAKES = 3;

const SALT_SEQUENCE = 0xabcdef01;
const SALT_AI = 0x12345678;
const SALT_TIEBREAK = 0xdeadcafe;

export function generateSequence(seed: number, round: number): number[] {
  const length = Math.min(NUM_COLORS, INITIAL_SEQUENCE_LENGTH + (round - 1));
  const rng = mulberry32((seed ^ SALT_SEQUENCE ^ Math.imul(round, 0x9e3779b9)) >>> 0);
  const indices = Array.from({ length: NUM_COLORS }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, length);
}

function tiebreakScore(seed: number, playerId: string): number {
  let hash = (seed ^ SALT_TIEBREAK) >>> 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash ^= playerId.charCodeAt(i);
    hash = (Math.imul(hash, 0x01000193)) >>> 0;
  }
  return (hash >>> 0) / 0x100000000;
}

export function computePlayerScore(result: Omit<MemoryColorsPlayerResult, 'score'>): number {
  const furthestRoundReached = result.furthestRoundReached ?? result.roundsCleared;
  const responseFraction = Math.min(result.totalResponseMs / 300_000, 1);
  const timeScore = Math.round((1 - responseFraction) * 100);
  return (
    furthestRoundReached * 1_000_000 +
    (MAX_MISTAKES - result.mistakesUsed) * 10_000 +
    timeScore * 100 +
    Math.min(result.failedAtStep, 99)
  );
}

export function simulateAiResult(seed: number, playerId: string): MemoryColorsPlayerResult {
  let idHash = 0x811c9dc5;
  for (let i = 0; i < playerId.length; i += 1) {
    idHash ^= playerId.charCodeAt(i);
    idHash = (Math.imul(idHash, 0x01000193)) >>> 0;
  }

  const rng = mulberry32(((seed ^ SALT_AI) ^ idHash) >>> 0);
  const skill = 0.48 + rng() * 0.52;
  const furthestRoundReached = Math.max(1, Math.floor(1 + skill * 9 + rng() * 4));
  const likelyMistakes = Math.max(0, Math.round((1 - skill) * MAX_MISTAKES + rng()));
  const mistakesUsed = Math.min(MAX_MISTAKES, likelyMistakes);
  const failedRoundLength = Math.min(NUM_COLORS, INITIAL_SEQUENCE_LENGTH + (furthestRoundReached - 1));
  const failedAtStep = furthestRoundReached > 1 ? Math.floor(rng() * failedRoundLength) : 0;
  const roundsCleared = Math.max(0, furthestRoundReached - (mistakesUsed >= MAX_MISTAKES ? 1 : 0));
  const baseMs = 380 + rng() * 320;
  const stepsFromClearedRounds = Array.from(
    { length: Math.max(roundsCleared, 0) },
    (_, i) => Math.min(NUM_COLORS, INITIAL_SEQUENCE_LENGTH + i),
  ).reduce((sum, len) => sum + len, 0);
  const totalResponseMs = Math.round((stepsFromClearedRounds + failedAtStep) * baseMs);
  const result: Omit<MemoryColorsPlayerResult, 'score'> = {
    roundsCleared,
    furthestRoundReached,
    failedAtStep,
    mistakesUsed,
    totalResponseMs,
  };
  return { ...result, score: computePlayerScore(result) };
}

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
    const scoreDiff = rb.score - ra.score;
    if (scoreDiff !== 0) return scoreDiff;
    return tiebreakScore(seed, b) - tiebreakScore(seed, a);
  });
}

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

const memoryColorsSlice = createSlice({
  name: 'memoryColors',
  initialState,
  reducers: {
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

      const aiResults: Record<string, MemoryColorsPlayerResult> = {};
      for (const id of participantIds) {
        if (id !== humanPlayerId) aiResults[id] = simulateAiResult(seed, id);
      }
      state.aiResults = aiResults;

      if (!humanPlayerId) {
        state.phase = 'complete';
        memoryColorsSlice.caseReducers._finalizeOutcome(state);
      }
    },

    beginInput(state) {
      if (state.phase !== 'showing') return;
      state.phase = 'input';
      state.inputIndex = 0;
      state.stepStartMs = -1;
    },

    setStepStartMs(state, action: PayloadAction<number>) {
      state.stepStartMs = action.payload;
    },

    recordInput(state, action: PayloadAction<{ colorIndex: number; now: number }>) {
      if (state.phase !== 'input') return;
      const { colorIndex, now } = action.payload;

      if (state.stepStartMs >= 0) {
        state.totalResponseMs += Math.max(0, now - state.stepStartMs);
      }
      state.stepStartMs = now;

      const expected = state.sequence[state.inputIndex];
      const isCorrect = colorIndex === expected;

      if (isCorrect) {
        state.inputIndex += 1;
        if (state.inputIndex >= state.sequence.length) {
          state.phase = 'round_cleared';
        }
        return;
      }

      const nextMistakesUsed = state.mistakesUsed + 1;
      if (nextMistakesUsed < MAX_MISTAKES) {
        state.mistakesUsed = nextMistakesUsed;
        state.phase = 'warning_beat';
        return;
      }

      const result: Omit<MemoryColorsPlayerResult, 'score'> = {
        roundsCleared: state.round - 1,
        furthestRoundReached: state.round,
        failedAtStep: state.inputIndex,
        mistakesUsed: nextMistakesUsed,
        totalResponseMs: state.totalResponseMs,
      };
      state.mistakesUsed = nextMistakesUsed;
      state.humanResult = { ...result, score: computePlayerScore(result) };
      state.phase = 'complete';
      memoryColorsSlice.caseReducers._finalizeOutcome(state);
    },

    resumeAfterWarning(state) {
      if (state.phase !== 'warning_beat') return;
      state.phase = 'showing';
      state.inputIndex = 0;
      state.stepStartMs = -1;
    },

    startNextRound(state) {
      if (state.phase !== 'round_cleared') return;
      state.round += 1;
      state.sequence = generateSequence(state.seed, state.round);
      state.inputIndex = 0;
      state.stepStartMs = -1;
      state.phase = 'showing';
    },

    endRunAfterRoundCleared(state) {
      if (state.phase !== 'round_cleared') return;
      const result: Omit<MemoryColorsPlayerResult, 'score'> = {
        roundsCleared: state.round,
        furthestRoundReached: state.round,
        failedAtStep: 0,
        mistakesUsed: state.mistakesUsed,
        totalResponseMs: state.totalResponseMs,
      };
      state.humanResult = { ...result, score: computePlayerScore(result) };
      state.phase = 'complete';
      memoryColorsSlice.caseReducers._finalizeOutcome(state);
    },

    _finalizeOutcome(state) {
      const allResults: Record<string, MemoryColorsPlayerResult> = { ...state.aiResults };
      if (state.humanPlayerId && state.humanResult) {
        allResults[state.humanPlayerId] = state.humanResult;
      }
      const ranking = computeRanking(state.participantIds, allResults, state.seed);
      state.finalRanking = ranking;
      state.winnerId = ranking[0] ?? null;
      state.lastPlaceId = ranking[ranking.length - 1] ?? null;
    },

    markMemoryColorsOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

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
