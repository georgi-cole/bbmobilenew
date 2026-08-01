/**
 * adsService — centralized ad hook architecture for the game layer.
 *
 * Bridge contract:
 *   Game → native:  window.GameAds?.showInterstitial(placement)
 *                   window.GameAds?.showRewarded(placement)
 *   Native → game:  window.onAdRewardGranted(placement, payload?)
 *
 * Guard rules enforced here:
 *   - Automatic interstitials are suppressed when the user owns No Ads Pack.
 *   - Rewarded (optional) ads are always available, even with No Ads Pack.
 *   - Per-placement daily limits are respected via the Redux adsSlice.
 *   - competition_retry is blocked during the final-3 week.
 *
 * In web / dev environments where window.GameAds is not defined every call
 * is a safe no-op — the game proceeds normally without any ad.
 */

import type { AppDispatch, RootState } from '../../store/store'
import { recordAdShown } from '../../store/adsSlice'

// ── Placement definitions ─────────────────────────────────────────────────

export type AdPlacement =
  /** Rewarded: retry button/prompt after the user finishes last in LOH or POS comp. */
  | 'competition_retry'
  /** Automatic interstitial: shown after each eviction. */
  | 'eviction_auto'
  /** Automatic interstitial: shown every other week just before the POS holder announces. */
  | 'pos_decision_auto'
  /** Automatic interstitial: shown before the final safety holder announces their decision. */
  | 'final_safety_decision_auto'
  /** Automatic interstitial: shown before the final LOH announces their decision. */
  | 'final_loh_decision_auto'
  /** Automatic interstitial: shown after the finale season recap. */
  | 'finale_recap_auto'
  /** Rewarded: prompt when the user's social energy hits 0; reward = +3 energy (once/day). */
  | 'social_energy_recharge'
  /** Rewarded: prompt when the user's public meter drops to Disliked; reward = +4–10% approval (once/day). */
  | 'public_meter_disliked_boost'
  /** Rewarded: unlock the confessional vote breakdown after live eviction results. */
  | 'eviction_vote_breakdown'
  /** Rewarded: reveal every secret Vox Populi nomination ballot after nominations. */
  | 'vox_nomination_breakdown'
  /** Rewarded: reveal one temporary Vox audience snapshot before the vote closes. */
  | 'vox_audience_preview'
  /** Rewarded: temporary audience momentum boost during Public Favorite Player voting. */
  | 'favorite_player_audience_surge'

/** Placements that are automatic/interstitial (suppressed by No Ads Pack). */
export const INTERSTITIAL_PLACEMENTS = new Set<AdPlacement>([
  'eviction_auto',
  'pos_decision_auto',
  'final_safety_decision_auto',
  'final_loh_decision_auto',
  'finale_recap_auto',
])

/** Placements that have a once-per-day limit. */
export const DAILY_LIMITED_PLACEMENTS = new Set<AdPlacement>([
  'social_energy_recharge',
  'public_meter_disliked_boost',
])

// ── Type augmentation for window.GameAds bridge ───────────────────────────

declare global {
  interface Window {
    /** Native ad bridge injected by the Android/iOS wrapper. */
    GameAds?: {
      showInterstitial(placement: string): void
      showRewarded(placement: string): void
    }
    /**
     * Callback invoked by the native wrapper after a rewarded ad completes.
     * The game registers this handler at startup.
     */
    onAdRewardGranted?: (placement: string, payload?: Record<string, unknown>) => void
  }
}

// ── Reward callback registry ──────────────────────────────────────────────

type RewardHandler = (payload?: Record<string, unknown>) => void
const rewardHandlers = new Map<AdPlacement, RewardHandler>()

export function clearRewardHandler(placement: AdPlacement): void {
  rewardHandlers.delete(placement)
}

/**
 * Register the `window.onAdRewardGranted` global once.
 * Called by the game at bootstrap (e.g. in main.tsx).
 */
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

// ── Guard helpers ─────────────────────────────────────────────────────────

/** Today's date as an ISO date-only string (YYYY-MM-DD). */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Return true when the placement has already been shown today (for daily-limited placements).
 */
export function isAdDailyLimitReached(placement: AdPlacement, state: RootState): boolean {
  if (!DAILY_LIMITED_PLACEMENTS.has(placement)) return false
  const lastUsed = state.ads?.dailyUsage[placement]
  return lastUsed === todayDateString()
}

/**
 * Return true when the ad is eligible to show given the current Redux state.
 *
 * @param placement - The ad placement to check.
 * @param state     - Current Redux root state.
 * @param options   - Optional context flags:
 *   - isFinal3Week: suppress competition_retry during the final-3 week.
 */
export function canShowAd(
  placement: AdPlacement,
  state: RootState,
  options?: { isFinal3Week?: boolean }
): boolean {
  const hasNoAdsPack =
    (state.ads?.hasNoAdsPack ?? false) ||
    (state.vip?.isActive ?? false) ||
    (state.vip?.entitlements?.noAds ?? false)

  // Automatic ads are blocked when No Ads Pack is owned.
  if (INTERSTITIAL_PLACEMENTS.has(placement) && hasNoAdsPack) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: No Ads Pack owned`)
    }
    return false
  }

  // competition_retry is blocked during the final-3 week.
  if (placement === 'competition_retry' && options?.isFinal3Week) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: final-3 week`)
    }
    return false
  }

  // Daily-limited placements respect once-per-day constraint.
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

// ── Public ad methods ─────────────────────────────────────────────────────

/**
 * Attempt to show an automatic interstitial ad for the given placement.
 * Checks all guards before calling the native bridge.
 * No reward callback — gameplay resumes after the ad closes (native side handles it).
 *
 * @param placement - Must be an interstitial placement.
 * @param state     - Current Redux root state for guard checks.
 * @param dispatch  - Redux dispatch to record daily usage.
 * @param options   - Optional guard overrides.
 * @returns true when the ad was requested, false when it was suppressed.
 */
export function showInterstitial(
  placement: AdPlacement,
  state: RootState,
  dispatch: AppDispatch,
  options?: { isFinal3Week?: boolean }
): boolean {
  if (!canShowAd(placement, state, options)) return false
  if (!window.GameAds?.showInterstitial) {
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

/**
 * Attempt to show an optional rewarded ad for the given placement.
 * Checks all guards, then calls the native bridge.
 * The `onReward` callback is invoked only when `window.onAdRewardGranted` fires
 * for this placement (i.e. the native side confirms the user completed the ad).
 *
 * @param placement - The rewarded ad placement.
 * @param state     - Current Redux root state for guard checks.
 * @param dispatch  - Redux dispatch to record daily usage.
 * @param onReward  - Called with optional native payload when the reward is granted.
 * @param options   - Optional guard overrides.
 * @returns true when the ad was requested, false when it was suppressed.
 */
export function showRewarded(
  placement: AdPlacement,
  state: RootState,
  dispatch: AppDispatch,
  onReward: (payload?: Record<string, unknown>) => void,
  options?: { isFinal3Week?: boolean }
): boolean {
  if (!canShowAd(placement, state, options)) return false
  if (!window.GameAds?.showRewarded) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} rewarded skipped: native bridge absent`)
    }
    return false
  }
  if (rewardHandlers.has(placement)) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} rewarded skipped: request already pending`)
    }
    return false
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
