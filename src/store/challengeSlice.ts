// MODULE: src/store/challengeSlice.ts
// Orchestrates the full challenge flow:
//   pickGame → rules modal → 3s countdown → run game → compute scores → apply winner
//
// Uses the existing gameSlice actions (launchMinigame, completeMinigame, etc.)
// and the new minigame registry / scoring modules.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './store';
import { mulberry32 } from './rng';
import { pickRandomGame, getGame } from '../minigames/registry';
import type { GameRegistryEntry, GameCategory } from '../minigames/registry';
import { computeScores } from '../minigames/scoring';
import type { RawResult } from '../minigames/scoring';

// ─── State ────────────────────────────────────────────────────────────────────

export interface ChallengeRun {
  id: string;
  gameKey: string;
  seed: number;
  participants: string[];
  /** Per-player raw values keyed by player ID. */
  rawScores: Record<string, number>;
  /** Per-player canonical scores (0-1000). */
  canonicalScores: Record<string, number>;
  winnerId: string;
  timestamp: number;
  /** Whether the winner was determined by the game authoritatively. */
  authoritative: boolean;
}

export interface ChallengeState {
  /** Currently pending challenge (shown to UI). */
  pending: PendingChallenge | null;
  /** Telemetry log of completed runs (for reproducibility). */
  history: ChallengeRun[];
  /** Debug overrides. */
  debug: {
    forceGameKey?: string;
    forceSeed?: number;
    skipRules?: boolean;
    fastForwardCountdown?: boolean;
  };
}

export interface PendingChallenge {
  /** Unique ID for this challenge invocation. */
  id: string;
  game: GameRegistryEntry;
  seed: number;
  participants: string[];
  phase: 'rules' | 'countdown' | 'playing' | 'done';
}

const initialState: ChallengeState = {
  pending: null,
  history: [],
  debug: {},
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const challengeSlice = createSlice({
  name: 'challenge',
  initialState,
  reducers: {
    setPendingChallenge(state, action: PayloadAction<PendingChallenge | null>) {
      state.pending = action.payload;
    },

    setPendingPhase(state, action: PayloadAction<PendingChallenge['phase']>) {
      if (state.pending) state.pending.phase = action.payload;
    },

    recordRun(state, action: PayloadAction<ChallengeRun>) {
      // Keep at most 50 runs for telemetry.
      state.history = [action.payload, ...state.history].slice(0, 50);
    },

    setDebugOverrides(state, action: PayloadAction<ChallengeState['debug']>) {
      state.debug = { ...state.debug, ...action.payload };
    },

    clearDebugOverrides(state) {
      state.debug = {};
    },
  },
});

export const {
  setPendingChallenge,
  setPendingPhase,
  recordRun,
  setDebugOverrides,
  clearDebugOverrides,
} = challengeSlice.actions;

export default challengeSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectPendingChallenge = (s: RootState) => s.challenge?.pending ?? null;
export const selectChallengeHistory = (s: RootState) => s.challenge?.history ?? [];
export const selectChallengeDebug = (s: RootState) => s.challenge?.debug ?? {};

// ─── Thunks ───────────────────────────────────────────────────────────────────

/**
 * Pick a minigame from the registry (deterministically), set up the pending
 * challenge, and return the selected game entry.
 *
 * This does NOT start the rules modal; the UI component (MinigameHost) reads
 * `pending` from state and controls the modal/countdown itself.
 *
 * @param seed - Base seed for this challenge; per-game seed is derived from it.
 * @param participants - Player IDs that will compete.
 * @param opts.category - Optional category filter.
 * @param opts.excludeKeys - Games to exclude from the pool.
 */
export const startChallenge =
  (
    seed: number,
    participants: string[],
    opts: { category?: GameCategory; excludeKeys?: string[]; forceGameKey?: string } = {},
  ) =>
  (dispatch: AppDispatch, getState: () => RootState): GameRegistryEntry => {
    const state = getState();
    const debugState = state.challenge?.debug ?? {};

    // Resolve which game to use.
    const forceKey = opts.forceGameKey ?? debugState.forceGameKey;
    const forceSeed = debugState.forceSeed;
    const gameSeed = forceSeed !== undefined ? forceSeed : seed;

    let game: GameRegistryEntry;
    if (forceKey) {
      const found = getGame(forceKey);
      if (!found) throw new Error(`[challengeSlice] Unknown game key: ${forceKey}`);
      game = found;
    } else {
      game = pickRandomGame(gameSeed, {
        category: opts.category,
        excludeKeys: opts.excludeKeys,
      });
    }

    // Derive a per-challenge seed from the base seed + game key hash.
    const challengeSeed = deriveSeed(gameSeed, game.key);

    const id = `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pending: PendingChallenge = {
      id,
      game,
      seed: challengeSeed,
      participants,
      phase: 'rules',
    };

    dispatch(setPendingChallenge(pending));
    return game;
  };

/**
 * Complete the current challenge with the raw results from each participant.
 * Computes canonical scores, determines the winner, and records telemetry.
 *
 * Returns the winner's player ID.
 */
export const completeChallenge =
  (rawResults: RawResult[]) =>
  (dispatch: AppDispatch, getState: () => RootState): string | null => {
    const state = getState();
    const pending = state.challenge?.pending;
    if (!pending) return null;

    const { game, seed, participants } = pending;

    const ranked = computeScores(game.scoringAdapter, rawResults, game.scoringParams ?? {});

    const canonicalScores: Record<string, number> = {};
    for (const r of ranked) canonicalScores[r.playerId] = r.score;

    const winner = ranked[0];
    const winnerId = winner?.playerId ?? participants[0] ?? '';

    const run: ChallengeRun = {
      id: pending.id,
      gameKey: game.key,
      seed,
      participants,
      rawScores: Object.fromEntries(rawResults.map((r) => [r.playerId, r.rawValue])),
      canonicalScores,
      winnerId,
      timestamp: Date.now(),
      authoritative: winner?.authoritativeWinner === true,
    };

    dispatch(recordRun(run));
    dispatch(setPendingChallenge(null));

    return winnerId;
  };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a deterministic seed from a base seed and a string key. */
function deriveSeed(base: number, key: string): number {
  let hash = base;
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(hash ^ key.charCodeAt(i), 0x9e3779b9) >>> 0);
  }
  return mulberry32(hash)() * 0x100000000 >>> 0;
}
