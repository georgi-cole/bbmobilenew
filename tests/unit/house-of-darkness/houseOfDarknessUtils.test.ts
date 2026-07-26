import { describe, expect, it } from 'vitest';
import {
  HOUSE_OF_DARKNESS_MAX_ROUNDS,
  applyHouseOfDarknessMistakes,
  buildHouseOfDarknessBoard,
  getHouseOfDarknessMistakeDamage,
  getHouseOfDarknessPairCount,
  recoverHouseOfDarknessHealth,
} from '../../../src/components/HouseOfDarknessComp/houseOfDarknessUtils';

describe('House of Darkness survival rules', () => {
  it('starts at four pairs and adds one pair per round', () => {
    expect(getHouseOfDarknessPairCount(1)).toBe(4);
    expect(getHouseOfDarknessPairCount(2)).toBe(5);
    expect(getHouseOfDarknessPairCount(HOUSE_OF_DARKNESS_MAX_ROUNDS)).toBe(15);
  });

  it('pads a five-pair board with two sealed placeholders for four-column symmetry', () => {
    const board = buildHouseOfDarknessBoard(12345, 5);
    const playable = board.filter((card) => !card.isPlaceholder);
    const placeholders = board.filter((card) => card.isPlaceholder);

    expect(board).toHaveLength(12);
    expect(playable).toHaveLength(10);
    expect(placeholders).toHaveLength(2);
    expect(board.length % 4).toBe(0);

    const symbolCounts = new Map<string, number>();
    playable.forEach((card) => symbolCounts.set(card.symbol, (symbolCounts.get(card.symbol) ?? 0) + 1));
    expect([...symbolCounts.values()].every((count) => count === 2)).toBe(true);
  });

  it('keeps every deterministic mistake hit between three and five percent', () => {
    const hits = Array.from({ length: 40 }, (_, index) =>
      getHouseOfDarknessMistakeDamage(9876, 'player-a', 4, index),
    );

    expect(hits.every((hit) => hit >= 3 && hit <= 5)).toBe(true);
    expect(hits).toEqual(Array.from({ length: 40 }, (_, index) =>
      getHouseOfDarknessMistakeDamage(9876, 'player-a', 4, index),
    ));
  });

  it('stops applying mistakes once lifespan reaches zero', () => {
    const result = applyHouseOfDarknessMistakes({
      health: 7,
      sessionSeed: 42,
      playerId: 'player-a',
      round: 3,
      mistakeStartIndex: 0,
      mistakeCount: 10,
    });

    expect(result.health).toBe(0);
    expect(result.lethalMistakeIndex).not.toBeNull();
    expect(result.damage).toBeGreaterThanOrEqual(7);
    expect(result.damage).toBeLessThanOrEqual(10);
  });

  it('returns exactly twenty percent of round damage after a completed board', () => {
    expect(recoverHouseOfDarknessHealth(80, 20, true)).toBe(84);
    expect(recoverHouseOfDarknessHealth(97, 10, true)).toBe(99);
    expect(recoverHouseOfDarknessHealth(80, 20, false)).toBe(80);
    expect(recoverHouseOfDarknessHealth(0, 20, true)).toBe(0);
  });
});
