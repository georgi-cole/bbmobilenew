/**
 * Competition winner selection guard tests.
 *
 * Validates that:
 *  1. A participant with score > 0 wins over participants with score = 0.
 *  2. When all participants score > 0, the highest scorer wins.
 *  3. When ALL participants score 0 (edge case), a winner is still selected.
 *  4. The guard applies in completeMinigame (TapRace flow).
 *  5. The guard applies in completeChallenge (MinigameHost flow).
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  completeMinigame,
  launchMinigame,
} from '../src/store/gameSlice';
import challengeReducer, {
  completeChallenge,
  startChallenge,
} from '../src/store/challengeSlice';
import type { GameState, Player, MinigameSession } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number, isUserIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === isUserIndex,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 2,
    phase: 'hoh_comp',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  };
  return configureStore({
    reducer: { game: gameReducer, challenge: challengeReducer },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

// ── completeMinigame guard ─────────────────────────────────────────────────────

describe('completeMinigame — zero-score guard', () => {
  it('AI with score 80 wins when human taps 0', () => {
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'hoh_comp' });

    // Human is p0; AI participants are p1 and p2
    const session: MinigameSession = {
      key: 'tap-race',
      participants: ['p0', 'p1', 'p2'],
      seed: 1,
      options: { timeLimit: 10000 },
      aiScores: { p1: 80, p2: 75 }, // AI scores
    };
    store.dispatch(launchMinigame(session));
    // Human submits score 0
    store.dispatch(completeMinigame(0));

    const state = store.getState().game;
    expect(state.phase).toBe('hoh_results');
    // Winner must NOT be the human (p0, score=0); should be p1 (score=80)
    expect(state.hohId).toBe('p1');
  });

  it('human wins when they tap the most', () => {
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'hoh_comp' });

    const session: MinigameSession = {
      key: 'tap-race',
      participants: ['p0', 'p1', 'p2'],
      seed: 1,
      options: { timeLimit: 10000 },
      aiScores: { p1: 60, p2: 55 },
    };
    store.dispatch(launchMinigame(session));
    store.dispatch(completeMinigame(95)); // human taps 95

    const state = store.getState().game;
    expect(state.hohId).toBe('p0');
  });

  it('falls back to any participant when all score 0', () => {
    // Edge case: all participants score 0 — still picks a winner.
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'hoh_comp' });

    const session: MinigameSession = {
      key: 'tap-race',
      participants: ['p0', 'p1', 'p2'],
      seed: 99,
      options: { timeLimit: 10000 },
      aiScores: { p1: 0, p2: 0 },
    };
    store.dispatch(launchMinigame(session));
    store.dispatch(completeMinigame(0)); // human also scores 0

    const state = store.getState().game;
    expect(state.phase).toBe('hoh_results');
    // A winner must have been selected
    expect(state.hohId).not.toBeNull();
    expect(['p0', 'p1', 'p2']).toContain(state.hohId);
  });

  it('among positive scorers, highest wins', () => {
    const players = makePlayers(4);
    const store = makeStore({ players, phase: 'hoh_comp' });

    const session: MinigameSession = {
      key: 'tap-race',
      participants: ['p0', 'p1', 'p2', 'p3'],
      seed: 7,
      options: { timeLimit: 10000 },
      aiScores: { p1: 50, p2: 0, p3: 70 },
    };
    store.dispatch(launchMinigame(session));
    store.dispatch(completeMinigame(30)); // human score = 30

    const state = store.getState().game;
    // p3 has highest positive score (70)
    expect(state.hohId).toBe('p3');
  });
});

// ── completeChallenge guard ───────────────────────────────────────────────────

describe('completeChallenge — positive-score winner preference', () => {
  it('selects a positive-score winner over zero-score participants', () => {
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'hoh_comp' });

    // Manually start a challenge so pending state is set.
    // Use 'quickTap' — a valid game key in the registry.
    store.dispatch(
      startChallenge(42, ['p0', 'p1', 'p2'], { forceGameKey: 'quickTap' }),
    );

    // Dispatch completeChallenge with p0 = 0, p1 = 0, p2 = 85
    const winnerId = store.dispatch(
      completeChallenge([
        { playerId: 'p0', rawValue: 0 },
        { playerId: 'p1', rawValue: 0 },
        { playerId: 'p2', rawValue: 85 },
      ]),
    );

    expect(winnerId).toBe('p2');
  });

  it('returns the highest positive scorer when multiple compete', () => {
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      startChallenge(10, ['p0', 'p1', 'p2'], { forceGameKey: 'quickTap' }),
    );

    const winnerId = store.dispatch(
      completeChallenge([
        { playerId: 'p0', rawValue: 60 },
        { playerId: 'p1', rawValue: 90 },
        { playerId: 'p2', rawValue: 45 },
      ]),
    );

    expect(winnerId).toBe('p1');
  });

  it('returns a winner even when all scores are zero', () => {
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      startChallenge(99, ['p0', 'p1', 'p2'], { forceGameKey: 'quickTap' }),
    );

    const winnerId = store.dispatch(
      completeChallenge([
        { playerId: 'p0', rawValue: 0 },
        { playerId: 'p1', rawValue: 0 },
        { playerId: 'p2', rawValue: 0 },
      ]),
    );

    // Must return one of the participants (not null/undefined/empty)
    expect(winnerId).toBeTruthy();
    expect(['p0', 'p1', 'p2']).toContain(winnerId);
  });
});

// ── Advance guard (hoh_results random pick) ───────────────────────────────────

describe('advance() — HOH results picks an alive player', () => {
  it('picks an HOH when advancing from hoh_comp without a minigame', () => {
    const store = makeStore({ phase: 'hoh_comp', players: makePlayers(6) });
    store.dispatch(advance()); // hoh_comp → hoh_results
    const state = store.getState().game;
    expect(state.phase).toBe('hoh_results');
    expect(state.hohId).not.toBeNull();
    // HOH must be one of the alive players
    const alive = state.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    expect(alive.some((p) => p.id === state.hohId)).toBe(true);
  });
});
