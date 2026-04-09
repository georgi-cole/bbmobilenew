import { describe, expect, it } from 'vitest';
import { getMinigameAiModel } from '../src/ai/competition';
import { getGame } from '../src/minigames/registry';
import reactComponents from '../src/minigames/reactComponents';
import {
  buildBoard,
  computeFinalScore,
  countRevealedSafeCells,
  revealCell,
} from '../src/components/Minesweeps/minesweepsLogic';

describe('minesweeps registry entry', () => {
  it('uses the React architecture', () => {
    const entry = getGame('minesweeps');
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('Minesweeps');
    expect(entry?.legacy).toBe(false);
    expect((entry as Record<string, unknown>)?.modulePath).toBeUndefined();
  });

  it('is registered in the generic react components map', () => {
    expect(reactComponents['Minesweeps']).toBeDefined();
    expect(typeof reactComponents['Minesweeps']).toBe('function');
  });
});

describe('minesweeps logic helpers', () => {
  it('builds a deterministic board and keeps the first chosen cell safe', () => {
    const boardA = buildBoard({ seed: 42, safeCell: { row: 0, col: 0 } });
    const boardB = buildBoard({ seed: 42, safeCell: { row: 0, col: 0 } });

    expect(boardA[0][0].mine).toBe(false);
    expect(boardA.flat().map((cell) => cell.mine)).toEqual(boardB.flat().map((cell) => cell.mine));
  });

  it('flood reveals empty zones', () => {
    const board = buildBoard({
      rows: 3,
      cols: 3,
      mines: 0,
      seed: 7,
      safeCell: { row: 1, col: 1 },
    });

    const revealed = revealCell(board, 1, 1);
    expect(revealed.hitMine).toBe(false);
    expect(countRevealedSafeCells(revealed.board)).toBe(9);
  });

  it('keeps the score on the canonical 0-1000 scale', () => {
    expect(
      computeFinalScore({
        won: true,
        revealedSafeCells: 71,
        totalSafeCells: 71,
        elapsedMs: 15_000,
      }),
    ).toBe(980);

    expect(
      computeFinalScore({
        won: true,
        revealedSafeCells: 71,
        totalSafeCells: 71,
        elapsedMs: 180_000,
      }),
    ).toBe(650);

    expect(
      computeFinalScore({
        won: false,
        revealedSafeCells: 18,
        totalSafeCells: 72,
      }),
      // Math.round((18 / 72) * 50) * 10 = 130 on the 0-1000 scale.
    ).toBe(130);
  });

  it('clamps over-reported progress to the maximum score', () => {
    expect(
      computeFinalScore({
        won: false,
        revealedSafeCells: 999,
        totalSafeCells: 10,
      }),
    ).toBe(1000);
  });

  it('registers a competitive AI score range for minesweeps clears', () => {
    expect(getMinigameAiModel('minesweeps')).toMatchObject({
      minScore: 520,
      maxScore: 980,
    });
  });
});
