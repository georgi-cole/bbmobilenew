import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Leaderboard from '../src/screens/Leaderboard/Leaderboard';
import gameReducer from '../src/store/gameSlice';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
    },
  });
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
});
