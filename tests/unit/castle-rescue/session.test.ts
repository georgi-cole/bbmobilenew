import { describe, expect, it, vi } from 'vitest';
import {
  PENALTY_DEATH,
  PENALTY_OUT_OF_LIVES,
} from '../../../src/minigames/castleRescue/castleRescueConstants';
import {
  applyCastleRescueLifeLoss,
  resolveCastleRescueRunSeed,
} from '../../../src/minigames/castleRescue/castleRescueSession';

describe('resolveCastleRescueRunSeed', () => {
  it('keeps explicit non-zero seeds for deterministic runs', () => {
    const makeSeed = vi.fn(() => 999);
    expect(resolveCastleRescueRunSeed(123, makeSeed)).toBe(123);
    expect(makeSeed).not.toHaveBeenCalled();
  });

  it('treats seed 0 as an implicit random session seed', () => {
    const makeSeed = vi.fn(() => 456789);
    expect(resolveCastleRescueRunSeed(0, makeSeed)).toBe(456789);
    expect(makeSeed).toHaveBeenCalledTimes(1);
  });

  it('falls back to a random session seed when seed is undefined', () => {
    const makeSeed = vi.fn(() => 987654321);
    expect(resolveCastleRescueRunSeed(undefined, makeSeed)).toBe(987654321);
    expect(makeSeed).toHaveBeenCalledTimes(1);
  });
});

describe('applyCastleRescueLifeLoss', () => {
  it('subtracts one life and the standard death penalty while lives remain', () => {
    const gs = {
      hearts: 3,
      score: 500,
      startTime: 1_000,
      princessRescued: false,
      finalElapsedMs: 0,
      finalScore: 0,
      phase: 'playing' as const,
      endReason: 'timeout' as const,
    };

    const ended = applyCastleRescueLifeLoss(gs, 4_000, PENALTY_DEATH, PENALTY_OUT_OF_LIVES);

    expect(ended).toBe(false);
    expect(gs.hearts).toBe(2);
    expect(gs.score).toBe(450);
    expect(gs.phase).toBe('playing');
  });

  it('applies the extra 250-point penalty and completes the run on the last life', () => {
    const computeFinalScore = vi.fn(() => 120);
    const gs = {
      hearts: 1,
      score: 500,
      startTime: 2_000,
      princessRescued: false,
      finalElapsedMs: 0,
      finalScore: 0,
      phase: 'playing' as const,
      endReason: 'timeout' as const,
    };

    const ended = applyCastleRescueLifeLoss(
      gs,
      8_000,
      PENALTY_DEATH,
      PENALTY_OUT_OF_LIVES,
      computeFinalScore,
    );

    expect(ended).toBe(true);
    expect(gs.hearts).toBe(0);
    expect(gs.score).toBe(200);
    expect(gs.finalElapsedMs).toBe(6_000);
    expect(gs.finalScore).toBe(120);
    expect(gs.phase).toBe('complete');
    expect(gs.endReason).toBe('out_of_lives');
    expect(computeFinalScore).toHaveBeenCalledWith(gs, 6_000);
  });

  it('clamps the combined loss penalties at zero', () => {
    const gs = {
      hearts: 1,
      score: 200,
      startTime: 0,
      princessRescued: false,
      finalElapsedMs: 0,
      finalScore: 0,
      phase: 'playing' as const,
      endReason: 'timeout' as const,
    };

    applyCastleRescueLifeLoss(gs, 1_000, PENALTY_DEATH, PENALTY_OUT_OF_LIVES, () => 0);

    expect(gs.score).toBe(0);
    expect(gs.hearts).toBe(0);
  });
});
