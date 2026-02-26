/**
 * SpectatorView — unit tests.
 *
 * Covers:
 *  1. Renders the overlay with competitor names.
 *  2. Reconciles immediately when authoritative winner is present in Redux.
 *  3. Reconciles when 'minigame:end' CustomEvent arrives after mount.
 *  4. Keyboard shortcut (Space) accelerates to reveal when winner is unknown.
 *  5. onDone is called after the reveal animation completes.
 *  6. Component renders without crashing when competitorIds is empty.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../../store/gameSlice';
import SpectatorView from '../SpectatorView';
import type { GameState, Player } from '../../../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(ids: string[], hohId: string | null = null): Player[] {
  return ids.map((id) => ({
    id,
    name: `Player-${id}`,
    avatar: '🧑',
    status: (id === hohId ? 'hoh' : 'active') as Player['status'],
    isUser: id === 'user',
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 8,
    phase: 'final3_comp3',
    players: makePlayers(['p1', 'p2', 'user'], overrides.hohId ?? null),
    tvFeed: [],
    isLive: true,
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    f3Part1WinnerId: 'p1',
    f3Part2WinnerId: 'p2',
    ...overrides,
  };
  return configureStore({ reducer: { game: gameReducer }, preloadedState: { game: base } });
}

function renderSpectator(
  store: ReturnType<typeof makeStore>,
  props: Partial<React.ComponentProps<typeof SpectatorView>> = {},
) {
  return render(
    <Provider store={store}>
      <SpectatorView
        competitorIds={['p1', 'p2']}
        onDone={props.onDone ?? vi.fn()}
        {...props}
      />
    </Provider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpectatorView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing and displays a dialog', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderSpectator(store);
    expect(screen.getByRole('dialog')).toBeDefined();
    vi.useRealTimers();
  });

  it('shows competitor names in the overlay chips', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderSpectator(store, { competitorIds: ['p1', 'p2'] });
    // Names appear in competitor chips; getAllByText handles duplicates (also in variant)
    const p1Elements = screen.getAllByText('Player-p1');
    const p2Elements = screen.getAllByText('Player-p2');
    expect(p1Elements.length).toBeGreaterThan(0);
    expect(p2Elements.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('reconciles to the Redux authoritative winner (hohId already set on mount)', () => {
    vi.useFakeTimers();
    // hohId is already set — SpectatorView should jump straight to revealed
    const store = makeStore({ hohId: 'p1' });
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Fast-forward through reconciliation delay (RECONCILE_DURATION_MS = 1200)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reconciles when "minigame:end" event fires after mount', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Simulate authoritative result arriving via CustomEvent
    act(() => {
      window.dispatchEvent(
        new CustomEvent('minigame:end', { detail: { winnerId: 'p2' } }),
      );
    });

    // Advance past reconciliation delay
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('calls onDone after the simulation timer expires (no authoritative result)', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Advance past full simulation duration (6000 ms) + reconcile delay (1200 ms)
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('Space key accelerates reveal', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    act(() => {
      fireEvent.keyDown(window, { code: 'Space' });
    });

    // Advance past reconciliation delay
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('renders without error when competitorIds is empty', () => {
    vi.useFakeTimers();
    const store = makeStore();
    // Should not throw
    expect(() => renderSpectator(store, { competitorIds: [] })).not.toThrow();
    vi.useRealTimers();
  });

  it('shows the trivia variant without crashing', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], variant: 'trivia' });
    expect(screen.getByRole('dialog')).toBeDefined();
    vi.useRealTimers();
  });

  it('shows the maze variant without crashing', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], variant: 'maze' });
    expect(screen.getByRole('dialog')).toBeDefined();
    vi.useRealTimers();
  });
});
