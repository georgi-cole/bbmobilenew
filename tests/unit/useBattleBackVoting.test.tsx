import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBattleBackVoting } from '../../src/hooks/useBattleBackVoting';

vi.mock('../../src/services/sound/publicVotingAudioTiming', () => ({
  getPublicVotingAudioDurationMs: vi.fn(() => Promise.resolve(null)),
  calculatePublicVotingEliminationIntervalMs: vi.fn(
    (_duration: number | null, _candidateCount: number, fallback: number) => fallback,
  ),
}));

describe('useBattleBackVoting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('eliminates by authoritative target order despite live percentage drift', async () => {
    const { result } = renderHook(() =>
      useBattleBackVoting({
        candidates: ['low', 'favorite', 'middle'],
        seed: 9,
        eliminationIntervalMs: 800,
        tickIntervalMs: 100,
        driftAmount: 8,
        targetPercentages: { low: 12, favorite: 63, middle: 25 },
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(810);
    });
    expect(result.current.eliminated).toEqual(['low']);
    expect(result.current.isComplete).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(810);
    });
    expect(result.current.eliminated).toEqual(['low', 'middle']);
    expect(result.current.winnerId).toBe('favorite');
    expect(result.current.isComplete).toBe(true);
  });

  it('completes a single-candidate vote immediately', () => {
    const { result } = renderHook(() =>
      useBattleBackVoting({ candidates: ['only'], seed: 1 }),
    );
    expect(result.current).toMatchObject({
      votes: { only: 100 },
      eliminated: [],
      winnerId: 'only',
      isComplete: true,
    });
  });

  it('treats an empty pool as complete instead of starting permanent intervals', () => {
    const { result } = renderHook(() => useBattleBackVoting({ candidates: [], seed: 1 }));
    expect(result.current).toEqual({
      votes: {},
      eliminated: [],
      winnerId: null,
      isComplete: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
