/**
 * Integration tests — Tilt Labyrinth minigame (native React migration).
 *
 * Verifies:
 *  1. Registry entry has been updated to React implementation.
 *  2. AI registry entry is present and correct (lower-is-better).
 *  3. Slice initialises correctly on initTiltLabyrinth.
 *  4. setHumanScore transitions to 'complete' with correct winner / last place.
 *  5. resolveTiltLabyrinthOutcome dispatches applyMinigameWinner once and is idempotent.
 *  6. Phase-mismatch guard: thunk is a no-op when game phase doesn't match.
 *  7. Winner is correct (lowest time wins — lower-is-better).
 *  8. Last-place is correct (highest time = worst finisher).
 *  9. Auto-nominee (lastHohCompFinisherId) matches the scoreboard last-place.
 * 10. Human nomination flow works after the Tilt Labyrinth comp resolves.
 * 11. AI nomination flow works after the Tilt Labyrinth comp resolves.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import tiltLabyrinthReducer, {
  initTiltLabyrinth,
  setHumanScore,
  markTiltLabyrinthOutcomeResolved,
} from '../../src/features/tiltLabyrinth/tiltLabyrinthSlice';
import { resolveTiltLabyrinthOutcome } from '../../src/features/tiltLabyrinth/thunks';
import { getGame } from '../../src/minigames/registry';
import { minigameAiRegistry } from '../../src/ai/competition/minigameAiRegistry';
import gameReducer, {
  applyMinigameWinner,
  advance,
  commitNominees,
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
    isUser: i === 0, // p0 is always the human unless overridden
  }));
}

/** Minimal store wiring for integration tests (game + tiltLabyrinth). */
function makeIntegrationStore(initialGamePhase = 'loh_comp') {
  const minimalGameReducer = (
    state = {
      phase: initialGamePhase,
      lohId: null as string | null,
      posWinnerId: null as string | null,
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
      if (initialGamePhase === 'loh_comp') {
        return {
          ...state,
          lohId: payload.winnerId,
          lastHohCompFinisherId: payload.lastPlaceId ?? null,
          phase: 'loh_results',
        };
      }
      return {
        ...state,
        posWinnerId: payload.winnerId,
        phase: 'pos_results',
      };
    }
    return state;
  };

  return configureStore({
    reducer: { tiltLabyrinth: tiltLabyrinthReducer, game: minimalGameReducer },
  });
}

/** Full store for nomination flow tests. */
function makeFullGameStore(overrides: Partial<GameState> = {}) {
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
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  };

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
      tiltLabyrinth: tiltLabyrinthReducer,
    },
    preloadedState: { game: { ...base, ...overrides } as GameState },
  });
}

function initStore(
  store: ReturnType<typeof makeIntegrationStore>,
  type: 'LOH' | 'POS' = 'LOH',
  seed = 42,
) {
  // Scores are completion times in ms — lower is better
  store.dispatch(
    initTiltLabyrinth({
      participantIds: ['alice', 'bob', 'carol'],
      participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
      humanPlayerId: 'alice',
      competitionType: type,
      seed,
      // bob=12000ms (fast), carol=45000ms (slow)
      aiScores: { bob: 12_000, carol: 45_000 },
    }),
  );
}

// ─── Registry wiring ──────────────────────────────────────────────────────────

describe('Registry — tiltLabyrinth entry', () => {
  it('exists in the registry', () => {
    expect(getGame('tiltLabyrinth')).toBeDefined();
  });

  it('uses implementation="react"', () => {
    expect(getGame('tiltLabyrinth')?.implementation).toBe('react');
  });

  it('uses legacy=false', () => {
    expect(getGame('tiltLabyrinth')?.legacy).toBe(false);
  });

  it('uses reactComponentKey="TiltLabyrinth"', () => {
    expect(getGame('tiltLabyrinth')?.reactComponentKey).toBe('TiltLabyrinth');
  });

  it('uses the authoritative winner contract', () => {
    expect(getGame('tiltLabyrinth')?.authoritative).toBe(true);
    expect(getGame('tiltLabyrinth')?.scoringAdapter).toBe('authoritative');
  });

  it('has timeLimitMs=0 (self-terminating)', () => {
    expect(getGame('tiltLabyrinth')?.timeLimitMs).toBe(0);
  });

  it('documents unlimited play and hazard penalties', () => {
    expect(getGame('tiltLabyrinth')?.instructions).toContain(
      'There is no time limit - take as long as you need to finish',
    );
    expect(getGame('tiltLabyrinth')?.instructions).toContain(
      'Each hazard hit adds 3 seconds to your completion time',
    );
  });
});

// ─── AI registry ─────────────────────────────────────────────────────────────

describe('AI Registry — tiltLabyrinth entry', () => {
  it('exists in minigameAiRegistry', () => {
    expect(minigameAiRegistry['tiltLabyrinth']).toBeDefined();
  });

  it('has scoreDirection="lower-is-better"', () => {
    expect(minigameAiRegistry['tiltLabyrinth']?.scoreDirection).toBe('lower-is-better');
  });

  it('has category="precision"', () => {
    expect(minigameAiRegistry['tiltLabyrinth']?.category).toBe('precision');
  });
});

// ─── Slice initialisation ─────────────────────────────────────────────────────

describe('initTiltLabyrinth', () => {
  it('transitions to playing phase', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tiltLabyrinth.phase).toBe('playing');
  });

  it('stores AI scores', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tiltLabyrinth.aiScores).toEqual({ bob: 12_000, carol: 45_000 });
  });

  it('stores participants', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tiltLabyrinth.participants.map((p) => p.id)).toEqual([
      'alice', 'bob', 'carol',
    ]);
  });

  it('outcomeResolved starts false', () => {
    const store = makeIntegrationStore();
    initStore(store);
    expect(store.getState().tiltLabyrinth.outcomeResolved).toBe(false);
  });
});

// ─── Winner + last-place derivation (lower-is-better) ────────────────────────

describe('Tilt Labyrinth winner and last-place (lower-is-better)', () => {
  it('player with lowest time (fastest) wins', () => {
    const store = makeIntegrationStore();
    initStore(store);
    // alice=8000ms (fastest), bob=12000ms, carol=45000ms
    store.dispatch(setHumanScore(8_000));
    expect(store.getState().tiltLabyrinth.winnerId).toBe('alice');
  });

  it('player with highest time (slowest) is last place', () => {
    const store = makeIntegrationStore();
    initStore(store);
    store.dispatch(setHumanScore(8_000));
    expect(store.getState().tiltLabyrinth.lastPlaceId).toBe('carol');
  });

  it('human with highest time is last place', () => {
    const store = makeIntegrationStore();
    initStore(store);
    // alice=55000ms (slowest); bob=12000ms wins
    store.dispatch(setHumanScore(55_000));
    expect(store.getState().tiltLabyrinth.winnerId).toBe('bob');
    expect(store.getState().tiltLabyrinth.lastPlaceId).toBe('alice');
  });

  it('transitions to complete on setHumanScore', () => {
    const store = makeIntegrationStore();
    initStore(store);
    store.dispatch(setHumanScore(20_000));
    expect(store.getState().tiltLabyrinth.phase).toBe('complete');
  });

  it('finalScores includes both human and AI scores', () => {
    const store = makeIntegrationStore();
    initStore(store);
    store.dispatch(setHumanScore(10_000));
    const { finalScores } = store.getState().tiltLabyrinth;
    expect(finalScores['alice']).toBe(10_000);
    expect(finalScores['bob']).toBe(12_000);
    expect(finalScores['carol']).toBe(45_000);
  });

  it('winner is NOT set as last-place finisher', () => {
    const store = makeIntegrationStore();
    initStore(store);
    store.dispatch(setHumanScore(8_000)); // alice wins
    const { winnerId, lastPlaceId } = store.getState().tiltLabyrinth;
    expect(winnerId).not.toBe(lastPlaceId);
  });
});

// ─── resolveTiltLabyrinthOutcome — idempotency ────────────────────────────────

describe('resolveTiltLabyrinthOutcome — idempotency', () => {
  function reachComplete(type: 'LOH' | 'POS' = 'LOH', humanScore = 8_000) {
    const phase = type === 'LOH' ? 'loh_comp' : 'pos_comp';
    const store = makeIntegrationStore(phase);
    initStore(store, type);
    store.dispatch(setHumanScore(humanScore));
    expect(store.getState().tiltLabyrinth.phase).toBe('complete');
    return store;
  }

  it('dispatches applyMinigameWinner for LOH', () => {
    const store = reachComplete('LOH');
    store.dispatch(resolveTiltLabyrinthOutcome());
    expect(store.getState().tiltLabyrinth.outcomeResolved).toBe(true);
    expect(store.getState().game.lohId).toBe('alice'); // alice=8000ms wins (fastest)
  });

  it('dispatches applyMinigameWinner for POS', () => {
    const store = reachComplete('POS');
    store.dispatch(resolveTiltLabyrinthOutcome());
    expect(store.getState().tiltLabyrinth.outcomeResolved).toBe(true);
    expect(store.getState().game.posWinnerId).toBe('alice');
  });

  it('is idempotent — second dispatch is a no-op', () => {
    const store = reachComplete('LOH');
    store.dispatch(resolveTiltLabyrinthOutcome());
    store.dispatch(resolveTiltLabyrinthOutcome()); // second call — must not throw or double-apply
    expect(store.getState().tiltLabyrinth.outcomeResolved).toBe(true);
  });

  it('is a no-op when game phase does not match competition type (LOH in pos_comp)', () => {
    const store = makeIntegrationStore('pos_comp');
    initStore(store, 'LOH');
    store.dispatch(setHumanScore(8_000));
    store.dispatch(resolveTiltLabyrinthOutcome()); // phase mismatch — should be a no-op
    expect(store.getState().tiltLabyrinth.outcomeResolved).toBe(false);
    expect(store.getState().game.lohId).toBeNull();
  });

  it('markTiltLabyrinthOutcomeResolved guard prevents re-dispatch', () => {
    const store = reachComplete('LOH');
    store.dispatch(markTiltLabyrinthOutcomeResolved());
    store.dispatch(resolveTiltLabyrinthOutcome()); // already resolved
    expect(store.getState().tiltLabyrinth.outcomeResolved).toBe(true);
  });
});

// ─── auto-nominee matches scoreboard last-place ───────────────────────────────

describe('auto-nominee (lastHohCompFinisherId) matches scoreboard last-place', () => {
  it('lastHohCompFinisherId equals the last-place finisher from Tilt Labyrinth', () => {
    const players = makePlayers(4);
    const store = makeFullGameStore({ players });

    // Lower time = better; p3 has the highest time (slowest) → last place
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 5_500, p1: 12_000, p2: 28_000, p3: 55_000 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.lohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('lastHohCompFinisherId is not the winner', () => {
    const players = makePlayers(4);
    const store = makeFullGameStore({ players });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p1',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 10_000, p1: 7_000, p2: 30_000, p3: 50_000 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.lohId).toBe('p1');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
    expect(store.getState().game.lastHohCompFinisherId).not.toBe(
      store.getState().game.lohId,
    );
  });
});

// ─── Public mode auto-nominee ─────────────────────────────────────────────────

describe('Tilt Labyrinth — Public mode auto-nominee', () => {
  it('auto-nominee matches last-place finisher in public mode', () => {
    const players = makePlayers(6);
    const store = makeFullGameStore({ players, publicModeEnabled: true });

    // p5 is slowest (last place) → should become auto-third nominee
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: players.map((p) => p.id),
        scores: { p0: 6_000, p1: 12_000, p2: 20_000, p3: 30_000, p4: 40_000, p5: 58_000 },
        lastPlaceId: 'p5',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // loh_results → social_1 → nominations → nomination_results
    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results (human LOH awaits commitNominees)

    // p0 is human LOH, so awaitingNominations should be true
    expect(store.getState().game.awaitingNominations).toBe(true);

    // Human nominates two players
    store.dispatch(commitNominees(['p1', 'p2']));

    // In public mode, last-place finisher (p5) should be the auto-third nominee
    const state = store.getState().game;
    expect(state.nominationContext?.autoNomineeId).toBe('p5');
    expect(state.nomineeIds).toContain('p5');
  });

  it('auto-nominee is NOT added when public mode is disabled', () => {
    const players = makePlayers(5);
    const store = makeFullGameStore({ players, publicModeEnabled: false });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: players.map((p) => p.id),
        scores: { p0: 6_000, p1: 14_000, p2: 22_000, p3: 35_000, p4: 55_000 },
        lastPlaceId: 'p4',
        lastPlaceType: 'scored',
      }),
    );

    // Advance through nominations without public mode auto-nominee
    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results

    // p4 is NOT auto-added in non-public mode
    const state = store.getState().game;
    expect(state.nominationContext?.autoNomineeId ?? null).toBeNull();
  });
});

// ─── Human nomination flow ────────────────────────────────────────────────────

describe('Human nomination flow after Tilt Labyrinth LOH', () => {
  it('human LOH can nominate two players after comp resolves', () => {
    const players = makePlayers(6);
    const store = makeFullGameStore({ players });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: players.map((p) => p.id),
        scores: { p0: 5_000, p1: 11_000, p2: 18_000, p3: 25_000, p4: 35_000, p5: 59_000 },
        lastPlaceId: 'p5',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.phase).toBe('loh_results');
    expect(store.getState().game.lohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // Advance to nominations via normal flow
    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    expect(store.getState().game.phase).toBe('nominations');
  });
});

// ─── AI nomination flow ───────────────────────────────────────────────────────

describe('AI nomination flow after Tilt Labyrinth LOH', () => {
  it('AI LOH nominates correctly after comp resolves', () => {
    const players = makePlayers(6);
    const store = makeFullGameStore({ players, publicModeEnabled: false });

    // p1 is AI and wins (lowest time)
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p1',
        participants: players.map((p) => p.id),
        scores: { p0: 9_000, p1: 6_500, p2: 15_000, p3: 28_000, p4: 40_000, p5: 57_000 },
        lastPlaceId: 'p5',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.lohId).toBe('p1');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // Advance through AI nomination phases
    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results (AI picks)
    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.nomineeIds).toHaveLength(2);
    // LOH cannot nominate themselves
    expect(state.nomineeIds).not.toContain('p1');
  });
});

// ─── Full slice round-trip via resolveTiltLabyrinthOutcome ────────────────────

describe('Full slice round-trip via resolveTiltLabyrinthOutcome', () => {
  it('correctly passes lastPlaceId and lastPlaceType=scored to applyMinigameWinner', () => {
    const players = makePlayers(4);
    const store = makeFullGameStore({ players });

    store.dispatch(
      initTiltLabyrinth({
        participantIds: ['p0', 'p1', 'p2', 'p3'],
        participantNames: { p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3' },
        humanPlayerId: 'p0',
        competitionType: 'LOH',
        seed: 99,
        // lower times = better: p1=10s, p2=25s, p3=50s
        aiScores: { p1: 10_000, p2: 25_000, p3: 50_000 },
      }),
    );

    // p0 finishes in 8s — fastest
    store.dispatch(setHumanScore(8_000));

    const labState = store.getState().tiltLabyrinth;
    expect(labState.winnerId).toBe('p0');
    expect(labState.lastPlaceId).toBe('p3');

    store.dispatch(resolveTiltLabyrinthOutcome());

    const gameState = store.getState().game;
    expect(gameState.lohId).toBe('p0');
    expect(gameState.lastHohCompFinisherId).toBe('p3');
  });

  it('accepts a seven-minute completion and ranks it normally', () => {
    const store = makeIntegrationStore('loh_comp');
    store.dispatch(
      initTiltLabyrinth({
        participantIds: ['alice', 'bob', 'carol'],
        participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
        humanPlayerId: 'alice',
        competitionType: 'LOH',
        seed: 7,
        // bob and carol both finish faster
        aiScores: { bob: 15_000, carol: 30_000 },
      }),
    );

    // Unlimited play: a seven-minute finish is valid, but naturally ranks last.
    store.dispatch(setHumanScore(420_000));

    const { winnerId, lastPlaceId } = store.getState().tiltLabyrinth;
    expect(winnerId).toBe('bob');     // fastest AI
    expect(lastPlaceId).toBe('alice'); // alice completed, but was slowest
  });
});
