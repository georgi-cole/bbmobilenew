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
    const surgeList = screen.getByRole('list', { name: /eligible players for audience surge/i });
    expect(within(surgeList).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText(/live audience percentages update in real time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/one player wins the grand prize/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/america/i)).not.toBeInTheDocument();
  });

  it('shows a skip control during the intro and lets the user select a boost target immediately', () => {
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

    expect(screen.getByRole('button', { name: /skip animation/i })).toBeInTheDocument();

    const surgeList = screen.getByRole('list', { name: /eligible players for audience surge/i });
    const taylorChip = within(surgeList).getByRole('button', { name: /taylor/i });

    expect(taylorChip).toBeEnabled();
    fireEvent.click(taylorChip);
    expect(screen.getByRole('button', { name: /watch to boost taylor/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /skip animation/i }));

    expect(screen.queryByRole('button', { name: /skip animation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /watch to boost taylor/i })).toBeEnabled();
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

  it('keeps the houseguest spotlight decoupled from vote ranking changes', () => {
    mockedUseBattleBackVoting
      .mockReturnValueOnce({
        votes: { p1: 10, p2: 70, p3: 20 },
        eliminated: [],
        winnerId: null,
        isComplete: false,
      })
      .mockReturnValueOnce({
        votes: { p1: 5, p2: 15, p3: 80 },
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

    let spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    expect(within(spotlight).getByRole('heading', { name: 'Jordan' })).toBeInTheDocument();
    expect(within(spotlight).queryByText(/current front-runner/i)).not.toBeInTheDocument();

    rerender(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={2}
        onComplete={vi.fn()}
      />,
    );

    spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    expect(within(spotlight).getByRole('heading', { name: 'Jordan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /morgan, rank 1, 80%/i })).toBeInTheDocument();
  });

  it('rotates the spotlight on its own calm timer and skips eliminated candidates', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p1: 10, p2: 70, p3: 20 },
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

    let spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    expect(within(spotlight).getByRole('heading', { name: 'Jordan' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    expect(within(spotlight).getByRole('heading', { name: 'Jordan' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    expect(within(spotlight).getByRole('heading', { name: 'Taylor' })).toBeInTheDocument();
  });

  it('removes vote-eliminated players from the spotlight pool and marks the final two', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p1: 0, p2: 55, p3: 45 },
      eliminated: ['p1'],
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

    const spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    expect(within(spotlight).getByText(/final two: Taylor vs Morgan/i)).toBeInTheDocument();
    expect(within(spotlight).getByRole('heading', { name: 'Taylor' })).toBeInTheDocument();
    expect(within(spotlight).queryByRole('heading', { name: 'Jordan' })).not.toBeInTheDocument();
  });

  it('uses a different biography fact when the spotlight pool cycles back', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { finn: 34, mimi: 33, rae: 33 },
      eliminated: [],
      winnerId: null,
      isComplete: false,
    });
    const profilePlayers: Player[] = [
      { id: 'finn', name: 'Finn', avatar: '🧑', status: 'active' },
      { id: 'mimi', name: 'Mimi', avatar: '🧑', status: 'active' },
      { id: 'rae', name: 'Rae', avatar: '🧑', status: 'active' },
    ];

    render(
      <PublicFavoriteOverlay
        candidates={profilePlayers}
        seed={1}
        onComplete={vi.fn()}
      />,
    );

    let spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    const firstFinnFact = within(spotlight).getByText(/marine architect/i).textContent;

    act(() => {
      vi.advanceTimersByTime(12000);
    });

    spotlight = screen.getByRole('region', { name: /houseguest spotlight/i });
    expect(within(spotlight).getByRole('heading', { name: 'Finn' })).toBeInTheDocument();
    expect(spotlight.textContent).not.toContain(firstFinnFact);
  });
});
