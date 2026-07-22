import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import gameReducer from '../src/store/gameSlice';
import profilesReducer from '../src/store/profilesSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import finaleReducer from '../src/store/finaleSlice';
import GameRoute from '../src/routes/GameRoute';
import { createSurvivorRun, terminalizeSurvivorRun } from '../src/modes/survivorRun';

vi.mock('../src/screens/GameScreen/GameScreen', () => ({
  default: () => <div>Game Screen</div>,
}));

function makeStore(gameOverrides: Record<string, unknown>) {
  const baseGame = gameReducer(undefined, { type: '@@INIT' });
  const baseSettings = settingsReducer(undefined, { type: '@@INIT' });
  const baseProfiles = profilesReducer(undefined, { type: '@@INIT' });
  const basePublicOpinion = publicOpinionReducer(undefined, { type: '@@INIT' });
  const baseFinale = finaleReducer(undefined, { type: '@@INIT' });

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
      publicOpinion: publicOpinionReducer,
      finale: finaleReducer,
    },
    preloadedState: {
      game: {
        ...baseGame,
        ...gameOverrides,
      },
      settings: baseSettings,
      profiles: baseProfiles,
      publicOpinion: basePublicOpinion,
      finale: baseFinale,
    },
  });
}

describe('GameRoute', () => {
  it('keeps terminal survivor runs on the game screen for the soft elimination flow', async () => {
    const terminalSurvivor = terminalizeSurvivorRun(createSurvivorRun());
    const store = makeStore(terminalSurvivor as Record<string, unknown>);

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game']}>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/game" element={<GameRoute />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText('Game Screen')).toBeInTheDocument();
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('still returns to home for non-survivor inactive runs', async () => {
    const store = makeStore({
      status: 'failed',
      mode: 'classic',
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game']}>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/game" element={<GameRoute />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
    expect(screen.queryByText('Game Screen')).toBeNull();
  });
});
