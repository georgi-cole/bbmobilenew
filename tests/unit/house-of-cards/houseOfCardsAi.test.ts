import { describe, expect, it } from 'vitest';

import {
  createHouseOfCardsAiProfiles,
  createHouseOfCardsSessionAbility,
  simulateHouseOfCardsAiRound,
} from '../../../src/features/houseOfCards/houseOfCardsAi';

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

describe('House of Cards preliminary AI', () => {
  it('is deterministic for the same tournament inputs', () => {
    const params = {
      playerId: 'alex',
      round: 3,
      pairCount: 8,
      tournamentSeed: 2026,
      sessionAbility: 55,
    };

    expect(simulateHouseOfCardsAiRound(params)).toEqual(simulateHouseOfCardsAiRound(params));
  });

  it('redistributes a player ability between tournament seeds', () => {
    const abilities = new Set(
      Array.from({ length: 20 }, (_, index) =>
        createHouseOfCardsSessionAbility('alex', index + 1),
      ),
    );

    expect(abilities.size).toBeGreaterThan(1);
  });

  it('creates profiles for every AI participant but not the human', () => {
    const profiles = createHouseOfCardsAiProfiles(
      ['human', 'alex', 'bea'],
      'human',
      2026,
    );

    expect(profiles.human).toBeUndefined();
    expect(Object.keys(profiles).sort()).toEqual(['alex', 'bea']);
  });

  it('keeps session ability within its configured limits', () => {
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const ability = createHouseOfCardsSessionAbility('alex', seed);
      expect(ability).toBeGreaterThanOrEqual(25);
      expect(ability).toBeLessThanOrEqual(85);
    }
  });

  it('does not give a permanent advantage to one participant', () => {
    const alexAbilities: number[] = [];
    const beaAbilities: number[] = [];
    for (let seed = 1; seed <= 1_000; seed += 1) {
      alexAbilities.push(createHouseOfCardsSessionAbility('alex', seed));
      beaAbilities.push(createHouseOfCardsSessionAbility('bea', seed));
    }

    expect(Math.abs(average(alexAbilities) - average(beaAbilities))).toBeLessThan(2);
  });

  it('makes average AI perfect runs rare on a 24-card board', () => {
    let perfectRuns = 0;
    for (let seed = 1; seed <= 5_000; seed += 1) {
      if (simulateHouseOfCardsAiRound({
        playerId: 'alex', round: 5, pairCount: 12, tournamentSeed: seed, sessionAbility: 55,
      }).mistakes === 0) perfectRuns += 1;
    }

    expect(perfectRuns / 5_000).toBeLessThan(0.02);
  });

  it('keeps strong AI perfect runs below the maximum rate', () => {
    let perfectRuns = 0;
    for (let seed = 1; seed <= 5_000; seed += 1) {
      if (simulateHouseOfCardsAiRound({
        playerId: 'alex', round: 5, pairCount: 12, tournamentSeed: seed, sessionAbility: 80,
      }).mistakes === 0) perfectRuns += 1;
    }

    expect(perfectRuns / 5_000).toBeLessThan(0.08);
  });

  it('produces more mistakes on larger boards', () => {
    const mistakesFor = (pairCount: number) => {
      const mistakes: number[] = [];
      for (let seed = 1; seed <= 1_000; seed += 1) {
        mistakes.push(simulateHouseOfCardsAiRound({
          playerId: 'alex', round: 3, pairCount, tournamentSeed: seed, sessionAbility: 55,
        }).mistakes);
      }
      return average(mistakes);
    };

    const average4 = mistakesFor(4);
    const average8 = mistakesFor(8);
    const average12 = mistakesFor(12);
    expect(average4).toBeLessThan(average8);
    expect(average8).toBeLessThan(average12);
  });

  it('rewards higher ability with fewer mistakes and less time on average', () => {
    const lowerAbility = { mistakes: [] as number[], timeMs: [] as number[] };
    const higherAbility = { mistakes: [] as number[], timeMs: [] as number[] };
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const base = { playerId: 'alex', round: 3, pairCount: 12, tournamentSeed: seed };
      const lowerPerformance = simulateHouseOfCardsAiRound({ ...base, sessionAbility: 40 });
      const higherPerformance = simulateHouseOfCardsAiRound({ ...base, sessionAbility: 70 });
      lowerAbility.mistakes.push(lowerPerformance.mistakes);
      lowerAbility.timeMs.push(lowerPerformance.timeMs);
      higherAbility.mistakes.push(higherPerformance.mistakes);
      higherAbility.timeMs.push(higherPerformance.timeMs);
    }

    expect(average(higherAbility.mistakes)).toBeLessThan(average(lowerAbility.mistakes));
    expect(average(higherAbility.timeMs)).toBeLessThan(average(lowerAbility.timeMs));
  });
});
