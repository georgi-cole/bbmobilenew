import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router';
import gameReducer from '../../../store/gameSlice';
import challengeReducer, { type PendingChallenge } from '../../../store/challengeSlice';
import profilesReducer from '../../../store/profilesSlice';
import type { GameState, MinigameSession } from '../../../types';
import NavBar from '../NavBar';


function buildPendingChallenge(participants: string[] = ['user']): PendingChallenge {
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
    participants,
    phase: 'rules',
    aiScores: {},
  };
}

function buildPendingMinigame(participants: string[] = ['user']): MinigameSession {
  return {
    key: 'quickTap',
    participants,
    seed: 1,
    options: { timeLimit: 30 },
    aiScores: {},
  };
}

function renderNavBar(
  initialEntry = '/game',
  options: {
    challengePending?: boolean;
    challengeParticipants?: string[];
    pendingMinigame?: boolean;
    pendingMinigameParticipants?: string[];
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
        ...(options.pendingMinigame ? { pendingMinigame: buildPendingMinigame(options.pendingMinigameParticipants) } : {}),
        ...options.gameOverrides,
      },
      challenge: options.challengePending
        ? { ...initialChallengeState, pending: buildPendingChallenge(options.challengeParticipants) }
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

  it('keeps bottom navigation available for an evicted classic spectator during an AI-only challenge', () => {
    renderNavBar('/game', {
      challengePending: true,
      challengeParticipants: ['p1', 'p2'],
      gameOverrides: {
        players: [
          { id: 'user', name: 'You', avatar: '🙂', status: 'evicted', isUser: true },
          { id: 'p1', name: 'Ari', avatar: '🙂', status: 'active', isUser: false },
          { id: 'p2', name: 'Bo', avatar: '🙂', status: 'active', isUser: false },
        ],
      },
    });

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'HOME' })).toBeDefined();
  });

  it('hides the bottom navigation while a native minigame session is active', () => {
    renderNavBar('/game', { pendingMinigame: true });

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('keeps bottom navigation available when a native minigame excludes the evicted user', () => {
    renderNavBar('/game', {
      pendingMinigame: true,
      pendingMinigameParticipants: ['p1', 'p2'],
      gameOverrides: {
        players: [
          { id: 'user', name: 'You', avatar: '🙂', status: 'jury', isUser: true },
          { id: 'p1', name: 'Ari', avatar: '🙂', status: 'active', isUser: false },
          { id: 'p2', name: 'Bo', avatar: '🙂', status: 'active', isUser: false },
        ],
      },
    });

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeDefined();
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

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
});
