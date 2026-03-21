/**
 * Double Eviction twist — unit and integration tests.
 *
 * Validates:
 *  1. activateDoubleEviction sets the correct state and pushes a TV event.
 *  2. tryActivateDoubleEviction thunk respects eligibility rules and probability bands.
 *  3. advance() nominates 3 players during a Double Eviction week (AI HOH).
 *  4. commitNominees accepts 3 nominees during a Double Eviction week.
 *  5. advance() queues two evictions during a Double Eviction week.
 *  6. finalizePendingEviction promotes the second eviction after the first.
 *  7. finalizePendingEviction clears weekActive after both evictions resolve.
 *  8. Non-double-eviction weeks still behave exactly as before.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  activateDoubleEviction,
  tryActivateDoubleEviction,
  commitNominees,
  finalizePendingEviction,
} from '../src/store/gameSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import type { GameState, Player, DoubleEvictionState } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

const DE_INITIAL: DoubleEvictionState = {
  usedCount: 0,
  weekActive: false,
  pendingSecondEviction: null,
};

function makeStore(
  gameOverrides: Partial<GameState> = {},
  settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  const base: GameState = {
    season: 1,
    week: 3,
    phase: 'nominations',
    seed: 42,
    hohId: 'p0',
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
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
    players: makePlayers(14),
    tvFeed: [],
    isLive: false,
    doubleEviction: { ...DE_INITIAL },
  };

  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...settingsOverrides,
    sim: { ...DEFAULT_SETTINGS.sim, ...(settingsOverrides.sim ?? {}) },
  };

  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: mergedSettings,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('activateDoubleEviction', () => {
  it('sets weekActive=true, increments usedCount, and pushes a TV event', () => {
    const store = makeStore();
    store.dispatch(activateDoubleEviction());
    const { doubleEviction, tvFeed, twistActive } = store.getState().game;

    expect(doubleEviction?.weekActive).toBe(true);
    expect(doubleEviction?.usedCount).toBe(1);
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
    expect(twistActive).toBe(true);

    const event = tvFeed.find((e) => e.major === 'double_eviction');
    expect(event).toBeDefined();
    expect(event!.type).toBe('twist');
    expect(event!.text).toMatch(/DOUBLE EVICTION/i);
  });

  it('initialises doubleEviction when the field is absent (legacy state)', () => {
    // Simulate a legacy game state without doubleEviction field
    const store = makeStore({ doubleEviction: undefined });
    store.dispatch(activateDoubleEviction());
    const { doubleEviction } = store.getState().game;

    expect(doubleEviction?.weekActive).toBe(true);
    expect(doubleEviction?.usedCount).toBe(1);
  });

  it('increments usedCount from an existing value', () => {
    const store = makeStore({
      doubleEviction: { usedCount: 1, weekActive: false, pendingSecondEviction: null },
    });
    store.dispatch(activateDoubleEviction());
    expect(store.getState().game.doubleEviction?.usedCount).toBe(2);
  });
});

// ── tryActivateDoubleEviction thunk ──────────────────────────────────────────

describe('tryActivateDoubleEviction', () => {
  it('returns false when enableTwists is false', () => {
    const store = makeStore(
      { phase: 'nominations', players: makePlayers(14) },
      { sim: { enableTwists: false } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
    expect(store.getState().game.doubleEviction?.weekActive).toBe(false);
  });

  it('returns false when phase is not nominations', () => {
    const store = makeStore(
      { phase: 'week_start', players: makePlayers(14) },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('returns false when weekActive is already true', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        players: makePlayers(14),
        doubleEviction: { usedCount: 0, weekActive: true, pendingSecondEviction: null },
      },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
    // usedCount unchanged
    expect(store.getState().game.doubleEviction?.usedCount).toBe(0);
  });

  it('always activates in the 13-16 band when usedCount < 2', () => {
    // 14 alive players, usedCount 0 → should always activate
    const store = makeStore(
      { phase: 'nominations', players: makePlayers(14), seed: 999 },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(true);
    expect(store.getState().game.doubleEviction?.weekActive).toBe(true);
  });

  it('does NOT activate in the 13-16 band when usedCount >= 2', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        players: makePlayers(14),
        doubleEviction: { usedCount: 2, weekActive: false, pendingSecondEviction: null },
      },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('always activates in the 10-12 band when usedCount === 0', () => {
    // 11 alive players
    const store = makeStore(
      { phase: 'nominations', players: makePlayers(11), seed: 999 },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(true);
  });

  it('does NOT activate in the 10-12 band when usedCount >= 2', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        players: makePlayers(11),
        doubleEviction: { usedCount: 2, weekActive: false, pendingSecondEviction: null },
      },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('does NOT activate outside the 5-16 range (3 alive)', () => {
    const store = makeStore(
      { phase: 'nominations', players: makePlayers(3) },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('does NOT activate outside the 5-16 range (17 alive)', () => {
    const store = makeStore(
      { phase: 'nominations', players: makePlayers(17) },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });
});

// ── nomination_results: AI HOH nominates 3 during Double Eviction ────────────

describe('advance() — nomination_results with Double Eviction', () => {
  // advance() from 'nominations' → 'nomination_results' runs the nomination logic
  it('AI HOH nominates 3 when weekActive is true', () => {
    // p0 is AI HOH (isUser: false)
    const players: Player[] = [
      { id: 'p0', name: 'AI HOH', avatar: '🧑', status: 'hoh', isUser: false },
      ...Array.from({ length: 13 }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Player ${i + 1}`,
        avatar: '🧑',
        status: 'active' as const,
        isUser: false,
      })),
    ];
    const store = makeStore({
      phase: 'nominations', // advance() from nominations → nomination_results runs nomination logic
      hohId: 'p0',
      players,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });
    store.dispatch(advance());
    const { nomineeIds } = store.getState().game;
    expect(nomineeIds).toHaveLength(3);
  });

  it('AI HOH nominates 2 when weekActive is false', () => {
    const players: Player[] = [
      { id: 'p0', name: 'AI HOH', avatar: '🧑', status: 'hoh', isUser: false },
      ...Array.from({ length: 13 }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Player ${i + 1}`,
        avatar: '🧑',
        status: 'active' as const,
        isUser: false,
      })),
    ];
    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
      players,
      doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    });
    store.dispatch(advance());
    const { nomineeIds } = store.getState().game;
    expect(nomineeIds).toHaveLength(2);
  });

  it('human HOH sets awaitingNominations with 3-nominee prompt when weekActive', () => {
    // p0 is human HOH
    const players: Player[] = [
      { id: 'p0', name: 'Human HOH', avatar: '🧑', status: 'hoh', isUser: true },
      ...Array.from({ length: 13 }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Player ${i + 1}`,
        avatar: '🧑',
        status: 'active' as const,
        isUser: false,
      })),
    ];
    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
      players,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });
    store.dispatch(advance());
    const { awaitingNominations, tvFeed } = store.getState().game;
    expect(awaitingNominations).toBe(true);
    // The prompt message should mention "three"
    const nominationEvent = tvFeed.find((e) => e.text.includes('three'));
    expect(nominationEvent).toBeDefined();
  });
});

// ── commitNominees: human HOH submits 3 nominees ─────────────────────────────

describe('commitNominees with Double Eviction', () => {
  function makeNominationStore(weekActive: boolean) {
    return makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
      players: makePlayers(14, 0), // p0 is human HOH
      awaitingNominations: true,
      pendingNominee1Id: null,
      doubleEviction: { usedCount: 1, weekActive, pendingSecondEviction: null },
    });
  }

  it('accepts 3 nominees when weekActive is true', () => {
    const store = makeNominationStore(true);
    store.dispatch(commitNominees(['p1', 'p2', 'p3']));
    const { nomineeIds, awaitingNominations } = store.getState().game;
    expect(nomineeIds).toEqual(['p1', 'p2', 'p3']);
    expect(awaitingNominations).toBe(false);
  });

  it('rejects 2 nominees when weekActive is true', () => {
    const store = makeNominationStore(true);
    store.dispatch(commitNominees(['p1', 'p2']));
    // Should be rejected — nomineeIds unchanged (empty)
    expect(store.getState().game.nomineeIds).toHaveLength(0);
    expect(store.getState().game.awaitingNominations).toBe(true);
  });

  it('accepts 2 nominees when weekActive is false', () => {
    const store = makeNominationStore(false);
    store.dispatch(commitNominees(['p1', 'p2']));
    const { nomineeIds, awaitingNominations } = store.getState().game;
    expect(nomineeIds).toEqual(['p1', 'p2']);
    expect(awaitingNominations).toBe(false);
  });

  it('rejects 3 nominees when weekActive is false', () => {
    const store = makeNominationStore(false);
    store.dispatch(commitNominees(['p1', 'p2', 'p3']));
    expect(store.getState().game.nomineeIds).toHaveLength(0);
    expect(store.getState().game.awaitingNominations).toBe(true);
  });

  it('rejects duplicate IDs', () => {
    const store = makeNominationStore(true);
    store.dispatch(commitNominees(['p1', 'p1', 'p2']));
    expect(store.getState().game.nomineeIds).toHaveLength(0);
  });
});

// ── eviction_results: 2 evictions queued during Double Eviction ──────────────

describe('advance() — eviction_results with Double Eviction', () => {
  // advance() from 'live_vote' → 'eviction_results' runs the eviction logic.
  // Votes are already set before advance() is called.
  function makeEvictionStore(votes: Record<string, string>) {
    // 14 players, AI HOH, 3 nominees (p1/p2/p3)
    const players: Player[] = [
      { id: 'p0', name: 'AI HOH', avatar: '🧑', status: 'hoh', isUser: false },
      { id: 'p1', name: 'Nominee 1', avatar: '🧑', status: 'nominated', isUser: false },
      { id: 'p2', name: 'Nominee 2', avatar: '🧑', status: 'nominated', isUser: false },
      { id: 'p3', name: 'Nominee 3', avatar: '🧑', status: 'nominated', isUser: false },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `v${i}`,
        name: `Voter ${i}`,
        avatar: '🧑',
        status: 'active' as const,
        isUser: false,
      })),
    ];
    return makeStore({
      phase: 'live_vote', // advance() from live_vote → eviction_results triggers eviction logic
      hohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p3'],
      players,
      votes,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });
  }

  it('sets pendingEviction for the top vote-getter and pendingSecondEviction for the second', () => {
    // p1 has most votes (3), p2 is second (2), p3 last (1)
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p1', v2: 'p1',
      v3: 'p2', v4: 'p2',
      v5: 'p3',
    });
    store.dispatch(advance());
    const { pendingEviction, doubleEviction } = store.getState().game;

    expect(pendingEviction).not.toBeNull();
    expect(pendingEviction?.evicteeId).toBe('p1');
    expect(doubleEviction?.pendingSecondEviction).not.toBeNull();
    expect(doubleEviction?.pendingSecondEviction?.evicteeId).toBe('p2');
  });

  it('stores vote results for popup reveal', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p2', v2: 'p3',
    });
    store.dispatch(advance());
    expect(store.getState().game.voteResults).not.toBeNull();
  });

  it('uses a deterministic precomputed tie-break when all three nominees are tied', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p2', v2: 'p3',
    });
    store.dispatch(advance());
    const { pendingEviction, doubleEviction } = store.getState().game;
    expect(pendingEviction).not.toBeNull();
    expect(doubleEviction?.pendingSecondEviction).not.toBeNull();
    expect(pendingEviction?.evicteeId).not.toBe(doubleEviction?.pendingSecondEviction?.evicteeId);
  });
});

// ── finalizePendingEviction: chains second eviction ──────────────────────────

describe('finalizePendingEviction with Double Eviction', () => {
  function makeFinalizationStore() {
    const players: Player[] = [
      { id: 'p0', name: 'HOH', avatar: '🧑', status: 'hoh', isUser: false },
      { id: 'p1', name: 'First Evictee', avatar: '🧑', status: 'nominated', isUser: false },
      { id: 'p2', name: 'Second Evictee', avatar: '🧑', status: 'nominated', isUser: false },
      { id: 'p3', name: 'Nominee 3', avatar: '🧑', status: 'nominated', isUser: false },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`,
        name: `Active ${i}`,
        avatar: '🧑',
        status: 'active' as const,
        isUser: false,
      })),
    ];
    return makeStore({
      phase: 'eviction_results',
      hohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p3'],
      players,
      pendingEviction: {
        evicteeId: 'p1',
        evictionMessage: 'p1 has been evicted.',
      },
      doubleEviction: {
        usedCount: 1,
        weekActive: true,
        pendingSecondEviction: {
          evicteeId: 'p2',
          evictionMessage: 'p2 has also been evicted.',
        },
      },
    });
  }

  it('promotes pendingSecondEviction to pendingEviction after the first eviction', () => {
    const store = makeFinalizationStore();
    store.dispatch(finalizePendingEviction('p1'));

    const { pendingEviction, doubleEviction } = store.getState().game;
    expect(pendingEviction?.evicteeId).toBe('p2');
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
    // weekActive still true — second eviction not yet done
    expect(doubleEviction?.weekActive).toBe(true);
  });

  it('evicts the first player after finalizePendingEviction', () => {
    const store = makeFinalizationStore();
    store.dispatch(finalizePendingEviction('p1'));

    const p1 = store.getState().game.players.find((p) => p.id === 'p1');
    expect(p1?.status).toMatch(/evicted|jury/);
  });

  it('clears weekActive and twistActive after both evictions resolve', () => {
    const store = makeFinalizationStore();
    // First eviction
    store.dispatch(finalizePendingEviction('p1'));
    // Second eviction
    store.dispatch(finalizePendingEviction('p2'));

    const { doubleEviction, twistActive } = store.getState().game;
    expect(doubleEviction?.weekActive).toBe(false);
    expect(twistActive).toBe(false);
  });

  it('evicts both players after both finalizations', () => {
    const store = makeFinalizationStore();
    store.dispatch(finalizePendingEviction('p1'));
    store.dispatch(finalizePendingEviction('p2'));

    const p1 = store.getState().game.players.find((p) => p.id === 'p1');
    const p2 = store.getState().game.players.find((p) => p.id === 'p2');
    expect(p1?.status).toMatch(/evicted|jury/);
    expect(p2?.status).toMatch(/evicted|jury/);
  });
});

// ── Non-double-eviction weeks behave normally ─────────────────────────────────

describe('regular eviction weeks are unaffected', () => {
  it('advance() from live_vote queues 1 eviction and no second eviction when weekActive is false', () => {
    // Votes that result in p1 getting more votes than p2
    const players: Player[] = [
      { id: 'p0', name: 'HOH', avatar: '🧑', status: 'hoh', isUser: false },
      { id: 'p1', name: 'Nominee 1', avatar: '🧑', status: 'nominated', isUser: false },
      { id: 'p2', name: 'Nominee 2', avatar: '🧑', status: 'nominated', isUser: false },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `v${i}`,
        name: `Voter ${i}`,
        avatar: '🧑',
        status: 'active' as const,
        isUser: false,
      })),
    ];
    const store = makeStore({
      phase: 'live_vote', // advance from live_vote → eviction_results
      hohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      players,
      votes: { v0: 'p1', v1: 'p1', v2: 'p1', v3: 'p2', v4: 'p2', v5: 'p2' },
      doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    });

    store.dispatch(advance());

    const { pendingEviction, doubleEviction } = store.getState().game;
    // One eviction queued via tie-break RNG (or one clear winner)
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
    // pendingEviction is set (one of p1 or p2)
    expect(pendingEviction).not.toBeNull();
  });
});
