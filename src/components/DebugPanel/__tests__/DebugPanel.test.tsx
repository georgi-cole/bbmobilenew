import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import DebugPanel from '../DebugPanel';
import gameReducer from '../../../store/gameSlice';
import socialReducer from '../../../social/socialSlice';
import settingsReducer from '../../../store/settingsSlice';

vi.mock('../FinaleControls.debug', () => ({
  default: () => null,
}));

vi.mock('../MinigameDebugControls', () => ({
  default: () => null,
}));

vi.mock('../SimulationDebugControls', () => ({
  default: () => null,
}));

vi.mock('../DebugDiagnostics', () => ({
  default: () => null,
}));

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      settings: settingsReducer,
    },
  });
}

describe('DebugPanel forced shock controls', () => {
  it('opens when the mounted app navigates into debug mode', async () => {
    const user = userEvent.setup();
    const store = makeStore();

    function DebugRouteHarness() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/game?debug=1&qa=1')}>
            Enter debug game
          </button>
          <DebugPanel />
        </>
      );
    }

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <DebugRouteHarness />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.queryByRole('complementary', { name: 'Debug Panel' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enter debug game' }));
    expect(screen.getByRole('complementary', { name: 'Debug Panel' })).toBeInTheDocument();
  });

  it('can place a player in the Tribunal for battle-back testing', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const player = store.getState().game.players[0];
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game?debug=1&qa=1']}>
          <DebugPanel />
        </MemoryRouter>
      </Provider>
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Player House Status' }),
      player.id
    );
    await user.click(screen.getByRole('button', { name: 'Set Tribunal' }));
    expect(
      store.getState().game.players.find((candidate) => candidate.id === player.id)?.status
    ).toBe('jury');
  });

  it('includes Back 2 the Game in the force shock dropdown and queues it', async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game?debug=1&qa=1']}>
          <DebugPanel />
        </MemoryRouter>
      </Provider>
    );

    const forceShockSelect = screen.getByRole('combobox', { name: 'Force Shock' });

    expect(screen.getByRole('option', { name: 'Back 2 the Game' })).toBeDefined();

    await user.selectOptions(forceShockSelect, 'battleBack');
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(store.getState().game.pendingForcedShock?.type).toBe('battleBack');
  });

  it('includes Morning Shock in the force shock dropdown and queues it', async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game?debug=1&qa=1']}>
          <DebugPanel />
        </MemoryRouter>
      </Provider>
    );

    const forceShockSelect = screen.getByRole('combobox', { name: 'Force Shock' });

    expect(screen.getByRole('option', { name: 'Morning Shock' })).toBeDefined();

    await user.selectOptions(forceShockSelect, 'dayStartShock');
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(store.getState().game.pendingForcedShock?.type).toBe('dayStartShock');
  });

  it('includes Twin Shock in the force shock dropdown and queues it', async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game?debug=1&qa=1']}>
          <DebugPanel />
        </MemoryRouter>
      </Provider>
    );

    const forceShockSelect = screen.getByRole('combobox', { name: 'Force Shock' });

    expect(screen.getByRole('option', { name: 'Twin Shock' })).toBeDefined();

    await user.selectOptions(forceShockSelect, 'twinShock');
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(store.getState().game.pendingForcedShock?.type).toBe('twinShock');
  });

  it("schedules Cupid's Arrow for an exact season", async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game?debug=1&qa=1']}>
          <DebugPanel />
        </MemoryRouter>
      </Provider>
    );

    const seasonInput = screen.getByRole('spinbutton', { name: "Cupid's Arrow Season" });
    await user.clear(seasonInput);
    await user.type(seasonInput, '3');
    await user.click(screen.getByRole('button', { name: 'Schedule Cupid season' }));

    expect(store.getState().settings.sim.cupidArrowSeasonOverride).toBe(3);
    expect(store.getState().game.cupidArrow?.scheduledSeason).toBe(3);
  });
});
