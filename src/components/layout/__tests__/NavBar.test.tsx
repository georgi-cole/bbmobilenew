import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import gameReducer from '../../../store/gameSlice';
import profilesReducer from '../../../store/profilesSlice';
import NavBar from '../NavBar';

function renderNavBar(initialEntry = '/game') {
  const initialGameState = gameReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: {
      game: gameReducer,
      profiles: profilesReducer,
    },
    preloadedState: {
      game: {
        ...initialGameState,
        status: 'active' as const,
      },
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
  it('shows the updated bottom navigation labels once a game is active', () => {
    renderNavBar('/game');

    expect(screen.getByRole('button', { name: 'RULES' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'GAME' })).toBeNull();
    expect(screen.getByRole('button', { name: 'BOARD' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'USER' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'LEADERBOARD' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PROFILE' })).toBeNull();
  });

  it('hides the bottom navigation on non-game routes even during an active game', () => {
    renderNavBar('/profile');

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('hides the bottom navigation on the credits route', () => {
    renderNavBar('/credits');

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('disables bottom navigation buttons on the game-over route', () => {
    renderNavBar('/game-over');

    expect(screen.getByRole('button', { name: 'HOME' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'RULES' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'SETTINGS' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'BOARD' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'USER' })).toBeDisabled();
  });
});
