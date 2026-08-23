import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import StoreProductIcon from '../../components/StoreProductModal/StoreProductIcon'
import StoreProductModal from '../../components/StoreProductModal/StoreProductModal'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { initializeVip, purchaseStoreItem, restoreVip, selectVip } from '../../store/vipSlice'
import { setGameUX } from '../../store/settingsSlice'
import {
  EXPANSION_PRODUCT_KEYS,
  FEATURE_PRODUCT_KEYS,
  STANDALONE_PRODUCT_KEYS,
  getStoreProductDefinition,
  type StoreProductKey,
} from '../../vip/vipConfig'
import './Store.css'
import './StoreProductList.css'

function CheckIcon() {
  return (
    <span className="vip-store__check" aria-hidden="true">
      +
    </span>
  )
}

export default function Store() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const storeState = useAppSelector(selectVip)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [selectedProductKey, setSelectedProductKey] = useState<StoreProductKey | null>(null)
  const purchaseLockRef = useRef(false)
  const busy =
    storeState.status === 'loading' ||
    storeState.status === 'purchasing' ||
    storeState.status === 'restoring'
  const vipProduct = storeState.products.vip
  const vipDefinition = getStoreProductDefinition('vip')
  const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo
  const hasReturnDestination = typeof returnTo === 'string' && returnTo.startsWith('/')

  function goBack() {
    if (hasReturnDestination) {
      navigate(returnTo, { replace: true })
      return
    }
    navigate(-1)
  }

  useEffect(() => {
    if (storeState.status === 'idle') void dispatch(initializeVip())
  }, [dispatch, storeState.status])

  function ownsProduct(productKey: StoreProductKey): boolean {
    return productKey === 'vip'
      ? storeState.isActive
      : storeState.isActive || storeState.entitlements[productKey]
  }

  function selectProduct(productKey: StoreProductKey) {
    setNotice(null)
    setModalError(null)
    setSelectedProductKey(productKey)
  }

  async function handlePurchase(productKey: StoreProductKey) {
    if (purchaseLockRef.current || busy || ownsProduct(productKey)) return
    purchaseLockRef.current = true
    setNotice(null)
    setModalError(null)
    try {
      const result = await dispatch(purchaseStoreItem(productKey))
      if (purchaseStoreItem.fulfilled.match(result)) {
        const definition = getStoreProductDefinition(productKey)
        if (productKey === 'dramaMode' || productKey === 'vip') {
          dispatch(setGameUX({ dramaMode: true }))
        }
        setNotice(`${definition.title} is now permanently unlocked and active.`)
      } else if (purchaseStoreItem.rejected.match(result)) {
        setModalError(result.payload ?? 'The purchase could not be completed.')
      }
    } finally {
      purchaseLockRef.current = false
    }
  }

  async function handleRestore() {
    if (busy) return
    setNotice(null)
    setModalError(null)
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
    } else if (restoreVip.rejected.match(result)) {
      setModalError(result.payload ?? 'Purchases could not be restored.')
    }
  }

  const selectedDefinition =
    selectedProductKey == null ? null : getStoreProductDefinition(selectedProductKey)
  const selectedOwned = selectedProductKey == null ? false : ownsProduct(selectedProductKey)
  const selectedIncludedWithVip =
    selectedProductKey != null &&
    selectedProductKey !== 'vip' &&
    storeState.isActive &&
    !storeState.entitlements[selectedProductKey]

  return (
    <main className="vip-store">
      <header className="vip-store__header">
        <h1>BIGEYE MARKETFACE</h1>
        {storeState.isActive && <span className="vip-store__active-badge">VIP Owned</span>}
        <button
          type="button"
          className="vip-store__back"
          onClick={goBack}
          aria-label="Go back"
        >
          ↩
        </button>
      </header>

      <section className="vip-store__card" aria-labelledby="vip-plan-title">
        <div className="vip-store__glow" aria-hidden="true" />
        <div className="vip-store__bundle-heading">
          <span className="vip-store__bundle-icon" aria-hidden="true">
            <StoreProductIcon name={vipDefinition.icon} />
          </span>
          <div>
            <p className="vip-store__kicker">Best value - permanent</p>
            <h2 id="vip-plan-title">{vipProduct?.title || vipDefinition.title}</h2>
          </div>
        </div>
        <p className="vip-store__description">
          {vipProduct?.description || vipDefinition.description}
        </p>

        <ul className="vip-store__benefits">
          {vipDefinition.benefits.map((benefit) => (
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
            onClick={() => selectProduct('vip')}
            disabled={busy}
          >
            {storeState.isActive ? 'View owned VIP' : 'Explore VIP'}
          </button>
        </div>
      </section>

      <section className="vip-store__standalone" aria-labelledby="individual-products-title">
        <div className="vip-store__section-heading">
          <p className="vip-store__eyebrow">Buy separately</p>
          <h2 id="individual-products-title">Choose only what you want</h2>
          <p>Tap any item for details. Every unlock is a permanent one-time purchase.</p>
        </div>

        <div className="vip-store__product-grid">
          {FEATURE_PRODUCT_KEYS.map((productKey) => {
            const definition = getStoreProductDefinition(productKey)
            const product = storeState.products[productKey]
            const owned = ownsProduct(productKey)
            const includedWithVip = storeState.isActive && !storeState.entitlements[productKey]
            return (
              <button
                type="button"
                className="vip-store__product"
                data-theme={definition.visualTheme}
                key={productKey}
                onClick={() => selectProduct(productKey)}
                disabled={busy}
                aria-label={`Open ${definition.title}`}
              >
                <span className="vip-store__product-icon" aria-hidden="true">
                  <StoreProductIcon name={definition.icon} />
                </span>
                <span className="vip-store__product-copy">
                  <span className="vip-store__product-title">
                    {product?.title || definition.title}
                  </span>
                  <span className="vip-store__product-description">{definition.shortTagline}</span>
                </span>
                <span className="vip-store__product-footer">
                  <strong>
                    {includedWithVip
                      ? 'Included with VIP'
                      : owned
                        ? 'Owned'
                        : product?.price || 'Price unavailable'}
                  </strong>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="vip-store__standalone" aria-labelledby="season-expansions-title">
        <div className="vip-store__section-heading">
          <p className="vip-store__eyebrow">Season expansions</p>
          <h2 id="season-expansions-title">Change the rules of the house</h2>
          <p>Complete seasonal formats with their own ceremonies, strategy, and finale journey.</p>
        </div>

        <div className="vip-store__product-grid">
          {EXPANSION_PRODUCT_KEYS.map((productKey) => {
            const definition = getStoreProductDefinition(productKey)
            const product = storeState.products[productKey]
            const owned = ownsProduct(productKey)
            const includedWithVip = storeState.isActive && !storeState.entitlements[productKey]
            return (
              <button
                type="button"
                className="vip-store__product"
                data-theme={definition.visualTheme}
                key={productKey}
                onClick={() => selectProduct(productKey)}
                disabled={busy}
                aria-label={`Open ${definition.title}`}
              >
                <span className="vip-store__product-icon" aria-hidden="true">
                  <StoreProductIcon name={definition.icon} />
                </span>
                <span className="vip-store__product-copy">
                  <span className="vip-store__product-title">{definition.title}</span>
                  <span className="vip-store__product-description">{definition.shortTagline}</span>
                </span>
                <span className="vip-store__product-footer">
                  <strong>
                    {includedWithVip
                      ? 'Included with VIP'
                      : owned
                        ? 'Owned'
                        : product?.price || 'Price unavailable'}
                  </strong>
                </span>
              </button>
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
          {storeState.status === 'restoring' ? 'Restoring...' : 'Restore Purchases'}
        </button>

        {!storeState.billingAvailable && storeState.status !== 'loading' && (
          <p className="vip-store__availability">
            Purchases appear here when the app is installed from Apple App Store or Google Play.
          </p>
        )}
        {(notice || (selectedProductKey == null && storeState.error)) && (
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
        Restore Purchases after reinstalling or moving to another device.{' '}
        <button type="button" onClick={() => navigate('/legal')}>
          Privacy and terms
        </button>
      </p>

      {selectedDefinition && selectedProductKey && (
        <StoreProductModal
          definition={selectedDefinition}
          product={storeState.products[selectedProductKey]}
          owned={selectedOwned}
          includedWithVip={selectedIncludedWithVip}
          billingAvailable={storeState.billingAvailable}
          purchasing={
            storeState.status === 'purchasing' &&
            storeState.activePurchaseKey === selectedProductKey
          }
          restoring={storeState.status === 'restoring'}
          error={modalError}
          notice={notice}
          onClose={() => {
            if (storeState.status !== 'purchasing') setSelectedProductKey(null)
          }}
          onPurchase={() => void handlePurchase(selectedProductKey)}
          onRestore={() => void handleRestore()}
          onNavigate={(route) => {
            setSelectedProductKey(null)
            navigate(route)
          }}
        />
      )}
    </main>
  )
}
