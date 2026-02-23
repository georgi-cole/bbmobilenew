import { useState, useRef, useCallback } from 'react';
import { SOCIAL_ACTIONS } from '../../social/socialActions';
import { computeOutcomeDelta } from '../../social/SocialPolicy';
import ActionCard from './ActionCard';
import PreviewPopup from './PreviewPopup';
import type { PreviewDeltaEntry } from './PreviewPopup';
import type { Player } from '../../types';

export interface ActionGridProps {
  /** Called with the action id when a card is clicked/activated. */
  onActionClick?: (actionId: string) => void;
  /** Called with the action id when a card's Preview button is clicked. */
  onPreview?: (actionId: string) => void;
  /** Set of action ids that are currently disabled. */
  disabledIds?: ReadonlySet<string>;
  /** Id of the currently selected action. */
  selectedId?: string | null;
  /**
   * Ids of the currently selected target players. When provided, the
   * PreviewPopup shows per-target affinity deltas for the hovered/focused action.
   */
  selectedTargetIds?: ReadonlySet<string>;
  /**
   * Player roster used to resolve target ids to display names in the preview.
   * Optional — if omitted, target ids are shown as-is.
   */
  players?: readonly Player[];
}

/**
 * ActionGrid — horizontally scrollable row of ActionCard components.
 *
 * Reads the canonical SOCIAL_ACTIONS list and renders one card per action.
 * Disabled/selected state is controlled by the parent via props so this
 * component stays pure and easy to test.
 *
 * Keyboard navigation:
 *   ArrowLeft / ArrowRight — moves focus between non-disabled action cards.
 *   Enter / Space          — activates the focused card (handled by ActionCard).
 *
 * Preview:
 *   Hovering or focusing a card sets previewActionId; an inline PreviewPopup
 *   appears below the grid showing per-target affinity deltas (success outcome).
 *   Mouse leaving the grid or focus moving outside clears the preview.
 */
export default function ActionGrid({
  onActionClick,
  onPreview,
  disabledIds = new Set(),
  selectedId = null,
  selectedTargetIds,
  players,
}: ActionGridProps) {
  const [previewActionId, setPreviewActionId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleHoverFocus = useCallback((actionId: string) => {
    setPreviewActionId(actionId);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cards = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[data-action-id][tabindex="0"]') ?? [],
    );
    if (cards.length === 0) return;
    const idx = cards.indexOf(document.activeElement as HTMLElement);
    const next =
      idx === -1
        ? e.key === 'ArrowRight' ? 0 : cards.length - 1
        : e.key === 'ArrowRight'
          ? Math.min(idx + 1, cards.length - 1)
          : Math.max(idx - 1, 0);
    cards[next]?.focus();
  }

  function handleMouseLeave() {
    setPreviewActionId(null);
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setPreviewActionId(null);
    }
  }

  // Compute preview deltas for the currently previewed action.
  let previewDeltas: PreviewDeltaEntry[] | null = null;
  if (previewActionId !== null) {
    if (!selectedTargetIds || selectedTargetIds.size === 0) {
      previewDeltas = [];
    } else {
      // actorId and targetId are unused by computeOutcomeDelta (they are prefixed
      // with _ in the implementation); the delta depends only on actionId + outcome.
      const delta = computeOutcomeDelta(previewActionId, '', '', 'success');
      // Build a lookup map to avoid O(n*m) find inside the loop.
      const playerById = new Map(players?.map((p) => [p.id, p]) ?? []);
      previewDeltas = Array.from(selectedTargetIds).map((targetId) => ({
        targetName: playerById.get(targetId)?.name ?? targetId,
        delta,
      }));
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        className="sp2-action-grid"
        role="group"
        onKeyDown={handleKeyDown}
        onMouseLeave={handleMouseLeave}
        onBlur={handleBlur}
      >
        {SOCIAL_ACTIONS.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            selected={selectedId === action.id}
            disabled={disabledIds.has(action.id)}
            onClick={onActionClick}
            onPreview={onPreview}
            onHoverFocus={handleHoverFocus}
          />
        ))}
      </div>
      {previewDeltas !== null && <PreviewPopup deltas={previewDeltas} />}
    </>
  );
}
