/**
 * Redux slice for the "Famous Figures" trivia competition.
 *
 * State machine:
 *   idle → round_active → round_reveal → round_active  (repeat for each round)
 *                                      → complete       (after all rounds)
 *
 * Three rounds per match. Each round players guess a historical figure from
 * progressive clues. Fewer hints used means more points. The player with the
 * highest total score after all rounds wins.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';
import type { FigureRow } from '../../games/famous-figures/model';
import { isAcceptedGuess } from '../../games/famous-figures/fuzzy';
import figuresData from '../../games/famous-figures/data/famous_figures.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FamousFiguresPrizeType = 'HOH' | 'POV';
export type FamousFiguresStatus = 'idle' | 'round_active' | 'round_reveal' | 'complete';
export type FamousFiguresTimerPhase =
  | 'clue'
  | 'hint_1'
  | 'hint_2'
  | 'hint_3'
  | 'hint_4'
  | 'hint_5'
  | 'overtime'
  | 'done';

export interface FamousFiguresState {
  competitionType: FamousFiguresPrizeType;
  status: FamousFiguresStatus;
  currentRound: number;
  totalRounds: number;
  currentFigureIndex: number;
  hintsRevealed: number;
  playerScores: Record<string, number>;
  playerRoundScores: Record<string, number[]>;
  playerCorrect: Record<string, boolean>;
  playerGuesses: Record<string, string[]>;
  correctPlayers: string[];
  figureOrder: number[];
  round: number;
  seed: number;
  outcomeResolved: boolean;
  winnerId: string | null;
  /** round (0-indexed) → playerId → whether AI answered correctly */
  aiSubmissions: Record<number, Record<string, boolean>>;
  timerPhase: FamousFiguresTimerPhase;
  roundComplete: boolean;
}

// ─── Dataset ──────────────────────────────────────────────────────────────────

export const FAMOUS_FIGURES: FigureRow[] = figuresData as FigureRow[];

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: FamousFiguresState = {
  competitionType: 'HOH',
  status: 'idle',
  currentRound: 0,
  totalRounds: 3,
  currentFigureIndex: 0,
  hintsRevealed: 0,
  playerScores: {},
  playerRoundScores: {},
  playerCorrect: {},
  playerGuesses: {},
  correctPlayers: [],
  figureOrder: [],
  round: 0,
  seed: 0,
  outcomeResolved: false,
  winnerId: null,
  aiSubmissions: {},
  timerPhase: 'clue',
  roundComplete: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle of [0 … length-1] using the given RNG. */
function shuffleIndices(rng: () => number, length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Point value for a correct guess, based on how many hints were revealed
 * before the correct answer was submitted.
 */
export function getPointsForHintsUsed(hintsRevealed: number): number {
  switch (hintsRevealed) {
    case 0: return 10;
    case 1: return 9;
    case 2: return 7;
    case 3: return 5;
    case 4: return 3;
    case 5: return 1;
    default: return 1; // overtime
  }
}

/** FNV-1a 32-bit hash — stable string → uint32. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

/**
 * Build deterministic AI submissions for a single round.
 * Returns a map of playerId → correct (boolean).
 *
 * Probability of correct answer depends on figure difficulty:
 *   easy   → 70% at 'clue' stage
 *   medium → 50% at 'hint_2' stage
 *   hard   → 30% at 'hint_3' stage
 */
export function buildAiSubmissionsForRound(
  participantIds: string[],
  figureIndex: number,
  hintsRevealed: number,
  rng: () => number,
): Record<string, boolean> {
  const figure = FAMOUS_FIGURES[figureIndex];
  if (!figure) return {};

  const result: Record<string, boolean> = {};

  for (const id of participantIds) {
    const idHash = fnv1a32(id);
    const seed = (idHash ^ (figureIndex * 0x9e3779b9) ^ (hintsRevealed * 0x517cc1b7)) >>> 0;
    const localRng = mulberry32(seed ^ (rng() * 0x100000000) >>> 0);
    const roll = localRng();

    let threshold = 0;
    if (figure.difficulty === 'easy') threshold = 0.70;
    else if (figure.difficulty === 'medium') threshold = 0.50;
    else threshold = 0.30;

    result[id] = roll < threshold;
  }

  return result;
}

/** Determine the winner from cumulative scores. Tiebreak: most correct rounds. */
function determineWinner(
  participantIds: string[],
  playerScores: Record<string, number>,
  playerRoundScores: Record<string, number[]>,
): string | null {
  if (participantIds.length === 0) return null;

  let bestScore = -1;
  let winners: string[] = [];

  for (const id of participantIds) {
    const score = playerScores[id] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      winners = [id];
    } else if (score === bestScore) {
      winners.push(id);
    }
  }

  if (winners.length === 1) return winners[0];

  // Tiebreak: count correct rounds
  let bestCorrect = -1;
  let tiedWinners: string[] = [];
  for (const id of winners) {
    const correctRounds = (playerRoundScores[id] ?? []).filter((s) => s > 0).length;
    if (correctRounds > bestCorrect) {
      bestCorrect = correctRounds;
      tiedWinners = [id];
    } else if (correctRounds === bestCorrect) {
      tiedWinners.push(id);
    }
  }

  return tiedWinners[0];
}

/** Initialise per-round player state. */
function resetRoundPlayerState(state: FamousFiguresState): void {
  state.playerCorrect = {};
  state.playerGuesses = {};
  state.correctPlayers = [];
  state.roundComplete = false;
  state.hintsRevealed = 0;
  state.timerPhase = 'clue';
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const famousFiguresSlice = createSlice({
  name: 'famousFigures',
  initialState,
  reducers: {
    /**
     * Initialise the competition: shuffle figure order, set up player state,
     * transition idle → round_active.
     */
    startFamousFigures(
      state,
      action: PayloadAction<{
        participantIds: string[];
        competitionType: FamousFiguresPrizeType;
        seed: number;
      }>,
    ) {
      const { participantIds, competitionType, seed } = action.payload;
      const rng = mulberry32(seed);
      const order = shuffleIndices(rng, FAMOUS_FIGURES.length);

      state.competitionType = competitionType;
      state.status = 'round_active';
      state.currentRound = 0;
      state.round = 0;
      state.totalRounds = 3;
      state.currentFigureIndex = order[0];
      state.hintsRevealed = 0;
      state.figureOrder = order;
      state.seed = seed;
      state.outcomeResolved = false;
      state.winnerId = null;
      state.correctPlayers = [];
      state.roundComplete = false;
      state.timerPhase = 'clue';
      state.aiSubmissions = {};

      state.playerScores = {};
      state.playerRoundScores = {};
      state.playerCorrect = {};
      state.playerGuesses = {};
      for (const id of participantIds) {
        state.playerScores[id] = 0;
        state.playerRoundScores[id] = [];
        state.playerCorrect[id] = false;
        state.playerGuesses[id] = [];
      }
    },

    /** Reveal the next hint (increment hintsRevealed, update timerPhase). */
    revealNextHint(state) {
      if (state.status !== 'round_active') return;
      if (state.hintsRevealed >= 5) return;
      state.hintsRevealed += 1;
      const phases: FamousFiguresTimerPhase[] = ['clue', 'hint_1', 'hint_2', 'hint_3', 'hint_4', 'hint_5', 'overtime', 'done'];
      state.timerPhase = phases[state.hintsRevealed] as FamousFiguresTimerPhase;
    },

    /**
     * Advance the timer phase to the next stage.
     * The React component calls this on each timer expiry.
     */
    advanceTimer(state) {
      const order: FamousFiguresTimerPhase[] = [
        'clue', 'hint_1', 'hint_2', 'hint_3', 'hint_4', 'hint_5', 'overtime', 'done',
      ];
      const idx = order.indexOf(state.timerPhase);
      if (idx < 0 || idx >= order.length - 1) return;
      state.timerPhase = order[idx + 1];
      // Keep hintsRevealed in sync when auto-advancing hint phases
      if (state.timerPhase !== 'overtime' && state.timerPhase !== 'done') {
        const newHints = order.indexOf(state.timerPhase);
        if (newHints > state.hintsRevealed) {
          state.hintsRevealed = newHints;
        }
      }
    },

    /**
     * Submit a player's guess for the current figure.
     * Checks fuzzy match, awards points, suppresses duplicates.
     */
    submitPlayerGuess(
      state,
      action: PayloadAction<{ playerId: string; guess: string }>,
    ) {
      if (state.status !== 'round_active') return;
      const { playerId, guess } = action.payload;

      // Ensure player exists
      if (!(playerId in state.playerGuesses)) {
        state.playerGuesses[playerId] = [];
        state.playerCorrect[playerId] = false;
      }

      // Already answered correctly — no more guesses needed
      if (state.playerCorrect[playerId]) return;

      const trimmed = guess.trim();
      if (trimmed.length === 0) return;

      // Duplicate suppression
      const already = state.playerGuesses[playerId];
      if (already.includes(trimmed)) return;
      state.playerGuesses[playerId] = [...already, trimmed];

      // We call the fuzzy matcher to check the guess.
      const figure = FAMOUS_FIGURES[state.currentFigureIndex];
      if (!figure) return;

      const correct: boolean = isAcceptedGuess(trimmed, figure);

      if (correct) {
        state.playerCorrect[playerId] = true;
        state.correctPlayers = [...state.correctPlayers, playerId];
        const points = getPointsForHintsUsed(state.hintsRevealed);
        if (!(playerId in state.playerScores)) state.playerScores[playerId] = 0;
        state.playerScores[playerId] += points;
      }
    },

    /**
     * End the current round: record per-round scores, transition to
     * round_reveal.
     */
    endRound(state) {
      if (state.status !== 'round_active') return;

      // Record this round's score for each player (points earned only if correct)
      const allIds = Object.keys(state.playerScores);
      for (const id of allIds) {
        if (!state.playerRoundScores[id]) state.playerRoundScores[id] = [];
        // Only push if we haven't already recorded this round
        if (state.playerRoundScores[id].length === state.currentRound) {
          const roundScore = state.playerCorrect[id]
            ? getPointsForHintsUsed(state.hintsRevealed)
            : 0;
          state.playerRoundScores[id].push(roundScore);
        }
      }

      state.status = 'round_reveal';
      state.roundComplete = true;
    },

    /**
     * Advance to the next round or complete the match.
     * round_reveal → round_active  (if rounds remain)
     * round_reveal → complete       (after all rounds)
     */
    nextRound(state) {
      if (state.status !== 'round_reveal') return;

      const nextRound = state.currentRound + 1;

      if (nextRound >= state.totalRounds) {
        // All rounds complete — determine winner
        state.status = 'complete';
        const ids = Object.keys(state.playerScores);
        state.winnerId = determineWinner(ids, state.playerScores, state.playerRoundScores);
        return;
      }

      state.currentRound = nextRound;
      state.round = nextRound;
      state.currentFigureIndex = state.figureOrder[nextRound];
      state.status = 'round_active';
      resetRoundPlayerState(state);
    },

    /** Store AI submission results for a round. */
    setAiSubmissionsForRound(
      state,
      action: PayloadAction<{ round: number; submissions: Record<string, boolean> }>,
    ) {
      const { round, submissions } = action.payload;
      state.aiSubmissions[round] = submissions;
    },

    /** Idempotency guard — prevents outcome thunk from firing twice. */
    markFamousFiguresOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset to initial idle state. */
    resetFamousFigures() {
      return initialState;
    },
  },
});

export const {
  startFamousFigures,
  revealNextHint,
  advanceTimer,
  submitPlayerGuess,
  endRound,
  nextRound,
  setAiSubmissionsForRound,
  markFamousFiguresOutcomeResolved,
  resetFamousFigures,
} = famousFiguresSlice.actions;

export default famousFiguresSlice.reducer;
