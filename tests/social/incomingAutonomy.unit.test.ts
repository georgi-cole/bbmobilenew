/**
 * Unit tests for incomingInteractionAutonomy and affinityUtils.
 *
 * Tests cover:
 *  1. normalizeAffinity mapping
 *  2. Engagement score: strong ally/enemy higher than neutral
 *  3. Recency penalty reduces scores
 *  4. Strategic urgency can boost a neutral AI above threshold
 *  5. Per-AI and global caps enforced by shouldEnqueueInteraction
 *  6. chooseIncomingInteractionType returns correct types per phase/affinity
 */

import { describe, it, expect } from 'vitest';
import { normalizeAffinity } from '../../src/social/affinityUtils';
import {
  computeIncomingInteractionEngagementScore,
  chooseIncomingInteractionType,
  shouldEnqueueInteraction,
} from '../../src/social/incomingInteractionAutonomy';
import type { AutonomyContext } from '../../src/social/incomingInteractionAutonomy';
import type { IncomingInteraction } from '../../src/social/types';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Deterministic zero-jitter RNG that always returns 0.5 (no +/- variance). */
const zeroJitter = () => 0.5;

const BASE_PLAYERS = [
  { id: 'user', status: 'active', isUser: true },
  { id: 'actor1', status: 'active' },
  { id: 'actor2', status: 'active' },
];

function makeContext(overrides: Partial<AutonomyContext> = {}): AutonomyContext {
  return {
    phase: 'nominations',
    week: 3,
    relationships: {},
    players: BASE_PLAYERS,
    random: zeroJitter,
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'i-1',
    fromId: 'actor1',
    type: 'check_in',
    text: 'Hey.',
    createdAt: Date.now(),
    createdWeek: 3,
    expiresAtWeek: 4,
    read: false,
    requiresResponse: false,
    resolved: false,
    ...overrides,
  };
}

// ── normalizeAffinity ──────────────────────────────────────────────────────

describe('normalizeAffinity', () => {
  it('maps 0 to 0', () => {
    expect(normalizeAffinity(0)).toBe(0);
  });

  it('maps +100 to +1', () => {
    expect(normalizeAffinity(100)).toBe(1);
  });

  it('maps -100 to -1', () => {
    expect(normalizeAffinity(-100)).toBe(-1);
  });

  it('maps +50 to +0.5', () => {
    expect(normalizeAffinity(50)).toBe(0.5);
  });

  it('maps -50 to -0.5', () => {
    expect(normalizeAffinity(-50)).toBe(-0.5);
  });

  it('clamps values above 100 to 1', () => {
    expect(normalizeAffinity(200)).toBe(1);
  });

  it('clamps values below -100 to -1', () => {
    expect(normalizeAffinity(-999)).toBe(-1);
  });
});

// ── computeIncomingInteractionEngagementScore ──────────────────────────────

describe('computeIncomingInteractionEngagementScore', () => {
  it('strong ally has higher score than neutral (no relationship)', () => {
    const ctxAlly = makeContext({
      relationships: {
        actor1: { user: { affinity: 80, tags: [] } },
      },
    });
    const ctxNeutral = makeContext({ relationships: {} });

    const scoreAlly = computeIncomingInteractionEngagementScore(
      'actor1',
      'user',
      ctxAlly,
    );
    const scoreNeutral = computeIncomingInteractionEngagementScore(
      'actor1',
      'user',
      ctxNeutral,
    );

    expect(scoreAlly).toBeGreaterThan(scoreNeutral);
  });

  it('strong enemy has higher score than neutral (intensity = |affinity|)', () => {
    const ctxEnemy = makeContext({
      relationships: {
        actor1: { user: { affinity: -80, tags: [] } },
      },
    });
    const ctxNeutral = makeContext({ relationships: {} });

    const scoreEnemy = computeIncomingInteractionEngagementScore(
      'actor1',
      'user',
      ctxEnemy,
    );
    const scoreNeutral = computeIncomingInteractionEngagementScore(
      'actor1',
      'user',
      ctxNeutral,
    );

    expect(scoreEnemy).toBeGreaterThan(scoreNeutral);
  });

  it('recency penalty reduces score when a recent interaction exists', () => {
    const ctx = makeContext({ week: 5 });
    const recentInteraction = makeInteraction({ createdWeek: 5, fromId: 'actor1' });

    const scoreWithPenalty = computeIncomingInteractionEngagementScore(
      'actor1',
      'user',
      ctx,
      [recentInteraction],
    );
    const scoreNoPenalty = computeIncomingInteractionEngagementScore(
      'actor1',
      'user',
      ctx,
      [],
    );

    expect(scoreWithPenalty).toBeLessThan(scoreNoPenalty);
  });

  it('strategic urgency (nominations phase) boosts score above low-urgency phase', () => {
    const ctxHighUrgency = makeContext({ phase: 'nominations' });
    const ctxLowUrgency = makeContext({ phase: 'social_1' });

    const scoreHigh = computeIncomingInteractionEngagementScore('actor1', 'user', ctxHighUrgency);
    const scoreLow = computeIncomingInteractionEngagementScore('actor1', 'user', ctxLowUrgency);

    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('memory intensity raises the score when strong gratitude exists', () => {
    const ctxWithMemory = makeContext({
      relationships: {},
      socialMemory: {
        actor1: {
          user: {
            gratitude: 10,
            resentment: 0,
            neglect: 0,
            trustMomentum: 0,
            recentEvents: [],
          },
        },
      },
    });
    const ctxNoMemory = makeContext({ relationships: {} });

    const scoreWithMemory = computeIncomingInteractionEngagementScore('actor1', 'user', ctxWithMemory);
    const scoreNoMemory = computeIncomingInteractionEngagementScore('actor1', 'user', ctxNoMemory);

    expect(scoreWithMemory).toBeGreaterThan(scoreNoMemory);
  });

  it('live_vote urgency can push a neutral AI above scoreThreshold', () => {
    const ctx = makeContext({ phase: 'live_vote', relationships: {} });
    const score = computeIncomingInteractionEngagementScore('actor1', 'user', ctx);
    // With zero jitter and no affinity, strategic urgency for live_vote (0.95)
    // weighted at 0.5 alone gives 0.475, which should exceed the 0.15 threshold.
    expect(score).toBeGreaterThan(0.15);
  });

  it('returns a non-negative value', () => {
    const ctx = makeContext();
    const score = computeIncomingInteractionEngagementScore('actor1', 'user', ctx);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic with fixed RNG', () => {
    const ctx = makeContext({ random: () => 0.3 });
    const s1 = computeIncomingInteractionEngagementScore('actor1', 'user', ctx);
    const s2 = computeIncomingInteractionEngagementScore('actor1', 'user', ctx);
    expect(s1).toBe(s2);
  });
});

// ── chooseIncomingInteractionType ──────────────────────────────────────────

describe('chooseIncomingInteractionType', () => {
  it('returns nomination_plea for ally during nominations', () => {
    const ctx = makeContext({
      phase: 'nominations',
      relationships: { actor1: { user: { affinity: 60, tags: [] } } },
    });
    expect(chooseIncomingInteractionType('actor1', 'user', ctx)).toBe('nomination_plea');
  });

  it('returns snide_remark for enemy during nominations', () => {
    const ctx = makeContext({
      phase: 'nominations',
      relationships: { actor1: { user: { affinity: -50, tags: [] } } },
    });
    expect(chooseIncomingInteractionType('actor1', 'user', ctx)).toBe('snide_remark');
  });

  it('returns deal_offer for neutral during nominations', () => {
    const ctx = makeContext({
      phase: 'nominations',
      relationships: {},
    });
    expect(chooseIncomingInteractionType('actor1', 'user', ctx)).toBe('deal_offer');
  });

  it('returns compliment for strong ally in default phase', () => {
    const ctx = makeContext({
      phase: 'week_start',
      relationships: { actor1: { user: { affinity: 70, tags: [] } } },
    });
    expect(chooseIncomingInteractionType('actor1', 'user', ctx)).toBe('compliment');
  });

  it('returns check_in for slightly positive affinity in default phase', () => {
    const ctx = makeContext({
      phase: 'week_start',
      relationships: { actor1: { user: { affinity: 20, tags: [] } } },
    });
    expect(chooseIncomingInteractionType('actor1', 'user', ctx)).toBe('check_in');
  });

  it('uses negative memory bias to shift neutral affinity toward gossip', () => {
    const ctx = makeContext({
      phase: 'week_start',
      relationships: {},
      socialMemory: {
        actor1: {
          user: {
            gratitude: 0,
            resentment: 10,
            neglect: 0,
            trustMomentum: 0,
            recentEvents: [],
          },
        },
      },
    });
    expect(chooseIncomingInteractionType('actor1', 'user', ctx)).toBe('gossip');
  });
});

// ── shouldEnqueueInteraction ───────────────────────────────────────────────

describe('shouldEnqueueInteraction', () => {
  it('returns true for eligible actor with no pending interactions', () => {
    const ctx = makeContext({ phase: 'nominations' });
    expect(shouldEnqueueInteraction('actor1', 'user', ctx, [])).toBe(true);
  });

  it('returns false when global active cap is reached', () => {
    const ctx = makeContext({ phase: 'nominations' });
    // maxActive = 4; create 4 unresolved interactions from different actors
    const pending: IncomingInteraction[] = Array.from({ length: 4 }, (_, i) =>
      makeInteraction({ id: `i-${i}`, fromId: `other${i}`, resolved: false }),
    );
    expect(shouldEnqueueInteraction('actor1', 'user', ctx, pending)).toBe(false);
  });

  it('returns false when per-AI cap is reached for actor1', () => {
    const ctx = makeContext({ phase: 'nominations' });
    // maxPerAI = 2; actor1 already has 2 unresolved
    const pending: IncomingInteraction[] = [
      makeInteraction({ id: 'i-a', fromId: 'actor1', resolved: false }),
      makeInteraction({ id: 'i-b', fromId: 'actor1', resolved: false }),
    ];
    expect(shouldEnqueueInteraction('actor1', 'user', ctx, pending)).toBe(false);
  });

  it('returns false when actor is on cooldown (recent interaction in same week)', () => {
    const ctx = makeContext({ phase: 'nominations', week: 5 });
    // An unresolved interaction from actor1 in the same week → full recency penalty
    const pending: IncomingInteraction[] = [
      makeInteraction({ id: 'i-recent', fromId: 'actor1', createdWeek: 5, resolved: false }),
    ];
    expect(shouldEnqueueInteraction('actor1', 'user', ctx, pending)).toBe(false);
  });

  it('returns true when previous interaction is old enough (past cooldown)', () => {
    // cooldownTicks = 2; interaction from week 1, current week = 3 → no penalty
    const ctx = makeContext({ phase: 'nominations', week: 3 });
    const pending: IncomingInteraction[] = [
      makeInteraction({ id: 'i-old', fromId: 'actor1', createdWeek: 1, resolved: false }),
    ];
    expect(shouldEnqueueInteraction('actor1', 'user', ctx, pending)).toBe(true);
  });

  it('returns a non-negative value for a low-urgency phase', () => {
    const ctx = makeContext({ phase: 'week_end', relationships: {}, random: () => 0 });
    const score = computeIncomingInteractionEngagementScore('actor1', 'user', ctx);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
