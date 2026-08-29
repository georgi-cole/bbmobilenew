import type { StoreEntitlementKey } from './vipConfig'

const VIP_STORAGE_KEY = 'bbmobilenew:vip:v2'

/**
 * Temporary public testing switch. Set to false before the release build that
 * connects store purchases or rewarded ads. It affects store entitlements only,
 * never ordinary gameplay-state locks.
 */
export const TEMPORARY_STORE_UNLOCKS_ENABLED = false

export interface StoreEntitlements {
  survivalMode: boolean
  publicMode: boolean
  tribunalHouse: boolean
  dramaMode: boolean
  cupidArrow: boolean
  voxPopuli: boolean
  premiumChallenges: boolean
  noAds: boolean
}

export interface PersistedVipEntitlement {
  isActive: boolean
  entitlements: StoreEntitlements
  lastVerifiedAt: string | null
}

export function createEmptyStoreEntitlements(): StoreEntitlements {
  return {
    survivalMode: false,
    publicMode: false,
    tribunalHouse: false,
    dramaMode: false,
    cupidArrow: false,
    voxPopuli: false,
    premiumChallenges: false,
    noAds: false,
  }
}

function normalizeEntitlements(raw: unknown): StoreEntitlements {
  const value =
    raw && typeof raw === 'object' ? (raw as Partial<Record<StoreEntitlementKey, unknown>>) : {}
  return {
    survivalMode: value.survivalMode === true,
    publicMode: value.publicMode === true,
    tribunalHouse: value.tribunalHouse === true,
    dramaMode: value.dramaMode === true,
    cupidArrow: value.cupidArrow === true,
    voxPopuli: value.voxPopuli === true,
    premiumChallenges: value.premiumChallenges === true,
    noAds: value.noAds === true,
  }
}

export function loadCachedVipEntitlement(): PersistedVipEntitlement {
  try {
    const raw = localStorage.getItem(VIP_STORAGE_KEY)
    if (!raw) {
      return {
        isActive: false,
        entitlements: createEmptyStoreEntitlements(),
        lastVerifiedAt: null,
      }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedVipEntitlement>
    return {
      // Every store item is a permanent non-consumable. Ownership remains
      // available offline and is reconciled on the next successful store refresh.
      isActive: parsed.isActive === true,
      entitlements: normalizeEntitlements(parsed.entitlements),
      lastVerifiedAt: typeof parsed.lastVerifiedAt === 'string' ? parsed.lastVerifiedAt : null,
    }
  } catch {
    return {
      isActive: false,
      entitlements: createEmptyStoreEntitlements(),
      lastVerifiedAt: null,
    }
  }
}

export function saveCachedVipEntitlement(value: PersistedVipEntitlement): void {
  try {
    localStorage.setItem(VIP_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage may be unavailable in private browsing. Native refresh still works.
  }
}

export function hasCachedVipAccess(): boolean {
  if (TEMPORARY_STORE_UNLOCKS_ENABLED) return true
  return loadCachedVipEntitlement().isActive
}

export function hasCachedStoreAccess(entitlement: StoreEntitlementKey): boolean {
  if (TEMPORARY_STORE_UNLOCKS_ENABLED) return true
  const cached = loadCachedVipEntitlement()
  return cached.isActive || cached.entitlements[entitlement]
}
