import type { StoreProductIconName } from '../../vip/vipConfig'

export const STORE_PRODUCT_ICON_NAMES: readonly StoreProductIconName[] = [
  'vip',
  'survivalMode',
  'publicMode',
  'tribunalHouse',
  'dramaMode',
  'cupidArrow',
  'voxPopuli',
  'premiumChallenges',
  'noAds',
  'fallback',
]

export function hasStoreProductIcon(name: string): name is StoreProductIconName {
  return STORE_PRODUCT_ICON_NAMES.includes(name as StoreProductIconName)
}
