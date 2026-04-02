import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicFavoriteOverlay from '../../src/components/PublicFavoriteOverlay/PublicFavoriteOverlay';
import type { Player } from '../../src/types';
import { useBattleBackVoting } from '../../src/hooks/useBattleBackVoting';

vi.mock('../../src/hooks/useBattleBackVoting', () => ({
  useBattleBackVoting: vi.fn(),
}));

const mockedUseBattleBackVoting = vi.mocked(useBattleBackVoting);

const PLAYERS: Player[] = [
  {
    id: 'p1',
    name: 'Jordan',
    avatar: '🧑',
    status: 'evicted',
    isUser: false,
  },
  {
    id: 'p2',
    name: 'Taylor',
    avatar: '🧑',
    status: 'evicted',
    isUser: false,
  },
];

describe('PublicFavoriteOverlay', () => {
  it('uses generic public copy during voting', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p1: 55, p2: 45 },
      eliminated: [],
      winnerId: null,
      isComplete: false,
    });

    render(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={1}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText(/live public vote/i)).toBeInTheDocument();
    expect(screen.getByText(/the public is voting for their favorite player/i)).toBeInTheDocument();
    expect(screen.queryByText(/america/i)).not.toBeInTheDocument();
  });

  it('shows Eyeoleans on the winner card', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p1: 60, p2: 40 },
      eliminated: ['p2'],
      winnerId: 'p1',
      isComplete: true,
    });

    render(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={1}
        awardAmount={25000}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText("Public's Favorite Player")).toBeInTheDocument();
    expect(screen.getByText('Wins 25,000 Eyeoleans!')).toBeInTheDocument();
    expect(screen.getByText(/congratulations from the public/i)).toBeInTheDocument();
    expect(screen.queryByText(/america/i)).not.toBeInTheDocument();
  });
});
