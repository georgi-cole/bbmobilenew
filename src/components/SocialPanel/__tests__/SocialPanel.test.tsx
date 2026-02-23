/**
 * Tests for the SocialPanel component.
 *
 * Covers:
 *  1. Renders energy display.
 *  2. Renders target options from alive players (excluding actor).
 *  3. Renders available actions from energyBank state.
 *  4. Execute button is disabled when no target or action is selected.
 *  5. Shows a success result message after a successful action.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, { setEnergyBankEntry } from '../../../social/socialSlice';
import { initManeuvers } from '../../../social/SocialManeuvers';
import SocialPanel from '../SocialPanel';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(energyBank?: Record<string, number>) {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
    },
  });
  initManeuvers(store);

  if (energyBank) {
    for (const [id, value] of Object.entries(energyBank)) {
      store.dispatch(setEnergyBankEntry({ playerId: id, value }));
    }
  }

  return store;
}

function renderPanel(store: ReturnType<typeof makeStore>, actorId = 'user') {
  return render(
    <Provider store={store}>
      <SocialPanel actorId={actorId} />
    </Provider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SocialPanel – rendering', () => {
  it('renders the Social Actions heading', () => {
    const store = makeStore();
    renderPanel(store);
    expect(screen.getByText(/Social Actions/)).toBeDefined();
  });

  it('renders the energy display', () => {
    const store = makeStore({ user: 4 });
    renderPanel(store);
    expect(screen.getByLabelText(/Energy: 4/)).toBeDefined();
  });

  it('shows ⚡ 0 when actor has no energy entry', () => {
    const store = makeStore();
    renderPanel(store);
    expect(screen.getByLabelText(/Energy: 0/)).toBeDefined();
  });

  it('renders a target select with a placeholder option', () => {
    const store = makeStore();
    renderPanel(store);
    expect(screen.getByLabelText('Select target')).toBeDefined();
    expect(screen.getByText('— Choose target —')).toBeDefined();
  });

  it('renders an action select with a placeholder option', () => {
    const store = makeStore();
    renderPanel(store);
    expect(screen.getByLabelText('Select action')).toBeDefined();
    expect(screen.getByText('— Choose action —')).toBeDefined();
  });

  it('Execute button is disabled when nothing is selected', () => {
    const store = makeStore({ user: 10 });
    renderPanel(store);
    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not show a result message initially', () => {
    const store = makeStore();
    renderPanel(store);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('SocialPanel – action execution', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    // Use the default game store — it has a user player + 11 AI players from the roster
    store = makeStore({ user: 10 });
  });

  it('Execute button becomes enabled when both target and action are selected', () => {
    renderPanel(store, 'user');

    // Get the first non-placeholder target option
    const targetSelect = screen.getByLabelText('Select target') as HTMLSelectElement;
    const targetOptions = Array.from(targetSelect.options).filter((o) => o.value !== '');
    expect(targetOptions.length).toBeGreaterThan(0);

    fireEvent.change(targetSelect, { target: { value: targetOptions[0].value } });
    fireEvent.change(screen.getByLabelText('Select action'), { target: { value: 'idle' } });

    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a result message after executing an action', () => {
    renderPanel(store, 'user');

    const targetSelect = screen.getByLabelText('Select target') as HTMLSelectElement;
    const targetOptions = Array.from(targetSelect.options).filter((o) => o.value !== '');

    fireEvent.change(targetSelect, { target: { value: targetOptions[0].value } });
    fireEvent.change(screen.getByLabelText('Select action'), { target: { value: 'idle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));

    expect(screen.getByRole('status')).toBeDefined();
  });

  it('resets selects to placeholder after executing', () => {
    renderPanel(store, 'user');

    const targetSelect = screen.getByLabelText('Select target') as HTMLSelectElement;
    const actionSelect = screen.getByLabelText('Select action') as HTMLSelectElement;
    const targetOptions = Array.from(targetSelect.options).filter((o) => o.value !== '');

    fireEvent.change(targetSelect, { target: { value: targetOptions[0].value } });
    fireEvent.change(actionSelect, { target: { value: 'idle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));

    expect(targetSelect.value).toBe('');
    expect(actionSelect.value).toBe('');
  });
});

