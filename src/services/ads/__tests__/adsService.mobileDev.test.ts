import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RootState } from '../../../store/store'

vi.mock('../../../config/buildTarget', () => ({
  BUILD_TARGET: 'mobile-dev',
  IS_ADMIN_BUILD: false,
  IS_MOBILE_DEV_BUILD: true,
  IS_RELEASE_BUILD: true,
}))

import { clearRewardHandler, initAdBridge, showRewarded } from '../adsService'

function makeState(): RootState {
  return {
    ads: {
      hasNoAdsPack: false,
      dailyUsage: {},
      lastCompLastPlaceType: null,
    },
    vip: {
      isActive: false,
      entitlements: {
        survivalMode: false,
        publicMode: false,
        tribunalHouse: false,
        dramaMode: false,
        cupidArrow: false,
        voxPopuli: false,
        premiumChallenges: false,
        noAds: false,
      },
    },
  } as RootState
}

describe('adsService mobile-dev simulator', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearRewardHandler('eviction_vote_breakdown')
    delete window.GameAds
    delete window.onAdRewardGranted
  })

  it('grants a rewarded-ad result without a native bridge', async () => {
    vi.useFakeTimers()
    initAdBridge()
    const dispatch = vi.fn()
    const onReward = vi.fn()

    expect(
      showRewarded('eviction_vote_breakdown', makeState(), dispatch, onReward)
    ).toBe(true)

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ads/recordAdShown',
        payload: 'eviction_vote_breakdown',
      })
    )

    await vi.runAllTimersAsync()

    expect(onReward).toHaveBeenCalledTimes(1)
    expect(onReward).toHaveBeenCalledWith({ source: 'mobile-dev-simulator' })
  })
})
