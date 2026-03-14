/**
 * glassBridgeSlice.ts — Redux slice for "Glass Bridge — Brutal Mode"
 *
 * A sequential elimination challenge where players cross a bridge of paired
 * glass tiles one row at a time.  Each row has exactly one safe tile (left or
 * right).  Choosing the wrong tile breaks it and eliminates the player.
 *
 * Phases:
 *   idle           → not started
 *   order_selection → players pick numbers; AI picks automatically
 *   order_reveal    → shuffled order is shown
 *   playing         → sequential gameplay loop
 *   complete        → final rankings determined
 *
 * All randomness is provided by the Mulberry32 seeded RNG; Math.random() is
 * never called.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';
import type { CompetitionSkillProfile } from '../../ai/competition/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TileSide = 'left' | 'right';

export interface BridgeRow {
  /** The safe tile for this row. Hidden from visible state in the UI. */
  safeSide: TileSide;
  leftBroken: boolean;
  rightBroken: boolean;
}

/**
 * Per-player progress tracking.
 * Row numbers are 1-based in all public state.
 * furthestRowReached = 0 means the player has not cleared any row.
 */
export interface GlassBridgePlayerProgress {
  playerId: string;
  /** 1-based row number of the furthest safely-crossed row (0 = none). */
  furthestRowReached: number;
  /** Elapsed ms since challengeStartTimeMs when the player first reached
   *  furthestRowReached.  0 when furthestRowReached is 0. */
  timeReachedFurthestRowMs: number;
  eliminated: boolean;
  /** Elapsed ms since challengeStartTimeMs when the player finished.
   *  Only set when the player has successfully crossed all rows. */
  finishTimeMs?: number;
}

export type GlassBridgePhase =
  | 'idle'
  | 'order_selection'
  | 'order_reveal'
  | 'playing'
  | 'complete';

export interface GlassBridgeParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  competitionProfile?: CompetitionSkillProfile;
}

export interface GlassBridgeState {
  phase: GlassBridgePhase;
  seed: number;
  competitionType: 'HOH' | 'POV';

  /** Ordered list of participants. */
  participants: GlassBridgeParticipant[];

  /** Number of rows in the bridge. */
  rowsCount: number;

  /** Bridge rows (0-indexed internally; UI should present as 1-based). */
  rows: BridgeRow[];

  /** Global timer limit in ms. */
  globalTimeLimitMs: number;

  /** Timestamp (ms, from Date.now()) when the first player started. */
  challengeStartTimeMs: number | null;

  // ── Order selection ──────────────────────────────────────────────────────

  /** Numbers already chosen during order selection (values 1..N). */
  chosenNumbers: Record<string, number>;

  /** Shuffled turn order produced after order reveal.
   *  Index 0 = first to play. */
  turnOrder: string[];

  // ── Gameplay ─────────────────────────────────────────────────────────────

  /** Index into turnOrder for the currently active player. */
  currentTurnIndex: number;

  /** 1-based row the current player is about to step onto. */
  currentPlayerRow: number;

  /** Per-player progress map. */
  progress: Record<string, GlassBridgePlayerProgress>;

  /** Ordered list of eliminated player IDs (first eliminated = index 0). */
  eliminationOrder: string[];

  /** Winner determined at completion. */
  winnerId: string | null;

  /** Ordered placements (1st place = index 0). */
  placements: string[];

  /** Whether the outcome has been applied to the game engine. */
  outcomeResolved: boolean;

  /** When true, the global timer has expired. */
  timerExpired: boolean;

  /** The human player's id (null = no human). */
  humanPlayerId: string | null;

  /** Whether the human is currently spectating (eliminated but watching). */
  humanSpectating: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ROWS_COUNT = 16;
const DEFAULT_TIME_LIMIT_MS = 120_000;

/**
 * Default accuracy when AI observes one broken tile and infers the safe side.
 * Overridden by the player's `nerve` skill if a profile is available.
 *
 * 99%   → AI usually chooses the logically safe tile.
 * 1%    → "slip accident" — AI steps onto the broken tile despite knowing better.
 */
const DEFAULT_AI_OBVIOUS_SAFE_ACCURACY = 0.99;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle using seeded RNG. */
function shuffleArray<T>(rng: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Generate bridge rows using seeded RNG. */
export function generateBridgeRows(rng: () => number, rowsCount: number): BridgeRow[] {
  return Array.from({ length: rowsCount }, () => ({
    safeSide: rng() < 0.5 ? 'left' : 'right',
    leftBroken: false,
    rightBroken: false,
  }));
}

/**
 * Derive the AI accuracy for an "obvious safe" situation from the player's
 * competition profile if available, otherwise use the default.
 *
 * The `nerve` skill maps linearly from 0→ ~0.75 accuracy to 100→ ~0.99.
 */
export function deriveAiObviousSafeAccuracy(profile?: CompetitionSkillProfile): number {
  if (!profile) return DEFAULT_AI_OBVIOUS_SAFE_ACCURACY;
  // nerve 0–100 → accuracy 0.75–0.99
  return 0.75 + (profile.nerve / 100) * 0.24;
}

/**
 * AI step decision logic.
 *
 * The AI may only use visible public state (broken tile flags).
 * It must NOT read safeSide directly.
 *
 * @param row        The row the AI is stepping onto (contains broken flags only; safeSide is
 *                   treated as hidden information and must NOT be used here).
 * @param rng        Seeded RNG function.
 * @param profile    Optional competition profile to calibrate accuracy.
 * @returns chosen tile side.
 */
export function aiDecideStep(
  row: Pick<BridgeRow, 'leftBroken' | 'rightBroken'>,
  rng: () => number,
  profile?: CompetitionSkillProfile,
): TileSide {
  const { leftBroken, rightBroken } = row;

  if (leftBroken && rightBroken) {
    // Invalid state — should never happen in a valid simulation.
    // Fail-safe: choose randomly.
    if (import.meta.env.DEV) {
      console.warn('[GlassBridge] aiDecideStep: both tiles broken — recovering safely');
    }
    return rng() < 0.5 ? 'left' : 'right';
  }

  if (leftBroken) {
    // Right tile is logically safe.
    const accuracy = deriveAiObviousSafeAccuracy(profile);
    if (rng() < accuracy) return 'right';
    // Slip accident (0.1%) — AI loses footing and steps onto the broken tile.
    return 'left';
  }

  if (rightBroken) {
    // Left tile is logically safe.
    const accuracy = deriveAiObviousSafeAccuracy(profile);
    if (rng() < accuracy) return 'left';
    // Slip accident (0.1%) — AI loses footing and steps onto the broken tile.
    return 'right';
  }

  // No information — pure 50/50 guess.
  return rng() < 0.5 ? 'left' : 'right';
}

/** Build the final sorted placements array from completed progress data. */
export function buildPlacements(
  progress: Record<string, GlassBridgePlayerProgress>,
  turnOrder: string[],
): string[] {
  const players = Object.values(progress);

  // Finished players first, sorted by finishTimeMs ascending.
  const finished = players
    .filter(p => p.finishTimeMs !== undefined)
    .sort((a, b) => (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0));

  // Non-finishers sorted by progress then time then original turn order.
  const nonFinishers = players
    .filter(p => p.finishTimeMs === undefined)
    .sort((a, b) => {
      if (b.furthestRowReached !== a.furthestRowReached) {
        return b.furthestRowReached - a.furthestRowReached;
      }
      if (a.timeReachedFurthestRowMs !== b.timeReachedFurthestRowMs) {
        return a.timeReachedFurthestRowMs - b.timeReachedFurthestRowMs;
      }
      // Fall back to turn order (earlier turn = higher placement on tie).
      const ai = turnOrder.indexOf(a.playerId);
      const bi = turnOrder.indexOf(b.playerId);
      return ai - bi;
    });

  return [...finished, ...nonFinishers].map(p => p.playerId);
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: GlassBridgeState = {
  phase: 'idle',
  seed: 0,
  competitionType: 'HOH',
  participants: [],
  rowsCount: DEFAULT_ROWS_COUNT,
  rows: [],
  globalTimeLimitMs: DEFAULT_TIME_LIMIT_MS,
  challengeStartTimeMs: null,
  chosenNumbers: {},
  turnOrder: [],
  currentTurnIndex: 0,
  currentPlayerRow: 1,
  progress: {},
  eliminationOrder: [],
  winnerId: null,
  placements: [],
  outcomeResolved: false,
  timerExpired: false,
  humanPlayerId: null,
  humanSpectating: false,
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const glassBridgeSlice = createSlice({
  name: 'glassBridge',
  initialState,
  reducers: {
    /** Initialize a new Glass Bridge game. */
    initGlassBridge(
      state,
      action: PayloadAction<{
        participantIds: string[];
        participants?: Array<{ id: string; name: string; isHuman: boolean; competitionProfile?: CompetitionSkillProfile }>;
        competitionType: 'HOH' | 'POV';
        seed: number;
        rowsCount?: number;
        globalTimeLimitMs?: number;
        humanPlayerId?: string | null;
      }>,
    ) {
      const {
        participantIds,
        participants,
        competitionType,
        seed,
        rowsCount = DEFAULT_ROWS_COUNT,
        globalTimeLimitMs = DEFAULT_TIME_LIMIT_MS,
        humanPlayerId = null,
      } = action.payload;

      const rng = mulberry32(seed);

      // Build participant list.
      const resolvedParticipants: GlassBridgeParticipant[] = participantIds.map(id => {
        const extra = participants?.find(p => p.id === id);
        return {
          id,
          name: extra?.name ?? id,
          isHuman: extra?.isHuman ?? id === 'user',
          competitionProfile: extra?.competitionProfile,
        };
      });

      // Generate bridge.
      const rows = generateBridgeRows(rng, rowsCount);

      // Build initial progress for each player.
      const progress: Record<string, GlassBridgePlayerProgress> = {};
      for (const id of participantIds) {
        progress[id] = {
          playerId: id,
          furthestRowReached: 0,
          timeReachedFurthestRowMs: 0,
          eliminated: false,
        };
      }

      // Determine human player id.
      const resolvedHumanId =
        humanPlayerId ??
        resolvedParticipants.find(p => p.isHuman)?.id ??
        null;

      Object.assign(state, {
        ...initialState,
        phase: 'order_selection',
        seed,
        competitionType,
        participants: resolvedParticipants,
        rowsCount,
        rows,
        globalTimeLimitMs,
        chosenNumbers: {},
        progress,
        eliminationOrder: [],
        winnerId: null,
        placements: [],
        outcomeResolved: false,
        timerExpired: false,
        humanPlayerId: resolvedHumanId,
        humanSpectating: false,
      });
    },

    /**
     * Record a number choice during order selection.
     * Human calls this explicitly; AI choices are pre-generated and dispatched
     * in bulk by the component.
     */
    recordNumberChoice(
      state,
      action: PayloadAction<{ playerId: string; number: number }>,
    ) {
      if (state.phase !== 'order_selection') return;
      const { playerId, number } = action.payload;
      // Validate: playerId must be a known participant.
      if (!state.participants.some(p => p.id === playerId)) return;
      // Validate: number must be in range.
      const n = state.participants.length;
      if (number < 1 || number > n) return;
      // Prevent overwriting an existing pick.
      if (state.chosenNumbers[playerId] !== undefined) return;
      // Prevent picking a number already taken by another participant.
      const alreadyTaken = Object.values(state.chosenNumbers).includes(number);
      if (alreadyTaken) return;
      state.chosenNumbers[playerId] = number;
    },

    /**
     * Finalise order selection: shuffle the chosen numbers and produce the
     * turn order.  Call this after all players have chosen.
     */
    finaliseOrderSelection(state) {
      if (state.phase !== 'order_selection') return;

      const rng = mulberry32(state.seed + 1); // distinct sub-seed for order shuffle

      // Map number → playerId.
      const numberToPlayer: Record<number, string> = {};
      for (const [pid, num] of Object.entries(state.chosenNumbers)) {
        numberToPlayer[num] = pid;
      }

      // All numbers that were chosen (sorted).
      const chosenNums = Object.values(state.chosenNumbers).sort((a, b) => a - b);

      // Shuffle the numbers.
      const shuffled = shuffleArray(rng, chosenNums);

      // Turn order = players mapped in shuffled order.
      const turnOrder = shuffled.map(n => numberToPlayer[n]).filter(Boolean);

      state.turnOrder = turnOrder;
      state.phase = 'order_reveal';
    },

    /** Advance from order_reveal to playing (called after the reveal animation). */
    startPlaying(
      state,
      action: PayloadAction<{ now: number }>,
    ) {
      if (state.phase !== 'order_reveal') return;
      state.phase = 'playing';
      state.challengeStartTimeMs = action.payload.now;
      state.currentTurnIndex = 0;
      state.currentPlayerRow = 1;
    },

    /**
     * Resolve a single step: the active player steps onto `chosenSide`.
     *
     * Side effects:
     *  - If safe: advances the player's row; updates furthestRowReached.
     *  - If unsafe: marks the tile broken; eliminates the player.
     *  - If the player finishes (reaches last row safely): records finishTimeMs.
     */
    resolveStep(
      state,
      action: PayloadAction<{ chosenSide: TileSide; now: number }>,
    ) {
      if (state.phase !== 'playing') return;

      const { chosenSide, now } = action.payload;
      const activeId = state.turnOrder[state.currentTurnIndex];
      if (!activeId) return;

      const progress = state.progress[activeId];
      if (!progress || progress.eliminated || progress.finishTimeMs !== undefined) return;

      const elapsed = state.challengeStartTimeMs !== null ? now - state.challengeStartTimeMs : 0;

      // If the global timer has already expired, do not process any more steps.
      // The component's timer effect is responsible for dispatching expireTimer()/completeGame().
      if (state.timerExpired) return;

      // Check if the timer just expired at this moment.
      if (state.globalTimeLimitMs > 0 && elapsed >= state.globalTimeLimitMs) {
        // Mark expired and eliminate remaining players; do not resolve the step.
        state.timerExpired = true;
        for (const p of Object.values(state.progress)) {
          if (!p.eliminated && p.finishTimeMs === undefined) {
            p.eliminated = true;
            if (!state.eliminationOrder.includes(p.playerId)) {
              state.eliminationOrder.push(p.playerId);
            }
          }
        }
        return;
      }

      const rowIdx = state.currentPlayerRow - 1; // 0-based
      if (rowIdx < 0 || rowIdx >= state.rows.length) return;
      const row = state.rows[rowIdx];

      if (chosenSide === row.safeSide) {
        // Safe — advance.
        progress.furthestRowReached = state.currentPlayerRow;
        progress.timeReachedFurthestRowMs = elapsed;

        if (state.currentPlayerRow >= state.rowsCount) {
          // Player has crossed the final row — they finished!
          progress.finishTimeMs = elapsed;
          // Advance to next turn.
          state.currentTurnIndex += 1;
          state.currentPlayerRow = 1;
        } else {
          state.currentPlayerRow += 1;
        }
      } else {
        // Wrong tile — break and eliminate.
        if (chosenSide === 'left') {
          row.leftBroken = true;
        } else {
          row.rightBroken = true;
        }
        progress.eliminated = true;
        state.eliminationOrder.push(activeId);

        // Advance to next turn.
        state.currentTurnIndex += 1;
        state.currentPlayerRow = 1;
      }
    },

    /** Advance to the next player's turn (called when a player's turn ends cleanly). */
    advanceTurn(state) {
      if (state.phase !== 'playing') return;
      state.currentTurnIndex += 1;
      state.currentPlayerRow = 1;
    },

    /** Mark the global timer as expired; ongoing actions should stop. */
    expireTimer(state) {
      // Idempotency guard — avoid duplicating entries in eliminationOrder.
      if (state.timerExpired) return;
      state.timerExpired = true;
      // Eliminate any unfinished players.
      for (const p of Object.values(state.progress)) {
        if (!p.eliminated && p.finishTimeMs === undefined) {
          p.eliminated = true;
          state.eliminationOrder.push(p.playerId);
        }
      }
    },

    /** Compute final rankings and transition to complete. */
    completeGame(state) {
      if (state.phase !== 'playing' && state.phase !== 'complete') return;

      // Ensure any remaining unfinished players are eliminated.
      for (const p of Object.values(state.progress)) {
        if (!p.eliminated && p.finishTimeMs === undefined) {
          p.eliminated = true;
          if (!state.eliminationOrder.includes(p.playerId)) {
            state.eliminationOrder.push(p.playerId);
          }
        }
      }

      const placements = buildPlacements(state.progress, state.turnOrder);
      state.placements = placements;
      state.winnerId = placements[0] ?? null;
      state.phase = 'complete';
    },

    /** Mark human as spectating (eliminated but watching). */
    setHumanSpectating(state, action: PayloadAction<boolean>) {
      state.humanSpectating = action.payload;
    },

    /** Mark the game outcome as applied to the engine (idempotency guard). */
    markGlassBridgeOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset to idle state. */
    resetGlassBridge() {
      return initialState;
    },
  },
});

export const {
  initGlassBridge,
  recordNumberChoice,
  finaliseOrderSelection,
  startPlaying,
  resolveStep,
  advanceTurn,
  expireTimer,
  completeGame,
  setHumanSpectating,
  markGlassBridgeOutcomeResolved,
  resetGlassBridge,
} = glassBridgeSlice.actions;

export default glassBridgeSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────

export function selectActivePlayerId(state: GlassBridgeState): string | null {
  return state.turnOrder[state.currentTurnIndex] ?? null;
}

export function selectIsGameOver(state: GlassBridgeState): boolean {
  if (state.timerExpired) return true;
  if (state.currentTurnIndex >= state.turnOrder.length) return true;
  const allDone = Object.values(state.progress).every(
    p => p.eliminated || p.finishTimeMs !== undefined,
  );
  return allDone;
}

/**
 * Pre-simulate an AI player's entire turn through the bridge.
 * Returns an array of steps (chosenSide, result) — useful for testing
 * determinism or running headless simulations.
 */
export function simulateAiTurn(
  rows: BridgeRow[],
  rng: () => number,
  profile?: CompetitionSkillProfile,
): Array<{ row: number; chosenSide: TileSide; result: 'safe' | 'break' }> {
  const steps: Array<{ row: number; chosenSide: TileSide; result: 'safe' | 'break' }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const chosen = aiDecideStep(row, rng, profile);
    const result = chosen === row.safeSide ? 'safe' : 'break';
    steps.push({ row: i + 1, chosenSide: chosen, result });
    if (result === 'break') break;
  }
  return steps;
}

/**
 * Build AI number choices for order selection.
 * Each AI picks a unique number from the remaining pool.
 * Returns a map of playerId → chosenNumber.
 */
export function buildAiNumberChoices(
  participantIds: string[],
  humanId: string | null,
  alreadyChosen: Record<string, number>,
  rng: () => number,
): Record<string, number> {
  const n = participantIds.length;
  const taken = new Set(Object.values(alreadyChosen));
  const available = Array.from({ length: n }, (_, i) => i + 1).filter(
    num => !taken.has(num),
  );

  const result: Record<string, number> = {};
  for (const id of participantIds) {
    if (id === humanId) continue; // human picks interactively
    if (alreadyChosen[id] !== undefined) continue; // already chose
    if (available.length === 0) break;
    const idx = Math.floor(rng() * available.length);
    result[id] = available.splice(idx, 1)[0];
  }
  return result;
}
