/**
 * SpectatorView — unit tests.
 *
 * Covers:
 *  1. Renders the overlay with competitor names.
 *  2. Reconciles immediately when authoritative winner is present in Redux.
 *  3. Reconciles when 'minigame:end' CustomEvent arrives after mount.
 *  4. Skip is available immediately — Space key fires onDone after RECONCILE_DURATION_MS.
 *  5. onDone is called after the reveal animation completes (10 s run + 1.2 s reveal).
 *  6. Component renders without crashing when competitorIds is empty.
 *  7. advance() is blocked while SpectatorView is mounted (spectatorActive set).
 *  8. advance() is unblocked (spectatorActive cleared) before onDone fires.
 *  9. no-animations fast-path: onDone fires without waiting for 10 s sim + 1.2 s reveal.
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

// SIM_DURATION_MS = 10000; RECONCILE_DURATION_MS = 1200
const SIM_MS = 10000;
const RECONCILE_MS = 1200;

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

  it('reconciles to the Redux authoritative winner after 10 s run + 1.2 s reveal', () => {
    vi.useFakeTimers();
    // hohId is set — the winner is known at mount.
    const store = makeStore({ hohId: 'p1' });
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Advancing only 8 s must NOT call onDone — sim still running.
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDone).not.toHaveBeenCalled();

    // Advancing past 10 s sim + 1.2 s reveal (total ~11.2 s) fires onDone.
    act(() => {
      vi.advanceTimersByTime(SIM_MS + RECONCILE_MS + 200); // ~11.4 s total
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reconciles when "minigame:end" event fires — no floor, onDone after 10 s + 1.2 s', () => {
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

    // Advancing a few seconds — sim still running, onDone must not fire yet.
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDone).not.toHaveBeenCalled();

    // Advancing past 10 s sim + 1.2 s reveal fires onDone (no 15 s floor).
    act(() => {
      vi.advanceTimersByTime(SIM_MS + RECONCILE_MS + 200 - 8000); // remaining time to pass 11.4 s
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('calls onDone after the 10 s simulation timer + 1.2 s reveal (no floor)', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Sequence ends at 10 s, reveal at 11.2 s — onDone must not fire before then.
    act(() => {
      vi.advanceTimersByTime(10500);
    });
    expect(onDone).not.toHaveBeenCalled();

    // Advance past 10 s + 1.2 s.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('Space key triggers skip immediately (before sequenceComplete) and fires onDone after 1.2 s', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Space at 1 s (well before sequenceComplete at 10 s) — skip is immediate now.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      fireEvent.keyDown(window, { code: 'Space' });
    });

    // onDone should fire after RECONCILE_DURATION_MS (1.2 s).
    act(() => {
      vi.advanceTimersByTime(RECONCILE_MS + 200); // 1.4 s
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

    // Fast-forward past the 10 s sim + 1.2 s reveal.
    act(() => {
      vi.advanceTimersByTime(SIM_MS + RECONCILE_MS + 500);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    // spectatorActive must be null by the time onDone was called
    expect(spectatorActiveAtOnDone).toBeNull();
    // And it remains null after onDone
    expect(store.getState().game.spectatorActive).toBeNull();

    vi.useRealTimers();
  });

  it('Skip button is always enabled (available immediately, not gated by sequenceComplete)', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderSpectator(store, { competitorIds: ['p1', 'p2'] });

    const skipBtn = screen.getByRole('button', { name: /skip to results/i });

    // Skip button should be enabled immediately on mount.
    expect(skipBtn).not.toBeDisabled();

    vi.useRealTimers();
  });

  it('Skip button fires onDone after RECONCILE_DURATION_MS when clicked at any time', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    const skipBtn = screen.getByRole('button', { name: /skip to results/i });
    expect(skipBtn).not.toBeDisabled();

    // Click Skip immediately (without waiting for sequenceComplete).
    act(() => {
      skipBtn.click();
    });

    // Advance only the RECONCILE_DURATION_MS (1200 ms) — no floor to wait for.
    act(() => {
      vi.advanceTimersByTime(RECONCILE_MS + 200);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('repeated skip() calls do not push reveal out (onDone fires exactly once)', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    const skipBtn = screen.getByRole('button', { name: /skip to results/i });

    // Click Skip three times in quick succession.
    act(() => {
      skipBtn.click();
      skipBtn.click();
      skipBtn.click();
    });

    act(() => {
      vi.advanceTimersByTime(RECONCILE_MS + 200);
    });

    // onDone must be called exactly once regardless of multiple clicks.
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('setAuthoritativeWinner is a no-op once locked (does not desync winner state)', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Wait for sequence to complete and reconcile with p1 as winner.
    act(() => {
      window.dispatchEvent(
        new CustomEvent('minigame:end', { detail: { winnerId: 'p1' } }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(SIM_MS + RECONCILE_MS + 500); // past sequence + reveal
    });

    expect(onDone).toHaveBeenCalledTimes(1);

    // Attempt to inject a different winner after lock — must not call onDone again.
    act(() => {
      window.dispatchEvent(
        new CustomEvent('minigame:end', { detail: { winnerId: 'p2' } }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('openSpectator is a no-op (deduped) when spectatorActive is already set', () => {
    vi.useFakeTimers();
    // Pre-populate spectatorActive to simulate a duplicate open attempt.
    const existingActive = {
      competitorIds: ['p1', 'p2'],
      variant: 'holdwall' as const,
      startedAt: Date.now() - 1000,
    };
    const store = makeStore({ spectatorActive: existingActive });

    // The SpectatorView tries to dispatch openSpectator on mount — but since
    // spectatorActive is already set, the reducer should not overwrite it.
    renderSpectator(store, { competitorIds: ['p1', 'p2'] });

    // spectatorActive should still reflect the pre-existing state (startedAt unchanged).
    expect(store.getState().game.spectatorActive?.startedAt).toBe(existingActive.startedAt);

    vi.useRealTimers();
  });

  it('no-animations: onDone fires without advancing SIM_DURATION_MS or RECONCILE_DURATION_MS', () => {
    vi.useFakeTimers();
    // Set the body class before rendering so SpectatorView sees it on mount.
    document.body.classList.add('no-animations');

    const store = makeStore({ hohId: 'p1' });
    const onDone = vi.fn();
    renderSpectator(store, { competitorIds: ['p1', 'p2'], onDone });

    // Advance only a tiny amount — onDone should fire without waiting for 10 s sim
    // or 1.2 s reconcile delay.
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(onDone).toHaveBeenCalledTimes(1);

    document.body.classList.remove('no-animations');
    vi.useRealTimers();
  });
});
