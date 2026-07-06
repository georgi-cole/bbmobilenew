import { describe, expect, it } from 'vitest';

import {
  aiDecisionRng,
  aiPickFighters,
  aiShouldHit,
  cardRank,
  cardSuit,
  computeSpinnerWinnerIndex,
  computeTotal,
  resolveDuelOutcome,
} from '../src/features/blackjackTournament/blackjackTournamentSlice';

describe('Blackjack Tournament rules', () => {
  it('computes hand totals and card labels correctly', () => {
    expect(computeTotal([1, 10])).toBe(21);
    expect(computeTotal([1, 9, 1])).toBe(21);
    expect(computeTotal([1, 1, 9])).toBe(21);
    expect(computeTotal([10, 10, 5])).toBe(25);

    expect(cardRank(1)).toBe('A');
    expect(cardRank(11)).toBe('J');
    expect(cardRank(12)).toBe('Q');
    expect(cardRank(13)).toBe('K');
    expect(cardSuit(0)).toBe('♠');
    expect(cardSuit(3)).toBe('♣');
    expect(cardSuit(4)).toBe('♠');
  });

  it('resolves duels without ambiguity', () => {
    expect(resolveDuelOutcome([10, 7], [9, 7])).toBe('fighterA');
    expect(resolveDuelOutcome([10, 7], [10, 8])).toBe('fighterB');
    expect(resolveDuelOutcome([10, 10, 5], [9, 9, 4])).toBe('tie');
    expect(resolveDuelOutcome([10, 10, 2], [10, 10, 2])).toBe('tie');
    expect(resolveDuelOutcome([10, 10, 5], [10, 10, 6])).toBe('tie');
  });

  it('keeps AI hit decisions on the documented thresholds', () => {
    expect(aiShouldHit(11, 0.99)).toBe(true);
    expect(aiShouldHit(17, 0.01)).toBe(false);
    expect(aiShouldHit(15, 0.64)).toBe(true);
    expect(aiShouldHit(15, 0.7)).toBe(false);
    expect(aiDecisionRng(99, 2, 'fighter-a', 0)).toBe(aiDecisionRng(99, 2, 'fighter-a', 0));
    expect(aiDecisionRng(99, 2, 'fighter-a', 0)).not.toBe(aiDecisionRng(99, 2, 'fighter-b', 0));
  });

  it('picks fighters deterministically and keeps controller-vs-opponent rules intact', () => {
    expect(aiPickFighters(10, 1, 'controller', ['controller', 'opponent'])).toEqual({
      fighterAId: 'controller',
      fighterBId: 'opponent',
    });

    const pair = aiPickFighters(10, 1, 'controller', ['controller', 'a', 'b', 'c']);
    expect(pair).not.toBeNull();
    expect(pair).toBeTruthy();
    if (!pair) return;

    expect(pair.fighterAId).not.toBe('controller');
    expect(pair.fighterBId).not.toBe('controller');
    expect(pair.fighterAId).not.toBe(pair.fighterBId);
    expect(['a', 'b', 'c']).toContain(pair.fighterAId);
    expect(['a', 'b', 'c']).toContain(pair.fighterBId);
    expect(computeSpinnerWinnerIndex(123, 4)).toBeGreaterThanOrEqual(0);
    expect(computeSpinnerWinnerIndex(123, 4)).toBeLessThan(4);
    expect(computeSpinnerWinnerIndex(123, 4)).toBe(computeSpinnerWinnerIndex(123, 4));
  });
});
