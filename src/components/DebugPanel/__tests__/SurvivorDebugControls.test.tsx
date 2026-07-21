import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import SurvivorDebugControls from '../SurvivorDebugControls';
import gameReducer, { hydrateGame } from '../../../store/gameSlice';
import { createSurvivorRun } from '../../../modes/survivorRun';
import { survivorMiddleware } from '../../../modes/survivorMiddleware';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(survivorMiddleware),
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

    await user.click(screen.getByRole('button', { name: 'Start Surveyeval Run' }));

    expect(store.getState().game.mode).toBe('survival');
    expect(store.getState().game.players).toHaveLength(8);
  });

  it('advances the survival day when the run is active', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const survivorGame = createSurvivorRun();
    survivorGame.week = 1;
    if (survivorGame.modeSpecific?.kind === 'survival') {
      survivorGame.modeSpecific.currentDay = 1;
      survivorGame.modeSpecific.bestDayReached = 1;
    }
    store.dispatch(hydrateGame(survivorGame));

    render(
      <Provider store={store}>
        <SurvivorDebugControls />
      </Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Advance Surveyeval Day' }));

    const gameState = store.getState().game;
    if (gameState.modeSpecific?.kind !== 'survival') {
      throw new Error('Expected survivor mode state');
    }

    expect(gameState.week).toBeGreaterThan(1);
    expect(gameState.phase).toBe('week_start');
    expect(gameState.modeSpecific.currentDay).toBe(gameState.week);
    expect(gameState.modeSpecific.bestDayReached).toBe(gameState.week);
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
    expect(store.getState().game.tvFeed[0]?.text).toContain('Surveyeval run ended');
  });
});
