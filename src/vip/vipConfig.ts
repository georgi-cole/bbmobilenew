export type StoreEntitlementKey =
  | 'survivalMode'
  | 'publicMode'
  | 'tribunalHouse'
  | 'dramaMode'
  | 'noAds'

export type StoreProductKey = 'vip' | StoreEntitlementKey

export type StoreProductCategory = 'bundle' | 'game-mode' | 'house-feature' | 'utility'
export type StoreProductTheme = 'spotlight' | 'survival' | 'public' | 'tribunal' | 'drama' | 'quiet'
export type StoreProductIconName = StoreProductKey | 'fallback'

export interface StoreProductDefinition {
  key: StoreProductKey
  productId: string
  title: string
  description: string
  entitlement: StoreEntitlementKey | null
  shortTagline: string
  fullDescription: string
  benefits: readonly string[]
  icon: StoreProductIconName
  visualTheme: StoreProductTheme
  ownershipType: 'one-time'
  category: StoreProductCategory
  badge: string
  accessInstructions: string
  accessRoute?: string
  accessLabel?: string
  legalNote?: string
  availableInRelease: boolean
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

export const VIP_BENEFITS = [
  'Public Mode controls',
  'Surveyeval Mode',
  'Reality Mode',
  'VIP themes',
] as const

export const STORE_PRODUCT_CATALOG: readonly StoreProductDefinition[] = [
  {
    key: 'vip',
    productId: VIP_PRODUCT_ID,
    title: 'The Big Eye VIP',
    description: 'Permanently unlock every VIP feature for one bundle price.',
    entitlement: null,
    shortTagline: 'Every premium advantage. One permanent unlock.',
    fullDescription:
      'Own the complete premium collection in one purchase, including every current Store feature and VIP theme.',
    benefits: VIP_BENEFITS,
    icon: 'vip',
    visualTheme: 'spotlight',
    ownershipType: 'one-time',
    category: 'bundle',
    badge: 'Best value',
    accessInstructions:
      'Your included modes and controls are available from the Home screen and Settings.',
    accessRoute: '/settings',
    accessLabel: 'Manage VIP features',
    legalNote: 'A permanent, non-consumable purchase.',
    availableInRelease: true,
  },
  {
    key: 'survivalMode',
    productId: SURVIVAL_MODE_PRODUCT_ID,
    title: 'Surveyeval Mode',
    description: 'Permanently unlock Surveyeval Mode.',
    entitlement: 'survivalMode',
    shortTagline: 'Stay in the game. Outlast every replacement.',
    fullDescription:
      'Play the implemented endless Surveyeval format, where eliminated contestants are replaced and your run continues until you are eliminated.',
    benefits: [
      'Launch a dedicated Surveyeval season',
      'Face an evolving replacement cast',
      'Track your best Surveyeval run',
      'Resume an unfinished Surveyeval game',
    ],
    icon: 'survivalMode',
    visualTheme: 'survival',
    ownershipType: 'one-time',
    category: 'game-mode',
    badge: 'Game mode',
    accessInstructions: 'Choose Surveyeval from the Home screen.',
    accessRoute: '/',
    accessLabel: 'Go to Home',
    availableInRelease: true,
  },
  {
    key: 'publicMode',
    productId: PUBLIC_MODE_PRODUCT_ID,
    title: 'Public Mode',
    description: 'Permanently unlock Public Mode controls.',
    entitlement: 'publicMode',
    shortTagline: 'Let the audience influence the game.',
    fullDescription:
      'Enable the implemented public-opinion controls that bring audience requests and public danger decisions into eligible seasons.',
    benefits: [
      'Enable Public Mode in Settings',
      'Receive audience-driven requests',
      'Use public danger decision rules',
      'See public influence during the season',
    ],
    icon: 'publicMode',
    visualTheme: 'public',
    ownershipType: 'one-time',
    category: 'house-feature',
    badge: 'Game feature',
    accessInstructions: 'Turn Public Mode on or off in Settings before starting a season.',
    accessRoute: '/settings',
    accessLabel: 'Open Settings',
    availableInRelease: true,
  },
  {
    key: 'tribunalHouse',
    productId: TRIBUNAL_HOUSE_PRODUCT_ID,
    title: 'Tribunal Mode',
    description: 'Permanently unlock Tribunal Mode when it is released.',
    entitlement: 'tribunalHouse',
    shortTagline: 'A different endgame rule set.',
    fullDescription:
      'Reserve permanent access to the Tribunal Mode option exposed in the game settings.',
    benefits: [
      'Permanent entitlement',
      'Dedicated Settings control',
      'Included automatically with VIP',
    ],
    icon: 'tribunalHouse',
    visualTheme: 'tribunal',
    ownershipType: 'one-time',
    category: 'house-feature',
    badge: 'Game feature',
    accessInstructions: 'Manage Tribunal Mode from Settings when the feature is available.',
    accessRoute: '/settings',
    accessLabel: 'Open Settings',
    legalNote:
      'The entitlement is permanent; feature availability may depend on the current release.',
    availableInRelease: false,
  },
  {
    key: 'dramaMode',
    productId: DRAMA_MODE_PRODUCT_ID,
    title: 'Reality Mode',
    description: 'The room is watching. Make your game unforgettable.',
    entitlement: 'dramaMode',
    shortTagline: 'Play the social game they will still be talking about.',
    fullDescription: 'Whispers travel. Loyalties shift. One conversation can save your game.',
    benefits: [
      'Make secret deals, bold moves and unforgettable rivalries',
      'Get pulled into pleas, warnings and tempting offers',
      'Watch the room react to what you say and what you do not',
      'Know who trusts you, who is wary, and what is really shifting',
      'Turn on romance and ride-or-die storylines when you want extra heat',
    ],
    icon: 'dramaMode',
    visualTheme: 'drama',
    ownershipType: 'one-time',
    category: 'house-feature',
    badge: 'Your social game, amplified',
    accessInstructions: 'Choose how real you want the season to feel in Settings.',
    accessRoute: '/settings',
    accessLabel: 'Open Settings',
    availableInRelease: true,
  },
  {
    key: 'noAds',
    productId: NO_ADS_PRODUCT_ID,
    title: 'No Ads',
    description: 'Permanently remove automatic ads.',
    entitlement: 'noAds',
    shortTagline: 'Keep your season moving without interruptions.',
    fullDescription:
      'Remove automatic advertising breaks while keeping optional rewarded opportunities under your control.',
    benefits: [
      'Removes automatic ads',
      'Works across every game mode',
      'Activates immediately after purchase',
    ],
    icon: 'noAds',
    visualTheme: 'quiet',
    ownershipType: 'one-time',
    category: 'utility',
    badge: 'Permanent unlock',
    accessInstructions:
      'No setup is needed. Automatic ads are removed as soon as this unlock is active.',
    availableInRelease: false,
  },
]

export const STANDALONE_PRODUCT_KEYS: readonly StoreEntitlementKey[] =
  STORE_PRODUCT_CATALOG.flatMap((product) =>
    product.entitlement == null || !product.availableInRelease ? [] : [product.entitlement]
  )

export function getStoreProductDefinition(key: StoreProductKey): StoreProductDefinition {
  const definition = STORE_PRODUCT_CATALOG.find((product) => product.key === key)
  if (!definition) throw new Error(`Unknown store product: ${key}`)
  return definition
}
