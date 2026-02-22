/**
 * Unit tests for bigBrotherFallback.ts
 *
 * Run with: npx vitest run src/services/__tests__/bigBrotherFallback.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  detectIntent,
  scoreSentiment,
  generateOfflineBigBrotherReply,
} from '../bigBrotherFallback';

// ─── scoreSentiment ──────────────────────────────────────────────────────────

describe('scoreSentiment', () => {
  it('returns neutral score for empty string', () => {
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
});

// ─── detectIntent ────────────────────────────────────────────────────────────

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
});

// ─── generateOfflineBigBrotherReply ──────────────────────────────────────────

describe('generateOfflineBigBrotherReply', () => {
  it('returns a non-empty text and a reason', async () => {
    const res = await generateOfflineBigBrotherReply({ diaryText: 'I miss my parents' });
    expect(typeof res.text).toBe('string');
    expect(res.text.length).toBeGreaterThan(0);
    expect(typeof res.reason).toBe('string');
  });

  it('matches grief_family intent for "I miss my parents"', async () => {
    const res = await generateOfflineBigBrotherReply({ diaryText: 'I miss my parents' });
    expect(res.reason).toBe('grief_family');
  });

  it('returns safety reason for harmful messages', async () => {
    const res = await generateOfflineBigBrotherReply({
      diaryText: 'I want to get back at them and hurt them',
    });
    expect(res.reason).toBe('safety');
  });

  it('substitutes playerName into the reply', async () => {
    const res = await generateOfflineBigBrotherReply({
      diaryText: 'I miss my parents',
      playerName: 'Jordan',
    });
    expect(res.text).toContain('Jordan');
  });

  it('uses "Houseguest" when no playerName is provided', async () => {
    // Collect a few replies across different seeds to account for pool variation
    const texts: string[] = [];
    for (let seed = 0; seed < 20; seed++) {
      const r = await generateOfflineBigBrotherReply({ diaryText: 'I miss my parents', seed });
      texts.push(r.text);
    }
    // All replies should use the default "Houseguest" placeholder
    expect(texts.every((t) => t.includes('Houseguest'))).toBe(true);
  });

  it('is deterministic: same text + same seed returns same reply', async () => {
    const req = { diaryText: 'I feel so alone', seed: 42 };
    const [a, b] = await Promise.all([
      generateOfflineBigBrotherReply(req),
      generateOfflineBigBrotherReply(req),
    ]);
    expect(a.text).toBe(b.text);
  });

  it('different seeds can produce different replies', async () => {
    const text = 'I feel so alone and no one talks to me';
    const replies = await Promise.all(
      [0, 1, 2, 3, 4, 5, 6, 7].map((seed) =>
        generateOfflineBigBrotherReply({ diaryText: text, seed }),
      ),
    );
    const unique = new Set(replies.map((r) => r.text));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('reply text does not exceed 220 characters', async () => {
    const res = await generateOfflineBigBrotherReply({
      diaryText: 'I feel so alone and nobody talks to me',
      playerName: 'Jordan',
      seed: 0,
    });
    expect(res.text.length).toBeLessThanOrEqual(220);
  });
});
