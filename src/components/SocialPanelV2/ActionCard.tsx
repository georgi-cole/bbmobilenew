import { useRef, useState } from 'react'
import type { SocialActionDefinition } from '../../social/socialActions'
import { getSocialActionPresentation } from '../../social/socialRuntimeConfig'
import { normalizeActionCosts } from '../../social/smExecNormalize'
import './ActionCard.css'

export interface ActionCardProps {
  action: SocialActionDefinition
  /** Optional short description shown below the title. */
  description?: string
  /** Resolved dynamic costs, used by multi-target actions. */
  costs?: { energy: number; influence: number; info: number }
  /** Whether this card is currently selected. */
  selected?: boolean
  /** When true the card is non-interactive and shows an overlay. */
  disabled?: boolean
  /** Message shown in the disabled overlay. */
  disabledMessage?: string
  /** Affordability or contextual availability reason. */
  availabilityReason?: string
  /** Whether the action is presently affordable. */
  available?: boolean
  /** Called with the action id when the card is activated. */
  onClick?: (actionId: string) => void
  /** Called with the action id when the Preview button is clicked. */
  onPreview?: (actionId: string) => void
  /** Called when a card is hovered or focused. */
  onHoverFocus?: (actionId: string) => void
  /** Optional live cost used by dynamically priced actions such as Group Chat. */
  costOverride?: { energy: number; influence: number; info: number }
}

/** Accessible social action card with validated content-bank presentation. */
export default function ActionCard({
  action,
  costs,
  description,
  selected = false,
  disabled = false,
  disabledMessage = 'Unavailable',
  availabilityReason,
  available,
  onClick,
  onPreview,
  onHoverFocus,
  costOverride,
}: ActionCardProps) {
  const { id, category, availabilityHint } = action
  const presentation = getSocialActionPresentation(action)
  const title = presentation.title
  const resolvedDescription = description ?? presentation.description
  const icon = presentation.icon

  const {
    energy: energyCost,
    influence: influenceCost,
    info: infoCost,
  } = costs ?? costOverride ?? normalizeActionCosts(action)

  const isDisabled = disabled
  const showTooltip = disabled || Boolean(availabilityReason)
  const tooltipMessage = availabilityReason || disabledMessage

  const [longPressActive, setLongPressActive] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTouchStart() {
    if (!showTooltip) return
    longPressTimer.current = setTimeout(() => {
      setLongPressActive(true)
      dismissTimer.current = setTimeout(() => setLongPressActive(false), 1800)
    }, 600)
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleActivate() {
    if (!isDisabled) onClick?.(id)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleActivate()
    }
  }

  const accentClass =
    available === true
      ? 'ac-card--available'
      : available === false && category === 'aggressive'
        ? 'ac-card--risky'
        : ''

  const classNames = [
    'ac-card',
    selected ? 'ac-card--selected' : '',
    isDisabled ? 'ac-card--disabled' : '',
    !isDisabled && availabilityReason ? 'ac-card--unavailable' : '',
    accentClass,
    longPressActive ? 'ac-card--tooltip-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classNames}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      aria-pressed={selected}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      onPointerEnter={(event) => {
        if (!isDisabled && event.pointerType === 'mouse') onHoverFocus?.(id)
      }}
      onFocus={(event) => {
        if (!isDisabled && event.currentTarget.matches(':focus-visible')) onHoverFocus?.(id)
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      data-action-id={id}
    >
      <div className="ac-card__header">
        {icon && (
          <span className="ac-card__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="ac-card__title">{title}</span>
      </div>

      <div className="ac-card__chips">
        {energyCost > 0 && (
          <span className="ac-chip ac-chip--energy" aria-label={`Energy cost: ${energyCost}`}>
            ⚡ {energyCost}
          </span>
        )}
        {influenceCost > 0 && (
          <span
            className="ac-chip ac-chip--influence"
            aria-label={`Influence cost: ${influenceCost}`}
          >
            🤝 {influenceCost}
          </span>
        )}
        {infoCost > 0 && (
          <span className="ac-chip ac-chip--info" aria-label={`Info cost: ${infoCost}`}>
            💡 {infoCost}
          </span>
        )}
        {energyCost === 0 && influenceCost === 0 && infoCost === 0 && (
          <span className="ac-chip ac-chip--energy" aria-label="Energy cost: 0">
            ⚡ 0
          </span>
        )}
      </div>

      {resolvedDescription && <span className="ac-card__description">{resolvedDescription}</span>}

      {availabilityHint && (
        <span className="ac-badge" aria-label={`Requirement: ${availabilityHint}`}>
          {availabilityHint}
        </span>
      )}

      {onPreview && (
        <button
          className="ac-card__preview-btn"
          type="button"
          tabIndex={isDisabled ? -1 : 0}
          aria-label={`Preview ${title}`}
          onClick={(event) => {
            event.stopPropagation()
            if (!isDisabled) onPreview(id)
          }}
        >
          Preview
        </button>
      )}

      {showTooltip && (
        <div className="ac-card__tooltip" aria-hidden="true">
          {tooltipMessage}
        </div>
      )}
    </div>
  )
}
