import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import gameReducer from '../../../store/gameSlice';
import NavBar from '../NavBar';

function renderNavBar(initialEntry = '/game') {
  const store = configureStore({
    reducer: {
      game: gameReducer,
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <NavBar />
      </MemoryRouter>
    </Provider>,
  );
}

describe('NavBar', () => {
  it('shows the updated bottom navigation labels', () => {
    renderNavBar('/game');

    expect(screen.getByRole('button', { name: 'RULES' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'GAME' })).toBeNull();
    expect(screen.getByRole('button', { name: 'BOARD' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'USER' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'LEADERBOARD' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PROFILE' })).toBeNull();
  });

  it('hides the bottom navigation on the credits route', () => {
    renderNavBar('/credits');

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
});
