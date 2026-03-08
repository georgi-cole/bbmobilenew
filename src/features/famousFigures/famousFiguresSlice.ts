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
   * Shared figure order for the entire match (length = totalRounds).
   * All players see the same figures in the same order so the competition
   * is apples-to-apples. Generated once at match start from the seeded RNG.
   */
  matchFigureOrder: number[];
  /**
   * Per-player shuffled queue of figure indices (length = totalRounds).
   * Now mirrors matchFigureOrder for all players (same figures for everyone).
   * Kept for backward compatibility.
   */
  playerFigureQueues: Record<string, number[]>;
  /**
   * Per-player cursor counting how many personal rounds have been resolved
   * for that player (answered correctly, or the global round advanced past
   * them). Range: 0…totalRounds. Incremented on correct guess; also bumped to
   * `currentRound + 1` when `nextRound` advances so the cursor is always ≥
   * the upcoming global round.
   */
  playerRoundCursor: Record<string, number>;
  /**
   * Per-player per-round points, indexed by round number (0-based).
   * Written at `playerPersonalRoundScores[id][roundIndex]` immediately on each
   * correct guess — not deferred to `doEndRound`. Missed rounds default to 0
   * when read. Used by the waiting screen for the per-round breakdown.
   */
  playerPersonalRoundScores: Record<string, number[]>;
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
  matchFigureOrder: [],
  playerFigureQueues: {},
  playerRoundCursor: {},
  playerPersonalRoundScores: {},
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
 *
 * Prefers `playerPersonalRoundScores[id][currentRound]` over the cumulative
 * diff calculation so that scores are always correct even when a player
 * answered ahead of the global round.
 */
function doEndRound(state: FamousFiguresState): void {
  if (state.status !== 'round_active') return;

  const allIds = Object.keys(state.playerScores);
  for (const id of allIds) {
    if (!state.playerRoundScores[id]) state.playerRoundScores[id] = [];
    if (state.playerRoundScores[id].length === state.currentRound) {
      // Prefer the per-player personal round score recorded at guess-time so
      // that players who answered ahead of the global round get the right value.
      const personal = state.playerPersonalRoundScores[id];
      const personalScore =
        personal !== undefined ? personal[state.currentRound] : undefined;

      let roundScore: number;
      if (personalScore !== undefined) {
        // Use the per-player personal score recorded at guess-time — this is
        // accurate even when the player answered ahead of the global round.
        roundScore = personalScore;
      } else {
        // Fallback: derive from the cumulative score diff.
        const previousTotal = state.playerRoundScores[id].reduce(
          (sum, value) => sum + value,
          0,
        );
        const currentTotal = state.playerScores[id] ?? 0;
        roundScore = Math.max(0, currentTotal - previousTotal);
      }
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
      // Select exactly totalRounds figures from the shuffle — shared by all
      // players so the competition is apples-to-apples.
      const matchFigureOrder = order.slice(0, state.totalRounds);
      state.matchFigureOrder = matchFigureOrder;
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

      // All players share the same matchFigureOrder so scores are directly
      // comparable. playerFigureQueues is retained for backward compatibility.
      const playerFigureQueues: Record<string, number[]> = {};
      const playerRoundCursor: Record<string, number> = {};
      const playerPersonalRoundScores: Record<string, number[]> = {};
      for (const id of participantIds) {
        playerFigureQueues[id] = matchFigureOrder.slice();
        playerRoundCursor[id] = 0;
        playerPersonalRoundScores[id] = [];
        state.playerScores[id] = 0;
        state.playerRoundScores[id] = [];
        state.playerCorrect[id] = false;
        state.playerGuesses[id] = [];
      }
      state.playerFigureQueues = playerFigureQueues;
      state.playerRoundCursor = playerRoundCursor;
      state.playerPersonalRoundScores = playerPersonalRoundScores;

      // currentFigureIndex points to the shared round-0 figure.
      state.currentFigureIndex = matchFigureOrder[0] ?? order[0];
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
     * Submit a player's guess for their current personal figure.
     *
     * `targetRound` (optional, defaults to `currentRound`) lets the human
     * submit for a round they are "playing ahead" of the global round. AIs
     * always omit this and default to the current global round.
     *
     * Checks fuzzy match, awards points, suppresses duplicates.
     * On correct guess: marks the player solved and awards points.
     * Closes the round (transitions to round_reveal) only when every
     * registered participant has advanced their cursor past currentRound —
     * otherwise the round stays active so remaining players can still answer.
     */
    submitPlayerGuess(
      state,
      action: PayloadAction<{ playerId: string; guess: string; targetRound?: number; timestamp?: number }>,
    ) {
      if (state.status !== 'round_active') return;
      const { playerId, guess, timestamp } = action.payload;
      const targetRound = action.payload.targetRound ?? state.currentRound;

      // Bounds check
      if (targetRound < 0 || targetRound >= state.totalRounds) return;
      // Cannot answer a round that has already globally passed
      if (targetRound < state.currentRound) return;

      // Ensure player exists
      if (!(playerId in state.playerGuesses)) {
        state.playerGuesses[playerId] = [];
        state.playerCorrect[playerId] = false;
      }

      // Guard: enforce monotonic per-player progression — targetRound must be
      // the player's next unanswered round; this prevents skipping rounds.
      if (targetRound !== (state.playerRoundCursor[playerId] ?? 0)) return;

      // Guard: player already answered this round correctly but advancePlayerCursor
      // has not yet fired (overlay is still visible). Prevent a second correct
      // submission from double-awarding points.
      if (targetRound === state.currentRound && state.playerCorrect[playerId]) return;

      const trimmed = guess.trim();
      if (trimmed.length === 0) return;

      // Duplicate suppression — only apply for the current global round where
      // playerGuesses is actively maintained; for ahead rounds skip to avoid
      // false positives from previous round's guess history.
      if (targetRound === state.currentRound) {
        const normalizedGuess = normalizeForMatching(trimmed);
        const already = state.playerGuesses[playerId];
        if (already.some((g) => normalizeForMatching(g) === normalizedGuess)) return;
        state.playerGuesses[playerId] = [...already, trimmed];
      }

      // All players share matchFigureOrder — look up the figure for targetRound.
      const figureIdx =
        state.matchFigureOrder[targetRound] ??
        (state.playerFigureQueues[playerId]?.[targetRound] ?? state.currentFigureIndex);
      const figure = FAMOUS_FIGURES[figureIdx];
      if (!figure) return;

      const correct: boolean = isAcceptedGuess(trimmed, figure);

      if (correct) {
        const points = getPointsForHintsUsed(state.hintsRevealed);
        if (!(playerId in state.playerScores)) state.playerScores[playerId] = 0;
        state.playerScores[playerId] += points;
        // Record time-to-correct for tiebreaker traceability
        state.playerCorrectTimestamp[playerId] = timestamp ?? Date.now();
        // Record this round's personal score indexed by targetRound so indices
        // always match round numbers regardless of order of play.
        if (!state.playerPersonalRoundScores[playerId]) {
          state.playerPersonalRoundScores[playerId] = [];
        }
        state.playerPersonalRoundScores[playerId][targetRound] = points;

        if (targetRound === state.currentRound) {
          // For the current global round: mark correct but do NOT advance the
          // cursor yet. The UI will dispatch advancePlayerCursor after showing
          // the short success confirmation overlay (~700 ms). This keeps input
          // disabled during the overlay and the round open until every
          // participant has been acknowledged.
          state.playerCorrect[playerId] = true;
          state.correctPlayers = [...state.correctPlayers, playerId];
        } else {
          // For ahead rounds (targetRound > currentRound): advance cursor
          // immediately since no overlay is shown for ahead-play answers.
          // doEndRound is NOT called here — it fires from advancePlayerCursor
          // once all participants have advanced past the current global round.
          state.playerRoundCursor[playerId] = (state.playerRoundCursor[playerId] ?? 0) + 1;
        }
      }
    },

    /**
     * Advance a player's personal round cursor after the success confirmation
     * overlay has been shown (~700 ms after the correct guess).
     *
     * `targetRound` must equal the player's current cursor position so that
     * stale dispatches (e.g. if nextRound already bumped the cursor) are
     * silently ignored.
     *
     * When every participant's cursor has advanced past `currentRound` this
     * action also closes the round (transitions to round_reveal).
     */
    advancePlayerCursor(
      state,
      action: PayloadAction<{ playerId: string; targetRound: number }>,
    ) {
      const { playerId, targetRound } = action.payload;
      const cursor = state.playerRoundCursor[playerId] ?? 0;
      // Idempotency guard: only advance if cursor is at the expected position.
      if (cursor !== targetRound) return;
      state.playerRoundCursor[playerId] = cursor + 1;

      // Close the round when every participant's cursor has advanced past
      // the current global round.
      if (state.status !== 'round_active') return;
      const participantIds = Object.keys(state.playerScores);
      if (
        participantIds.length > 0 &&
        participantIds.every((id) => (state.playerRoundCursor[id] ?? 0) > state.currentRound)
      ) {
        doEndRound(state);
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
      const allIds = Object.keys(state.playerScores);

      // Advance cursor for any player whose cursor is still at or behind the
      // current round (they missed it — didn't answer correctly in time).
      // This ensures every player's cursor is always ≥ the upcoming round so
      // they can participate and the monotonic targetRound guard doesn't block them.
      for (const id of allIds) {
        const cursor = state.playerRoundCursor[id] ?? 0;
        if (cursor <= state.currentRound) {
          // Record 0 for the missed round so the index-based array stays aligned.
          if (!state.playerPersonalRoundScores[id]) {
            state.playerPersonalRoundScores[id] = [];
          }
          if (state.playerPersonalRoundScores[id][state.currentRound] === undefined) {
            state.playerPersonalRoundScores[id][state.currentRound] = 0;
          }
          state.playerRoundCursor[id] = state.currentRound + 1;
        }
      }

      if (nextRoundIndex >= state.totalRounds) {
        // All rounds complete — determine winner
        state.status = 'complete';
        state.winnerId = determineWinner(allIds, state.playerScores, state.playerRoundScores);
        return;
      }

      state.currentRound = nextRoundIndex;
      state.round = nextRoundIndex;
      state.status = 'round_active';
      resetRoundPlayerState(state);

      // currentFigureIndex tracks the shared round figure for the reveal display.
      state.currentFigureIndex =
        state.matchFigureOrder[nextRoundIndex] ??
        state.figureOrder[nextRoundIndex];
    },

    /** Store AI submission results for a round. */
    setAiSubmissionsForRound(
      state,
      action: PayloadAction<{ round: number; submissions: Record<string, boolean> }>,
    ) {
      const { round, submissions } = action.payload;
      state.aiSubmissions[round] = submissions;
    },

    /**
     * Atomically complete all remaining rounds and transition to 'complete'.
     *
     * For each remaining round:
     *   1. Apply any pre-computed AI submissions for players who haven't yet
     *      answered that round (cursor ≤ round).
     *   2. End the round (doEndRound → round_reveal).
     *   3. Advance (nextRound logic) until all rounds done → complete.
     *
     * This is dispatched by the "Finish Match" button in the waiting screen so
     * the human doesn't have to wait for all global timers to expire.
     */
    finishAllRounds(state) {
      if (state.status === 'complete') return;

      const allIds = Object.keys(state.playerScores);

      // Loop through remaining rounds starting from the current global round.
      for (let roundIdx = state.currentRound; roundIdx < state.totalRounds; roundIdx++) {
        // Ensure global state is in round_active for this iteration.
        if (state.status === 'round_reveal') {
          // Advance from a previous doEndRound call within this loop.
          state.currentRound = roundIdx;
          state.round = roundIdx;
          state.status = 'round_active';
          resetRoundPlayerState(state);
          state.currentFigureIndex =
            state.matchFigureOrder[roundIdx] ?? state.figureOrder[roundIdx];
        }

        if (state.status !== 'round_active') break;

        // Compute AI submissions inline if not already available.
        if (!state.aiSubmissions[roundIdx]) {
          const figIdx = state.matchFigureOrder[roundIdx] ?? state.currentFigureIndex;
          const rng = mulberry32(state.seed ^ (roundIdx * 0x9e3779b9));
          const submissions: Record<string, boolean> = {};
          for (const id of allIds) {
            const result = buildAiSubmissionsForRound([id], figIdx, state.hintsRevealed, rng);
            submissions[id] = result[id] ?? false;
          }
          state.aiSubmissions[roundIdx] = submissions;
        }

        const aiSubs = state.aiSubmissions[roundIdx];
        const figIdx = state.matchFigureOrder[roundIdx] ?? state.currentFigureIndex;

        // Apply correct AI submissions for players who haven't answered yet.
        for (const id of allIds) {
          // Skip players who already answered this round (cursor past it).
          if ((state.playerRoundCursor[id] ?? 0) > roundIdx) continue;

          // Player answered correctly but advancePlayerCursor hasn't fired yet
          // (success overlay was still visible when finishAllRounds was called).
          // Advance the cursor so the round-close logic sees a consistent state.
          if (state.playerPersonalRoundScores[id]?.[roundIdx] !== undefined) {
            state.playerRoundCursor[id] = roundIdx + 1;
            continue;
          }

          if (!state.playerPersonalRoundScores[id]) {
            state.playerPersonalRoundScores[id] = [];
          }

          if (!aiSubs[id]) {
            // AI submission was incorrect — record 0 for this round.
            if (state.playerPersonalRoundScores[id][roundIdx] === undefined) {
              state.playerPersonalRoundScores[id][roundIdx] = 0;
            }
            state.playerRoundCursor[id] = (state.playerRoundCursor[id] ?? 0) + 1;
            continue;
          }

          const fig = FAMOUS_FIGURES[figIdx];
          if (!fig) continue;

          const points = getPointsForHintsUsed(state.hintsRevealed);
          state.playerScores[id] = (state.playerScores[id] ?? 0) + points;
          state.playerCorrect[id] = true;
          state.correctPlayers = [...state.correctPlayers, id];
          state.playerCorrectTimestamp[id] = Date.now();

          // Store at the specific round index so the array stays aligned even
          // if earlier rounds were missed (they will already have been filled
          // with 0 or a valid score from a previous iteration).
          state.playerPersonalRoundScores[id][roundIdx] = points;
          state.playerRoundCursor[id] = (state.playerRoundCursor[id] ?? 0) + 1;
        }

        // Close this round.
        doEndRound(state);

        // If this was the last round, determine winner and finish.
        if (roundIdx + 1 >= state.totalRounds) {
          state.status = 'complete';
          state.winnerId = determineWinner(allIds, state.playerScores, state.playerRoundScores);
          return;
        }
        // Otherwise, prepare state for the next iteration of the loop.
        // (round_reveal → will be transitioned to round_active at top of next iteration)
      }

      // Fallback: ensure we always end in complete state.
      state.status = 'complete';
      state.winnerId = determineWinner(allIds, state.playerScores, state.playerRoundScores);
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
  advancePlayerCursor,
  endRound,
  nextRound,
  setAiSubmissionsForRound,
  finishAllRounds,
  markFamousFiguresOutcomeResolved,
  resetFamousFigures,
} = famousFiguresSlice.actions;

/**
 * Return the figure index for the given `round`.
 * With the shared `matchFigureOrder` design all players see the same figure
 * per round — the `playerId` parameter is accepted for backward compatibility
 * but is no longer used for figure selection.
 */
export function getPlayerFigureIndex(
  state: Pick<FamousFiguresState, 'matchFigureOrder' | 'playerFigureQueues' | 'figureOrder' | 'currentFigureIndex'>,
  playerId: string,
  round: number,
): number {
  // Prefer the shared matchFigureOrder when available.
  if (state.matchFigureOrder && state.matchFigureOrder[round] !== undefined) {
    return state.matchFigureOrder[round];
  }
  // Fallback: per-player queue (legacy / partial state in tests).
  const queue = state.playerFigureQueues[playerId];
  if (queue !== undefined && queue[round] !== undefined) return queue[round];
  return state.figureOrder[round] ?? state.currentFigureIndex;
}

export default famousFiguresSlice.reducer;
