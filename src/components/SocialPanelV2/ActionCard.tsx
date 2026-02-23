import type { SocialActionDefinition } from '../../social/socialActions';
import './ActionCard.css';

export interface ActionCardProps {
  action: SocialActionDefinition;
  /** Optional short description shown below the title. */
  description?: string;
  /** Whether this card is currently selected. */
  selected?: boolean;
  /** When true the card is non-interactive and shows an overlay. */
  disabled?: boolean;
  /** Message shown in the disabled overlay. */
  disabledMessage?: string;
  /**
   * When non-empty, shows a dimmed availability-reason overlay and dims the card.
   * Takes precedence over disabledMessage when both are set.
   */
  availabilityReason?: string;
  /**
   * When true, renders a green accent border (action is affordable/available).
   * When false AND action category is 'aggressive', renders a red accent border.
   */
  available?: boolean;
  /** Called with the action id when the card is activated. */
  onClick?: (actionId: string) => void;
  /** Called with the action id when the "Preview" button is clicked. */
  onPreview?: (actionId: string) => void;
  /**
   * Called with the action id when the card is hovered (mouseenter) or receives
   * keyboard focus. Used by ActionGrid to drive the inline PreviewPopup without
   * changing the existing `onPreview` / Preview-button semantics.
   */
  onHoverFocus?: (actionId: string) => void;
}

/**
 * ActionCard — renders a single social action with title, cost chips, and
 * an optional disabled-state overlay.
 *
 * Accessible: the card itself carries role="button" with tabIndex / aria-disabled
 * so keyboard and screen-reader users can interact with it.
 */
export default function ActionCard({
  action,
  description,
  selected = false,
  disabled = false,
  disabledMessage = 'Unavailable',
  availabilityReason,
  available,
  onClick,
  onPreview,
  onHoverFocus,
}: ActionCardProps) {
  const { id, title, baseCost, category, availabilityHint } = action;

  const energyCost = typeof baseCost === 'number' ? baseCost : (baseCost.energy ?? 0);
  const infoCost = typeof baseCost === 'number' ? 0 : (baseCost.info ?? 0);

  // A card is effectively non-interactive when the explicit `disabled` prop is
  // set. The `availabilityReason` provides a visual dimming hint but keeps the
  // card clickable — the domain-level energy check enforces the real gate.
  const isDisabled = disabled;
  const showOverlay = disabled || !!availabilityReason;
  const overlayMessage = availabilityReason || disabledMessage;

  function handleActivate() {
    if (!isDisabled) onClick?.(id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleActivate();
    }
  }

  // Accent border class: green when available, red when aggressive/risky.
  const accentClass =
    available === true
      ? 'ac-card--available'
      : available === false && category === 'aggressive'
        ? 'ac-card--risky'
        : '';

  const classNames = [
    'ac-card',
    selected ? 'ac-card--selected' : '',
    isDisabled ? 'ac-card--disabled' : '',
    // Dim unavailable (unaffordable) cards even though they remain clickable.
    !isDisabled && availabilityReason ? 'ac-card--unavailable' : '',
    accentClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      aria-pressed={selected}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => !isDisabled && onHoverFocus?.(id)}
      onFocus={() => !isDisabled && onHoverFocus?.(id)}
      data-action-id={id}
    >
      <div className="ac-card__header">
        {action.icon && <span className="ac-card__icon" aria-hidden="true">{action.icon}</span>}
        <span className="ac-card__title">{title}</span>
      </div>

      <div className="ac-card__chips">
        {energyCost > 0 && (
          <span className="ac-chip ac-chip--energy" aria-label={`Energy cost: ${energyCost}`}>
            ⚡ {energyCost}
          </span>
        )}
        {infoCost > 0 && (
          <span className="ac-chip ac-chip--info" aria-label={`Info cost: ${infoCost}`}>
            🔍 {infoCost}
          </span>
        )}
        {energyCost === 0 && infoCost === 0 && (
          <span className="ac-chip ac-chip--energy" aria-label="Energy cost: 0">
            ⚡ 0
          </span>
        )}
      </div>

      {(description ?? action.description) && (
        <span className="ac-card__description">{description ?? action.description}</span>
      )}

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
          onClick={(e) => {
            e.stopPropagation();
            if (!isDisabled) onPreview(id);
          }}
        >
          Preview
        </button>
      )}

      {showOverlay && (
        <div className="ac-card__disabled-overlay" aria-hidden="true">
          {overlayMessage}
        </div>
      )}
    </div>
  );
}
