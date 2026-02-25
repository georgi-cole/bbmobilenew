/**
 * Unit tests for src/bb/engine.ts
 *
 * Run with: npx vitest run src/bb/__tests__/engine.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  detectIntent,
  scoreSentiment,
  bigBrotherReply,
  normalize,
  tokenize,
  bigrams,
  trigrams,
} from '../engine';

// ─── normalize / tokenize ─────────────────────────────────────────────────────

describe('normalize', () => {
  it('lower-cases text', () => {
    expect(normalize('Hello WORLD')).toBe('hello world');
  });

  it('converts curly apostrophes to straight', () => {
    expect(normalize("don\u2019t")).toBe("don't");
  });

  it('removes punctuation except apostrophes', () => {
    expect(normalize('Hello, world!')).toBe('hello  world ');
  });
});

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('filters empty strings', () => {
    expect(tokenize('  hello   world  ')).toEqual(['hello', 'world']);
  });

  it('keeps apostrophes in contractions', () => {
    expect(tokenize("I don't know")).toEqual(['i', "don't", 'know']);
  });
});

// ─── bigrams / trigrams ───────────────────────────────────────────────────────

describe('bigrams', () => {
  it('returns bigrams for a token list', () => {
    expect(bigrams(['a', 'b', 'c'])).toEqual(['a b', 'b c']);
  });

  it('returns empty for single token', () => {
    expect(bigrams(['a'])).toEqual([]);
  });
});

describe('trigrams', () => {
  it('returns trigrams for a token list', () => {
    expect(trigrams(['a', 'b', 'c', 'd'])).toEqual(['a b c', 'b c d']);
  });

  it('returns empty for two tokens', () => {
    expect(trigrams(['a', 'b'])).toEqual([]);
  });
});

// ─── scoreSentiment ───────────────────────────────────────────────────────────

describe('scoreSentiment', () => {
  it('returns neutral for empty string', () => {
    const result = scoreSentiment('');
    expect(result.score).toBe(0);
    expect(result.intensity).toBe(0);
  });

  it('scores a positive message above 0', () => {
    const result = scoreSentiment('I am so happy and grateful today, everything is wonderful');
    expect(result.score).toBeGreaterThan(0);
  });

  it('scores a negative message below 0', () => {
    const result = scoreSentiment('I am so sad and lonely, I feel alone and hurt');
    expect(result.score).toBeLessThan(0);
  });

  it('score is clamped to [-1, 1]', () => {
    const result = scoreSentiment('hate hate hate hate hate hate hate hate hate');
    expect(result.score).toBeGreaterThanOrEqual(-1);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('intensity is between 0 and 1', () => {
    const result = scoreSentiment('happy sad angry love hate');
    expect(result.intensity).toBeGreaterThanOrEqual(0);
    expect(result.intensity).toBeLessThanOrEqual(1);
  });

  it('"I miss my parents" scores as negative mild', () => {
    const result = scoreSentiment('I miss my parents');
    expect(result.score).toBeLessThan(0);
    // Score should be moderate, not at the extreme end
    expect(result.score).toBeGreaterThan(-1);
  });

  it('negation inverts sentiment contribution', () => {
    // "I don't hate Echo" — "hate" is negated, so score should be positive or neutral
    const withNeg = scoreSentiment("I don't hate Echo");
    const withoutNeg = scoreSentiment('I hate Echo');
    expect(withNeg.score).toBeGreaterThan(withoutNeg.score);
  });
});

// ─── detectIntent ─────────────────────────────────────────────────────────────

describe('detectIntent', () => {
  it('detects grief_family for family-miss messages', () => {
    expect(detectIntent('I miss my mom and dad so much')).toBe('grief_family');
  });

  it('detects grief_pet for pet-miss messages', () => {
    expect(detectIntent('I really miss my dog back home')).toBe('grief_pet');
  });

  it('detects loneliness for isolation messages', () => {
    expect(detectIntent('I feel so alone and nobody talks to me')).toBe('loneliness');
  });

  it('detects strategy for game strategy messages', () => {
    expect(detectIntent('I need to think about my alliance and who to vote out this week')).toBe('strategy');
  });

  it('detects social_anxiety for nervousness messages', () => {
    expect(detectIntent('I am so nervous and anxious about what everyone thinks of me')).toBe('social_anxiety');
  });

  it('detects anger for anger messages', () => {
    expect(detectIntent('I am so angry and furious at Echo for betraying me')).toBe('anger');
  });

  it('detects humor for light-hearted messages', () => {
    expect(detectIntent('This is so funny and hilarious, I can not stop laughing')).toBe('humor');
  });

  it('detects confession for confession messages', () => {
    expect(detectIntent('I have to confess something I have been hiding')).toBe('confession');
  });

  it('detects validation for seeking-approval messages', () => {
    expect(detectIntent('Did I do the right thing? Am I good enough for this game?')).toBe('validation');
  });

  it('returns safety for violence-related messages', () => {
    expect(detectIntent('I want to kill them for what they did to me')).toBe('safety');
  });

  // ── Negation handling ─────────────────────────────────────────────────────

  it('negation: "I don\'t hate Echo" should NOT be anger', () => {
    expect(detectIntent("I don't hate Echo")).not.toBe('anger');
  });

  it('negation: "I am not angry at all" should NOT be anger', () => {
    expect(detectIntent('I am not angry at all')).not.toBe('anger');
  });

  it('negation: without negation "I hate Echo" IS anger', () => {
    expect(detectIntent('I hate Echo')).toBe('anger');
  });

  // ── Phrase priority ───────────────────────────────────────────────────────

  it('phrase priority: "I want to quit" -> quit', () => {
    expect(detectIntent('I want to quit')).toBe('quit');
  });

  it('phrase priority: "I want to leave the house" -> quit', () => {
    expect(detectIntent('I want to leave')).toBe('quit');
  });

  it('phrase priority: "I miss my parents" -> grief_family (not generic loneliness)', () => {
    expect(detectIntent('I miss my parents')).toBe('grief_family');
  });
});

// ─── bigBrotherReply ──────────────────────────────────────────────────────────

describe('bigBrotherReply', () => {
  it('returns a non-empty text', () => {
    const r = bigBrotherReply('I feel so alone');
    expect(typeof r.text).toBe('string');
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('returns intent, sentiment, and replyId', () => {
    const r = bigBrotherReply('I miss my parents');
    expect(r.intent).toBe('grief_family');
    expect(typeof r.sentiment.score).toBe('number');
    expect(typeof r.replyId).toBe('string');
    expect(r.replyId.length).toBeGreaterThan(0);
  });

  it('substitutes {{name}} with playerName', () => {
    const r = bigBrotherReply('I feel alone', { playerName: 'Jordan' });
    expect(r.text).toContain('Jordan');
    expect(r.text).not.toContain('{{name}}');
  });

  it('uses "Houseguest" when no playerName is provided', () => {
    const texts: string[] = [];
    for (let seed = 0; seed < 10; seed++) {
      texts.push(bigBrotherReply('I miss my parents', { seed }).text);
    }
    expect(texts.every((t) => t.includes('Houseguest'))).toBe(true);
  });

  it('reply text does not exceed 220 characters', () => {
    const r = bigBrotherReply('I feel so alone and nobody talks to me', {
      playerName: 'Houseguest',
      seed: 0,
    });
    expect(r.text.length).toBeLessThanOrEqual(220);
  });

  // ── Deterministic selection ───────────────────────────────────────────────

  it('deterministic: same input + seed returns same replyId', () => {
    const ctx = { seed: 42 };
    const r1 = bigBrotherReply('I feel so alone', ctx);
    const r2 = bigBrotherReply('I feel so alone', ctx);
    expect(r1.replyId).toBe(r2.replyId);
    expect(r1.text).toBe(r2.text);
  });

  it('deterministic: different seeds can produce different replyIds', () => {
    const ids = new Set(
      [0, 1, 2, 3, 4, 5, 6, 7].map(
        (seed) => bigBrotherReply('I feel so alone and nobody talks to me', { seed }).replyId,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  // ── Anti-repeat ───────────────────────────────────────────────────────────

  it('anti-repeat: passing lastReplyIds avoids the excluded reply', () => {
    const input = 'I feel so alone';
    const r1 = bigBrotherReply(input, { seed: 0 });
    const r2 = bigBrotherReply(input, { seed: 0, lastReplyIds: [r1.replyId] });
    expect(r2.replyId).not.toBe(r1.replyId);
  });

  it('anti-repeat: falls back to full pool when all ids excluded', () => {
    // Collect all possible replyIds for this intent across many seeds
    const input = 'I feel so alone';
    const allIds = new Set(
      Array.from({ length: 30 }, (_, seed) =>
        bigBrotherReply(input, { seed }).replyId,
      ),
    );
    // Even with all IDs excluded, should still return something
    const r = bigBrotherReply(input, { seed: 0, lastReplyIds: [...allIds] });
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('anti-repeat: multiple sequential lastReplyIds are all avoided', () => {
    const input = 'I feel so alone and isolated';
    const seen: string[] = [];
    for (let seed = 0; seed < 8; seed++) {
      const r = bigBrotherReply(input, { seed, lastReplyIds: [...seen] });
      // The returned replyId should not be in the excluded list
      expect(seen).not.toContain(r.replyId);
      seen.push(r.replyId);
    }
  });
});
