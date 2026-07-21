import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RootState } from '../../../store/store'
import { canShowAd, showInterstitial, showRewarded } from '../adsService'

function makeState(
  overrides?: Partial<RootState['ads']>,
  vipOverrides?: Partial<RootState['vip']>
): RootState {
  return {
    ads: {
      hasNoAdsPack: false,
      dailyUsage: {},
      lastCompLastPlaceType: null,
      ...overrides,
    },
    vip: {
      isActive: false,
      entitlements: {
        survivalMode: false,
        publicMode: false,
        tribunalHouse: false,
        dramaMode: false,
        noAds: false,
      },
      ...vipOverrides,
    },
  } as RootState
}

describe('adsService bridge guards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete window.GameAds
    delete window.onAdRewardGranted
  })

  it('does not record usage for interstitials when the native bridge is missing', () => {
    const dispatch = vi.fn()

    expect(showInterstitial('eviction_auto', makeState(), dispatch)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not record usage for rewarded ads when the native bridge is missing', () => {
    const dispatch = vi.fn()

    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('records usage only when a rewarded ad request is sent through the native bridge', () => {
    const dispatch = vi.fn()
    const showRewardedBridge = vi.fn()
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: showRewardedBridge,
    }

    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ads/recordAdShown',
        payload: 'social_energy_recharge',
      })
    )
    expect(showRewardedBridge).toHaveBeenCalledWith('social_energy_recharge')
  })
})

describe('canShowAd guard logic', () => {
  it('blocks automatic interstitials when the legacy No Ads Pack is owned', () => {
    expect(canShowAd('eviction_auto', makeState({ hasNoAdsPack: true }))).toBe(false)
  })

  it('blocks automatic interstitials for standalone No Ads owners', () => {
    expect(
      canShowAd(
        'eviction_auto',
        makeState(undefined, {
          entitlements: {
            survivalMode: false,
            publicMode: false,
            tribunalHouse: false,
            dramaMode: false,
            noAds: true,
          },
        })
      )
    ).toBe(false)
  })

  it('blocks automatic interstitials for VIP owners', () => {
    expect(canShowAd('eviction_auto', makeState(undefined, { isActive: true }))).toBe(false)
  })

  it('does not block rewarded ads when No Ads Pack is owned', () => {
    expect(canShowAd('social_energy_recharge', makeState({ hasNoAdsPack: true }))).toBe(true)
    expect(canShowAd('competition_retry', makeState({ hasNoAdsPack: true }))).toBe(true)
  })

  it('blocks competition_retry during the final-3 week', () => {
    expect(canShowAd('competition_retry', makeState(), { isFinal3Week: true })).toBe(false)
  })

  it('allows competition_retry outside the final-3 week', () => {
    expect(canShowAd('competition_retry', makeState(), { isFinal3Week: false })).toBe(true)
    expect(canShowAd('competition_retry', makeState())).toBe(true)
  })

  it('blocks daily-limited placements when already shown today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(
      canShowAd(
        'social_energy_recharge',
        makeState({ dailyUsage: { social_energy_recharge: today } })
      )
    ).toBe(false)
  })

  it('allows daily-limited placements when last shown on a different day', () => {
    expect(
      canShowAd(
        'social_energy_recharge',
        makeState({ dailyUsage: { social_energy_recharge: '2000-01-01' } })
      )
    ).toBe(true)
  })
})
