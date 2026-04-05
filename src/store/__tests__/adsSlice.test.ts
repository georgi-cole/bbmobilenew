import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAdsState, saveAdsState, type AdsState } from '../adsSlice';

const ADS_STORAGE_KEY = 'bbmobilenew_ads_v1';

describe('adsSlice persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('loadAdsState restores persisted fields but resets transient competition state', () => {
    localStorage.setItem(
      ADS_STORAGE_KEY,
      JSON.stringify({
        hasNoAdsPack: true,
        dailyUsage: { social_energy_recharge: '2026-04-05' },
        lastCompLastPlaceType: 'loh',
      }),
    );

    expect(loadAdsState()).toEqual<AdsState>({
      hasNoAdsPack: true,
      dailyUsage: { social_energy_recharge: '2026-04-05' },
      lastCompLastPlaceType: null,
    });
  });

  it('saveAdsState omits transient competition state from localStorage', () => {
    saveAdsState({
      hasNoAdsPack: true,
      dailyUsage: { public_meter_disliked_boost: '2026-04-05' },
      lastCompLastPlaceType: 'pos',
    });

    expect(localStorage.getItem(ADS_STORAGE_KEY)).toBe(
      JSON.stringify({
        hasNoAdsPack: true,
        dailyUsage: { public_meter_disliked_boost: '2026-04-05' },
      }),
    );
  });
});
