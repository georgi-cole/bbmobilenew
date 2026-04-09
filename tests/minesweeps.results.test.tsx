import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Minesweeps from '../src/components/Minesweeps/Minesweeps';

vi.mock('../src/components/Minesweeps/minesweepsLogic', () => {
  const board = [[
    { mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false },
    { mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false },
  ]];

  return {
    MINESWEEPS_COLS: 2,
    MINESWEEPS_MINES: 0,
    MINESWEEPS_ROWS: 1,
    buildBoard: () => board,
    computeFinalScore: ({ won }: { won: boolean }) => (won ? 860 : 0),
    countFlags: () => 0,
    countRevealedSafeCells: (value: typeof board) => value.flat().filter((cell) => cell.revealed).length,
    countSafeCells: () => 2,
    createEmptyBoard: () => board,
    isBoardSolved: (value: typeof board) => value.flat().every((cell) => cell.revealed),
    revealAllMines: (value: typeof board) => value,
    revealCell: () => ({
      board: [[
        { mine: false, adjacent: 0, revealed: true, flagged: false, exploded: false },
        { mine: false, adjacent: 0, revealed: true, flagged: false, exploded: false },
      ]],
      hitMine: false,
    }),
    toggleFlag: (value: typeof board) => value,
  };
});

describe('Minesweeps competition results', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a ranked scoreboard before continuing and can place the human behind AI rivals', () => {
    const onFinish = vi.fn();

    render(
      <Minesweeps
        autoStart
        onFinish={onFinish}
        participants={[
          { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
          { id: 'ai-1', name: 'Nova', isHuman: false, precomputedScore: 900, previousPR: null },
          { id: 'ai-2', name: 'Rex', isHuman: false, precomputedScore: 780, previousPR: null },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole('gridcell')[0]);

    expect(screen.getByRole('heading', { name: 'Competition results' })).toBeInTheDocument();
    expect(screen.getByText('🏆 Nova wins this round.')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();

    const entries = screen.getAllByRole('listitem');
    expect(entries[0]?.textContent).toContain('Nova');
    expect(entries[1]?.textContent).toContain('You (you)');
    expect(entries[2]?.textContent).toContain('Rex');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onFinish).toHaveBeenCalledWith(860);
  });

  it('shows the human as the winner when their score tops the field', () => {
    render(
      <Minesweeps
        autoStart
        onFinish={vi.fn()}
        participants={[
          { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
          { id: 'ai-1', name: 'Nova', isHuman: false, precomputedScore: 800, previousPR: null },
          { id: 'ai-2', name: 'Rex', isHuman: false, precomputedScore: 780, previousPR: null },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole('gridcell')[0]);

    expect(screen.getByText('🏆 You take the round with 860 points.')).toBeInTheDocument();

    const entries = screen.getAllByRole('listitem');
    expect(entries[0]?.textContent).toContain('You (you)');
    expect(entries[1]?.textContent).toContain('Nova');
    expect(entries[2]?.textContent).toContain('Rex');
  });
});
