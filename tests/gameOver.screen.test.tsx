import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GameOver from '../src/screens/GameOver/GameOver';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import profilesReducer from '../src/store/profilesSlice';

function makeStore() {
  const baseGame = gameReducer(undefined, { type: '@@INIT' });
  const baseSettings = settingsReducer(undefined, { type: '@@INIT' });
  const baseProfiles = profilesReducer(undefined, { type: '@@INIT' });
  const players = baseGame.players.map((player) =>
    player.isUser
      ? {
          ...player,
          finalRank: 1,
          isWinner: true,
          stats: {
            ...player.stats,
            lohWins: 2,
            posWins: 1,
          },
        }
      : player,
  );

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
    },
    preloadedState: {
      game: {
        ...baseGame,
        season: 3,
        players,
        seasonArchives: [],
      },
      settings: baseSettings,
      profiles: baseProfiles,
    },
  });
}

describe('GameOver screen', () => {
  it('archives the completed season before exiting home', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/gameover']}>
          <Routes>
            <Route path="/" element={<div>Home route</div>} />
            <Route path="/gameover" element={<GameOver />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /exit to home/i }));

    await waitFor(() => {
      expect(screen.getByText('Home route')).toBeInTheDocument();
    });

    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives).toHaveLength(1);
    expect(archives[0].seasonIndex).toBe(3);
    expect(archives[0].playerSummaries.some((summary) => summary.playerId === 'user')).toBe(true);
  });
});
