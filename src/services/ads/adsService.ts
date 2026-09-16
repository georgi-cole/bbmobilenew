/**
 * adsService — centralized ad hook architecture for the game layer.
 *
 * Bridge contract:
 *   Game → native: window.GameAds?.showInterstitial(placement)
 *                  window.GameAds?.showRewarded(placement)
 *   Native → game: window.onAdRewardGranted(placement, payload?)
 *
 * The dedicated mobile-dev build keeps this same contract but simulates a
 * successful rewarded ad when no native ad bridge is installed.
 */

import type { AppDispatch, RootState } from '../../store/store'
import { recordAdShown } from '../../store/adsSlice'
import { hasEffectiveStoreEntitlement } from '../../vip/effectiveEntitlements'
import { IS_MOBILE_DEV_BUILD } from '../../config/buildTarget'

export type AdPlacement =
  | 'competition_retry'
  | 'eviction_auto'
  | 'pos_decision_auto'
  | 'final_safety_decision_auto'
  | 'final_loh_decision_auto'
  | 'finale_recap_auto'
  | 'social_energy_recharge'
  | 'public_meter_disliked_boost'
  | 'eviction_vote_breakdown'
  | 'vox_nomination_breakdown'
  | 'vox_audience_preview'
  | 'favorite_player_audience_surge'

export const INTERSTITIAL_PLACEMENTS = new Set<AdPlacement>([
  'eviction_auto',
  'pos_decision_auto',
  'final_safety_decision_auto',
  'final_loh_decision_auto',
  'finale_recap_auto',
])

export const DAILY_LIMITED_PLACEMENTS = new Set<AdPlacement>([
  'social_energy_recharge',
  'public_meter_disliked_boost',
])

declare global {
  interface Window {
    GameAds?: {
      showInterstitial(placement: string): void
      showRewarded(placement: string): void
    }
    onAdRewardGranted?: (placement: string, payload?: Record<string, unknown>) => void
  }
}

type RewardHandler = (payload?: Record<string, unknown>) => void
const rewardHandlers = new Map<AdPlacement, RewardHandler>()

export function clearRewardHandler(placement: AdPlacement): void {
  rewardHandlers.delete(placement)
}

export function initAdBridge(): void {
  window.onAdRewardGranted = (placement: string, payload?: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      console.log(`[ads] reward granted: ${placement}`, payload ?? {})
    }
    const handler = rewardHandlers.get(placement as AdPlacement)
    if (handler) {
      rewardHandlers.delete(placement as AdPlacement)
      handler(payload)
    } else if (import.meta.env.DEV) {
      console.log(
        `[ads] reward granted: ${placement} — no handler registered (ad may have been dismissed)`
      )
    }
  }
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isAdDailyLimitReached(placement: AdPlacement, state: RootState): boolean {
  if (!DAILY_LIMITED_PLACEMENTS.has(placement)) return false
  const lastUsed = state.ads?.dailyUsage[placement]
  return lastUsed === todayDateString()
}

export function canShowAd(
  placement: AdPlacement,
  state: RootState,
  options?: { isFinal3Week?: boolean }
): boolean {
  const hasNoAdsPack =
    (state.ads?.hasNoAdsPack ?? false) || hasEffectiveStoreEntitlement(state.vip, 'noAds')

  if (INTERSTITIAL_PLACEMENTS.has(placement) && hasNoAdsPack) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: No Ads Pack owned`)
    }
    return false
  }

  if (placement === 'competition_retry' && options?.isFinal3Week) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: final-3 week`)
    }
    return false
  }

  if (isAdDailyLimitReached(placement, state)) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: daily limit reached`)
    }
    return false
  }

  if (import.meta.env.DEV) {
    console.log(`[ads] ${placement} eligible`)
  }
  return true
}

export function showInterstitial(
  placement: AdPlacement,
  state: RootState,
  dispatch: AppDispatch,
  options?: { isFinal3Week?: boolean }
): boolean {
  if (!canShowAd(placement, state, options)) return false
  if (!window.GameAds?.showInterstitial) {
    if (IS_MOBILE_DEV_BUILD) {
      dispatch(recordAdShown(placement))
      return true
    }
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} interstitial skipped: native bridge absent`)
    }
    return false
  }

  if (import.meta.env.DEV) {
    console.log(`[ads] requesting interstitial: ${placement}`)
  }
  try {
    window.GameAds.showInterstitial(placement)
  } catch (error) {
    console.warn(`[ads] ${placement} interstitial bridge failed; request was not recorded`, error)
    return false
  }
  dispatch(recordAdShown(placement))
  return true
}

export function showRewarded(
  placement: AdPlacement,
  state: RootState,
  dispatch: AppDispatch,
  onReward: (payload?: Record<string, unknown>) => void,
  options?: { isFinal3Week?: boolean }
): boolean {
  if (!canShowAd(placement, state, options)) return false
  if (rewardHandlers.has(placement)) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} rewarded skipped: request already pending`)
    }
    return false
  }

  if (!window.GameAds?.showRewarded) {
    if (!IS_MOBILE_DEV_BUILD) {
      if (import.meta.env.DEV) {
        console.log(`[ads] ${placement} rewarded skipped: native bridge absent`)
      }
      return false
    }

    rewardHandlers.set(placement, onReward)
    dispatch(recordAdShown(placement))
    window.setTimeout(() => {
      window.onAdRewardGranted?.(placement, { source: 'mobile-dev-simulator' })
    }, 0)
    return true
  }

  if (import.meta.env.DEV) {
    console.log(`[ads] requesting rewarded: ${placement}`)
  }
  rewardHandlers.set(placement, onReward)
  try {
    window.GameAds.showRewarded(placement)
  } catch (error) {
    rewardHandlers.delete(placement)
    console.warn(`[ads] ${placement} rewarded bridge failed; request was not recorded`, error)
    return false
  }
  dispatch(recordAdShown(placement))
  return true
}
