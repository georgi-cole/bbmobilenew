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
  it('shows Rules instead of Game in the bottom navigation', () => {
    renderNavBar('/game');

    expect(screen.getByRole('button', { name: 'RULES' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'GAME' })).toBeNull();
  });
});
