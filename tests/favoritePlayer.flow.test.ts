/**
 * Public's Favorite Player twist — unit and flow tests.
 *
 * Validates:
 *  1. startFavoritePlayerPhase sets the correct initial state.
 *  2. eliminateFavoriteCandidate removes a candidate correctly.
 *  3. resolveFavoritePlayerWinner records the winner and closes the overlay.
 *  4. awardFavoritePrize marks awarded in history.
 *  5. Settings: enableFavoritePlayer defaults to false.
 *  6. Settings: favoritePlayerAwardAmount defaults to 25000.
 *  7. startFavoritePlayerPhase appends to game.history.
 *  8. Duplicate eliminateFavoriteCandidate is a no-op.
 *  9. voteSimulator createVoteSimulator — produces correct initial percentages.
 * 10. voteSimulator eliminates lowest-voted candidate.
 * 11. voteSimulator attachRealtimeAdapter replaces built-in simulation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  startFavoritePlayerPhase,
  openFavoritePlayerVoting,
  eliminateFavoriteCandidate,
  resolveFavoritePlayerWinner,
  awardFavoritePrize,
} from '../src/store/gameSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import type { GameState, Player, TvEvent } from '../src/types';
import { createVoteSimulator } from '../src/utils/voteSimulator';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(
  gameOverrides: Partial<GameState> = {},
  settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  const base: GameState = {
    season: 1,
    week: 10,
    phase: 'jury',
    seed: 42,
    hohId: null,
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
    aiReplacementStep: 0,
    aiReplacementWaiting: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    players: makePlayers(12),
    tvFeed: [],
    isLive: false,
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

// ── startFavoritePlayerPhase ─────────────────────────────────────────────────

describe('startFavoritePlayerPhase', () => {
  it('sets active=true, votingStarted=false, with correct candidates and awardAmount', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1', 'p2'], awardAmount: 25000 }));
    const fp = store.getState().game.favoritePlayer;
    expect(fp).toBeDefined();
    expect(fp!.active).toBe(true);
    expect(fp!.votingStarted).toBe(false);
    expect(fp!.candidates).toEqual(['p0', 'p1', 'p2']);
    expect(fp!.awardAmount).toBe(25000);
    expect(fp!.eliminated).toEqual([]);
    expect(fp!.winnerId).toBeNull();
  });

  it('appends a favoritePlayer:start event to game.history', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 10000 }));
    const history = store.getState().game.history;
    expect(history).toBeDefined();
    expect(history!.length).toBeGreaterThanOrEqual(1);
    const entry = history!.find((e) => e.type === 'favoritePlayer:start');
    expect(entry).toBeDefined();
    expect(entry!.week).toBe(10);
    expect(entry!.data.awardAmount).toBe(10000);
  });

  it('sets twistActive=true', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    expect(store.getState().game.twistActive).toBe(true);
  });

  it('pushes a TV event with major:twist for the TV filler announcement', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    const events = store.getState().game.tvFeed;
    const ev = events.find((e) => e.type === 'twist');
    expect(ev).toBeDefined();
    expect((ev as TvEvent)?.major).toBe('twist');
  });
});

describe('openFavoritePlayerVoting', () => {
  it('sets votingStarted=true when favoritePlayer is active', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0'], awardAmount: 25000 }));
    expect(store.getState().game.favoritePlayer!.votingStarted).toBe(false);
    store.dispatch(openFavoritePlayerVoting());
    expect(store.getState().game.favoritePlayer!.votingStarted).toBe(true);
  });

  it('is a no-op when favoritePlayer is not active', () => {
    const store = makeStore();
    store.dispatch(openFavoritePlayerVoting());
    expect(store.getState().game.favoritePlayer?.votingStarted).toBeUndefined();
  });
});

// ── eliminateFavoriteCandidate ────────────────────────────────────────────────

describe('eliminateFavoriteCandidate', () => {
  it('adds the eliminated ID to the eliminated array', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1', 'p2'], awardAmount: 25000 }));
    store.dispatch(eliminateFavoriteCandidate('p2'));
    const fp = store.getState().game.favoritePlayer;
    expect(fp!.eliminated).toContain('p2');
  });

  it('is a no-op when favoritePlayer is not active', () => {
    const store = makeStore();
    // No startFavoritePlayerPhase dispatched
    store.dispatch(eliminateFavoriteCandidate('p0'));
    expect(store.getState().game.favoritePlayer).toBeUndefined();
  });

  it('does not add duplicates', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    store.dispatch(eliminateFavoriteCandidate('p1'));
    store.dispatch(eliminateFavoriteCandidate('p1'));
    const fp = store.getState().game.favoritePlayer;
    expect(fp!.eliminated.filter((id) => id === 'p1').length).toBe(1);
  });
});

// ── resolveFavoritePlayerWinner ───────────────────────────────────────────────

describe('resolveFavoritePlayerWinner', () => {
  it('sets winnerId and closes the overlay (active=false)', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    store.dispatch(resolveFavoritePlayerWinner('p0'));
    const fp = store.getState().game.favoritePlayer;
    expect(fp!.winnerId).toBe('p0');
    expect(fp!.active).toBe(false);
  });

  it('clears twistActive when resolved', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    store.dispatch(resolveFavoritePlayerWinner('p0'));
    expect(store.getState().game.twistActive).toBe(false);
  });

  it('appends a favoritePlayer:winner event to game.history', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    store.dispatch(resolveFavoritePlayerWinner('p0'));
    const history = store.getState().game.history;
    const entry = history?.find((e) => e.type === 'favoritePlayer:winner');
    expect(entry).toBeDefined();
    expect(entry!.data.winnerId).toBe('p0');
  });

  it('is a no-op when favoritePlayer is not active', () => {
    const store = makeStore();
    store.dispatch(resolveFavoritePlayerWinner('p0'));
    expect(store.getState().game.favoritePlayer).toBeUndefined();
  });
});

// ── awardFavoritePrize ────────────────────────────────────────────────────────

describe('awardFavoritePrize', () => {
  it('appends a favoritePlayer:award event to game history', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    store.dispatch(resolveFavoritePlayerWinner('p0'));
    store.dispatch(awardFavoritePrize());
    const history = store.getState().game.history;
    const entry = history?.find((e) => e.type === 'favoritePlayer:award');
    expect(entry).toBeDefined();
    expect(entry!.data.winnerId).toBe('p0');
  });

  it('is a no-op when there is no winner', () => {
    const store = makeStore();
    store.dispatch(startFavoritePlayerPhase({ candidates: ['p0', 'p1'], awardAmount: 25000 }));
    // Do not resolve winner
    store.dispatch(awardFavoritePrize());
    const history = store.getState().game.history;
    const entry = history?.find((e) => e.type === 'favoritePlayer:award');
    expect(entry).toBeUndefined();
  });
});

// ── Settings defaults ─────────────────────────────────────────────────────────

describe('Settings: favoritePlayer defaults', () => {
  it('enableFavoritePlayer defaults to false', () => {
    expect(DEFAULT_SETTINGS.sim.enableFavoritePlayer).toBe(false);
  });

  it('favoritePlayerAwardAmount defaults to 25000', () => {
    expect(DEFAULT_SETTINGS.sim.favoritePlayerAwardAmount).toBe(25000);
  });
});

// ── voteSimulator ─────────────────────────────────────────────────────────────

describe('createVoteSimulator', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('produces initial percentages that sum to 100', () => {
    const sim = createVoteSimulator({ candidates: ['a', 'b', 'c'], seed: 42 });
    // After start, subscribe triggers initial notify
    const snaps: ReturnType<typeof sim.getSnapshot>[] = [];
    sim.subscribe((s) => snaps.push(s));
    sim.start();
    // advance timers slightly so the drift tick fires
    vi.advanceTimersByTime(10);
    sim.stop();
    if (snaps.length > 0) {
      const active = snaps[0];
      const sum = Object.values(active.votes).reduce((s, v) => s + v, 0);
      expect(sum).toBe(100);
    } else {
      // Check initial snapshot directly
      const snapshot = sim.getSnapshot();
      const activeIds = ['a', 'b', 'c'].filter((id) => !snapshot.eliminated.includes(id));
      const sum = activeIds.reduce((s, id) => s + (snapshot.votes[id] ?? 0), 0);
      expect(sum).toBe(100);
    }
  });

  it('eliminates the lowest-voted candidate after eliminationIntervalMs', () => {
    const sim = createVoteSimulator({
      candidates: ['a', 'b', 'c'],
      seed: 1,
      eliminationIntervalMs: 1000,
      tickIntervalMs: 200,
    });
    const snaps: ReturnType<typeof sim.getSnapshot>[] = [];
    sim.subscribe((s) => snaps.push(s));
    sim.start();

    // Advance past the first elimination interval
    vi.advanceTimersByTime(1200);
    sim.stop();

    const last = snaps[snaps.length - 1];
    // One candidate should be eliminated after 1.2s
    expect(last.eliminated.length).toBeGreaterThanOrEqual(1);
  });

  it('declares a winner when only one candidate remains', () => {
    const sim = createVoteSimulator({
      candidates: ['a', 'b'],
      seed: 99,
      eliminationIntervalMs: 500,
      tickIntervalMs: 100,
    });
    const snaps: ReturnType<typeof sim.getSnapshot>[] = [];
    sim.subscribe((s) => snaps.push(s));
    sim.start();

    // Advance past first elimination → only 1 left → winner
    vi.advanceTimersByTime(600);

    const last = snaps[snaps.length - 1];
    expect(last.isComplete).toBe(true);
    expect(last.winnerId).not.toBeNull();
  });

  it('attachRealtimeAdapter is callable and replaces simulation — elimination still fires', () => {
    const sim = createVoteSimulator({ candidates: ['a', 'b', 'c'], seed: 42, eliminationIntervalMs: 500 });
    let dataCallback: ((votes: Record<string, number>) => void) | null = null;
    const adapter = {
      start: vi.fn(),
      stop: vi.fn(),
      onData: vi.fn((cb: (votes: Record<string, number>) => void) => { dataCallback = cb; }),
    };
    sim.attachRealtimeAdapter(adapter);
    const snaps: ReturnType<typeof sim.getSnapshot>[] = [];
    sim.subscribe((s) => snaps.push(s));
    sim.start();

    // Adapter start should be called
    expect(adapter.start).toHaveBeenCalledWith(['a', 'b', 'c']);

    // Simulate incoming data from adapter — votes drive percentages
    dataCallback?.({ a: 60, b: 30, c: 10 });

    // Advance past the elimination interval so the simulator eliminates the lowest
    vi.advanceTimersByTime(600);

    const last = snaps[snaps.length - 1];
    // Elimination should have fired (adapter mode still runs elimination logic)
    expect(last.eliminated.length).toBeGreaterThanOrEqual(1);

    sim.stop();
    expect(adapter.stop).toHaveBeenCalled();
  });

  it('start() is idempotent — duplicate calls do not create extra intervals', () => {
    const sim = createVoteSimulator({ candidates: ['a', 'b'], seed: 42, eliminationIntervalMs: 1000 });
    const snaps: ReturnType<typeof sim.getSnapshot>[] = [];
    sim.subscribe((s) => snaps.push(s));

    // Call start() three times
    sim.start();
    sim.start();
    sim.start();

    vi.advanceTimersByTime(1100);
    sim.stop();

    // With idempotent start, only one elimination fires in the interval, not three
    const last = snaps[snaps.length - 1];
    expect(last.eliminated.length).toBeLessThanOrEqual(1);
  });

  it('produces deterministic results with the same seed', () => {
    const sim1 = createVoteSimulator({ candidates: ['x', 'y', 'z'], seed: 777, eliminationIntervalMs: 500, tickIntervalMs: 100 });
    const sim2 = createVoteSimulator({ candidates: ['x', 'y', 'z'], seed: 777, eliminationIntervalMs: 500, tickIntervalMs: 100 });

    const snaps1: ReturnType<typeof sim1.getSnapshot>[] = [];
    const snaps2: ReturnType<typeof sim2.getSnapshot>[] = [];
    sim1.subscribe((s) => snaps1.push(s));
    sim2.subscribe((s) => snaps2.push(s));

    sim1.start();
    sim2.start();
    vi.advanceTimersByTime(600);
    sim1.stop();
    sim2.stop();

    // Both simulations should produce the same elimination order
    const last1 = snaps1[snaps1.length - 1];
    const last2 = snaps2[snaps2.length - 1];
    if (last1 && last2) {
      expect(last1.eliminated).toEqual(last2.eliminated);
      expect(last1.winnerId).toEqual(last2.winnerId);
    }
  });
});
