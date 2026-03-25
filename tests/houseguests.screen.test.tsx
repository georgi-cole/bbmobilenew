import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import Houseguests from '../src/screens/Houseguests/Houseguests';
import { enrichPlayer } from '../src/utils/houseguestLookup';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

describe('Houseguests screen', () => {
  it('renders the Housemates title and occupancy chip', () => {
    const store = makeStore();
    const playerCount = store.getState().game.players.length;

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /Housemates/i })).toBeInTheDocument();
    expect(screen.getByLabelText(`${playerCount}/${playerCount} housemates`)).toBeInTheDocument();
  });

  it('opens the compact player info dialog on avatar tap', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const player = store
      .getState()
      .game.players.find((candidate) => {
        const enriched = enrichPlayer(candidate);
        return enriched.age !== undefined && Boolean(enriched.profession);
      });
    if (!player) {
      throw new Error('Expected at least one player with profile metadata');
    }
    const enrichedPlayer = enrichPlayer(player);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    await user.click(screen.getByRole('button', { name: new RegExp(player.name, 'i') }));

    expect(screen.getByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} info`, 'i') })).toBeInTheDocument();
    expect(screen.getByText(/Age/i)).toBeInTheDocument();
    expect(screen.getByText(/Occupation/i)).toBeInTheDocument();
  });
});
