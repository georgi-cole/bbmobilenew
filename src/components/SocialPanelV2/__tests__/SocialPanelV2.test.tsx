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
 * 10. Modal re-opens when transitioning between social_1 and social_2 after being closed.
 * 11. Execute button enabled when idle action (needsTargets: false) is selected.
 * 12. Execute button disabled when target-requiring action is selected without a player.
 * 13. Execute button enabled when action and a player are both selected.
 * 14. Execute shows success feedback after idle action is performed.
 * 15. Execute shows 'Insufficient energy' feedback when player cannot afford action.
 * 16. After successful execute, action selection is cleared (button returns to disabled).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../../store/gameSlice';
import socialReducer, { setEnergyBankEntry, openSocialPanel } from '../../../social/socialSlice';
import { initManeuvers } from '../../../social/SocialManeuvers';
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

  it('does not render during social_1 unless explicitly opened', () => {
    const store = makeStore({ phase: 'social_1' });
    renderPanel(store);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders during social_1 phase when opened via FAB', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('renders during social_2 phase when opened via FAB', () => {
    const store = makeStore({ phase: 'social_2' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('does not render when there is no human player', () => {
    const store = makeStore({ phase: 'social_1', hasHuman: false });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('SocialPanelV2 – energy display', () => {
  it('displays the human player energy chip', () => {
    const store = makeStore({ phase: 'social_1' });
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 7 }));
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByLabelText(/Energy: 7/)).toBeDefined();
  });

  it('shows energy as 0 when no energyBank entry exists', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByLabelText(/Energy: 0/)).toBeDefined();
  });
});

describe('SocialPanelV2 – layout', () => {
  it('renders player roster placeholder', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByLabelText('Player roster')).toBeDefined();
  });

  it('renders action grid placeholder', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByLabelText('Action grid')).toBeDefined();
  });

  it('renders a disabled Execute button', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the Recent Activity log above the footer', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByLabelText('Recent Activity log')).toBeDefined();
  });

  it('Recent Activity log is outside the Action grid column', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    const actionsColumn = screen.getByLabelText('Action grid');
    const recentLog = screen.getByLabelText('Recent Activity log');
    expect(actionsColumn.contains(recentLog)).toBe(false);
  });
});

describe('SocialPanelV2 – close behaviour', () => {
  it('hides the modal when the close button is clicked', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not re-open when the phase transitions after closing (FAB-only open)', () => {
    const store = makeStore({ phase: 'social_1' });
    act(() => { store.dispatch(openSocialPanel()); });
    renderPanel(store);

    // Close the modal.
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Phase transition should NOT re-open the panel.
    act(() => {
      store.dispatch(setPhase('social_2'));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ── Execute flow ───────────────────────────────────────────────────────────

describe('SocialPanelV2 – execute flow', () => {
  let store: ReturnType<typeof makeStore>;
  let humanId: string;

  beforeEach(() => {
    store = makeStore({ phase: 'social_1' });
    humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }));
    store.dispatch(openSocialPanel());
    initManeuvers(store);
    renderPanel(store);
  });

  it('execute button is enabled when a targetless action (idle) is selected', () => {
    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }));
    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('execute button stays disabled when a target-requiring action is selected without a player', () => {
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }));
    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('execute button is enabled when action and a player are both selected', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!;
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }));
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0]);
    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows feedback after executing idle action', () => {
    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('shows "Insufficient energy" when player cannot afford the action', () => {
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 0 }));
    });
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!;
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }));
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    expect(screen.getByRole('status').textContent).toContain('Insufficient energy');
  });

  it('execute button returns to disabled after successful execution', () => {
    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    // After success, selectedActionId is cleared → button disabled again
    const btn = screen.getByRole('button', { name: 'Execute' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
