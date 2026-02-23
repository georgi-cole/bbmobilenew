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
  onClick,
  onPreview,
  onHoverFocus,
}: ActionCardProps) {
  const { id, title, baseCost } = action;

  const energyCost = typeof baseCost === 'number' ? baseCost : (baseCost.energy ?? 0);
  const infoCost = typeof baseCost === 'number' ? 0 : (baseCost.info ?? 0);

  function handleActivate() {
    if (!disabled) onClick?.(id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleActivate();
    }
  }

  const classNames = [
    'ac-card',
    selected ? 'ac-card--selected' : '',
    disabled ? 'ac-card--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-pressed={selected}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => !disabled && onHoverFocus?.(id)}
      onFocus={() => !disabled && onHoverFocus?.(id)}
      data-action-id={id}
    >
      <span className="ac-card__title">{title}</span>

      {description && <span className="ac-card__description">{description}</span>}

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

      {onPreview && (
        <button
          className="ac-card__preview-btn"
          type="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Preview ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onPreview(id);
          }}
        >
          Preview
        </button>
      )}

      {disabled && (
        <div className="ac-card__disabled-overlay" aria-hidden="true">
          {disabledMessage}
        </div>
      )}
    </div>
  );
}
