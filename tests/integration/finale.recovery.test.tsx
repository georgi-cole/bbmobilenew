import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import AppShell from '../../src/components/layout/AppShell';
import gameReducer from '../../src/store/gameSlice';
import finaleReducer from '../../src/store/finaleSlice';
import settingsReducer from '../../src/store/settingsSlice';
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../../src/types';

vi.mock('../../src/components/layout/NavBar', () => ({
  default: () => <div data-testid="nav-bar" />,
}));

vi.mock('../../src/components/DebugPanel/DebugPanel', () => ({
  default: () => null,
}));

vi.mock('../../src/components/SeasonFinale/SeasonFinaleOverlay', () => ({
  default: () => <div data-testid="season-finale-overlay" />,
}));

vi.mock('../../src/hooks/useGameMode', () => ({
  default: () => undefined,
}));

vi.mock('../../src/hooks/useSound', () => ({
  default: () => ({
    play: vi.fn(),
    playMusic: vi.fn(),
    stopMusic: vi.fn(),
  }),
}));

function makeStore() {
  const baseGame = gameReducer(undefined, { type: '@@INIT' }) as GameState;
  const baseFinale = finaleReducer(undefined, { type: '@@INIT' });

  const players: Player[] = [
    { id: 'user', name: 'You', avatar: '🧑', status: 'active', isUser: true },
    { id: 'runner', name: 'Blue', avatar: '🧑', status: 'active', isUser: false },
    { id: 'j1', name: 'Lux', avatar: '🧑', status: 'jury', isUser: false },
    { id: 'j2', name: 'Vee', avatar: '🧑', status: 'jury', isUser: false },
    { id: 'j3', name: 'Ash', avatar: '🧑', status: 'jury', isUser: false },
  ];

  return configureStore({
    reducer: {
      game: gameReducer,
      finale: finaleReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: {
        ...baseGame,
        phase: 'jury',
        season: 2,
        week: 12,
        seed: 77,
        players,
        seasonFinale: null,
      },
      finale: {
        ...baseFinale,
        isActive: false,
        finalistIds: ['user', 'runner'],
        jurorIds: ['j1', 'j2', 'j3'],
        revealOrder: ['j1', 'j2', 'j3'],
        votes: {
          j1: 'user',
          j2: 'runner',
          j3: 'user',
        },
        revealedCount: 3,
        winnerId: 'user',
        runnerUpId: 'runner',
        isComplete: true,
        hasStarted: true,
      },
    },
  });
}

describe('jury finale recovery', () => {
  it('re-enters the season finale flow when jury is complete but the app is left on the jury screen', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div data-testid="game-screen" />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('season-finale-overlay')).toBeInTheDocument();
      expect(store.getState().game.seasonFinale?.phase).toBe('winnerCinematic');
    });
    expect(store.getState().game.players.find((player) => player.id === 'user')?.isWinner).toBe(true);
  });
});
