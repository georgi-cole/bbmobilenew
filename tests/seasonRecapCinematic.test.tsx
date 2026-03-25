import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SeasonRecapCinematic from '../src/components/SeasonRecapCinematic/SeasonRecapCinematic';
import type { Player } from '../src/types';

const playMusic = vi.fn();
const stopMusic = vi.fn();

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
    expect(screen.getByText('The Road to the Finale')).toBeTruthy();
  });
});
