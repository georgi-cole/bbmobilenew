/**
 * Tests for the SocialPanelV2 component.
 *
 * Covers:
 *  1. Does not render when game phase is not a social phase.
 *  2. Renders the modal during social_1 phase with a human player.
 *  3. Renders the modal during social_2 phase with a human player.
 *  4. Displays the human player's energy chip.
 *  5. Shows energy as 0 when no entry exists in energyBank.
 *  6. Renders player roster and action grid placeholders.
 *  7. Renders a disabled Execute button in the footer.
 *  8. Close button hides the modal.
 *  9. Does not render when there is no human player.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, { setEnergyBankEntry } from '../../../social/socialSlice';
import SocialPanelV2 from '../SocialPanelV2';
import type { RootState } from '../../../store/store';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(overrides?: {
  phase?: string;
  energyBank?: Record<string, number>;
  hasHuman?: boolean;
}) {
  const base = configureStore({ reducer: { game: gameReducer, social: socialReducer } });
  const defaultState = base.getState() as RootState;

  // Build the preloaded state by patching the default game state.
  const players = overrides?.hasHuman === false
    ? defaultState.game.players.map((p) => ({ ...p, isUser: false }))
    : defaultState.game.players;

  const preloadedState = {
    game: {
      ...defaultState.game,
      players,
      phase: (overrides?.phase ?? defaultState.game.phase) as RootState['game']['phase'],
    },
    social: defaultState.social,
  };

  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState,
  });

  if (overrides?.energyBank) {
    for (const [id, value] of Object.entries(overrides.energyBank)) {
      store.dispatch(setEnergyBankEntry({ playerId: id, value }));
    }
  }

  return store;
}

function renderPanel(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <SocialPanelV2 />
    </Provider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SocialPanelV2 – visibility', () => {
  it('does not render when phase is not social', () => {
    const store = makeStore({ phase: 'hoh_comp' });
    renderPanel(store);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders during social_1 phase', () => {
    const store = makeStore({ phase: 'social_1' });
    renderPanel(store);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('renders during social_2 phase', () => {
    const store = makeStore({ phase: 'social_2' });
    renderPanel(store);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('does not render when there is no human player', () => {
    const store = makeStore({ phase: 'social_1', hasHuman: false });
    renderPanel(store);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('SocialPanelV2 – energy display', () => {
  it('displays the human player energy chip', () => {
    const store = makeStore({ phase: 'social_1' });
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 7 }));
    renderPanel(store);
    expect(screen.getByLabelText(/Energy: 7/)).toBeDefined();
  });

  it('shows energy as 0 when no energyBank entry exists', () => {
    const store = makeStore({ phase: 'social_1' });
    renderPanel(store);
    expect(screen.getByLabelText(/Energy: 0/)).toBeDefined();
  });
});

describe('SocialPanelV2 – layout', () => {
  it('renders player roster placeholder', () => {
    const store = makeStore({ phase: 'social_1' });
    renderPanel(store);
    expect(screen.getByLabelText('Player roster')).toBeDefined();
  });

  it('renders action grid placeholder', () => {
    const store = makeStore({ phase: 'social_1' });
    renderPanel(store);
    expect(screen.getByLabelText('Action grid')).toBeDefined();
  });

  it('renders a disabled Execute button', () => {
    const store = makeStore({ phase: 'social_1' });
    renderPanel(store);
    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('SocialPanelV2 – close behaviour', () => {
  it('hides the modal when the close button is clicked', () => {
    const store = makeStore({ phase: 'social_1' });
    renderPanel(store);
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
