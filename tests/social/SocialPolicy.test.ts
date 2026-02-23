// Unit tests for SocialPolicy evaluator functions.
//
// Validates:
//  1. computeOutcomeScore is deterministic in 'preview' mode.
//  2. computeOutcomeScore is within expected bounds in 'execute' mode.
//  3. computeOutcomeScore returns positive score for friendly actions.
//  4. computeOutcomeScore returns negative score for aggressive actions.
//  5. evaluateOutcome returns correct label based on score.
//  6. evaluateOutcome averages scores across multiple targets.
//  7. Integration: executeAction returns score + label and sessionLogs include them.

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import socialReducer, {
  setEnergyBankEntry,
  selectSessionLogs,
} from '../../src/social/socialSlice';
import {
  computeOutcomeScore,
  evaluateOutcome,
  OUTCOME_THRESHOLDS,
} from '../../src/social/SocialPolicy';
import { initManeuvers, executeAction } from '../../src/social/SocialManeuvers';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { social: socialReducer } });
}

// ── computeOutcomeScore ───────────────────────────────────────────────────

describe('computeOutcomeScore – preview mode (deterministic)', () => {
  it('returns the same score on repeated calls with same inputs', () => {
    const s1 = computeOutcomeScore('ally', 'p1', 'p2', 'preview');
    const s2 = computeOutcomeScore('ally', 'p1', 'p2', 'preview');
    expect(s1).toBe(s2);
  });

  it('is deterministic regardless of how many times called', () => {
    const scores = Array.from({ length: 10 }, () =>
      computeOutcomeScore('betray', 'p1', 'p2', 'preview'),
    );
    expect(new Set(scores).size).toBe(1);
  });

  it('returns a positive score for friendly action (ally)', () => {
    const score = computeOutcomeScore('ally', 'p1', 'p2', 'preview');
    expect(score).toBeGreaterThan(0);
  });

  it('returns a negative score for aggressive action (betray)', () => {
    const score = computeOutcomeScore('betray', 'p1', 'p2', 'preview');
    expect(score).toBeLessThan(0);
  });

  it('returns 0 for unknown action with no relationships', () => {
    const score = computeOutcomeScore('unknown_xyz', 'p1', 'p2', 'preview');
    expect(score).toBe(0);
  });

  it('score is within [-1, +1]', () => {
    const score = computeOutcomeScore('ally', 'p1', 'p2', 'preview');
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('actor bias shifts score upward when actor has positive affinity toward target', () => {
    const noRel = computeOutcomeScore('ally', 'p1', 'p2', 'preview');
    const withRel = computeOutcomeScore('ally', 'p1', 'p2', 'preview', {
      p1: { p2: { affinity: 0.8, tags: [] } },
    });
    expect(withRel).toBeGreaterThan(noRel);
  });

  it('actor bias shifts score downward when actor has negative affinity toward target', () => {
    const noRel = computeOutcomeScore('ally', 'p1', 'p2', 'preview');
    const withRel = computeOutcomeScore('ally', 'p1', 'p2', 'preview', {
      p1: { p2: { affinity: -0.8, tags: [] } },
    });
    expect(withRel).toBeLessThan(noRel);
  });
});

describe('computeOutcomeScore – execute mode (stochastic)', () => {
  it('score is within [-1, +1]', () => {
    for (let i = 0; i < 20; i++) {
      const score = computeOutcomeScore('ally', 'p1', 'p2', 'execute');
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('scores vary across calls (stochastic jitter applied)', () => {
    // Run enough iterations that the chance of all being equal is negligible.
    const scores = new Set(
      Array.from({ length: 30 }, () => computeOutcomeScore('ally', 'p1', 'p2', 'execute')),
    );
    expect(scores.size).toBeGreaterThan(1);
  });

  it('base direction is still positive for friendly action across many runs', () => {
    const scores = Array.from({ length: 20 }, () =>
      computeOutcomeScore('ally', 'p1', 'p2', 'execute'),
    );
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    expect(avg).toBeGreaterThan(0);
  });
});

// ── evaluateOutcome ────────────────────────────────────────────────────────

describe('evaluateOutcome – label mapping', () => {
  it('returns label "Bad" for score at or below bad threshold', () => {
    // betray aggressiveSuccess = -0.15, well above bad threshold of -0.25
    // Use relationships to push the score lower
    const result = evaluateOutcome({
      actionId: 'betray',
      actorId: 'p1',
      targetIds: 'p2',
      mode: 'preview',
      relationships: { p1: { p2: { affinity: -1, tags: [] } } },
    });
    // With affinity -1 and actorBias = -1 * 0.1 = -0.1, score = -0.15 + -0.1 = -0.25
    expect(result.label).toBe('Bad');
  });

  it('returns label "Good" for positive score below good threshold', () => {
    // friendlySuccess = 0.1, which is >= 0.05 and < 0.3 → 'Good'
    const result = evaluateOutcome({
      actionId: 'ally',
      actorId: 'p1',
      targetIds: 'p2',
      mode: 'preview',
    });
    expect(result.label).toBe('Good');
  });

  it('returns label "Great" for score at or above good threshold (0.3)', () => {
    // friendlySuccess = 0.1 + high positive affinity bias: 2.0 * 0.1 = 0.2 → 0.3 clamped
    const result = evaluateOutcome({
      actionId: 'ally',
      actorId: 'p1',
      targetIds: 'p2',
      mode: 'preview',
      relationships: { p1: { p2: { affinity: 2.0, tags: [] } } },
    });
    expect(result.label).toBe('Great');
  });

  it('returns label "Unmoved" for score of 0 (unknown action)', () => {
    const result = evaluateOutcome({
      actionId: 'unknown_xyz',
      actorId: 'p1',
      targetIds: 'p2',
      mode: 'preview',
    });
    expect(result.label).toBe('Unmoved');
  });

  it('magnitude equals absolute value of score', () => {
    const result = evaluateOutcome({
      actionId: 'betray',
      actorId: 'p1',
      targetIds: 'p2',
      mode: 'preview',
    });
    expect(result.magnitude).toBeCloseTo(Math.abs(result.score));
  });

  it('score is the average across multiple targets', () => {
    // Two targets: p2 (no affinity) and p3 (no affinity) with same action → same per-target score
    const singleScore = computeOutcomeScore('ally', 'p1', 'p2', 'preview');
    const result = evaluateOutcome({
      actionId: 'ally',
      actorId: 'p1',
      targetIds: ['p2', 'p3'],
      mode: 'preview',
    });
    // Both targets produce the same score (no relationships), so average = that score
    expect(result.score).toBeCloseTo(singleScore);
  });

  it('is deterministic in preview mode for multiple targets', () => {
    const r1 = evaluateOutcome({ actionId: 'ally', actorId: 'p1', targetIds: ['p2', 'p3'], mode: 'preview' });
    const r2 = evaluateOutcome({ actionId: 'ally', actorId: 'p1', targetIds: ['p2', 'p3'], mode: 'preview' });
    expect(r1.score).toBe(r2.score);
    expect(r1.label).toBe(r2.label);
  });
});

// ── OUTCOME_THRESHOLDS ─────────────────────────────────────────────────────

describe('OUTCOME_THRESHOLDS constants', () => {
  it('bad threshold is -0.25', () => {
    expect(OUTCOME_THRESHOLDS.bad).toBe(-0.25);
  });

  it('unmoved threshold is 0.05', () => {
    expect(OUTCOME_THRESHOLDS.unmoved).toBe(0.05);
  });

  it('good threshold is 0.3', () => {
    expect(OUTCOME_THRESHOLDS.good).toBe(0.3);
  });
});

// ── Integration: executeAction wires evaluator ─────────────────────────────

describe('executeAction – evaluator integration', () => {
  it('returns score and label fields on success', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const result = executeAction('p1', 'p2', 'ally');
    expect(result.success).toBe(true);
    expect(typeof result.score).toBe('number');
    expect(typeof result.label).toBe('string');
  });

  it('returns score and label fields on failure result', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }));

    const result = executeAction('p1', 'p2', 'ally');
    expect(result.success).toBe(false);
    expect(typeof result.score).toBe('number');
    expect(typeof result.label).toBe('string');
  });

  it('sessionLog entries include score and label after executeAction', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    executeAction('p1', 'p2', 'ally');
    const logs = selectSessionLogs(store.getState());
    expect(logs).toHaveLength(1);
    expect(typeof logs[0].score).toBe('number');
    expect(typeof logs[0].label).toBe('string');
  });

  it('previewOnly mode does not mutate state', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    executeAction('p1', 'p2', 'ally', { previewOnly: true });
    expect(store.getState().social.sessionLogs).toHaveLength(0);
    expect(store.getState().social.energyBank['p1']).toBe(10);
    expect(store.getState().social.relationships['p1']?.['p2']).toBeUndefined();
  });

  it('previewOnly mode returns score and label deterministically', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const r1 = executeAction('p1', 'p2', 'ally', { previewOnly: true });
    const r2 = executeAction('p1', 'p2', 'ally', { previewOnly: true });
    expect(r1.score).toBe(r2.score);
    expect(r1.label).toBe(r2.label);
  });

  it('label in sessionLog is within expected range for friendly action (ally)', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    executeAction('p1', 'p2', 'ally');
    const logs = selectSessionLogs(store.getState());
    // ally is friendly: base score = friendlySuccess (0.1) ± JITTER_MAGNITUDE (0.08)
    // So score is in [0.02, 0.18] → label is 'Unmoved' or 'Good', never 'Bad' or 'Great'.
    expect(['Unmoved', 'Good']).toContain(logs[0].label);
  });
});
