import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router';
import GameOver from '../src/screens/GameOver/GameOver';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import profilesReducer from '../src/store/profilesSlice';
import type { Player } from '../src/types';

function makeStore(gameOverrides: Record<string, unknown> = {}) {
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
        ...gameOverrides,
      },
      settings: baseSettings,
      profiles: baseProfiles,
    },
  });
}

describe('GameOver screen', () => {
  it('archives the completed season and resets finale state before exiting home', async () => {
    const store = makeStore({
      week: 8,
      phase: 'jury',
      seasonFinale: {
        phase: 'seasonComplete',
        winnerId: 'user',
        interviewIndex: 0,
        goodbyeIndex: 0,
        isChatOpen: false,
        isLightsOffAnimating: false,
        publicFavoriteEnabled: true,
      },
    });

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

    expect(document.querySelector('.gameover-champion-record__trophy')).toBeInTheDocument();
    expect(document.querySelector('.gameover-champion-record__stats')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^home$/i }));

    await waitFor(() => {
      expect(screen.getByText('Home route')).toBeInTheDocument();
    });

    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives).toHaveLength(1);
    expect(archives[0].seasonIndex).toBe(3);
    expect(archives[0].playerSummaries.some((summary) => summary.playerId === 'user')).toBe(true);
    expect(store.getState().game.phase).toBe('season_start');
    expect(store.getState().game.seasonFinale).toBeNull();
  });

  it('resets the current game before starting a new season', async () => {
    const store = makeStore({
      week: 7,
      phase: 'nominations',
    });

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

    fireEvent.click(screen.getByRole('button', { name: /^new season$/i }));

    await waitFor(() => {
      expect(screen.getByText('Home route')).toBeInTheDocument();
    });

    expect(store.getState().game.week).toBe(1);
    expect(store.getState().game.phase).toBe('season_start');

    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives).toHaveLength(1);
    expect(archives[0].seasonIndex).toBe(3);
  });

  it('archives include weeksAlive for all players', async () => {
    // Game at week 8 — a mid-season snapshot where some players were evicted
    const baseGame = gameReducer(undefined, { type: '@@INIT' });
    const baseSettings = settingsReducer(undefined, { type: '@@INIT' });
    const baseProfiles = profilesReducer(undefined, { type: '@@INIT' });

    const playersWithEvictions: Player[] = baseGame.players.map((p, i) => {
      if (p.isUser) {
        // Winner — not evicted, no evictedAtWeek → weeksAlive falls back to game.week
        return { ...p, finalRank: 1, isWinner: true, stats: { lohWins: 3, posWins: 2, timesNominated: 1 } };
      }
      if (i === 1) {
        // Runner-up
        return { ...p, finalRank: 2 };
      }
      // Evicted players — stamp an eviction week
      return { ...p, status: 'evicted' as const, evictedAtWeek: i + 1 };
    });

    const store = configureStore({
      reducer: { game: gameReducer, settings: settingsReducer, profiles: profilesReducer },
      preloadedState: {
        game: { ...baseGame, season: 2, week: 8, players: playersWithEvictions, seasonArchives: [] },
        settings: baseSettings,
        profiles: baseProfiles,
      },
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/gameover']}>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/gameover" element={<GameOver />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^home$/i }));
    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());

    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives).toHaveLength(1);

    const userSummary = archives[0].playerSummaries.find((s) => s.playerId === 'user');
    expect(userSummary).toBeDefined();
    // Winner was never evicted → weeksAlive falls back to game.week (8)
    expect(userSummary?.weeksAlive).toBe(8);
    expect(userSummary?.daysAlive).toBe(8);
    expect(userSummary?.lohWins).toBe(3);
    expect(userSummary?.posWins).toBe(2);
    expect(userSummary?.finalPlacement).toBe(1);

    // Evicted players should have their stamped evictedAtWeek as weeksAlive
    const evictedSummary = archives[0].playerSummaries.find((s) => {
      const player = playersWithEvictions.find((p) => p.id === s.playerId);
      return player?.evictedAtWeek !== undefined;
    });
    const expectedWeeksAlive = evictedSummary
      ? playersWithEvictions.find((p) => p.id === evictedSummary.playerId)?.evictedAtWeek
      : undefined;
    expect(evictedSummary?.weeksAlive).toBe(expectedWeeksAlive);
    expect(evictedSummary?.daysAlive).toBe(expectedWeeksAlive);
  });

  it('archives include survivedDoubleEviction for players who survived a double eviction week', async () => {
    const baseGame = gameReducer(undefined, { type: '@@INIT' });
    const baseSettings = settingsReducer(undefined, { type: '@@INIT' });
    const baseProfiles = profilesReducer(undefined, { type: '@@INIT' });

    // Mark some players as having survived a double eviction
    const players: Player[] = baseGame.players.map((p, i) => {
      if (p.isUser) {
        return {
          ...p,
          finalRank: 1,
          isWinner: true,
          stats: { lohWins: 1, posWins: 0, timesNominated: 0, survivedDoubleEviction: true },
        };
      }
      if (i === 1) return { ...p, finalRank: 2, stats: { lohWins: 0, posWins: 1, timesNominated: 0, survivedDoubleEviction: true } };
      return { ...p, status: 'evicted' as const };
    });

    const store = configureStore({
      reducer: { game: gameReducer, settings: settingsReducer, profiles: profilesReducer },
      preloadedState: {
        game: { ...baseGame, season: 1, week: 10, players, seasonArchives: [] },
        settings: baseSettings,
        profiles: baseProfiles,
      },
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/gameover']}>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/gameover" element={<GameOver />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^home$/i }));
    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());

    const archives = store.getState().game.seasonArchives ?? [];
    const userSummary = archives[0].playerSummaries.find((s) => s.playerId === 'user');
    expect(userSummary?.survivedDoubleEviction).toBe(true);

    // Players without the flag should not have survivedDoubleEviction
    const evictedSummary = archives[0].playerSummaries.find(
      (s) => s.isEvicted,
    );
    expect(evictedSummary?.survivedDoubleEviction).toBeUndefined();
  });

  it('opens the aftermath ad prompt and enters the aftermath sequence after the fake ad', async () => {
    const store = makeStore({
      week: 9,
      phase: 'jury',
      seasonFinale: {
        phase: 'seasonComplete',
        winnerId: 'user',
        interviewIndex: 0,
        goodbyeIndex: 0,
        isChatOpen: false,
        isLightsOffAnimating: false,
        publicFavoriteEnabled: false,
      },
    });

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

    fireEvent.click(screen.getByRole('button', { name: /^aftermath$/i }));

    expect(screen.getByText('Aftermath Special')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^watch ad$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Aftermath Special')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^aftermath$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^watch ad$/i }));

    await waitFor(() => {
      expect(screen.getByText('Late Edition')).toBeInTheDocument();
      expect(screen.getByText(/What happened next/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^results$/i })).toBeInTheDocument();
    });

    const aftermathScroller = document.querySelector('.gameover-aftermath__scroll');
    const aftermathActions = document.querySelector('.gameover-aftermath__actions');
    expect(aftermathScroller).toBeInTheDocument();
    expect(aftermathActions).toBeInTheDocument();
    expect(aftermathScroller?.contains(aftermathActions)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled();
  });
});
