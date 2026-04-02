import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SeasonRecapCinematic from '../src/components/SeasonRecapCinematic/SeasonRecapCinematic';
import type { Player } from '../src/types';
import type { PublicOpinionState } from '../src/publicOpinion/types';

const playMusic = vi.fn();
const stopMusic = vi.fn();

vi.mock('framer-motion', async () => {
  const React = await import('react');

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    },
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: () => false,
  };
});

vi.mock('../src/hooks/useSound', () => ({
  default: () => ({
    playMusic,
    stopMusic,
  }),
}));

const PLAYERS: Player[] = [
  {
    id: 'f1',
    name: 'Avery',
    status: 'active',
    avatar: '😀',
    stats: { hohWins: 2, povWins: 1, timesNominated: 1 },
  },
  {
    id: 'f2',
    name: 'Blake',
    status: 'active',
    avatar: '😎',
    stats: { hohWins: 1, povWins: 2, timesNominated: 2 },
  },
  {
    id: 'j1',
    name: 'Casey',
    status: 'jury',
    avatar: '🧠',
    seasonPlacement: 3,
    stats: { hohWins: 1, povWins: 0, timesNominated: 3 },
  },
  {
    id: 'e1',
    name: 'Drew',
    status: 'evicted',
    avatar: '🔥',
    seasonPlacement: 4,
    stats: { hohWins: 0, povWins: 1, timesNominated: 2 },
  },
];

const PUBLIC_OPINION: PublicOpinionState = {
  profiles: {
    f1: {
      playerId: 'f1',
      approval: 82,
      previousApproval: 74,
      seasonApprovals: [50, 61, 74, 82],
      completedDirectionCount: 1,
      cumulativePositiveDelta: 32,
    },
    f2: {
      playerId: 'f2',
      approval: 47,
      previousApproval: 55,
      seasonApprovals: [50, 59, 55, 47],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 9,
    },
    j1: {
      playerId: 'j1',
      approval: 63,
      previousApproval: 58,
      seasonApprovals: [50, 55, 58, 63],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 13,
    },
    e1: {
      playerId: 'e1',
      approval: 21,
      previousApproval: 39,
      seasonApprovals: [50, 45, 39, 21],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 0,
    },
  },
  directions: [],
  feed: [
    {
      id: 'headline-1',
      playerId: 'e1',
      text: 'Drew shocked the audience with a feud that swallowed the whole week.',
      delta: -21,
      week: 10,
      timestamp: 1001,
      isHeadline: true,
    },
    {
      id: 'headline-2',
      playerId: 'f1',
      text: 'Avery sent the ratings soaring with a power play nobody stopped talking about.',
      delta: 14,
      week: 11,
      timestamp: 1002,
      isHeadline: true,
    },
  ],
  lastUpdatedWeek: 11,
  feedPostsThisDay: 2,
  currentFeedDay: 11,
};

describe('SeasonRecapCinematic', () => {
  const PREVIOUS_TOTAL_RECAP_DURATION_MS = 2200 + 3000 + 3400 + 3400 + 4200 + 2200 + 420;

  beforeEach(() => {
    vi.useFakeTimers();
    playMusic.mockClear();
    stopMusic.mockClear();
    if (!window.matchMedia) {
      const matchMediaMock = vi.fn<(query: string) => MediaQueryList>().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      window.matchMedia = matchMediaMock;
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the opening sting with trailer-style copy', () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText('The Road to the Finale')).toBeTruthy();
    expect(screen.getByText('12 weeks of chaos. One last decision.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('skips cleanly and finishes the recap', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip recap' }));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(playMusic).toHaveBeenCalledWith('music:season_recap');
    expect(stopMusic).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps the recap on screen beyond the previous shorter timing', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        onComplete={onComplete}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(PREVIOUS_TOTAL_RECAP_DURATION_MS + 500);
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Skip recap' })).toBeTruthy();
  });

  it('shows public meter and press coverage when public data exists', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={onComplete}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.getByText('Public Meter')).toBeTruthy();
    expect(screen.getByText('Top Rating')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(6100);
    });

    expect(screen.getByText('The Big Eye Bulletin')).toBeTruthy();
    expect(screen.getByText('House Watch Daily')).toBeTruthy();
    expect(screen.getByText(/Avery becomes the people’s headline/i)).toBeTruthy();
    expect(screen.getByText(/Drew could not outrun the backlash/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('falls back to gameplay stats when public data is unavailable', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={undefined}
        onComplete={onComplete}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.getByText('Safeties Won')).toBeTruthy();
    expect(screen.getByText('Houseguests')).toBeTruthy();
    expect(screen.queryByText('Public Meter')).toBeNull();
    expect(screen.queryByText('Top Rating')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('uses tribunal wording in the finale scene', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={onComplete}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    await act(async () => {
      vi.advanceTimersByTime(6100);
    });

    await act(async () => {
      vi.advanceTimersByTime(6900);
    });

    expect(screen.getByText('Shockwave')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(6900);
    });

    await act(async () => {
      vi.advanceTimersByTime(8500);
    });

    expect(screen.getByText('The tribunal decides.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
