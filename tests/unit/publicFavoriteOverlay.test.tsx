import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  {
    id: 'p3',
    name: 'Morgan',
    avatar: '🧑',
    status: 'evicted',
    isUser: false,
  },
];

describe('PublicFavoriteOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders the broadcast header and audience surge panel during voting', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p1: 41, p2: 34, p3: 25 },
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

    expect(screen.getAllByText(/live public vote/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/public favorite player/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1700);
    });

    expect(screen.getByText(/audience surge/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /watch to boost jordan/i })).toBeInTheDocument();
    expect(screen.getByText(/results board/i)).toBeInTheDocument();
    expect(screen.queryByText(/live audience percentages update in real time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/one player wins the grand prize/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/america/i)).not.toBeInTheDocument();
  });

  it('requests audience surge only once and shows the active state', async () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p1: 38, p2: 35, p3: 27 },
      eliminated: [],
      winnerId: null,
      isComplete: false,
    });

    const onAudienceSurgeRequest = vi.fn().mockResolvedValue(true);

    render(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={1}
        onComplete={vi.fn()}
        onAudienceSurgeRequest={onAudienceSurgeRequest}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1700);
    });

    const cta = screen.getByRole('button', { name: /watch to boost jordan/i });

    await act(async () => {
      fireEvent.click(cta);
      fireEvent.click(cta);
    });

    expect(onAudienceSurgeRequest).toHaveBeenCalledTimes(1);
    expect(onAudienceSurgeRequest).toHaveBeenCalledWith('p1');
    expect(screen.getAllByText(/audience surge active/i).length).toBeGreaterThan(0);
  });

  it('shows the polished winner reveal with the prize amount', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p1: 62, p2: 38, p3: 0 },
      eliminated: ['p3', 'p2'],
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

    expect(screen.getByText(/final reveal/i)).toBeInTheDocument();
    expect(screen.getByText("Public's Favorite Player")).toBeInTheDocument();
    expect(screen.getByText('Wins 25,000 Eyeoleans!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('replaces percentage text cleanly when vote totals update', () => {
    mockedUseBattleBackVoting
      .mockReturnValueOnce({
        votes: { p1: 41, p2: 34, p3: 25 },
        eliminated: [],
        winnerId: null,
        isComplete: false,
      })
      .mockReturnValueOnce({
        votes: { p1: 39, p2: 36, p3: 25 },
        eliminated: [],
        winnerId: null,
        isComplete: false,
      });

    const { rerender } = render(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={1}
        onComplete={vi.fn()}
      />,
    );

    rerender(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={2}
        onComplete={vi.fn()}
      />,
    );

    const resultsBoard = screen.getByRole('region', { name: /public vote ranking board/i });

    expect(within(resultsBoard).getByRole('button', { name: /jordan, rank 1, 39%/i })).toBeInTheDocument();
    expect(within(resultsBoard).queryByText('41%')).not.toBeInTheDocument();
    expect(within(resultsBoard).queryByText('34%')).not.toBeInTheDocument();
  });
});
