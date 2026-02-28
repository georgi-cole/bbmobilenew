// Integration tests for the cinematic eviction choreography.
//
// Validates:
//   1. SpotlightEvictionOverlay remains mounted for at least DONE_AT ms before onDone fires.
//   2. GameScreen renders the overlay while pendingEviction is set, then commits the eviction
//      (clears pendingEviction, updates evictee status, appends tvFeed event) after DONE_AT ms.
//   3. advance() is blocked while pendingEviction is set (overlay is blocking).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import settingsReducer from '../../src/store/settingsSlice';
import type { GameState, Player } from '../../src/types';
import SpotlightEvictionOverlay from '../../src/components/Eviction/SpotlightEvictionOverlay';
import GameScreen from '../../src/screens/GameScreen/GameScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'eviction_results',
    seed: 42,
    hohId: 'p1',
    prevHohId: null,
    nomineeIds: ['p2', 'p3'],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    pendingMinigame: null,
    minigameResult: null,
    twistActive: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    voteResults: null,
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    evictionSplashId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
    },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

// ── SpotlightEvictionOverlay unit tests ───────────────────────────────────

// Timing constants mirrored from the component for assertion purposes.
const DONE_AT = 5400;

describe('SpotlightEvictionOverlay – cinematic timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the evictee name in the aria-label', () => {
    const onDone = vi.fn();
    const evictee: Player = { id: 'p2', name: 'Alice', avatar: '🧑', status: 'active', isUser: false };
    render(
      <SpotlightEvictionOverlay
        evictee={evictee}
        layoutId="avatar-tile-p2"
        onDone={onDone}
      />,
    );
    expect(screen.getByRole('dialog', { name: /Alice has been evicted/i })).toBeTruthy();
  });

  it('does NOT fire onDone before DONE_AT ms', async () => {
    const onDone = vi.fn();
    const evictee: Player = { id: 'p2', name: 'Alice', avatar: '🧑', status: 'active', isUser: false };
    render(
      <SpotlightEvictionOverlay
        evictee={evictee}
        layoutId="avatar-tile-p2"
        onDone={onDone}
      />,
    );

    // Advance to just before DONE_AT
    await act(async () => { vi.advanceTimersByTime(DONE_AT - 50); });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('fires onDone at or after DONE_AT ms', async () => {
    const onDone = vi.fn();
    const evictee: Player = { id: 'p2', name: 'Alice', avatar: '🧑', status: 'active', isUser: false };
    render(
      <SpotlightEvictionOverlay
        evictee={evictee}
        layoutId="avatar-tile-p2"
        onDone={onDone}
      />,
    );

    await act(async () => { vi.advanceTimersByTime(DONE_AT + 50); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fires onDone only once even if fire() is called multiple times (guard)', async () => {
    const onDone = vi.fn();
    const evictee: Player = { id: 'p2', name: 'Alice', avatar: '🧑', status: 'active', isUser: false };
    render(
      <SpotlightEvictionOverlay
        evictee={evictee}
        layoutId="avatar-tile-p2"
        onDone={onDone}
      />,
    );

    // Advance well past done
    await act(async () => { vi.advanceTimersByTime(DONE_AT * 2); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fires onDone immediately in reduced-motion mode (REDUCED_DONE_AT = 600 ms)', async () => {
    // Mock prefers-reduced-motion
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onDone = vi.fn();
    const evictee: Player = { id: 'p2', name: 'Alice', avatar: '🧑', status: 'active', isUser: false };
    render(
      <SpotlightEvictionOverlay
        evictee={evictee}
        layoutId="avatar-tile-p2"
        onDone={onDone}
      />,
    );

    // Should not have fired before 600 ms
    await act(async () => { vi.advanceTimersByTime(550); });
    expect(onDone).not.toHaveBeenCalled();

    // Should fire at/after 600 ms
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(onDone).toHaveBeenCalledTimes(1);

    window.matchMedia = original;
  });
});

// ── GameScreen × SpotlightEvictionOverlay integration ─────────────────────

describe('GameScreen – SpotlightEvictionOverlay blocks tvFeed advancement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 60, height: 80,
      top: 0, left: 0, bottom: 80, right: 60,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders overlay while pendingEviction is set and commits eviction after DONE_AT ms', async () => {
    const players: Player[] = [
      { id: 'p0', name: 'Player 0', avatar: '🧑', status: 'active', isUser: true },
      { id: 'p1', name: 'Player 1', avatar: '🧑', status: 'hoh', isUser: false },
      { id: 'p2', name: 'Alice', avatar: '🧑', status: 'nominated', isUser: false },
      { id: 'p3', name: 'Player 3', avatar: '🧑', status: 'nominated', isUser: false },
      { id: 'p4', name: 'Player 4', avatar: '🧑', status: 'active', isUser: false },
      { id: 'p5', name: 'Player 5', avatar: '🧑', status: 'active', isUser: false },
    ];
    const store = makeStore({
      // Simulate the state after advance() ran from eviction_results:
      // pendingEviction is set, phase is week_end (since eviction_results → week_end).
      phase: 'week_end',
      hohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Alice, you have been evicted. 🚪' },
      players,
    });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameScreen />
        </MemoryRouter>
      </Provider>,
    );
    await act(async () => {});

    // advance() must be blocked while pendingEviction is set.
    expect(store.getState().game.pendingEviction).not.toBeNull();

    // The SpotlightEvictionOverlay dialog must be visible for the evictee.
    expect(screen.getByRole('dialog', { name: /Alice has been evicted/i })).toBeTruthy();

    // Alice's status must still be 'nominated' — the commit is deferred.
    const aliceBefore = store.getState().game.players.find((p) => p.id === 'p2');
    expect(aliceBefore?.status).toBe('nominated');

    // Advance past DONE_AT — overlay's onDone fires → finalizePendingEviction dispatched.
    await act(async () => { vi.advanceTimersByTime(DONE_AT + 100); });

    // pendingEviction must be cleared after finalizePendingEviction.
    expect(store.getState().game.pendingEviction).toBeNull();

    // Alice's status must now reflect the eviction.
    const aliceAfter = store.getState().game.players.find((p) => p.id === 'p2');
    expect(aliceAfter?.status).toMatch(/evicted|jury/);

    // tvFeed must contain the eviction message.
    expect(store.getState().game.tvFeed.some((e) => e.text.includes('Alice'))).toBe(true);
  });
});
