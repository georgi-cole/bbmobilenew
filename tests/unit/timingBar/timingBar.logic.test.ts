/**
 * Unit tests: Timing Bar — core game logic.
 *
 * Covers:
 *  1. getRoundDurationSeconds: 20→15→10→5→5 sequence.
 *  2. computeRawAccuracy: centre = 100%, edges = 0%.
 *  3. applyAttemptPenalty: deducts 6pp per non-locking attempt, clamped to 0.
 *  4. formatAccuracy: comma decimal separator, 1 decimal place.
 *  5. getEliminationCount: 5+→2, 3-4→1, 2→0.
 *  6. assignRanks: sort order (accuracy → time → attempts → shared).
 *  7. buildTimingRoundResult: computes entries, ranks, and eliminations.
 *  8. buildTimingRoundResult: timed-out player scores 0%.
 *  9. Elimination never reduces below 2 remaining.
 * 10. deriveRoundSeed: deterministic per round.
 */

import { describe, it, expect } from 'vitest';
import {
  getRoundDurationSeconds,
  computeRawAccuracy,
  applyAttemptPenalty,
  formatAccuracy,
  getEliminationCount,
  assignRanks,
  buildTimingRoundResult,
  deriveRoundSeed,
  NON_LOCKING_PENALTY_PP,
  TARGET_POSITION,
  type TimingParticipant,
  type TimingSubmission,
} from '../../../src/components/TimingBar/timingBarLogic';

// ── 1. getRoundDurationSeconds ─────────────────────────────────────────────────

describe('getRoundDurationSeconds', () => {
  it('returns 20s for round 1', () => {
    expect(getRoundDurationSeconds(1)).toBe(20);
  });

  it('returns 15s for round 2', () => {
    expect(getRoundDurationSeconds(2)).toBe(15);
  });

  it('returns 10s for round 3', () => {
    expect(getRoundDurationSeconds(3)).toBe(10);
  });

  it('returns 5s for round 4', () => {
    expect(getRoundDurationSeconds(4)).toBe(5);
  });

  it('does not go below 5s in round 5+', () => {
    expect(getRoundDurationSeconds(5)).toBe(5);
    expect(getRoundDurationSeconds(10)).toBe(5);
    expect(getRoundDurationSeconds(100)).toBe(5);
  });
});

// ── 2. computeRawAccuracy ──────────────────────────────────────────────────────

describe('computeRawAccuracy', () => {
  it('returns 100 when bar is at centre (50)', () => {
    expect(computeRawAccuracy(TARGET_POSITION)).toBe(100);
  });

  it('returns 0 when bar is at leftmost edge (0)', () => {
    expect(computeRawAccuracy(0)).toBe(0);
  });

  it('returns 0 when bar is at rightmost edge (100)', () => {
    expect(computeRawAccuracy(100)).toBe(0);
  });

  it('returns 50 when bar is at position 25 (halfway from edge to centre)', () => {
    expect(computeRawAccuracy(25)).toBe(50);
  });

  it('returns 50 when bar is at position 75', () => {
    expect(computeRawAccuracy(75)).toBe(50);
  });

  it('never goes below 0', () => {
    expect(computeRawAccuracy(-10)).toBe(0);
    expect(computeRawAccuracy(110)).toBe(0);
  });
});

// ── 3. applyAttemptPenalty ─────────────────────────────────────────────────────

describe('applyAttemptPenalty', () => {
  it('applies no penalty with 0 non-locking attempts', () => {
    expect(applyAttemptPenalty(80, 0)).toBe(80);
  });

  it(`deducts ${NON_LOCKING_PENALTY_PP}pp per non-locking attempt`, () => {
    expect(applyAttemptPenalty(80, 1)).toBeCloseTo(80 - NON_LOCKING_PENALTY_PP);
    expect(applyAttemptPenalty(80, 2)).toBeCloseTo(80 - NON_LOCKING_PENALTY_PP * 2);
  });

  it('clamps result to 0', () => {
    expect(applyAttemptPenalty(5, 5)).toBe(0);
    expect(applyAttemptPenalty(0, 10)).toBe(0);
  });

  it('allows exactly 0', () => {
    expect(applyAttemptPenalty(6, 1)).toBeCloseTo(0);
  });
});

// ── 4. formatAccuracy ─────────────────────────────────────────────────────────

describe('formatAccuracy', () => {
  it('formats with comma decimal separator and % suffix', () => {
    expect(formatAccuracy(98.4)).toBe('98,4%');
    expect(formatAccuracy(100)).toBe('100,0%');
    expect(formatAccuracy(0)).toBe('0,0%');
  });

  it('rounds to 1 decimal place', () => {
    expect(formatAccuracy(75.61)).toBe('75,6%');
    expect(formatAccuracy(75.54)).toBe('75,5%');
  });
});

// ── 5. getEliminationCount ────────────────────────────────────────────────────

describe('getEliminationCount', () => {
  it('eliminates 2 when 5+ players', () => {
    expect(getEliminationCount(5)).toBe(2);
    expect(getEliminationCount(8)).toBe(2);
    expect(getEliminationCount(10)).toBe(2);
  });

  it('eliminates 1 when 3 or 4 players', () => {
    expect(getEliminationCount(3)).toBe(1);
    expect(getEliminationCount(4)).toBe(1);
  });

  it('eliminates 0 when 2 players', () => {
    expect(getEliminationCount(2)).toBe(0);
  });
});

// ── 6. assignRanks ────────────────────────────────────────────────────────────

describe('assignRanks', () => {
  const makeEntry = (
    id: string,
    finalAccuracy: number,
    timeRemainingMs: number,
    nonLockingAttempts: number,
  ) => ({
    participantId: id,
    name: id,
    avatar: '🧑',
    isHuman: false,
    finalAccuracy,
    rawAccuracy: finalAccuracy,
    timeRemainingMs,
    nonLockingAttempts,
    timedOut: false,
  });

  it('ranks higher accuracy first', () => {
    const entries = [
      makeEntry('b', 70, 5000, 0),
      makeEntry('a', 90, 5000, 0),
    ];
    const ranked = assignRanks(entries, 42);
    expect(ranked[0].participantId).toBe('a');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].participantId).toBe('b');
    expect(ranked[1].rank).toBe(2);
  });

  it('uses time remaining as tiebreaker (more = better)', () => {
    const entries = [
      makeEntry('slow', 80, 2000, 0),
      makeEntry('fast', 80, 8000, 0),
    ];
    const ranked = assignRanks(entries, 42);
    expect(ranked[0].participantId).toBe('fast');
    expect(ranked[1].participantId).toBe('slow');
  });

  it('uses fewer attempts as third tiebreaker', () => {
    const entries = [
      makeEntry('proby', 80, 5000, 3),
      makeEntry('clean', 80, 5000, 1),
    ];
    const ranked = assignRanks(entries, 42);
    expect(ranked[0].participantId).toBe('clean');
    expect(ranked[1].participantId).toBe('proby');
  });

  it('assigns shared rank when all criteria are tied (3+ players)', () => {
    const entries = [
      makeEntry('a', 80, 5000, 1),
      makeEntry('b', 80, 5000, 1),
      makeEntry('c', 60, 3000, 0),
    ];
    const ranked = assignRanks(entries, 42);
    const rankA = ranked.find((e) => e.participantId === 'a')?.rank;
    const rankB = ranked.find((e) => e.participantId === 'b')?.rank;
    expect(rankA).toBe(1);
    expect(rankB).toBe(1);
    const rankC = ranked.find((e) => e.participantId === 'c')?.rank;
    expect(rankC).toBe(3);
  });
});

// ── 7. buildTimingRoundResult ─────────────────────────────────────────────────

describe('buildTimingRoundResult', () => {
  const participants: TimingParticipant[] = [
    { id: 'p1', name: 'Alice', avatar: '🧑', isHuman: true },
    { id: 'p2', name: 'Bob', avatar: '🤖', isHuman: false },
    { id: 'p3', name: 'Carol', avatar: '🤖', isHuman: false },
    { id: 'p4', name: 'Dave', avatar: '🤖', isHuman: false },
    { id: 'p5', name: 'Eve', avatar: '🤖', isHuman: false },
  ];

  const submissions: TimingSubmission[] = [
    { participantId: 'p1', lockedPosition: 50, timeRemainingMs: 10000, nonLockingAttempts: 0, timedOut: false },
    { participantId: 'p2', lockedPosition: 55, timeRemainingMs: 8000, nonLockingAttempts: 0, timedOut: false },
    { participantId: 'p3', lockedPosition: 45, timeRemainingMs: 7000, nonLockingAttempts: 1, timedOut: false },
    { participantId: 'p4', lockedPosition: 30, timeRemainingMs: 6000, nonLockingAttempts: 0, timedOut: false },
    { participantId: 'p5', lockedPosition: 20, timeRemainingMs: 5000, nonLockingAttempts: 0, timedOut: false },
  ];

  it('returns entries for all participants', () => {
    const result = buildTimingRoundResult({
      roundNumber: 1,
      activeParticipants: participants,
      submissions,
      allPlayers: [],
      seed: 42,
    });
    expect(result.entries).toHaveLength(5);
  });

  it('marks the correct players as eliminated (5 players → 2 eliminated)', () => {
    const result = buildTimingRoundResult({
      roundNumber: 1,
      activeParticipants: participants,
      submissions,
      allPlayers: [],
      seed: 42,
    });
    const eliminated = result.entries.filter((e) => e.isEliminated);
    expect(eliminated).toHaveLength(2);
    expect(result.eliminatedIds).toHaveLength(2);
    expect(result.advancingIds).toHaveLength(3);
  });

  it('advancing + eliminated = all participants', () => {
    const result = buildTimingRoundResult({
      roundNumber: 1,
      activeParticipants: participants,
      submissions,
      allPlayers: [],
      seed: 42,
    });
    expect(result.advancingIds.length + result.eliminatedIds.length).toBe(participants.length);
  });

  it('player at centre (100% raw) gets highest accuracy', () => {
    const result = buildTimingRoundResult({
      roundNumber: 1,
      activeParticipants: participants,
      submissions,
      allPlayers: [],
      seed: 42,
    });
    const p1Entry = result.entries.find((e) => e.participantId === 'p1');
    expect(p1Entry?.rawAccuracy).toBe(100);
    expect(p1Entry?.finalAccuracy).toBe(100); // 0 non-locking
  });
});

// ── 8. Timed-out player scores 0% ─────────────────────────────────────────────

describe('buildTimingRoundResult — timeout', () => {
  it('assigns 0% accuracy and timeRemainingMs=0 to timed-out players', () => {
    const participants: TimingParticipant[] = [
      { id: 'p1', name: 'Alice', avatar: '🧑', isHuman: true },
      { id: 'p2', name: 'Bob', avatar: '🤖', isHuman: false },
    ];
    const submissions: TimingSubmission[] = [
      { participantId: 'p1', lockedPosition: 50, timeRemainingMs: 5000, nonLockingAttempts: 0, timedOut: false },
      { participantId: 'p2', lockedPosition: 0, timeRemainingMs: 0, nonLockingAttempts: 0, timedOut: true },
    ];
    const result = buildTimingRoundResult({
      roundNumber: 1,
      activeParticipants: participants,
      submissions,
      allPlayers: [],
      seed: 42,
    });
    const timedOut = result.entries.find((e) => e.participantId === 'p2');
    expect(timedOut?.timedOut).toBe(true);
    expect(timedOut?.finalAccuracy).toBe(0);
    expect(timedOut?.timeRemainingMs).toBe(0);
  });
});

// ── 9. Elimination never reduces below 2 remaining ────────────────────────────

describe('buildTimingRoundResult — never below 2 remaining', () => {
  it('does not eliminate anyone when exactly 2 players remain', () => {
    const participants: TimingParticipant[] = [
      { id: 'p1', name: 'Alice', avatar: '🧑', isHuman: true },
      { id: 'p2', name: 'Bob', avatar: '🤖', isHuman: false },
    ];
    const submissions: TimingSubmission[] = [
      { participantId: 'p1', lockedPosition: 50, timeRemainingMs: 5000, nonLockingAttempts: 0, timedOut: false },
      { participantId: 'p2', lockedPosition: 40, timeRemainingMs: 4000, nonLockingAttempts: 0, timedOut: false },
    ];
    const result = buildTimingRoundResult({
      roundNumber: 1,
      activeParticipants: participants,
      submissions,
      allPlayers: [],
      seed: 42,
    });
    expect(result.eliminatedIds).toHaveLength(0);
    expect(result.advancingIds).toHaveLength(2);
    expect(result.isFinalRound).toBe(true);
  });
});

// ── 10. deriveRoundSeed ────────────────────────────────────────────────────────

describe('deriveRoundSeed', () => {
  it('is deterministic', () => {
    const s1 = deriveRoundSeed(999, 3);
    const s2 = deriveRoundSeed(999, 3);
    expect(s1).toBe(s2);
  });

  it('produces different seeds for different rounds', () => {
    const s1 = deriveRoundSeed(999, 1);
    const s2 = deriveRoundSeed(999, 2);
    expect(s1).not.toBe(s2);
  });
});
