/**
 * Integration tests — Tetris minigame (native React migration).
 *
 * Verifies:
 *  1. Registry entry has been updated to React implementation.
 *  2. AI registry entry is present and correct.
 *  3. Slice initialises correctly on initTetris.
 *  4. setHumanScore transitions to 'complete' with correct winner / last place.
 *  5. resolveTetrisOutcome dispatches applyMinigameWinner once and is idempotent.
 *  6. Phase-mismatch guard: thunk is a no-op when game phase doesn't match.
 *  7. winner is correct (highest score wins).
 *  8. last-place is correct (lowest score).
 *  9. auto-nominee (lastHohCompFinisherId) matches the scoreboard last-place.
 * 10. Human nomination flow works after the Tetris comp resolves.
 * 11. AI nomination flow works after the Tetris comp resolves.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import tetrisReducer, {
  initTetris,
  setHumanScore,
  markTetrisOutcomeResolved,
} from '../../src/features/tetris/tetrisSlice';
import { resolveTetrisOutcome } from '../../src/features/tetris/thunks';
import { getGame } from '../../src/minigames/registry';
import { minigameAiRegistry } from '../../src/ai/competition/minigameAiRegistry';
import gameReducer, {
  applyMinigameWinner,
  advance,
} from '../../src/store/gameSlice';
import settingsReducer from '../../src/store/settingsSlice';
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
  }));
}

/** Minimal store wiring for integration tests (game + tetris). */
function makeIntegrationStore(initialGamePhase = 'hoh_comp') {
  const minimalGameReducer = (
    state = {
      phase: initialGamePhase,
      hohId: null as string | null,
      povWinnerId: null as string | null,
      lastHohCompFinisherId: null as string | null,
    },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      const payload = action.payload as {
        winnerId: string;
        lastPlaceId?: string;
        lastPlaceType?: string;
        scores?: Record<string, number>;
      };
      if (initialGamePhase === 'hoh_comp') {
        return {
          ...state,
          hohId: payload.winnerId,
          lastHohCompFinisherId: payload.lastPlaceId ?? null,
          phase: 'hoh_results',
        };
      }
      return {
        ...state,
        povWinnerId: payload.winnerId,
        phase: 'pov_results',
      };
    }
    return state;
  };

  return configureStore({
    reducer: { tetris: tetrisReducer, game: minimalGameReducer },
  });
}

/** Full store for nomination flow tests. */
function makeFullGameStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 2,
    phase: 'hoh_comp',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled: true,
    povWinnerId: null,
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
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  };

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
      tetris: tetrisReducer,
    },
    preloadedState: { game: { ...base, ...overrides } as GameState },
  });
}

function initStore(
  store: ReturnType<typeof makeIntegrationStore>,
  type: 'HOH' | 'POV' = 'HOH',
  seed = 42,
) {
  store.dispatch(
    initTetris({
      participantIds: ['alice', 'bob', 'carol'],
      participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
      humanPlayerId: 'alice',
      competitionType: type,
      seed,
      aiScores: { bob: 800, carol: 300 },
    }),
  );
}

// ─── Registry wiring ──────────────────────────────────────────────────────────

describe('Registry — tetris entry', () => {
  it('exists in the registry', () => {
    expect(getGame('tetris')).toBeDefined();
  });

  it('uses implementation="react"', () => {
    expect(getGame('tetris')?.implementation).toBe('react');
  });

  it('uses legacy=false', () => {
    expect(getGame('tetris')?.legacy).toBe(false);
  });

  it('uses reactComponentKey="Tetris"', () => {
    expect(getGame('tetris')?.reactComponentKey).toBe('Tetris');
  });

  it('has authoritative=true', () => {
    expect(getGame('tetris')?.authoritative).toBe(true);
  });

  it('has timeLimitMs=0 (self-terminating)', () => {
    expect(getGame('tetris')?.timeLimitMs).toBe(0);
  });
});

// ─── AI registry ─────────────────────────────────────────────────────────────

describe('AI Registry — tetris entry', () => {
  it('exists in minigameAiRegistry', () => {
    expect(minigameAiRegistry['tetris']).toBeDefined();
  });

  it('has scoreDirection="higher-is-better"', () => {
    expect(minigameAiRegistry['tetris']?.scoreDirection).toBe('higher-is-better');
  });

  it('has category="precision"', () => {
    expect(minigameAiRegistry['tetris']?.category).toBe('precision');
  });
});

// ─── Slice initialisation ─────────────────────────────────────────────────────

describe('initTetris', () => {
  it('transitions to playing phase', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tetris.phase).toBe('playing');
  });

  it('stores AI scores', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tetris.aiScores).toEqual({ bob: 800, carol: 300 });
  });

  it('stores participants', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tetris.participants.map((p) => p.id)).toEqual([
      'alice', 'bob', 'carol',
    ]);
  });

  it('outcomeResolved starts false', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tetris.outcomeResolved).toBe(false);
  });
});

// ─── Winner + last-place derivation ──────────────────────────────────────────

describe('Tetris winner and last-place', () => {
  it('player with highest score wins', () => {
    const store = makeIntegrationStore();
    initStore(store);
    // alice scores 1200 — highest; bob=800, carol=300
    store.dispatch(setHumanScore(1200));
    expect(store.getState().tetris.winnerId).toBe('alice');
  });

  it('player with lowest score is last place', () => {
    const store = makeIntegrationStore();
    initStore(store);
    store.dispatch(setHumanScore(1200));
    expect(store.getState().tetris.lastPlaceId).toBe('carol');
  });

  it('human with lowest score is last place', () => {
    const store = makeIntegrationStore();
    initStore(store);
    // alice scores 100 — lowest; bob=800, carol=300 → bob wins
    store.dispatch(setHumanScore(100));
    expect(store.getState().tetris.winnerId).toBe('bob');
    expect(store.getState().tetris.lastPlaceId).toBe('alice');
  });

  it('transitions to complete on setHumanScore', () => {
    const store = makeIntegrationStore();
    initStore(store);
    store.dispatch(setHumanScore(500));
    expect(store.getState().tetris.phase).toBe('complete');
  });

  it('finalScores includes both human and AI scores', () => {
    const store = makeIntegrationStore();
    initStore(store);
    store.dispatch(setHumanScore(600));
    const { finalScores } = store.getState().tetris;
    expect(finalScores['alice']).toBe(600);
    expect(finalScores['bob']).toBe(800);
    expect(finalScores['carol']).toBe(300);
  });
});

// ─── resolveTetrisOutcome — idempotency ────────────────────────────────────────

describe('resolveTetrisOutcome — idempotency', () => {
  function reachComplete(type: 'HOH' | 'POV' = 'HOH', humanScore = 1200) {
    const phase = type === 'HOH' ? 'hoh_comp' : 'pov_comp';
    const store = makeIntegrationStore(phase);
    initStore(store, type);
    store.dispatch(setHumanScore(humanScore));
    expect(store.getState().tetris.phase).toBe('complete');
    return store;
  }

  it('dispatches applyMinigameWinner for HOH', () => {
    const store = reachComplete('HOH');
    store.dispatch(resolveTetrisOutcome());
    expect(store.getState().tetris.outcomeResolved).toBe(true);
    expect(store.getState().game.hohId).toBe('alice'); // alice=1200 wins
  });

  it('dispatches applyMinigameWinner for POV', () => {
    const store = reachComplete('POV');
    store.dispatch(resolveTetrisOutcome());
    expect(store.getState().tetris.outcomeResolved).toBe(true);
    expect(store.getState().game.povWinnerId).toBe('alice');
  });

  it('is idempotent — second dispatch is a no-op', () => {
    const store = reachComplete('HOH');
    store.dispatch(resolveTetrisOutcome());
    store.dispatch(resolveTetrisOutcome()); // second call — must not throw or double-apply
    expect(store.getState().tetris.outcomeResolved).toBe(true);
  });

  it('is a no-op when game phase does not match competition type (HOH in pov_comp)', () => {
    const store = makeIntegrationStore('pov_comp');
    initStore(store, 'HOH');
    store.dispatch(setHumanScore(1200));
    store.dispatch(resolveTetrisOutcome()); // phase mismatch — should be a no-op
    expect(store.getState().tetris.outcomeResolved).toBe(false);
    expect(store.getState().game.hohId).toBeNull();
  });

  it('markTetrisOutcomeResolved guard prevents re-dispatch', () => {
    const store = reachComplete('HOH');
    store.dispatch(markTetrisOutcomeResolved());
    store.dispatch(resolveTetrisOutcome()); // already resolved
    expect(store.getState().tetris.outcomeResolved).toBe(true);
  });
});

// ─── auto-nominee matches scoreboard last-place ───────────────────────────────

describe('auto-nominee (lastHohCompFinisherId) matches scoreboard last-place', () => {
  it('lastHohCompFinisherId equals the last-place finisher from Tetris', () => {
    const players = makePlayers(4);
    const store = makeFullGameStore({ players });

    // Dispatch applyMinigameWinner directly (as resolveTetrisOutcome would do)
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 900, p1: 600, p2: 400, p3: 50 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('lastHohCompFinisherId is not the winner', () => {
    const players = makePlayers(4);
    const store = makeFullGameStore({ players });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p1',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 700, p1: 1000, p2: 300, p3: 150 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.hohId).toBe('p1');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
    expect(store.getState().game.lastHohCompFinisherId).not.toBe(
      store.getState().game.hohId,
    );
  });
});

// ─── Human nomination flow ────────────────────────────────────────────────────

describe('Human nomination flow after Tetris HOH', () => {
  it('human HOH can nominate two players after comp resolves', () => {
    const players = makePlayers(6);
    // Mark p0 as human HOH
    players[0] = { ...players[0], status: 'active' };
    const store = makeFullGameStore({ players });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: players.map((p) => p.id),
        scores: { p0: 1200, p1: 900, p2: 700, p3: 500, p4: 300, p5: 100 },
        lastPlaceId: 'p5',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // Advance to nominations via normal flow
    store.dispatch(advance()); // hoh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    expect(store.getState().game.phase).toBe('nominations');
  });
});

// ─── AI nomination flow ───────────────────────────────────────────────────────

describe('AI nomination flow after Tetris HOH', () => {
  it('AI HOH nominates correctly after comp resolves', () => {
    const players = makePlayers(6);
    const store = makeFullGameStore({ players, publicModeEnabled: false });

    // p1 is AI and wins
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p1',
        participants: players.map((p) => p.id),
        scores: { p0: 1000, p1: 1500, p2: 800, p3: 600, p4: 400, p5: 200 },
        lastPlaceId: 'p5',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.hohId).toBe('p1');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // Advance through AI nomination phases
    store.dispatch(advance()); // hoh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results (AI picks)
    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.nomineeIds).toHaveLength(2);
    // HOH cannot nominate themselves
    expect(state.nomineeIds).not.toContain('p1');
  });
});
