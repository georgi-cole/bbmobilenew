import { SOCIAL_ACTIONS } from '../../social/socialActions';
import ActionCard from './ActionCard';

export interface ActionGridProps {
  /** Called with the action id when a card is clicked/activated. */
  onActionClick?: (actionId: string) => void;
  /** Called with the action id when a card's Preview button is clicked. */
  onPreview?: (actionId: string) => void;
  /** Set of action ids that are currently disabled. */
  disabledIds?: ReadonlySet<string>;
  /** Id of the currently selected action. */
  selectedId?: string | null;
}

/**
 * ActionGrid — horizontally scrollable row of ActionCard components.
 *
 * Reads the canonical SOCIAL_ACTIONS list and renders one card per action.
 * Disabled/selected state is controlled by the parent via props so this
 * component stays pure and easy to test.
 */
export default function ActionGrid({
  onActionClick,
  onPreview,
  disabledIds = new Set(),
  selectedId = null,
}: ActionGridProps) {
  return (
    <div
      className="sp2-action-grid"
      role="group"
    >
      {SOCIAL_ACTIONS.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          selected={selectedId === action.id}
          disabled={disabledIds.has(action.id)}
          onClick={onActionClick}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}
