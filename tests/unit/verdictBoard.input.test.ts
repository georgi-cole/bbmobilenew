import { describe, expect, it } from 'vitest';
import { sanitizeVerdictBoardLetterInput } from '../../src/components/HangmanChallengeComp/verdictBoardInput';

describe('Verdict Board letter input', () => {
  it('accepts one A-Z letter and rejects digits, punctuation, and symbols', () => {
    expect(sanitizeVerdictBoardLetterInput('q')).toBe('Q');
    expect(sanitizeVerdictBoardLetterInput('ab')).toBe('B');
    expect(sanitizeVerdictBoardLetterInput('7')).toBe('');
    expect(sanitizeVerdictBoardLetterInput('!')).toBe('');
    expect(sanitizeVerdictBoardLetterInput('🙂')).toBe('');
  });
});
