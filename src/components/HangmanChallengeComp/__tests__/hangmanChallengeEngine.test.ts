import { describe, expect, it } from 'vitest';
import {
  buildDisplayTokens,
  calculateRoundScore,
  getWordBank,
  pickRoundWords,
  shouldAttemptMysterySpawn,
  shouldForceSecondMysteryBox,
} from '../hangmanChallengeEngine';

describe('hangmanChallengeEngine', () => {
  it('uses a safe expanded word bank and supports multi-word phrases', () => {
    const words = getWordBank().map((entry) => entry.text);
    expect(words).toContain('leader of house');
    expect(words).toContain('power of safety');
    expect(words).not.toContain('veto');
    expect(words).not.toContain('backdoor');
  });

  it('builds a 5-round progression with unique ascending difficulties', () => {
    const rounds = pickRoundWords(42);
    expect(rounds).toHaveLength(5);
    expect(new Set(rounds.map((entry) => entry.text)).size).toBe(5);
    expect(rounds.map((entry) => entry.difficulty)).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves spaces while masking unrevealed letters', () => {
    expect(buildDisplayTokens('power of safety', ['P', 'O'], ['S'])).toEqual([
      'P', 'O', '•', '•', '•', ' ', 'O', '•', ' ', 'S', '•', '•', '•', '•', '•',
    ]);
  });

  it('calculates solved-round bonuses and unsolved fallback scores', () => {
    const solvedBreakdown = calculateRoundScore({
      solved: true,
      errors: 0,
      elapsedSeconds: 12,
      timePenaltyPoints: 48,
      boxesOpened: 0,
      perfectEligible: true,
      revealedRatio: 1,
      mysteryAdjustments: [],
      bonusTokenPoints: 0,
    });
    expect(solvedBreakdown.finalRoundScore).toBe(1512);

    const failedBreakdown = calculateRoundScore({
      solved: false,
      errors: 5,
      elapsedSeconds: 33,
      timePenaltyPoints: 132,
      boxesOpened: 1,
      perfectEligible: false,
      revealedRatio: 0.51,
      mysteryAdjustments: [{ label: 'Hidden risk', value: -80 }],
      bonusTokenPoints: 0,
    });
    expect(failedBreakdown.finalRoundScore).toBe(38);
  });

  it('uses the required mystery box spawn schedule', () => {
    expect(shouldAttemptMysterySpawn(9)).toBe(true);
    expect(shouldAttemptMysterySpawn(19)).toBe(true);
    expect(shouldAttemptMysterySpawn(29)).toBe(true);
    expect(shouldAttemptMysterySpawn(30)).toBe(false);
    expect(shouldForceSecondMysteryBox(30, 1)).toBe(true);
    expect(shouldForceSecondMysteryBox(30, 2)).toBe(false);
  });
});
