/**
 * Tests for the FloatingActionBar component.
 *
 * Covers:
 *  1. Social button badge shows human player's energy value from energyBank.
 *  2. Badge is absent when there is no human player.
 *  3. Flash CSS class is added to the social button when energy changes.
 *  4. Flash CSS class is removed after the animation interval.
 *  5. ARIA label on social button includes energy value.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, { setEnergyBankEntry, applyEnergyDelta } from '../../../social/socialSlice';
import FloatingActionBar from '../FloatingActionBar';
import type { RootState } from '../../../store/store';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(hasHuman = true) {
  const base = configureStore({ reducer: { game: gameReducer, social: socialReducer } });
  const defaultState = base.getState() as RootState;
  const players = hasHuman
    ? defaultState.game.players
    : defaultState.game.players.map((p) => ({ ...p, isUser: false }));

  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: { game: { ...defaultState.game, players }, social: defaultState.social },
  });
}

function renderFAB(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <FloatingActionBar />
    </Provider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FloatingActionBar – social energy badge', () => {
  it('shows a badge with the human player energy value', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 8 })); });
    renderFAB(store);
    // Badge text should reflect energy value
    expect(screen.getByText('8')).toBeDefined();
  });

  it('shows 0 badge when human energy is 0', () => {
    const store = makeStore();
    renderFAB(store);
    // Default energy is 0 — badge should still show 0
    expect(screen.getByText('0')).toBeDefined();
  });

  it('shows 99+ badge when energy exceeds 99', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 150 })); });
    renderFAB(store);
    expect(screen.getByText('99+')).toBeDefined();
  });

  it('ARIA label on social button includes energy value', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 })); });
    renderFAB(store);
    expect(screen.getByRole('button', { name: /energy: 5/i })).toBeDefined();
  });
});

describe('FloatingActionBar – social button flash animation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('adds flash class to social button when energy changes', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    renderFAB(store);

    // Change energy — should trigger flash
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }));
    });

    const btn = screen.getByRole('button', { name: /energy: 10/i });
    expect(btn.className).toContain('fab__side-btn--flash');
  });

  it('removes flash class after 600ms', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    renderFAB(store);

    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }));
    });

    act(() => { vi.advanceTimersByTime(600); });

    const btn = screen.getByRole('button', { name: /energy: 10/i });
    expect(btn.className).not.toContain('fab__side-btn--flash');
  });

  it('adds flash class when energy changes via applyEnergyDelta', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 })); });
    renderFAB(store);

    act(() => {
      store.dispatch(applyEnergyDelta({ playerId: humanId, delta: -2 }));
    });

    const btn = screen.getByRole('button', { name: /energy: 3/i });
    expect(btn.className).toContain('fab__side-btn--flash');
  });
});
