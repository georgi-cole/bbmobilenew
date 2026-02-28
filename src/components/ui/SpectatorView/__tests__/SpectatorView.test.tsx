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
 *  7. advance() is blocked while SpectatorView is mounted (spectatorActive set).
 *  8. advance() is unblocked (spectatorActive cleared) before onDone fires.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { advance } from '../../../../store/gameSlice';
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
    spectatorActive: null,
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

  it('reconciles to the Redux authoritative winner after the 15 s floor elapses', () => {
    vi.useFakeTimers();
    // hohId is set — the winner is known at mount, but onDone must not fire
    // until the 15 s MIN_FLOOR_MS has elapsed (or Skip is pressed).
    const store = makeStore({ hohId: 'p1' });
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Advancing only 8 s (sim + reconcile) must NOT call onDone — floor not reached.
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDone).not.toHaveBeenCalled();

    // Advancing past the 15 s floor fires onDone.
    act(() => {
      vi.advanceTimersByTime(8000); // total ~16 s
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reconciles when "minigame:end" event fires, honouring the 15 s floor', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Simulate authoritative result arriving via CustomEvent during the sim.
    act(() => {
      window.dispatchEvent(
        new CustomEvent('minigame:end', { detail: { winnerId: 'p2' } }),
      );
    });

    // Advancing only a few seconds must NOT call onDone — floor not reached.
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDone).not.toHaveBeenCalled();

    // Advancing past the 15 s floor fires onDone.
    act(() => {
      vi.advanceTimersByTime(8000); // total ~16 s
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('calls onDone after the simulation timer and 15 s floor both expire', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Sequence ends at 6 s, floor ends at 15 s — onDone must not fire before then.
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDone).not.toHaveBeenCalled();

    // Advance past 15 s total.
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('Space key has no effect before sequenceComplete and fires onDone immediately after sequenceComplete', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Space before sequence completes (< 6 s) must be a no-op.
    act(() => {
      fireEvent.keyDown(window, { code: 'Space' });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).not.toHaveBeenCalled();

    // Advance to after sequenceComplete (>= 6 s elapsed).
    act(() => {
      vi.advanceTimersByTime(5500); // total ~6.5 s, sequence done
    });

    // Now Space should trigger the reveal bypass, completing quickly.
    act(() => {
      fireEvent.keyDown(window, { code: 'Space' });
    });
    act(() => {
      vi.advanceTimersByTime(2000); // reconcile delay (RECONCILE_DURATION_MS)
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

  it('sets spectatorActive in Redux on mount — advance() is blocked while overlay is open', () => {
    vi.useFakeTimers();
    const store = makeStore({ phase: 'final3_comp3' });

    // spectatorActive is null before mount
    expect(store.getState().game.spectatorActive).toBeNull();

    renderSpectator(store, { competitorIds: ['p1', 'p2'] });

    // spectatorActive is now set — advance() should be a no-op
    expect(store.getState().game.spectatorActive).not.toBeNull();
    expect(store.getState().game.spectatorActive?.competitorIds).toEqual(['p1', 'p2']);

    const phaseBefore = store.getState().game.phase;
    store.dispatch(advance());
    // Phase must NOT have changed — advance() was blocked
    expect(store.getState().game.phase).toBe(phaseBefore);

    vi.useRealTimers();
  });

  it('clears spectatorActive (unblocks advance()) before onDone fires', () => {
    vi.useFakeTimers();
    const store = makeStore({ hohId: 'p1', phase: 'final3_comp3' });

    let spectatorActiveAtOnDone: unknown = 'not-called';
    const onDone = vi.fn(() => {
      // Capture store state at the moment onDone is invoked
      spectatorActiveAtOnDone = store.getState().game.spectatorActive;
    });

    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Fast-forward past the 15 s MIN_FLOOR_MS + RECONCILE_DURATION_MS.
    act(() => {
      vi.advanceTimersByTime(17000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    // spectatorActive must be null by the time onDone was called
    expect(spectatorActiveAtOnDone).toBeNull();
    // And it remains null after onDone
    expect(store.getState().game.spectatorActive).toBeNull();

    vi.useRealTimers();
  });

  it('Skip button is disabled before sequenceComplete and enabled after', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderSpectator(store, { competitorIds: ['p1', 'p2'] });

    const skipBtn = screen.getByRole('button', { name: /skip to results/i });

    // Before sequence completes, button is disabled.
    expect(skipBtn).toBeDisabled();

    // Advance past SIM_DURATION_MS (6 s) so sequenceComplete becomes true.
    act(() => {
      vi.advanceTimersByTime(7000);
    });

    expect(skipBtn).not.toBeDisabled();
    vi.useRealTimers();
  });

  it('Skip button immediately fires onDone after sequenceComplete (bypasses floor)', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Advance past sequenceComplete (6 s).
    act(() => {
      vi.advanceTimersByTime(7000);
    });

    const skipBtn = screen.getByRole('button', { name: /skip to results/i });
    expect(skipBtn).not.toBeDisabled();

    // Click Skip — should trigger reveal without waiting for the 15 s floor.
    act(() => {
      skipBtn.click();
    });

    // Advance only the RECONCILE_DURATION_MS (1200 ms) — well under the floor.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
