/**
 * Double Eviction twist — unit and integration tests.
 *
 * Validates:
 *  1. activateDoubleEviction sets the correct state and pushes a TV event.
 *  2. tryActivateDoubleEviction thunk respects eligibility rules and eviction-count pacing.
 *  3. advance() nominates 3 players during a Double Eviction week (AI LOH).
 *  4. commitNominees accepts 3 nominees during a Double Eviction week.
 *  5. advance() queues two evictions during a Double Eviction week.
 *  6. finalizePendingEviction promotes the second eviction after the first.
 *  7. finalizePendingEviction clears weekActive after both evictions resolve.
 *  8. Non-double-eviction weeks still behave exactly as before.
 * UI overlay behavior is covered separately in `src/components/ui/__tests__/TvZone.announcement.test.tsx`.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  activateDoubleEviction,
  queueForcedShock,
  tryActivateDoubleEviction,
  tryActivatePendingForcedDoubleEviction,
  commitNominees,
  finalizePendingEviction,
  submitTieBreak,
  submitDoubleEvictionTieBreak,
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

/**
 * Build a player list with `evictedCount` evicted players followed by
 * `aliveCount` active players. Used to test eviction-count pacing.
 */
function makePlayersWithEvictions(aliveCount: number, evictedCount: number): Player[] {
  const evicted: Player[] = Array.from({ length: evictedCount }, (_, i) => ({
    id: `evicted${i}`,
    name: `Evicted ${i}`,
    avatar: '🧑',
    status: 'evicted' as const,
    isUser: false,
  }));
  const alive: Player[] = Array.from({ length: aliveCount }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
  return [...evicted, ...alive];
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
    lohId: 'p0',
    prevHohId: null,
    nomineeIds: [],
    posWinnerId: null,
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
  it('sets weekActive=true and leaves announcement ownership to the nominations card', () => {
    const store = makeStore();
    store.dispatch(activateDoubleEviction());
    const { doubleEviction, tvFeed, twistActive, twistActivatedThisWeek } = store.getState().game;

    expect(doubleEviction?.weekActive).toBe(true);
    expect(doubleEviction?.usedCount).toBe(1);
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
    expect(twistActive).toBe(true);
    expect(twistActivatedThisWeek).toBe(true);

    expect(tvFeed.find((event) => event.major === 'double_eviction')).toBeUndefined();
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
      { phase: 'nominations', players: makePlayersWithEvictions(10, 5) },
      { sim: { enableTwists: false } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
    expect(store.getState().game.doubleEviction?.weekActive).toBe(false);
  });

  it('returns false when phase is not nominations', () => {
    const store = makeStore(
      { phase: 'week_start', players: makePlayersWithEvictions(10, 5) },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('returns false when weekActive is already true', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        players: makePlayersWithEvictions(10, 5),
        doubleEviction: { usedCount: 0, weekActive: true, pendingSecondEviction: null },
      },
      { sim: { enableTwists: true } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
    // usedCount unchanged
    expect(store.getState().game.doubleEviction?.usedCount).toBe(0);
  });

  it('returns false when fewer than 5 evictions have happened (early game)', () => {
    // Only 4 evictions so far — too early for DE
    const store = makeStore(
      { phase: 'nominations', players: makePlayersWithEvictions(12, 4), seed: 999 },
      { sim: { enableTwists: true, doubleEvictionChance: 100 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('returns false at final 5 or fewer alive players (endgame)', () => {
    // 5 evictions done, but only 5 alive — too close to the end
    const store = makeStore(
      { phase: 'nominations', players: makePlayersWithEvictions(5, 5), seed: 999 },
      { sim: { enableTwists: true, doubleEvictionChance: 100 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('activates when all conditions are met (chance=100)', () => {
    // 5 evictions, 10 alive — eligible mid-season window
    const store = makeStore(
      { phase: 'nominations', players: makePlayersWithEvictions(10, 5), seed: 999 },
      { sim: { enableTwists: true, doubleEvictionChance: 100 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(true);
    expect(store.getState().game.doubleEviction?.weekActive).toBe(true);
    expect(store.getState().game.twistActivatedThisWeek).toBe(true);
  });

  it('does NOT activate when chance roll fails (chance=0)', () => {
    const store = makeStore(
      { phase: 'nominations', players: makePlayersWithEvictions(10, 5), seed: 999 },
      { sim: { enableTwists: true, doubleEvictionChance: 0 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
    expect(store.getState().game.doubleEviction?.weekActive).toBe(false);
  });

  it('does NOT activate when usedCount >= 2 (season cap reached)', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        players: makePlayersWithEvictions(10, 5),
        doubleEviction: { usedCount: 2, weekActive: false, pendingSecondEviction: null },
      },
      { sim: { enableTwists: true, doubleEvictionChance: 100 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('does NOT activate when twistActivatedThisWeek is true (same-week guard)', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        players: makePlayersWithEvictions(10, 5),
        twistActivatedThisWeek: true,
      },
      { sim: { enableTwists: true, doubleEvictionChance: 100 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });

  it('activates a second time in the same season when usedCount === 1 and chance=100', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        players: makePlayersWithEvictions(10, 5),
        doubleEviction: { usedCount: 1, weekActive: false, pendingSecondEviction: null },
      },
      { sim: { enableTwists: true, doubleEvictionChance: 100 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(true);
    expect(store.getState().game.doubleEviction?.usedCount).toBe(2);
  });

  it('does NOT activate outside the eligible range (3 alive, 5 evictions)', () => {
    // 3 alive is final 3 — well below the final-5 cutoff
    const store = makeStore(
      { phase: 'nominations', players: makePlayersWithEvictions(3, 5) },
      { sim: { enableTwists: true, doubleEvictionChance: 100 } },
    );
    const result = store.dispatch(tryActivateDoubleEviction()) as unknown as boolean;
    expect(result).toBe(false);
  });
});

describe('forced double eviction queue', () => {
  it('queues for the current week when nominations have not happened yet', () => {
    const store = makeStore({ phase: 'social_1', week: 4 });
    store.dispatch(queueForcedShock('doubleEviction'));

    expect(store.getState().game.pendingForcedShock).toEqual({
      type: 'doubleEviction',
      requestedWeek: 4,
      earliestWeek: 4,
    });
  });

  it('queues for the next week when nominations already passed', () => {
    const store = makeStore({ phase: 'pos_results', week: 4 });
    store.dispatch(queueForcedShock('doubleEviction'));

    expect(store.getState().game.pendingForcedShock?.earliestWeek).toBe(5);
  });

  it('activates the queued shock at nominations even when normal twist settings would block it', () => {
    const store = makeStore(
      {
        phase: 'nominations',
        week: 4,
        players: makePlayers(8),
      },
      { sim: { enableTwists: false, doubleEvictionChance: 0 } },
    );

    store.dispatch(queueForcedShock('doubleEviction'));
    const result = store.dispatch(tryActivatePendingForcedDoubleEviction()) as unknown as boolean;

    expect(result).toBe(true);
    expect(store.getState().game.doubleEviction?.weekActive).toBe(true);
    expect(store.getState().game.pendingForcedShock).toBeNull();
  });
});

// ── nomination_results: AI LOH nominates 3 during Double Eviction ────────────

describe('advance() — nomination_results with Double Eviction', () => {
  // advance() from 'nominations' → 'nomination_results' runs the nomination logic
  it('AI LOH nominates 3 when weekActive is true', () => {
    // p0 is AI LOH (isUser: false)
    const players: Player[] = [
      { id: 'p0', name: 'AI LOH', avatar: '🧑', status: 'loh', isUser: false },
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
      lohId: 'p0',
      players,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });
    store.dispatch(advance());
    const { nomineeIds } = store.getState().game;
    expect(nomineeIds).toHaveLength(3);
  });

  it('AI LOH nominates 2 when weekActive is false', () => {
    const players: Player[] = [
      { id: 'p0', name: 'AI LOH', avatar: '🧑', status: 'loh', isUser: false },
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
      lohId: 'p0',
      players,
      doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    });
    store.dispatch(advance());
    const { nomineeIds } = store.getState().game;
    expect(nomineeIds).toHaveLength(2);
  });

  it('human LOH sets awaitingNominations with 3-nominee prompt when weekActive', () => {
    // p0 is human LOH
    const players: Player[] = [
      { id: 'p0', name: 'Human LOH', avatar: '🧑', status: 'loh', isUser: true },
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
      lohId: 'p0',
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

// ── commitNominees: human LOH submits 3 nominees ─────────────────────────────

describe('commitNominees with Double Eviction', () => {
  function makeNominationStore(weekActive: boolean) {
    return makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      players: makePlayers(14, 0), // p0 is human LOH
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
  function makeEvictionStore(
    votes: Record<string, string>,
    options: { humanLoh?: boolean; publicModeEnabled?: boolean } = {},
  ) {
    const { humanLoh = false, publicModeEnabled = false } = options;
    // 14 players, AI LOH, 3 nominees (p1/p2/p3)
    const players: Player[] = [
      { id: 'p0', name: humanLoh ? 'Human LOH' : 'AI LOH', avatar: '🧑', status: 'loh', isUser: humanLoh },
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
      lohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p3'],
      publicModeEnabled,
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
    expect(doubleEviction?.pendingSecondEviction?.evictionMessage).toContain('eliminated in tonight\'s Double Elimination');
  });

  it('treats 3-3-1 as two clear evictees with no tie-break', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p1', v2: 'p1',
      v3: 'p2', v4: 'p2', v5: 'p2',
      v6: 'p3',
    });
    store.dispatch(advance());
    const game = store.getState().game;
    expect(game.awaitingTieBreak).toBe(false);
    expect(new Set([
      game.pendingEviction?.evicteeId,
      game.doubleEviction?.pendingSecondEviction?.evicteeId,
    ])).toEqual(new Set(['p1', 'p2']));
  });

  it('treats 2-2-2 as a tie for both eviction slots', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p1', v2: 'p2', v3: 'p2', v4: 'p3', v5: 'p3',
    }, { humanLoh: true });
    store.dispatch(advance());
    const game = store.getState().game;
    expect(game.awaitingTieBreak).toBe(true);
    expect(game.pendingEviction).toBeNull();
    expect(new Set(game.tiedNomineeIds ?? [])).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('treats 2-1-1 as a tie only for the second eviction slot', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p1', v2: 'p2', v3: 'p3',
    }, { humanLoh: true });
    store.dispatch(advance());
    const game = store.getState().game;
    expect(game.pendingEviction?.evicteeId).toBe('p1');
    expect(game.awaitingTieBreak).toBe(true);
    expect(new Set(game.tiedNomineeIds ?? [])).toEqual(new Set(['p2', 'p3']));
  });

  it('stores vote results for popup reveal', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p2', v2: 'p3',
    });
    store.dispatch(advance());
    expect(store.getState().game.voteResults).not.toBeNull();
  });

  it('requires a public tie-break when the second eviction slot is tied in public mode', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p1', v2: 'p1', v3: 'p1', v4: 'p1',
      v5: 'p2',
      v6: 'p3',
    }, { publicModeEnabled: true });

    store.dispatch(advance());

    const { awaitingTieBreak, tiedNomineeIds, pendingEviction, doubleEviction } = store.getState().game;
    expect(pendingEviction?.evicteeId).toBe('p1');
    expect(awaitingTieBreak).toBe(true);
    expect(tiedNomineeIds).toEqual(['p2', 'p3']);
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
  });

  it('requires a human LOH tie-break when the second eviction slot is tied outside public mode', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p1', v2: 'p1', v3: 'p1', v4: 'p1',
      v5: 'p2',
      v6: 'p3',
    }, { humanLoh: true });

    store.dispatch(advance());

    const { awaitingTieBreak, tiedNomineeIds, pendingEviction, doubleEviction } = store.getState().game;
    expect(pendingEviction?.evicteeId).toBe('p1');
    expect(awaitingTieBreak).toBe(true);
    expect(tiedNomineeIds).toEqual(['p2', 'p3']);
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
  });

  it('requires a public tie-break when all three nominees are tied in public mode', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p2', v2: 'p3',
    }, { publicModeEnabled: true });

    store.dispatch(advance());

    const { pendingEviction, awaitingTieBreak, tiedNomineeIds, doubleEviction } = store.getState().game;
    expect(pendingEviction).toBeNull();
    expect(awaitingTieBreak).toBe(true);
    expect(tiedNomineeIds).toEqual(['p1', 'p2', 'p3']);
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
  });

  it('requires a human LOH tie-break when all three nominees are tied outside public mode', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p2', v2: 'p3',
    }, { humanLoh: true });

    store.dispatch(advance());

    const { pendingEviction, awaitingTieBreak, tiedNomineeIds, doubleEviction } = store.getState().game;
    expect(pendingEviction).toBeNull();
    expect(awaitingTieBreak).toBe(true);
    expect(tiedNomineeIds).toEqual(['p1', 'p2', 'p3']);
    expect(doubleEviction?.pendingSecondEviction).toBeNull();
  });

  it('submitTieBreak queues the second eviction instead of replacing the first during double eviction', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p1', v2: 'p1', v3: 'p1', v4: 'p1',
      v5: 'p2',
      v6: 'p3',
    }, { publicModeEnabled: true });

    store.dispatch(advance());
    store.dispatch(submitTieBreak('p2'));

    const { awaitingTieBreak, pendingEviction, doubleEviction } = store.getState().game;
    expect(awaitingTieBreak).toBe(false);
    expect(pendingEviction?.evicteeId).toBe('p1');
    expect(doubleEviction?.pendingSecondEviction?.evicteeId).toBe('p2');
    expect(doubleEviction?.pendingSecondEviction?.evictionMessage).toContain(
      'There was a tie between Nominee 2 and Nominee 3 for the second eviction.',
    );
    expect(doubleEviction?.pendingSecondEviction?.evictionMessage).toContain(
      'Public approval had to decide between Nominee 2 and Nominee 3 and chose to eliminate Nominee 2.',
    );
  });

  it('submitDoubleEvictionTieBreak queues both evictions when all three nominees are tied', () => {
    const store = makeEvictionStore({
      v0: 'p1', v1: 'p2', v2: 'p3',
    }, { publicModeEnabled: true });

    store.dispatch(advance());
    store.dispatch(submitDoubleEvictionTieBreak(['p3', 'p2']));

    const { awaitingTieBreak, pendingEviction, doubleEviction } = store.getState().game;
    expect(awaitingTieBreak).toBe(false);
    expect(pendingEviction?.evicteeId).toBe('p3');
    expect(doubleEviction?.pendingSecondEviction?.evicteeId).toBe('p2');
    expect(pendingEviction?.evictionMessage).toContain(
      'There was a tie between Nominee 1, Nominee 2, and Nominee 3.',
    );
    expect(pendingEviction?.evictionMessage).toContain(
      'Public approval had to decide between Nominee 1, Nominee 2, and Nominee 3 and chose to eliminate Nominee 3 and Nominee 2.',
    );
  });
});

// ── finalizePendingEviction: chains second eviction ──────────────────────────

describe('finalizePendingEviction with Double Eviction', () => {
  function makeFinalizationStore() {
    const players: Player[] = [
      { id: 'p0', name: 'LOH', avatar: '🧑', status: 'loh', isUser: false },
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
      lohId: 'p0',
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

  it('stamps evictedAtWeek on each evicted player at the eviction week', () => {
    // Regression: evictedAtWeek was never set — buildSummaries could not derive weeksAlive.
    const store = makeFinalizationStore();
    const gameWeek = store.getState().game.week;

    store.dispatch(finalizePendingEviction('p1'));
    store.dispatch(finalizePendingEviction('p2'));

    const p1 = store.getState().game.players.find((p) => p.id === 'p1');
    const p2 = store.getState().game.players.find((p) => p.id === 'p2');
    expect(p1?.evictedAtWeek).toBe(gameWeek);
    expect(p2?.evictedAtWeek).toBe(gameWeek);
  });

  it('marks survivedDoubleEviction on all surviving players after both evictions', () => {
    // Regression: survivedDoubleEviction was never set on Player.stats.
    const store = makeFinalizationStore();
    store.dispatch(finalizePendingEviction('p1'));
    store.dispatch(finalizePendingEviction('p2'));

    const { players } = store.getState().game;
    // Every player still in the house (not evicted/jury) should have the flag
    const survivors = players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
    expect(survivors.length).toBeGreaterThan(0);
    survivors.forEach((p) => {
      expect(p.stats?.survivedDoubleEviction).toBe(true);
    });

    // The evicted players should NOT have the flag
    const p1 = players.find((p) => p.id === 'p1');
    const p2 = players.find((p) => p.id === 'p2');
    expect(p1?.stats?.survivedDoubleEviction).toBeUndefined();
    expect(p2?.stats?.survivedDoubleEviction).toBeUndefined();
  });
});

// ── Non-double-eviction weeks behave normally ─────────────────────────────────

describe('regular eviction weeks are unaffected', () => {
  it('advance() from live_vote queues 1 eviction and no second eviction when weekActive is false', () => {
    // Votes that result in p1 getting more votes than p2
    const players: Player[] = [
      { id: 'p0', name: 'LOH', avatar: '🧑', status: 'loh', isUser: false },
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
      lohId: 'p0',
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
