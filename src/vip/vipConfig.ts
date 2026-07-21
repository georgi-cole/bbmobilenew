export type StoreEntitlementKey = 'survivalMode' | 'publicMode' | 'tribunalHouse' | 'dramaMode' | 'noAds'

export type StoreProductKey = 'vip' | StoreEntitlementKey

export interface StoreProductDefinition {
  key: StoreProductKey
  productId: string
  title: string
  description: string
  entitlement: StoreEntitlementKey | null
}

export const VIP_PRODUCT_ID =
  import.meta.env.VITE_VIP_PRODUCT_ID?.trim() || 'com.georgicole.thebigeye.vip'

export const SURVIVAL_MODE_PRODUCT_ID =
  import.meta.env.VITE_SURVIVAL_MODE_PRODUCT_ID?.trim() || 'com.georgicole.thebigeye.survival'

export const PUBLIC_MODE_PRODUCT_ID =
  import.meta.env.VITE_PUBLIC_MODE_PRODUCT_ID?.trim() || 'com.georgicole.thebigeye.publicmode'

export const TRIBUNAL_HOUSE_PRODUCT_ID =
  import.meta.env.VITE_TRIBUNAL_HOUSE_PRODUCT_ID?.trim() || 'com.georgicole.thebigeye.tribunalhouse'

export const DRAMA_MODE_PRODUCT_ID =
  import.meta.env.VITE_DRAMA_MODE_PRODUCT_ID?.trim() || 'com.georgicole.thebigeye.dramamode'

export const NO_ADS_PRODUCT_ID =
  import.meta.env.VITE_NO_ADS_PRODUCT_ID?.trim() || 'com.georgicole.thebigeye.noads'

export const STORE_PRODUCT_CATALOG: readonly StoreProductDefinition[] = [
  {
    key: 'vip',
    productId: VIP_PRODUCT_ID,
    title: 'The Big Eye VIP',
    description: 'Permanently unlock every VIP feature for one bundle price.',
    entitlement: null,
  },
  {
    key: 'survivalMode',
    productId: SURVIVAL_MODE_PRODUCT_ID,
    title: 'Survival Mode',
    description: 'Permanently unlock Survival Mode.',
    entitlement: 'survivalMode',
  },
  {
    key: 'publicMode',
    productId: PUBLIC_MODE_PRODUCT_ID,
    title: 'Public Mode',
    description: 'Permanently unlock Public Mode controls.',
    entitlement: 'publicMode',
  },
  {
    key: 'tribunalHouse',
    productId: TRIBUNAL_HOUSE_PRODUCT_ID,
    title: 'Tribunal House',
    description: 'Permanently unlock Tribunal House when it is released.',
    entitlement: 'tribunalHouse',
  },
  {
    key: 'dramaMode',
    productId: DRAMA_MODE_PRODUCT_ID,
    title: 'Drama Mode',
    description: 'Unlock deeper alliances, grudges, betrayals, and house drama.',
    entitlement: 'dramaMode',
  },
  {
    key: 'noAds',
    productId: NO_ADS_PRODUCT_ID,
    title: 'No Ads',
    description: 'Permanently remove automatic ads.',
    entitlement: 'noAds',
  },
]

export const STANDALONE_PRODUCT_KEYS: readonly StoreEntitlementKey[] = [
  'survivalMode',
  'publicMode',
  'tribunalHouse',
  'dramaMode',
  'noAds',
]

export const VIP_BENEFITS = [
  'Public Mode controls',
  'Survival Mode',
  'Tribunal House when released',
  'Drama Mode',
  'Ad-free play',
  'VIP themes',
  'Future VIP features',
] as const

export function getStoreProductDefinition(key: StoreProductKey): StoreProductDefinition {
  const definition = STORE_PRODUCT_CATALOG.find((product) => product.key === key)
  if (!definition) throw new Error(`Unknown store product: ${key}`)
  return definition
}
