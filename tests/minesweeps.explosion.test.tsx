import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Minesweeps from '../src/components/Minesweeps/Minesweeps';
import { buildBoard, MINESWEEPS_COLS, MINESWEEPS_ROWS } from '../src/components/Minesweeps/minesweepsLogic';

/**
 * Regression test for the "hit a bomb → game hangs, no way to continue" bug.
 *
 * The first reveal is always safe, so the board is rebuilt around the first
 * clicked cell. We then click a known mine and assert that the game ends and
 * presents a reachable Continue button that forwards the final score.
 */
describe('Minesweeps explosion ends the game with a reachable Continue', () => {
  it('shows the results overlay and Continue button after hitting a mine', () => {
    const onFinish = vi.fn();
    const seed = 1;

    render(
      <Minesweeps
        autoStart
        seed={seed}
        onFinish={onFinish}
        participants={[
          { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
          { id: 'ai-1', name: 'Nova', isHuman: false, precomputedScore: 400, previousPR: null },
        ]}
      />,
    );

    const cells = () => screen.getAllByRole('gridcell');

    // First reveal at (0,0) is forced safe and rebuilds the board around it.
    fireEvent.click(cells()[0]);

    // Locate a mine on the post-first-click board and detonate it.
    const board = buildBoard({ seed, safeCell: { row: 0, col: 0 } });
    let mineIndex = -1;
    for (let r = 0; r < MINESWEEPS_ROWS && mineIndex < 0; r += 1) {
      for (let c = 0; c < MINESWEEPS_COLS; c += 1) {
        if (board[r][c].mine) {
          mineIndex = r * MINESWEEPS_COLS + c;
          break;
        }
      }
    }
    expect(mineIndex).toBeGreaterThanOrEqual(0);

    fireEvent.click(cells()[mineIndex]);

    // Game must end with a visible scoreboard and a working Continue button.
    expect(screen.getByRole('heading', { name: 'Competition results' })).toBeInTheDocument();
    const continueBtn = screen.getByRole('button', { name: 'Continue' });
    expect(continueBtn).toBeInTheDocument();

    fireEvent.click(continueBtn);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
