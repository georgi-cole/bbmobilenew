import { describe, expect, it } from 'vitest';
import { CASTLE_RESCUE_LEVELS } from '../../../src/minigames/castleRescue/castleRescuePuzzleLevels';
import {
  createBoardFromLevel,
  findAvailableMoves,
  findMatches,
  solveBoard,
} from '../../../src/minigames/castleRescue/castleRescuePuzzleLogic';

describe('Castle Rescue finite match-3 levels', () => {
  for (const level of CASTLE_RESCUE_LEVELS) {
    it(`${level.name} starts clean, has a move, and remains solvable`, () => {
      const board = createBoardFromLevel(level);

      expect(findMatches(board)).toHaveLength(0);
      expect(findAvailableMoves(board).length).toBeGreaterThan(0);
      expect(solveBoard(board, 500_000)).toBe(true);
    });
  }
});
