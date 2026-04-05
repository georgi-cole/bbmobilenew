import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RootState } from '../../../store/store';
import { showInterstitial, showRewarded } from '../adsService';

function makeState(overrides?: Partial<RootState['ads']>): RootState {
  return {
    ads: {
      hasNoAdsPack: false,
      dailyUsage: {},
      lastCompLastPlaceType: null,
      ...overrides,
    },
  } as RootState;
}

describe('adsService bridge guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.GameAds;
    delete window.onAdRewardGranted;
  });

  it('does not record usage for interstitials when the native bridge is missing', () => {
    const dispatch = vi.fn();

    expect(showInterstitial('eviction_auto', makeState(), dispatch)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not record usage for rewarded ads when the native bridge is missing', () => {
    const dispatch = vi.fn();

    expect(
      showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn()),
    ).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('records usage only when a rewarded ad request is sent through the native bridge', () => {
    const dispatch = vi.fn();
    const showRewardedBridge = vi.fn();
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: showRewardedBridge,
    };

    expect(
      showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn()),
    ).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ads/recordAdShown',
        payload: 'social_energy_recharge',
      }),
    );
    expect(showRewardedBridge).toHaveBeenCalledWith('social_energy_recharge');
  });
});
