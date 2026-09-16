import type { StoreEntitlementKey } from './vipConfig'
import { IS_ADMIN_BUILD, IS_MOBILE_DEV_BUILD } from '../config/buildTarget'

export interface VipEntitlementStateLike {
  isActive?: boolean
  entitlements?: Partial<Record<StoreEntitlementKey, boolean>>
}

/**
 * Development-only entitlement bypass. The dedicated mobile-dev target uses
 * production gameplay choreography while treating every paid entitlement as
 * available. Store-release validation rejects this target and the legacy env
 * override so it cannot be used by an App Store / Play Store build by accident.
 */
export const TEMPORARY_STORE_UNLOCKS_ENABLED =
  IS_ADMIN_BUILD || IS_MOBILE_DEV_BUILD || import.meta.env.VITE_VIP_DEV_ENTITLEMENT === 'true'

export function isEffectiveVipActive(
  vip: VipEntitlementStateLike | undefined,
  temporaryUnlocksEnabled = TEMPORARY_STORE_UNLOCKS_ENABLED
): boolean {
  return temporaryUnlocksEnabled || vip?.isActive === true
}

export function hasEffectiveStoreEntitlement(
  vip: VipEntitlementStateLike | undefined,
  entitlement: StoreEntitlementKey,
  temporaryUnlocksEnabled = TEMPORARY_STORE_UNLOCKS_ENABLED
): boolean {
  return (
    isEffectiveVipActive(vip, temporaryUnlocksEnabled) || vip?.entitlements?.[entitlement] === true
  )
}
