import { Capacitor } from '@capacitor/core'
import {
  NativePurchases,
  PURCHASE_TYPE,
  type Product,
  type Transaction,
} from '@capgo/native-purchases'
import {
  STORE_PRODUCT_CATALOG,
  getStoreProductDefinition,
  type StoreEntitlementKey,
  type StoreProductDefinition,
  type StoreProductKey,
} from './vipConfig'
import { createEmptyStoreEntitlements, type StoreEntitlements } from './vipStorage'
import { IS_ADMIN_BUILD } from '../config/buildTarget'

export interface StoreProduct {
  key: StoreProductKey
  productId: string
  title: string
  description: string
  price: string
}

export interface VipStoreSnapshot {
  billingAvailable: boolean
  isActive: boolean
  entitlements: StoreEntitlements
  products: Partial<Record<StoreProductKey, StoreProduct>>
  verifiedAt: string
}

function toStoreProduct(product: Product, definition: StoreProductDefinition): StoreProduct {
  return {
    key: definition.key,
    productId: definition.productId,
    title: product.title || definition.title,
    description: product.description || definition.description,
    price: product.priceString,
  }
}

function productMatchesDefinition(product: Product, definition: StoreProductDefinition): boolean {
  return (
    product.identifier === definition.productId || product.planIdentifier === definition.productId
  )
}

export function isOwnedStoreTransaction(
  transaction: Transaction,
  productKey: StoreProductKey,
  platform: string = Capacitor.getPlatform()
): boolean {
  const definition = getStoreProductDefinition(productKey)
  if (transaction.productIdentifier !== definition.productId) return false

  if (platform === 'android') {
    const isCompleted =
      transaction.purchaseState === '1' || transaction.purchaseState === 'PURCHASED'
    return isCompleted && transaction.isAcknowledged === true
  }

  if (transaction.revocationDate || transaction.subscriptionState === 'revoked') return false
  // getPurchases({ onlyCurrentEntitlements: true }) scopes iOS results to
  // currently owned non-consumables. Some StoreKit versions omit isActive for IAP.
  return transaction.isActive !== false
}

export function isActiveVipTransaction(
  transaction: Transaction,
  platform: string = Capacitor.getPlatform()
): boolean {
  return isOwnedStoreTransaction(transaction, 'vip', platform)
}

function isNativeBillingPlatform(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios')
  )
}

async function loadProducts(): Promise<Partial<Record<StoreProductKey, StoreProduct>>> {
  const releasedProducts = STORE_PRODUCT_CATALOG.filter(
    (definition) => definition.availableInRelease
  )
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: releasedProducts.map((definition) => definition.productId),
    productType: PURCHASE_TYPE.INAPP,
  })
  const catalog: Partial<Record<StoreProductKey, StoreProduct>> = {}
  for (const definition of releasedProducts) {
    const product = products.find((candidate) => productMatchesDefinition(candidate, definition))
    if (product) catalog[definition.key] = toStoreProduct(product, definition)
  }
  return catalog
}

function ownershipFromTransactions(purchases: Transaction[]): {
  isActive: boolean
  entitlements: StoreEntitlements
} {
  const entitlements = createEmptyStoreEntitlements()
  let isActive = false

  for (const definition of STORE_PRODUCT_CATALOG) {
    const owned = purchases.some((purchase) => isOwnedStoreTransaction(purchase, definition.key))
    if (definition.key === 'vip') {
      isActive = owned
    } else if (definition.entitlement) {
      entitlements[definition.entitlement] = owned
    }
  }

  return { isActive, entitlements }
}

async function loadOwnership(): Promise<{
  isActive: boolean
  entitlements: StoreEntitlements
}> {
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.INAPP,
    onlyCurrentEntitlements: true,
  })
  return ownershipFromTransactions(purchases)
}

export async function loadVipStoreSnapshot(options?: {
  restore?: boolean
}): Promise<VipStoreSnapshot> {
  const verifiedAt = new Date().toISOString()
  if (!isNativeBillingPlatform()) {
    return {
      billingAvailable: false,
      isActive:
        IS_ADMIN_BUILD ||
        (import.meta.env.DEV && import.meta.env.VITE_VIP_DEV_ENTITLEMENT === 'true'),
      entitlements: createEmptyStoreEntitlements(),
      products: {},
      verifiedAt,
    }
  }

  const { isBillingSupported } = await NativePurchases.isBillingSupported()
  if (!isBillingSupported) {
    return {
      billingAvailable: false,
      isActive: false,
      entitlements: createEmptyStoreEntitlements(),
      products: {},
      verifiedAt,
    }
  }

  if (options?.restore) await NativePurchases.restorePurchases()
  const products = await loadProducts()
  const ownership = await loadOwnership()
  return {
    billingAvailable: true,
    ...ownership,
    products,
    verifiedAt,
  }
}

export async function purchaseStoreProduct(productKey: StoreProductKey): Promise<VipStoreSnapshot> {
  if (!isNativeBillingPlatform()) {
    throw new Error('Purchases are only available in the iOS and Android app.')
  }

  const definition = getStoreProductDefinition(productKey)
  if (!definition.availableInRelease) {
    throw new Error('This product is not available in the current release.')
  }
  const transaction = await NativePurchases.purchaseProduct({
    productIdentifier: definition.productId,
    productType: PURCHASE_TYPE.INAPP,
    isConsumable: false,
    // The plugin finishes StoreKit transactions and acknowledges Play purchases.
    autoAcknowledgePurchases: true,
  })

  if (!isOwnedStoreTransaction(transaction, productKey)) {
    throw new Error(
      transaction.purchaseState === '0'
        ? 'Your purchase is pending. It will unlock after the store confirms payment.'
        : 'The store did not return this purchase as owned yet. Try Restore Purchases in a moment.'
    )
  }

  return loadVipStoreSnapshot()
}

export function hasStoreEntitlement(
  snapshot: Pick<VipStoreSnapshot, 'isActive' | 'entitlements'>,
  entitlement: StoreEntitlementKey
): boolean {
  return snapshot.isActive || snapshot.entitlements[entitlement]
}
