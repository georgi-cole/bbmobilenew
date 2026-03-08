/**
 * Component test: FamousFiguresComp success overlay behaviour.
 *
 * Verifies that:
 *  1. After a correct human guess the success overlay appears immediately.
 *  2. The overlay shows "Correct!", the figure's canonical name, and points.
 *  3. Input is disabled while the overlay is visible.
 *  4. After CONFIRM_MS (~700 ms) the overlay disappears.
 *  5. advancePlayerCursor is dispatched after the timer fires, advancing the
 *     player's cursor in the Redux store.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import famousFiguresReducer, {
  startFamousFigures,
  FAMOUS_FIGURES,
} from '../../../src/features/famousFigures/famousFiguresSlice';
import type { FamousFiguresState } from '../../../src/features/famousFigures/famousFiguresSlice';
import gameReducer from '../../../src/store/gameSlice';
import FamousFiguresComp from '../../../src/components/FamousFiguresComp/FamousFiguresComp';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      famousFigures: famousFiguresReducer,
      game: gameReducer,
    },
  });
}

function ff(store: ReturnType<typeof makeStore>): FamousFiguresState {
  return (store.getState() as { famousFigures: FamousFiguresState }).famousFigures;
}

const HUMAN_ID = 'human-player';
const SEED = 42;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FamousFiguresComp — success overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows success overlay with correct content after a correct guess', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <FamousFiguresComp
          participantIds={[HUMAN_ID]}
          participants={[{ id: HUMAN_ID, name: 'Human', isHuman: true }]}
          prizeType="HOH"
          seed={SEED}
          revealPauseMs={1500}
        />
      </Provider>,
    );

    // Wait for component to initialise (startFamousFigures dispatched in useEffect)
    await act(async () => {});

    // Get the canonical answer for round 0
    const state = ff(store);
    const figIdx = state.matchFigureOrder[0];
    const figure = FAMOUS_FIGURES[figIdx];
    expect(figure).toBeDefined();

    // Overlay should not be visible yet
    expect(screen.queryByTestId('ff-success-overlay')).not.toBeInTheDocument();

    // Type the correct answer
    const input = screen.getByPlaceholderText('Type your guess…');
    fireEvent.change(input, { target: { value: figure.canonicalName } });
    fireEvent.click(screen.getByRole('button', { name: /submit guess/i }));

    // Overlay should now be visible
    const overlay = screen.getByTestId('ff-success-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay.textContent).toContain('Correct!');
    expect(overlay.textContent).toContain(figure.canonicalName);
    expect(overlay.textContent).toMatch(/\+\d+ points?/);
  });

  it('input is disabled while the success overlay is visible', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <FamousFiguresComp
          participantIds={[HUMAN_ID]}
          participants={[{ id: HUMAN_ID, name: 'Human', isHuman: true }]}
          prizeType="HOH"
          seed={SEED}
          revealPauseMs={1500}
        />
      </Provider>,
    );

    await act(async () => {});

    const state = ff(store);
    const figure = FAMOUS_FIGURES[state.matchFigureOrder[0]];

    const input = screen.getByPlaceholderText('Type your guess…');
    fireEvent.change(input, { target: { value: figure.canonicalName } });
    fireEvent.click(screen.getByRole('button', { name: /submit guess/i }));

    // Input must be disabled during overlay
    expect(screen.getByPlaceholderText('Type your guess…')).toBeDisabled();
    expect(screen.getByRole('button', { name: /submit guess/i })).toBeDisabled();
  });

  it('overlay disappears and advancePlayerCursor fires after ~700ms', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <FamousFiguresComp
          participantIds={[HUMAN_ID]}
          participants={[{ id: HUMAN_ID, name: 'Human', isHuman: true }]}
          prizeType="HOH"
          seed={SEED}
          revealPauseMs={1500}
        />
      </Provider>,
    );

    await act(async () => {});

    const state = ff(store);
    const figure = FAMOUS_FIGURES[state.matchFigureOrder[0]];

    // Cursor starts at 0 and must not advance before overlay completes
    expect(ff(store).playerRoundCursor[HUMAN_ID]).toBe(0);

    const input = screen.getByPlaceholderText('Type your guess…');
    fireEvent.change(input, { target: { value: figure.canonicalName } });
    fireEvent.click(screen.getByRole('button', { name: /submit guess/i }));

    // Overlay visible, cursor still 0
    expect(screen.getByTestId('ff-success-overlay')).toBeInTheDocument();
    expect(ff(store).playerRoundCursor[HUMAN_ID]).toBe(0);

    // Advance fake timer past CONFIRM_MS (700ms)
    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    // Overlay should be gone and cursor should have advanced
    expect(screen.queryByTestId('ff-success-overlay')).not.toBeInTheDocument();
    expect(ff(store).playerRoundCursor[HUMAN_ID]).toBe(1);
  });
});
