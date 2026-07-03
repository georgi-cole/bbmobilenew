import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import gameReducer from '../../../store/gameSlice';
import challengeReducer, { type PendingChallenge } from '../../../store/challengeSlice';
import profilesReducer from '../../../store/profilesSlice';
import type { GameState, MinigameSession } from '../../../types';
import NavBar from '../NavBar';

function buildPendingChallenge(): PendingChallenge {
  return {
    id: 'challenge-1',
    game: {
      key: 'majority_rules',
      title: 'Majority Rules',
      implementation: 'react',
      reactComponentKey: 'MajorityRules',
      retired: false,
    } as PendingChallenge['game'],
    seed: 1,
    participants: ['user'],
    phase: 'rules',
    aiScores: {},
  };
}

function buildPendingMinigame(): MinigameSession {
  return {
    key: 'quickTap',
    participants: ['user'],
    seed: 1,
    options: { timeLimit: 30 },
    aiScores: {},
  };
}

function renderNavBar(
  initialEntry = '/game',
  options: {
    challengePending?: boolean;
    pendingMinigame?: boolean;
    gameOverrides?: Partial<GameState>;
  } = {},
) {
  const initialGameState = gameReducer(undefined, { type: '@@INIT' });
  const initialChallengeState = challengeReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      profiles: profilesReducer,
    },
    preloadedState: {
      game: {
        ...initialGameState,
        status: 'active' as const,
        ...(options.pendingMinigame ? { pendingMinigame: buildPendingMinigame() } : {}),
        ...options.gameOverrides,
      },
      challenge: options.challengePending
        ? { ...initialChallengeState, pending: buildPendingChallenge() }
        : initialChallengeState,
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

  it('hides the bottom navigation while a challenge rules modal is active', () => {
    renderNavBar('/game', { challengePending: true });

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('hides the bottom navigation while a native minigame session is active', () => {
    renderNavBar('/game', { pendingMinigame: true });

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('hides the bottom navigation during the tribunal-style jury sequence', () => {
    renderNavBar('/game', { gameOverrides: { phase: 'jury' as const } });

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('hides the bottom navigation during the season finale recap', () => {
    renderNavBar('/game', {
      gameOverrides: {
        seasonFinale: {
          phase: 'winnerCinematic',
          winnerId: 'user',
          interviewIndex: 0,
          goodbyeIndex: 0,
          isChatOpen: false,
          isLightsOffAnimating: false,
          publicFavoriteEnabled: false,
        } as NonNullable<GameState['seasonFinale']>,
      },
    });

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
