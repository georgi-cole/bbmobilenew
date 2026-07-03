import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import gameReducer from '../../src/store/gameSlice';
import GameRouteGate from '../../src/routes/GameRouteGate';

vi.mock('../../src/screens/GameScreen/GameScreen', () => ({
  default: () => <div data-testid="game-screen" />,
}));

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
    },
  });
}

function renderGameRoute(store = makeStore()) {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/game']}>
        <Routes>
          <Route path="/" element={<div data-testid="home-hub" />} />
          <Route path="/game" element={<GameRouteGate />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

describe('GameRouteGate', () => {
  it('redirects direct /game visits when no active run exists', async () => {
    renderGameRoute();

    expect(await screen.findByTestId('home-hub')).toBeTruthy();
    expect(screen.queryByTestId('game-screen')).toBeNull();
  });

  it('renders the game when an active run exists', async () => {
    const store = makeStore();
    store.dispatch({ type: 'game/resetGame' });

    renderGameRoute(store);

    expect(await screen.findByTestId('game-screen')).toBeTruthy();
    expect(screen.queryByTestId('home-hub')).toBeNull();
  });
});
