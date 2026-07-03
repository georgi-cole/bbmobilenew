import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import SurvivorDebugControls from '../SurvivorDebugControls';
import gameReducer, { hydrateGame } from '../../../store/gameSlice';
import { createSurvivorRun } from '../../../modes/survivorRun';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
    },
  });
}

describe('SurvivorDebugControls', () => {
  it('starts a survivor run from the debug menu', async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <SurvivorDebugControls />
      </Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Start Survivor Run' }));

    expect(store.getState().game.mode).toBe('survivor');
    expect(store.getState().game.players).toHaveLength(8);
  });

  it('advances the survivor day when the run is active', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const survivorGame = createSurvivorRun();
    survivorGame.week = 4;
    if (survivorGame.modeSpecific?.kind === 'survivor') {
      survivorGame.modeSpecific.currentDay = 2;
      survivorGame.modeSpecific.bestDayReached = 2;
    }
    store.dispatch(hydrateGame(survivorGame));

    render(
      <Provider store={store}>
        <SurvivorDebugControls />
      </Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Advance Survivor Day' }));

    const gameState = store.getState().game;
    if (gameState.modeSpecific?.kind !== 'survivor') {
      throw new Error('Expected survivor mode state');
    }

    expect(gameState.modeSpecific.currentDay).toBe(4);
  });

  it('terminalizes a survivor run for hard-stop testing', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.dispatch(hydrateGame(createSurvivorRun()));

    render(
      <Provider store={store}>
        <SurvivorDebugControls />
      </Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Terminalize Run' }));

    expect(store.getState().game.status).toBe('failed');
    expect(store.getState().game.tvFeed[0]?.text).toContain('Survivor run ended');
  });
});
