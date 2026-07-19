import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { initializeVip, purchaseStoreItem, restoreVip, selectVip } from '../../store/vipSlice'
import {
  STANDALONE_PRODUCT_KEYS,
  VIP_BENEFITS,
  getStoreProductDefinition,
  type StoreProductKey,
} from '../../vip/vipConfig'
import './Store.css'

const PRODUCT_ICONS: Record<(typeof STANDALONE_PRODUCT_KEYS)[number], string> = {
  survivalMode: '🛡️',
  publicMode: '👁️',
  tribunalHouse: '⚖️',
  noAds: '🚫',
}

function CheckIcon() {
  return (
    <span className="vip-store__check" aria-hidden="true">
      ✓
    </span>
  )
}

export default function Store() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const storeState = useAppSelector(selectVip)
  const [notice, setNotice] = useState<string | null>(null)
  const busy =
    storeState.status === 'loading' ||
    storeState.status === 'purchasing' ||
    storeState.status === 'restoring'
  const vipProduct = storeState.products.vip

  useEffect(() => {
    if (storeState.status === 'idle') void dispatch(initializeVip())
  }, [dispatch, storeState.status])

  function ownsProduct(productKey: StoreProductKey): boolean {
    return productKey === 'vip'
      ? storeState.isActive
      : storeState.isActive || storeState.entitlements[productKey]
  }

  async function handlePurchase(productKey: StoreProductKey) {
    setNotice(null)
    const result = await dispatch(purchaseStoreItem(productKey))
    if (purchaseStoreItem.fulfilled.match(result)) {
      const definition = getStoreProductDefinition(productKey)
      setNotice(`${definition.title} is now permanently unlocked.`)
    }
  }

  async function handleRestore() {
    setNotice(null)
    const result = await dispatch(restoreVip())
    if (restoreVip.fulfilled.match(result)) {
      const ownedCount = STANDALONE_PRODUCT_KEYS.filter(
        (key) => result.payload.entitlements[key]
      ).length
      setNotice(
        result.payload.isActive || ownedCount > 0
          ? 'Your purchases have been restored.'
          : 'No owned products were found for this store account.'
      )
    }
  }

  const vipButtonDisabled =
    busy || storeState.isActive || !storeState.billingAvailable || !vipProduct

  return (
    <main className="vip-store">
      <header className="vip-store__header">
        <button
          type="button"
          className="vip-store__back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ←
        </button>
        <div>
          <p className="vip-store__eyebrow">Store</p>
          <h1>Permanent Unlocks</h1>
        </div>
        {storeState.isActive && <span className="vip-store__active-badge">VIP Owned</span>}
      </header>

      <section className="vip-store__card" aria-labelledby="vip-plan-title">
        <div className="vip-store__glow" aria-hidden="true" />
        <div className="vip-store__bundle-heading">
          <p className="vip-store__crown" aria-hidden="true">
            ♛
          </p>
          <div>
            <p className="vip-store__kicker">Best value · permanent</p>
            <h2 id="vip-plan-title">{vipProduct?.title || 'The Big Eye VIP'}</h2>
          </div>
        </div>
        <p className="vip-store__description">
          {vipProduct?.description ||
            'Get every current VIP unlock together, plus themes and future VIP features.'}
        </p>

        <ul className="vip-store__benefits">
          {VIP_BENEFITS.map((benefit) => (
            <li key={benefit}>
              <CheckIcon />
              {benefit}
            </li>
          ))}
        </ul>

        <div className="vip-store__bundle-purchase">
          <div className="vip-store__price" aria-label={vipProduct?.price || 'Price unavailable'}>
            <strong className={vipProduct ? undefined : 'vip-store__price-unavailable'}>
              {vipProduct?.price ||
                (storeState.billingAvailable
                  ? 'Product unavailable'
                  : 'Available on iOS and Android')}
            </strong>
            {vipProduct && <span>one time</span>}
          </div>

          <button
            type="button"
            className="vip-store__primary"
            onClick={() => void handlePurchase('vip')}
            disabled={vipButtonDisabled}
          >
            {storeState.activePurchaseKey === 'vip'
              ? 'Connecting to store…'
              : storeState.isActive
                ? 'VIP Owned'
                : 'Buy VIP Bundle'}
          </button>
        </div>
      </section>

      <section className="vip-store__standalone" aria-labelledby="individual-products-title">
        <div className="vip-store__section-heading">
          <p className="vip-store__eyebrow">Buy separately</p>
          <h2 id="individual-products-title">Choose only what you want</h2>
          <p>Each item below is a permanent one-time purchase.</p>
        </div>

        <div className="vip-store__product-grid">
          {STANDALONE_PRODUCT_KEYS.map((productKey) => {
            const definition = getStoreProductDefinition(productKey)
            const product = storeState.products[productKey]
            const owned = ownsProduct(productKey)
            const includedWithVip = storeState.isActive && !storeState.entitlements[productKey]
            const purchasing = storeState.activePurchaseKey === productKey
            return (
              <article className="vip-store__product" key={productKey}>
                <span className="vip-store__product-icon" aria-hidden="true">
                  {PRODUCT_ICONS[productKey]}
                </span>
                <div className="vip-store__product-copy">
                  <h3>{product?.title || definition.title}</h3>
                  <p>{product?.description || definition.description}</p>
                </div>
                <div className="vip-store__product-footer">
                  <strong>{product?.price || '—'}</strong>
                  <button
                    type="button"
                    onClick={() => void handlePurchase(productKey)}
                    disabled={busy || owned || !storeState.billingAvailable || !product}
                  >
                    {purchasing
                      ? 'Buying…'
                      : includedWithVip
                        ? 'Included with VIP'
                        : owned
                          ? 'Owned'
                          : 'Buy'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="vip-store__restore-panel">
        <button
          type="button"
          className="vip-store__restore"
          onClick={() => void handleRestore()}
          disabled={busy || !storeState.billingAvailable}
        >
          {storeState.status === 'restoring' ? 'Restoring…' : 'Restore Purchases'}
        </button>

        {!storeState.billingAvailable && storeState.status !== 'loading' && (
          <p className="vip-store__availability">
            Purchases appear here when the app is installed from Apple App Store or Google Play.
          </p>
        )}
        {(notice || storeState.error) && (
          <p
            className={
              storeState.error ? 'vip-store__notice vip-store__notice--error' : 'vip-store__notice'
            }
            role="status"
            aria-live="polite"
          >
            {notice || storeState.error}
          </p>
        )}
      </section>

      <p className="vip-store__terms">
        These are one-time, non-consumable purchases charged to your Apple or Google account. Use
        Restore Purchases after reinstalling or moving to another device.
      </p>
    </main>
  )
}
