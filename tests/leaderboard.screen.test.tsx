import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Leaderboard from '../src/screens/Leaderboard/Leaderboard';
import gameReducer from '../src/store/gameSlice';

function makeStore(overrides: Record<string, unknown> = {}) {
  const initialGameState = gameReducer(undefined, { type: '@@INIT' });
  return configureStore({
    reducer: {
      game: gameReducer,
    },
    preloadedState: {
      game: {
        ...initialGameState,
        ...overrides,
      },
    },
  });
}

function renderLeaderboard(store = makeStore()) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/leaderboard']}>
        <Routes>
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('Leaderboard screen', () => {
  it('uses the back button to return to the previous route', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game', '/leaderboard']} initialIndex={1}>
          <Routes>
            <Route path="/game" element={<div>Game route</div>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    await waitFor(() => {
      expect(screen.getByText('Game route')).toBeInTheDocument();
    });
  });

  it('shows archived past winners', () => {
    const store = makeStore({
      seasonArchives: [
        {
          seasonIndex: 3,
          seasonId: 'season-3',
          playerSummaries: [
            { playerId: 'p1', displayName: 'Georgi Cole', finalPlacement: 1 },
            { playerId: 'p2', displayName: 'Mimi', finalPlacement: 2 },
          ],
        },
      ],
    });

    renderLeaderboard(store);

    fireEvent.click(screen.getByRole('button', { name: /past winners/i }));

    expect(screen.getByText('Season 3')).toBeInTheDocument();
    expect(screen.getByText('Georgi Cole')).toBeInTheDocument();
    expect(screen.getByText('4.8M viewers')).toBeInTheDocument();
  });

  it('shows only the first name when the winner has no last name', () => {
    const store = makeStore({
      seasonArchives: [
        {
          seasonIndex: 4,
          seasonId: 'season-4',
          playerSummaries: [
            { playerId: 'p1', displayName: 'Mimi', finalPlacement: 1 },
          ],
        },
      ],
    });

    renderLeaderboard(store);

    fireEvent.click(screen.getByRole('button', { name: /past winners/i }));

    expect(screen.getByText('Season 4')).toBeInTheDocument();
    expect(screen.getByText('Mimi')).toBeInTheDocument();
    expect(screen.getByText('6.1M viewers')).toBeInTheDocument();
  });

  it('shows N/A when an archived season has no recorded winner', () => {
    const store = makeStore({
      seasonArchives: [
        {
          seasonIndex: 2,
          seasonId: 'season-2',
          playerSummaries: [
            { playerId: 'p3', displayName: 'Rune', finalPlacement: 2 },
            { playerId: 'p4', displayName: 'Ash', finalPlacement: 3 },
          ],
        },
      ],
    });

    renderLeaderboard(store);

    fireEvent.click(screen.getByRole('button', { name: /past winners/i }));

    expect(screen.getByText('Season 2')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});
