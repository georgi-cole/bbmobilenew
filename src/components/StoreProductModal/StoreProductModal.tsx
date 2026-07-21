import { useEffect, useId, useRef } from 'react'
import type { StoreProduct } from '../../vip/vipPurchaseService'
import type { StoreProductDefinition } from '../../vip/vipConfig'
import StoreProductIcon from './StoreProductIcon'
import './StoreProductModal.css'

interface StoreProductModalProps {
  definition: StoreProductDefinition
  product?: StoreProduct
  owned: boolean
  includedWithVip: boolean
  billingAvailable: boolean
  purchasing: boolean
  restoring: boolean
  error: string | null
  notice: string | null
  onClose: () => void
  onPurchase: () => void
  onRestore: () => void
  onNavigate: (route: string) => void
}

export function StoreProductPoster({
  definition,
  owned,
}: {
  definition: StoreProductDefinition
  owned: boolean
}) {
  return (
    <div className="store-product-modal__poster" aria-hidden="true">
      <span className="store-product-modal__beam store-product-modal__beam--one" />
      <span className="store-product-modal__beam store-product-modal__beam--two" />
      <span className="store-product-modal__poster-ring">
        <StoreProductIcon name={definition.icon} />
      </span>
      <span className="store-product-modal__poster-wordmark">THE BIG EYE</span>
      {owned && <span className="store-product-modal__unlocked-stamp">Unlocked</span>}
    </div>
  )
}

export function StoreProductBenefits({ benefits }: { benefits: readonly string[] }) {
  return (
    <ul className="store-product-modal__benefits">
      {benefits.map((benefit) => (
        <li key={benefit}>
          <span className="store-product-modal__benefit-mark" aria-hidden="true" />
          <span>{benefit}</span>
        </li>
      ))}
    </ul>
  )
}

export function StorePurchaseButton({
  price,
  disabled,
  purchasing,
  onPurchase,
}: {
  price?: string
  disabled: boolean
  purchasing: boolean
  onPurchase: () => void
}) {
  return (
    <button
      type="button"
      className="store-product-modal__purchase"
      disabled={disabled}
      onClick={onPurchase}
    >
      {purchasing ? (
        <>
          <span className="store-product-modal__spinner" aria-hidden="true" />
          Confirming purchase...
        </>
      ) : price ? (
        <>Unlock for {price}</>
      ) : (
        <>Currently unavailable</>
      )}
    </button>
  )
}

export function OwnedProductConfirmation({
  definition,
  includedWithVip,
  onClose,
  onNavigate,
  titleId,
}: {
  definition: StoreProductDefinition
  includedWithVip: boolean
  onClose: () => void
  onNavigate: (route: string) => void
  titleId: string
}) {
  return (
    <div className="store-product-modal__owned">
      <div className="store-product-modal__owned-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="m5 12 4 4L19 7" />
        </svg>
      </div>
      <h2 id={titleId}>{definition.title} is unlocked</h2>
      <p>
        {includedWithVip
          ? 'This content is active through your Big Eye VIP bundle.'
          : 'Thank you for supporting The Big Eye. This content is already active on your account.'}
      </p>
      <div className="store-product-modal__access">
        <span>Where to find it</span>
        <strong>{definition.accessInstructions}</strong>
      </div>
      <div className="store-product-modal__owned-actions">
        {definition.accessRoute && (
          <button
            type="button"
            className="store-product-modal__purchase"
            onClick={() => onNavigate(definition.accessRoute!)}
          >
            {definition.accessLabel || 'Open now'}
          </button>
        )}
        <button type="button" className="store-product-modal__secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

export default function StoreProductModal({
  definition,
  product,
  owned,
  includedWithVip,
  billingAvailable,
  purchasing,
  restoring,
  error,
  notice,
  onClose,
  onPurchase,
  onRestore,
  onNavigate,
}: StoreProductModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const busy = purchasing || restoring
  const canPurchase = billingAvailable && Boolean(product?.price) && !busy

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !purchasing) {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      previousFocus?.focus()
    }
  }, [onClose, purchasing])

  return (
    <div
      className="store-product-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-theme={definition.visualTheme}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !purchasing) onClose()
      }}
    >
      <div className="store-product-modal__panel" ref={panelRef} tabIndex={-1}>
        <button
          type="button"
          className="store-product-modal__close"
          onClick={onClose}
          disabled={purchasing}
          aria-label={purchasing ? 'Purchase in progress' : 'Close product details'}
        >
          <span aria-hidden="true">X</span>
        </button>

        <StoreProductPoster definition={definition} owned={owned} />

        <div className="store-product-modal__content">
          <span className="store-product-modal__badge">{definition.badge}</span>
          {owned ? (
            <OwnedProductConfirmation
              definition={definition}
              includedWithVip={includedWithVip}
              onClose={onClose}
              onNavigate={onNavigate}
              titleId={titleId}
            />
          ) : (
            <>
              <h2 id={titleId}>{definition.title}</h2>
              <p className="store-product-modal__tagline">{definition.shortTagline}</p>
              <p id={descriptionId} className="store-product-modal__description">
                {definition.fullDescription}
              </p>
              <StoreProductBenefits benefits={definition.benefits} />

              <div className="store-product-modal__purchase-area">
                <div className="store-product-modal__price">
                  <span>Permanent unlock</span>
                  <strong>{product?.price || 'Price unavailable'}</strong>
                </div>
                <StorePurchaseButton
                  price={product?.price}
                  disabled={!canPurchase}
                  purchasing={purchasing}
                  onPurchase={onPurchase}
                />
                <button
                  type="button"
                  className="store-product-modal__restore"
                  onClick={onRestore}
                  disabled={busy || !billingAvailable}
                >
                  {restoring ? 'Restoring purchases...' : 'Restore Purchases'}
                </button>
                {!billingAvailable && (
                  <p className="store-product-modal__availability">
                    Purchases are available in the iOS and Android app.
                  </p>
                )}
                {definition.legalNote && (
                  <p className="store-product-modal__legal">{definition.legalNote}</p>
                )}
              </div>
            </>
          )}

          {(notice || error) && (
            <p
              className={
                error
                  ? 'store-product-modal__message store-product-modal__message--error'
                  : 'store-product-modal__message'
              }
              role="status"
              aria-live="polite"
            >
              {notice || error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
