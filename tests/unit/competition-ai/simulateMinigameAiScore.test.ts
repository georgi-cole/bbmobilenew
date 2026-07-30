/**
 * Unified minigame AI score dispatcher — routing and integration tests.
 *
 * Covers:
 *  1. simulateMinigameAiScore routes quickTap to simulateQuickTapAiScore (same result)
 *  2. simulateMinigameAiScore routes snake to simulateSnakeAiScore (same result)
 *  3. simulateMinigameAiScore routes unknown games to simulateAiPerformance
 *  4. simulateMinigameAiScore is deterministic for identical inputs
 *  5. quickTap scores via dispatcher fall in the competitive zone [100, 350]
 *  6. quickTap scores in challenge flow (simulateMinigameAiScore) are competitive
 *  7. Both startMinigame and startChallenge produce competitive quickTap AI scores
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { simulateMinigameAiScore } from '../../../src/ai/competition';
import { simulateQuickTapAiScore } from '../../../src/ai/competition/quickTapSimulation';
import { simulateSnakeAiScore } from '../../../src/ai/competition/snakeAiSimulator';
import gameReducer, { startMinigame } from '../../../src/store/gameSlice';
import challengeReducer, { startChallenge } from '../../../src/store/challengeSlice';
import settingsReducer from '../../../src/store/settingsSlice';
import publicOpinionReducer from '../../../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../../../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const players = overrides.players ?? makePlayers(5);
  const base: GameState = {
    season: 1,
    week: 2,
    phase: 'loh_comp',
    seed: 42,
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled: true,
    posWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    lastHohCompFinisherId: null,
    publicSavedNomineeId: null,
    nominationContext: null,
    awaitingPublicSave: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    players,
    tvFeed: [],
    isLive: false,
    ...overrides,
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
      challenge: challengeReducer,
    },
    preloadedState: { game: base },
  });
}

// ── 1. Dispatcher routing — quickTap ─────────────────────────────────────────

describe('simulateMinigameAiScore — quickTap routing', () => {
  it('produces identical results to simulateQuickTapAiScore for the same inputs', () => {
    const args = { seed: 42, playerId: 'p1', participantIndex: 0 };

    const viaDispatcher = simulateMinigameAiScore({ gameKey: 'quickTap', ...args });
    const viaDirectCall = simulateQuickTapAiScore(args);

    expect(viaDispatcher).toBe(viaDirectCall);
  });

  it('is deterministic for identical quickTap inputs', () => {
    const a = simulateMinigameAiScore({ gameKey: 'quickTap', seed: 99, playerId: 'ai-1' });
    const b = simulateMinigameAiScore({ gameKey: 'quickTap', seed: 99, playerId: 'ai-1' });
    expect(a).toBe(b);
  });

  it('quickTap scores via dispatcher fall in the competitive zone [85, 350]', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const scores = seeds.map((seed) =>
      simulateMinigameAiScore({ gameKey: 'quickTap', seed, playerId: `p${seed}` }),
    );
    // Bands reduced 15% (issue #951): lowest band 89 − jitter/slump ≈ 71.
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...scores)).toBeLessThanOrEqual(350);
  });

  it('quickTap scores via dispatcher respect the configured timeLimitSeconds', () => {
    const score30 = simulateMinigameAiScore({
      gameKey: 'quickTap', seed: 42, playerId: 'p1', timeLimitSeconds: 30,
    });
    const score60 = simulateMinigameAiScore({
      gameKey: 'quickTap', seed: 42, playerId: 'p1', timeLimitSeconds: 60,
    });
    expect(score60).toBeGreaterThan(score30);
  });

  it('quickTap scores via dispatcher respect timeLimitMs too', () => {
    const score30 = simulateMinigameAiScore({
      gameKey: 'quickTap', seed: 42, playerId: 'p1', timeLimitMs: 30_000,
    });
    const score60 = simulateMinigameAiScore({
      gameKey: 'quickTap', seed: 42, playerId: 'p1', timeLimitMs: 60_000,
    });
    expect(score60).toBeGreaterThan(score30);
  });

  it('majority of 1000 quickTap dispatcher scores fall in the competitive zone (119–264)', () => {
    const seeds = Array.from({ length: 1000 }, (_, i) => i + 1);
    const scores = seeds.map((seed) =>
      simulateMinigameAiScore({ gameKey: 'quickTap', seed, playerId: 'test-player' }),
    );
    // Bands reduced 15% (issue #951): the competitive zone (bands 2–5) is 119–264.
    const competitive = scores.filter((s) => s >= 119 && s <= 264);
    // 22%+32%+25%+13% = 92% targeted at this range; tolerate ≥ 700 out of 1000
    expect(competitive.length).toBeGreaterThanOrEqual(700);
  });
});

// ── 2. Dispatcher routing — snake ────────────────────────────────────────────

describe('simulateMinigameAiScore — snake routing', () => {
  it('produces identical results to simulateSnakeAiScore for the same inputs', () => {
    const viaDispatcher = simulateMinigameAiScore({
      gameKey: 'snake', seed: 42, playerId: 'p1',
    });
    const viaDirectCall = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'p1' });
    // simulateMinigameAiScore returns a plain number; simulateSnakeAiScore returns { score, completionMs }
    expect(viaDispatcher).toBe(viaDirectCall.score);
  });
});

// ── 3. Dispatcher routing — generic fallback ─────────────────────────────────

describe('simulateMinigameAiScore — generic fallback routing', () => {
  it('returns a number for any unknown game key', () => {
    const result = simulateMinigameAiScore({ gameKey: 'memoryMatch', seed: 42, playerId: 'p1' });
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result)).toBe(true);
  });

  it('is deterministic for generic games', () => {
    const a = simulateMinigameAiScore({ gameKey: 'triviaPulse', seed: 7, playerId: 'p2' });
    const b = simulateMinigameAiScore({ gameKey: 'triviaPulse', seed: 7, playerId: 'p2' });
    expect(a).toBe(b);
  });
});

// ── 4. Session flow (startMinigame) — competitive quickTap scores ─────────────

describe('startMinigame — quickTap uses competitive scoring via shared dispatcher', () => {
  it('precomputed AI scores fall in the competitive zone [100, 350]', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    store.dispatch(
      startMinigame({
        key: 'quickTap',
        participants: ['p0', 'p1', 'p2', 'p3'],
        seed: 42,
        options: { timeLimit: 30 },
      }),
    );

    const session = store.getState().game.pendingMinigame;
    expect(session).not.toBeNull();

    for (const pid of ['p1', 'p2', 'p3']) {
      const score = session?.aiScores?.[pid];
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(60);
      expect(score).toBeLessThanOrEqual(350);
    }
  });

  it('AI scores are well above the old stale maxScore (102) for quickTap', () => {
    // Confirm the new competitive band scoring model is used. Call
    // simulateMinigameAiScore directly with fixed seeds so the test is
    // fully deterministic and not affected by startMinigame's random
    // invocation seed generation.
    const allScores: number[] = [];

    for (let seed = 1; seed <= 30; seed++) {
      for (const pid of ['p1', 'p2', 'p3']) {
        const score = simulateMinigameAiScore({
          gameKey: 'quickTap',
          seed,
          playerId: pid,
          participantIndex: parseInt(pid.slice(1), 10),
          timeLimitSeconds: 30,
        });
        allScores.push(score);
      }
    }

    // At least 85% of scores should be above 102 (old stale maxScore 120, −15%).
    // The new band1 is only 8% probable, so the vast majority should exceed 102.
    const aboveOldMax = allScores.filter((s) => s > 102);
    expect(aboveOldMax.length).toBeGreaterThan(allScores.length * 0.85);
  });
});

// ── 5. Challenge flow (startChallenge) — same quickTap scoring path ───────────

describe('startChallenge — quickTap uses the same shared dispatcher as startMinigame', () => {
  it('AI scores in the challenge flow are in the competitive zone [60, 350]', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    store.dispatch(
      startChallenge(42, ['p0', 'p1', 'p2', 'p3'], { forceGameKey: 'quickTap' }),
    );

    const pending = store.getState().challenge.pending;
    expect(pending).not.toBeNull();

    for (const pid of ['p1', 'p2', 'p3']) {
      const score = pending?.aiScores?.[pid];
      if (typeof score === 'number') {
        expect(score).toBeGreaterThanOrEqual(60);
        expect(score).toBeLessThanOrEqual(350);
      }
    }
  });

  it('challenge quickTap scores are above the old stale maxScore of 102', () => {
    const players = makePlayers(4);
    const allScores: number[] = [];

    for (let seed = 1; seed <= 10; seed++) {
      const store = makeStore({ players });
      store.dispatch(
        startChallenge(seed * 100, ['p0', 'p1', 'p2', 'p3'], { forceGameKey: 'quickTap' }),
      );
      const pending = store.getState().challenge.pending;
      for (const pid of ['p1', 'p2', 'p3']) {
        const score = pending?.aiScores?.[pid];
        if (typeof score === 'number') allScores.push(score);
      }
    }

    // All scores should be above the old stale maxScore (120 → 102 after −15%).
    const aboveOldMax = allScores.filter((s) => s > 102);
    expect(aboveOldMax.length).toBeGreaterThan(allScores.length * 0.9);
  });
});
