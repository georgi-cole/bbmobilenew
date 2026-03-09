// MODULE: src/store/challengeSlice.ts
// Orchestrates the full challenge flow:
//   pickGame → rules modal → 3s countdown → run game → compute scores → apply winner
//
// Uses the existing gameSlice actions (launchMinigame, completeMinigame, etc.)
// and the new minigame registry / scoring modules.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './store';
import { mulberry32 } from './rng';
import { simulateChallengeAiScore } from '../ai/competition';
import { pickRandomGame, getGame, getPoolByFilter } from '../minigames/registry';
import type { GameRegistryEntry, GameCategory } from '../minigames/registry';
import { computeScores } from '../minigames/scoring';
import type { RawResult } from '../minigames/scoring';
import type { CwgoPrizeType } from '../features/cwgo/cwgoCompetitionSlice';

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
  /** Monotonically-increasing nonce used to differentiate per-invocation seeds. */
  nextNonce: number;
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
  /** Pre-simulated deterministic scores for every non-human participant. */
  aiScores: Record<string, number>;
  /** Prize type captured at challenge creation (HOH or POV). */
  prizeType?: CwgoPrizeType | string;
}

const initialState: ChallengeState = {
  pending: null,
  history: [],
  nextNonce: 1,
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

    incrementNonce(state) {
      state.nextNonce = ((state.nextNonce + 1) >>> 0) || 1;
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
  incrementNonce,
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
 * @param opts.prizeType - Prize type for CWGO competitions (HOH or POV).
 */
export const startChallenge =
  (
    seed: number,
    participants: string[],
    opts: { category?: GameCategory; excludeKeys?: string[]; forceGameKey?: string; prizeType?: CwgoPrizeType | string } = {},
  ) =>
  (dispatch: AppDispatch, getState: () => RootState): GameRegistryEntry => {
    const state = getState();
    const debugState = state.challenge?.debug ?? {};

    // Resolve which game to use.
    const forceKey = opts.forceGameKey ?? debugState.forceGameKey;
    const forceSeed = debugState.forceSeed;
    const gameSeed = forceSeed !== undefined ? forceSeed : seed;

    let gameEntry: GameRegistryEntry;
    if (forceKey) {
      const found = getGame(forceKey);
      if (!found) throw new Error(`[challengeSlice] Unknown game key: ${forceKey}`);
      gameEntry = found;
    } else {
      // Consult the saved Comp Selection setting (if present).
      const compSel = state.settings?.gameUX?.compSelection;
      const mode = compSel?.mode ?? 'random-games';

      switch (mode) {
        case 'single-game': {
          const key = compSel?.selectedGameId;
          const found = key ? getGame(key) : undefined;
          if (found) {
            gameEntry = found;
          } else {
            // Unknown or missing key — fall back to random selection.
            gameEntry = pickRandomGame(gameSeed, { category: opts.category, excludeKeys: opts.excludeKeys });
          }
          break;
        }

        case 'user-selection': {
          const keys = compSel?.selectedGameIds ?? [];
          const pool = keys
            .map((k) => getGame(k))
            .filter((g): g is GameRegistryEntry => g !== undefined && !g.retired);
          if (pool.length > 0) {
            // Weighted deterministic pick from the user-curated pool.
            const weighted: GameRegistryEntry[] = [];
            for (const entry of pool) {
              for (let i = 0; i < entry.weight; i++) weighted.push(entry);
            }
            const rng = mulberry32(gameSeed >>> 0);
            gameEntry = weighted[Math.floor(rng() * weighted.length)];
          } else {
            gameEntry = pickRandomGame(gameSeed, { category: opts.category, excludeKeys: opts.excludeKeys });
          }
          break;
        }

        case 'arcade-only':
          gameEntry = pickRandomGame(gameSeed, { category: 'arcade', excludeKeys: opts.excludeKeys });
          break;

        case 'trivia-only':
          gameEntry = pickRandomGame(gameSeed, { category: 'trivia', excludeKeys: opts.excludeKeys });
          break;

        case 'endurance-only':
          gameEntry = pickRandomGame(gameSeed, { category: 'endurance', excludeKeys: opts.excludeKeys });
          break;

        case 'logic-only':
          gameEntry = pickRandomGame(gameSeed, { category: 'logic', excludeKeys: opts.excludeKeys });
          break;

        case 'retired': {
          const retiredPool = getPoolByFilter({ retired: true });
          if (retiredPool.length > 0) {
            const rng = mulberry32(gameSeed >>> 0);
            gameEntry = retiredPool[Math.floor(rng() * retiredPool.length)];
          } else {
            gameEntry = pickRandomGame(gameSeed, { category: opts.category, excludeKeys: opts.excludeKeys });
          }
          break;
        }

        case 'misc': {
          // "Misc" — intended for games with no category or multiple categories.
          // The registry currently assigns a single GameCategory to every entry
          // (there is no 'none' or 'misc' category), so this mode falls back to
          // fully-random selection.  Future registry expansions that add uncategorised
          // entries should filter them here with getPoolByFilter.
          gameEntry = pickRandomGame(gameSeed, { category: opts.category, excludeKeys: opts.excludeKeys });
          break;
        }

        case 'unique': {
          // Exclude recently-used games; fall back to normal selection when pool is empty.
          const recentKeys = new Set(
            (state.challenge?.history ?? []).map((r) => r.gameKey),
          );
          const exclude = [...recentKeys, ...(opts.excludeKeys ?? [])];
          const uniquePool = getPoolByFilter({ retired: false, category: opts.category, excludeKeys: exclude });
          if (uniquePool.length > 0) {
            const weighted: GameRegistryEntry[] = [];
            for (const entry of uniquePool) {
              for (let i = 0; i < entry.weight; i++) weighted.push(entry);
            }
            const rng = mulberry32(gameSeed >>> 0);
            gameEntry = weighted[Math.floor(rng() * weighted.length)];
          } else {
            // Pool exhausted — fall back to unconstrained random.
            gameEntry = pickRandomGame(gameSeed, { category: opts.category, excludeKeys: opts.excludeKeys });
          }
          break;
        }

        case 'random-games':
        default:
          gameEntry = pickRandomGame(gameSeed, {
            category: opts.category,
            excludeKeys: opts.excludeKeys,
          });
          break;
      }
    }

    // Derive a per-challenge seed from the base seed + game key hash.
    const challengeSeed = deriveSeed(gameSeed, gameEntry.key);

    // Derive a per-invocation seed so repeated challenges with the same base
    // seed (same week) still get varied question order / AI behaviour.
    // debug.forceSeed bypasses this for reproducibility.
    const nextNonce = state.challenge?.nextNonce ?? 1;
    const perChallengeSeed = forceSeed !== undefined
      ? challengeSeed
      : ((mulberry32((challengeSeed ^ nextNonce) >>> 0)() * 0x100000000) >>> 0);
    dispatch(incrementNonce());

    // Pre-compute AI scores for all non-human participants.
    const humanId = getState().game?.players?.find((p) => p.isUser)?.id;
    const aiScores: Record<string, number> = {};
    let aiSeed = perChallengeSeed;
    for (const pid of participants) {
      if (pid !== humanId) {
        aiScores[pid] = simulateChallengeAiScore({ game: gameEntry, seed: aiSeed });
        aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0;
      }
    }

    const id = `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pending: PendingChallenge = {
      id,
      game: gameEntry,
      seed: perChallengeSeed,
      participants,
      phase: 'rules',
      aiScores,
      prizeType: opts.prizeType,
    };

    dispatch(setPendingChallenge(pending));
    return gameEntry;
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

    // Guard: prefer a winner with a positive canonical score. If all scored <= 0,
    // fall back to the first ranked entry, then the first participant.
    const positiveWinner = ranked.find((r) => r.score > 0);
    const winner = positiveWinner ?? ranked[0];
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
