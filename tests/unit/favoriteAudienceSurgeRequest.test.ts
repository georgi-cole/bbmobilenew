import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestFavoriteAudienceSurge } from '../../src/screens/GameScreen/favoriteAudienceSurgeRequest';

describe('requestFavoriteAudienceSurge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.GameAds;
  });

  it('grants the surge immediately when the native rewarded bridge is unavailable', async () => {
    const dispatch = vi.fn();
    const setAdPending = vi.fn();

    await expect(
      requestFavoriteAudienceSurge({
        playerId: 'p1',
        adPending: false,
        dispatch,
        getState: () => ({}) as never,
        isMounted: () => true,
        setAdPending,
      }),
    ).resolves.toBe(true);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ads/recordAdShown',
        payload: 'favorite_player_audience_surge',
      }),
    );
    expect(setAdPending).toHaveBeenNthCalledWith(1, true);
    expect(setAdPending).toHaveBeenNthCalledWith(2, false);
  });

  it('clears the pending state when the rewarded request never resolves', async () => {
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: vi.fn(),
    };

    const clearRewardHandlerFn = vi.fn();
    const setAdPending = vi.fn();
    const result = requestFavoriteAudienceSurge({
      playerId: 'p1',
      adPending: false,
      dispatch: vi.fn(),
      getState: () => ({}) as never,
      isMounted: () => true,
      setAdPending,
      timeoutMs: 1500,
      showRewardedFn: vi.fn(() => true),
      clearRewardHandlerFn,
    });

    await vi.advanceTimersByTimeAsync(1500);

    await expect(result).resolves.toBe(false);
    expect(clearRewardHandlerFn).toHaveBeenCalledWith('favorite_player_audience_surge');
    expect(setAdPending).toHaveBeenNthCalledWith(1, true);
    expect(setAdPending).toHaveBeenNthCalledWith(2, false);
  });

  it('resolves successfully when the reward is granted before the timeout', async () => {
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: vi.fn(),
    };

    const setAdPending = vi.fn();
    const clearRewardHandlerFn = vi.fn();

    await expect(
      requestFavoriteAudienceSurge({
        playerId: 'p1',
        adPending: false,
        dispatch: vi.fn(),
        getState: () => ({}) as never,
        isMounted: () => true,
        setAdPending,
        timeoutMs: 1500,
        showRewardedFn: vi.fn((_placement, _state, _dispatch, onReward) => {
          onReward();
          return true;
        }),
        clearRewardHandlerFn,
      }),
    ).resolves.toBe(true);

    expect(clearRewardHandlerFn).not.toHaveBeenCalled();
    expect(setAdPending).toHaveBeenNthCalledWith(1, true);
    expect(setAdPending).toHaveBeenNthCalledWith(2, false);
  });
});
