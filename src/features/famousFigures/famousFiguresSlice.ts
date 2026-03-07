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
import { isAcceptedGuess, normalizeForMatching } from '../../games/famous-figures/fuzzy';
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
  /** Unix timestamp (ms) when each player answered correctly this round. */
  playerCorrectTimestamp: Record<string, number>;
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
  /**
   * Per-player shuffled queue of figure indices (length = totalRounds).
   * Generated at match start using `seed ^ fnv1a32(playerId)` so each player
   * sees a unique, reproducible set of figures.
   */
  playerFigureQueues: Record<string, number[]>;
  /**
   * Per-player cursor counting how many personal rounds have been completed
   * (i.e. how many times the player guessed correctly). Range: 0…totalRounds.
   * Incremented immediately on a correct guess; used to show the personal
   * "waiting for others" screen once cursor === totalRounds.
   */
  playerRoundCursor: Record<string, number>;
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
  playerCorrectTimestamp: {},
  correctPlayers: [],
  figureOrder: [],
  round: 0,
  seed: 0,
  outcomeResolved: false,
  winnerId: null,
  aiSubmissions: {},
  timerPhase: 'clue',
  roundComplete: false,
  playerFigureQueues: {},
  playerRoundCursor: {},
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
 * Probability of correct answer depends solely on figure difficulty:
 *   easy   → 70 % chance of correct
 *   medium → 50 % chance of correct
 *   hard   → 30 % chance of correct
 *
 * The result is deterministic: given the same participantIds, figureIndex,
 * hintsRevealed and rng state, the output is always identical.
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
  state.playerCorrectTimestamp = {};
  state.correctPlayers = [];
  state.roundComplete = false;
  state.hintsRevealed = 0;
  state.timerPhase = 'clue';
}

/**
 * Record per-round scores and transition the match to round_reveal.
 * Safe to call multiple times — guards against status !== round_active.
 */
function doEndRound(state: FamousFiguresState): void {
  if (state.status !== 'round_active') return;

  const allIds = Object.keys(state.playerScores);
  for (const id of allIds) {
    if (!state.playerRoundScores[id]) state.playerRoundScores[id] = [];
    if (state.playerRoundScores[id].length === state.currentRound) {
      const previousTotal = state.playerRoundScores[id].reduce(
        (sum, value) => sum + value,
        0,
      );
      const currentTotal = state.playerScores[id] ?? 0;
      const roundScore = Math.max(0, currentTotal - previousTotal);
      state.playerRoundScores[id].push(roundScore);
    }
  }

  state.status = 'round_reveal';
  state.roundComplete = true;
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
      state.playerCorrectTimestamp = {};

      // Build per-player shuffled figure queues using seed ^ fnv1a32(playerId)
      // so each player sees a unique, reproducible set of figures.
      const playerFigureQueues: Record<string, number[]> = {};
      const playerRoundCursor: Record<string, number> = {};
      for (const id of participantIds) {
        const playerRng = mulberry32(seed ^ fnv1a32(id));
        const playerOrder = shuffleIndices(playerRng, FAMOUS_FIGURES.length);
        // Each player gets totalRounds (3) unique figures from their own shuffle.
        playerFigureQueues[id] = playerOrder.slice(0, 3);
        playerRoundCursor[id] = 0;
        state.playerScores[id] = 0;
        state.playerRoundScores[id] = [];
        state.playerCorrect[id] = false;
        state.playerGuesses[id] = [];
      }
      state.playerFigureQueues = playerFigureQueues;
      state.playerRoundCursor = playerRoundCursor;

      // currentFigureIndex points to the first participant's round-0 figure
      // (used for reveal display and backward-compat code paths).
      const firstId = participantIds[0];
      state.currentFigureIndex =
        firstId !== undefined
          ? (playerFigureQueues[firstId]?.[0] ?? order[0])
          : order[0];
    },

    /** Reveal the next hint (increment hintsRevealed, update timerPhase). */
    revealNextHint(state) {
      if (state.status !== 'round_active') return;
      if (state.roundComplete) return;
      if (state.hintsRevealed >= 5) return;
      state.hintsRevealed += 1;
      const phases: FamousFiguresTimerPhase[] = ['clue', 'hint_1', 'hint_2', 'hint_3', 'hint_4', 'hint_5', 'overtime', 'done'];
      const phaseIdx = Math.min(state.hintsRevealed, phases.length - 1);
      state.timerPhase = phases[phaseIdx];
    },

    /**
     * Advance the timer phase to the next stage.
     * The React component calls this on each timer expiry.
     * No-ops when the round has already been solved (roundComplete).
     */
    advanceTimer(state) {
      if (state.roundComplete) return;
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
     * On correct guess: marks the player solved and awards points.
     * Closes the round (transitions to round_reveal) only when every
     * registered participant has solved — otherwise the round stays active
     * so remaining players can still answer.
     */
    submitPlayerGuess(
      state,
      action: PayloadAction<{ playerId: string; guess: string; timestamp?: number }>,
    ) {
      if (state.status !== 'round_active') return;
      const { playerId, guess, timestamp } = action.payload;

      // Ensure player exists
      if (!(playerId in state.playerGuesses)) {
        state.playerGuesses[playerId] = [];
        state.playerCorrect[playerId] = false;
      }

      // Already answered correctly — no more guesses needed
      if (state.playerCorrect[playerId]) return;

      const trimmed = guess.trim();
      if (trimmed.length === 0) return;

      // Duplicate suppression — compare by normalized form so "Einstein" and "einstein" are the same guess
      const normalizedGuess = normalizeForMatching(trimmed);
      const already = state.playerGuesses[playerId];
      if (already.some((g) => normalizeForMatching(g) === normalizedGuess)) return;
      state.playerGuesses[playerId] = [...already, trimmed];

      // Resolve this player's personal figure for the current global round.
      // Each player has their own shuffled queue so they are never guessing the
      // same figure as another player in the same round.
      const playerQueue = state.playerFigureQueues[playerId];
      const playerFigIdx =
        playerQueue !== undefined
          ? (playerQueue[state.currentRound] ?? state.currentFigureIndex)
          : state.currentFigureIndex;
      const figure = FAMOUS_FIGURES[playerFigIdx];
      if (!figure) return;

      const correct: boolean = isAcceptedGuess(trimmed, figure);

      if (correct) {
        state.playerCorrect[playerId] = true;
        state.correctPlayers = [...state.correctPlayers, playerId];
        const points = getPointsForHintsUsed(state.hintsRevealed);
        if (!(playerId in state.playerScores)) state.playerScores[playerId] = 0;
        state.playerScores[playerId] += points;
        // Record time-to-correct for tiebreaker traceability
        state.playerCorrectTimestamp[playerId] = timestamp ?? Date.now();
        // Advance this player's personal round cursor immediately.
        state.playerRoundCursor[playerId] = (state.playerRoundCursor[playerId] ?? 0) + 1;
        // Close the round only when every participant has now solved
        const participantIds = Object.keys(state.playerScores);
        if (participantIds.length > 0 && participantIds.every((id) => state.playerCorrect[id])) {
          doEndRound(state);
        }
      }
    },

    /**
     * End the current round: record per-round scores, transition to
     * round_reveal. No-op if status !== 'round_active' (round already closed).
     */
    endRound(state) {
      doEndRound(state);
    },

    /**
     * Advance to the next round or complete the match.
     * round_reveal → round_active  (if rounds remain)
     * round_reveal → complete       (after all rounds)
     */
    nextRound(state) {
      if (state.status !== 'round_reveal') return;

      const nextRoundIndex = state.currentRound + 1;

      if (nextRoundIndex >= state.totalRounds) {
        // All rounds complete — determine winner
        state.status = 'complete';
        const ids = Object.keys(state.playerScores);
        state.winnerId = determineWinner(ids, state.playerScores, state.playerRoundScores);
        return;
      }

      state.currentRound = nextRoundIndex;
      state.round = nextRoundIndex;
      state.status = 'round_active';
      resetRoundPlayerState(state);

      // currentFigureIndex tracks the first participant's figure for the reveal
      // display; per-player figures are resolved via playerFigureQueues in
      // submitPlayerGuess and the component.
      const ids = Object.keys(state.playerScores);
      const firstId = ids[0];
      if (firstId !== undefined && state.playerFigureQueues[firstId] !== undefined) {
        state.currentFigureIndex =
          state.playerFigureQueues[firstId][nextRoundIndex] ??
          state.figureOrder[nextRoundIndex];
      } else {
        state.currentFigureIndex = state.figureOrder[nextRoundIndex];
      }
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

/**
 * Return the figure index that `playerId` should be guessing in the given
 * `round`. Falls back to the global `figureOrder[round]` if the player has no
 * personal queue (e.g. in legacy state or tests that pre-load partial state).
 */
export function getPlayerFigureIndex(
  state: Pick<FamousFiguresState, 'playerFigureQueues' | 'figureOrder' | 'currentFigureIndex'>,
  playerId: string,
  round: number,
): number {
  const queue = state.playerFigureQueues[playerId];
  if (queue !== undefined && queue[round] !== undefined) return queue[round];
  return state.figureOrder[round] ?? state.currentFigureIndex;
}

export default famousFiguresSlice.reducer;
