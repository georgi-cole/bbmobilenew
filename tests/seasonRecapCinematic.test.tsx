import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SeasonRecapCinematic from '../src/components/SeasonRecapCinematic/SeasonRecapCinematic';
import { buildSeasonRecapData } from '../src/components/SeasonRecapCinematic/seasonRecapData';
import type { Player } from '../src/types';
import type { PublicOpinionState } from '../src/publicOpinion/types';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const motion = new Proxy({}, {
    get: (_target, tag: string) => ({
      children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileTap: _whileTap, layoutId: _layoutId, ...props
    }: React.HTMLAttributes<HTMLElement> & Record<string, unknown>) =>
      React.createElement(tag, props, children),
  });
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: () => true,
  };
});

const PLAYERS: Player[] = [
  { id: 'f1', name: 'Avery', status: 'active', avatar: '🙂', stats: { lohWins: 2, posWins: 1, timesNominated: 1 } },
  { id: 'f2', name: 'Blake', status: 'active', avatar: '😎', stats: { lohWins: 1, posWins: 2, timesNominated: 2 } },
  { id: 'j1', name: 'Casey', status: 'jury', avatar: '🧠', seasonPlacement: 3, evictedAtWeek: 10, stats: { lohWins: 1, posWins: 0, timesNominated: 3 } },
  { id: 'e1', name: 'Drew', status: 'evicted', avatar: '🔥', seasonPlacement: 4, evictedAtWeek: 6, stats: { lohWins: 0, posWins: 1, timesNominated: 2 } },
];

const PUBLIC_OPINION: PublicOpinionState = {
  profiles: {
    f1: { playerId: 'f1', approval: 82, previousApproval: 74, seasonApprovals: [50, 61, 74, 82], completedDirectionCount: 1, cumulativePositiveDelta: 32 },
    f2: { playerId: 'f2', approval: 47, previousApproval: 55, seasonApprovals: [50, 59, 55, 47], completedDirectionCount: 0, cumulativePositiveDelta: 9 },
    j1: { playerId: 'j1', approval: 63, previousApproval: 58, seasonApprovals: [50, 55, 58, 63], completedDirectionCount: 0, cumulativePositiveDelta: 13 },
    e1: { playerId: 'e1', approval: 21, previousApproval: 39, seasonApprovals: [50, 45, 39, 21], completedDirectionCount: 0, cumulativePositiveDelta: 0 },
  },
  directions: [],
  feed: [],
  lastUpdatedWeek: 11,
  feedPostsThisDay: 0,
  currentFeedDay: 11,
};

function renderRecap(onComplete = vi.fn()) {
  render(
    <SeasonRecapCinematic
      season={9}
      week={12}
      players={PLAYERS}
      publicOpinion={PUBLIC_OPINION}
      onComplete={onComplete}
    />,
  );
  return onComplete;
}

function skipOpening() {
  fireEvent.click(screen.getByRole('button', { name: /skip opening/i }));
}

describe('Season recap archive', () => {
  it('uses the photoshoot and hidden moments as an automatic opening, then offers only awards and finale chapters', () => {
    renderRecap();

    expect(screen.getByRole('heading', { name: /they lefttheir mark/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /skip opening/i })).toBeTruthy();
    skipOpening();

    expect(screen.getByText('Choose the next chapter.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /enter ceremony/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open calendar/i })).toBeTruthy();
    expect(screen.getByLabelText(/opening chapters completed/i)).toBeTruthy();
    expect(screen.getByText('Final photoshoot')).toBeTruthy();
    expect(screen.getByText('Hidden moments')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /final photoshoot/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /hidden moments/i })).toBeNull();
  });

  it('opens an awards ceremony list before revealing the achievement-linked, formal winner result', () => {
    renderRecap();
    skipOpening();
    fireEvent.click(screen.getByRole('button', { name: /enter ceremony/i }));

    expect(screen.getByRole('list', { name: /season honor categories/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /compzilla/i }));

    expect(screen.getByText('COMPZILLA')).toBeTruthy();
    expect(screen.getByText('Avery')).toBeTruthy();
    expect(screen.getByText('3 comps won')).toBeTruthy();
    expect(screen.getByRole('button', { name: /all categories/i })).toBeTruthy();
  });

  it('uses a tappable season calendar that expands a selected event day', () => {
    renderRecap();
    skipOpening();
    fireEvent.click(screen.getByRole('button', { name: /open calendar/i }));

    expect(screen.getByLabelText(/event legend/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /days 29.*56/i }));
    const drewCheckpoint = screen.getByRole('button', { name: /day 42: drew, evicted/i });
    fireEvent.click(drewCheckpoint);

    expect(screen.queryByLabelText(/event legend/i)).toBeNull();
    expect(screen.getByText("Drew's season ended here.")).toBeTruthy();
    expect(screen.getByText('Comp wins')).toBeTruthy();
    expect(screen.queryByText(/house note/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /calendar/i }));
    expect(screen.getByRole('button', { name: /day 42: drew, evicted/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /days 57.*84/i }));
    fireEvent.click(screen.getByRole('button', { name: /day 69: jury phase, milestone/i }));
    expect(screen.getByText('Why it mattered')).toBeTruthy();
  });

  it('keeps the original category data and makes the comp result explicit', () => {
    const data = buildSeasonRecapData(PLAYERS, 12, PUBLIC_OPINION);
    expect(data.categories.map((category) => category.id)).toEqual([
      'compzilla',
      'head_honcho',
      'mess_factory',
      'ghost_mode',
      'vibe_curator',
      'heat_magnet',
    ]);
    expect(data.categories[0]?.winner.id).toBe('f1');
    expect(data.categories[0]?.winnerStat).toBe('3 comps won');
  });

  it('always allows an immediate exit', async () => {
    const onComplete = renderRecap();
    fireEvent.click(screen.getByRole('button', { name: /exit season recap/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
