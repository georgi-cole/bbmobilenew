import { describe, expect, it } from 'vitest';
import type { GameRegistryEntry } from '../../../src/minigames/registry';
import { getGame } from '../../../src/minigames/registry';
import { selectNextCompetitionGame } from '../../../src/ai/competition/scheduling';

function getRequiredGame(key: string): GameRegistryEntry {
  const game = getGame(key);
  if (!game) throw new Error(`Missing game in registry: ${key}`);
  return game;
}

describe('competition scheduling diversity', () => {
  it('avoids repeating an overused category in recent history', () => {
    const pool = [
      getRequiredGame('quickTap'),
      getRequiredGame('laserPantryDash'),
      getRequiredGame('triviaPulse'),
    ];

    const selection = selectNextCompetitionGame({
      seed: 42,
      games: pool,
      recentGameKeys: ['quickTap', 'laserPantryDash', 'quickTap'],
    });

    expect(selection.key).toBe('triviaPulse');
  });

  it('falls back gracefully when every option shares the recent category', () => {
    const pool = [
      getRequiredGame('quickTap'),
      getRequiredGame('laserPantryDash'),
    ];

    const selection = selectNextCompetitionGame({
      seed: 9,
      games: pool,
      recentGameKeys: ['quickTap', 'laserPantryDash', 'quickTap'],
    });

    expect(pool.map((game) => game.key)).toContain(selection.key);
  });

  it('is deterministic for the same inputs', () => {
    const pool = [
      getRequiredGame('quickTap'),
      getRequiredGame('triviaPulse'),
      getRequiredGame('timingBar'),
    ];

    const first = selectNextCompetitionGame({
      seed: 777,
      games: pool,
      recentGameKeys: ['triviaPulse', 'timingBar'],
    });
    const second = selectNextCompetitionGame({
      seed: 777,
      games: pool,
      recentGameKeys: ['triviaPulse', 'timingBar'],
    });

    expect(first.key).toBe(second.key);
  });

  it('does not crash when metadata is missing for a minigame key', () => {
    const unknownGame: GameRegistryEntry = {
      key: 'mysteryGame',
      title: 'Mystery Game',
      description: 'Unknown competition',
      instructions: [],
      metricKind: 'points',
      metricLabel: 'Score',
      timeLimitMs: 0,
      authoritative: false,
      scoringAdapter: 'raw',
      legacy: false,
      weight: 1,
      category: 'arcade',
      retired: false,
    };

    const pool = [unknownGame, getRequiredGame('quickTap')];

    const selection = selectNextCompetitionGame({
      seed: 13,
      games: pool,
      recentGameKeys: ['quickTap'],
    });

    expect(pool.map((game) => game.key)).toContain(selection.key);
  });
});
