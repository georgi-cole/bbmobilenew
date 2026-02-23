import { useState, useRef, useCallback } from 'react';
import { SOCIAL_ACTIONS } from '../../social/socialActions';
import { normalizeActionCost } from '../../social/smExecNormalize';
import { computeOutcomeScore } from '../../social/SocialPolicy';
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
  /**
   * Id of the acting player (human). Passed to computeOutcomeDelta so each
   * delta is computed with the real actor context rather than an empty string.
   */
  actorId?: string;
  /**
   * Actor's current energy. When provided, actions are sorted so affordable
   * ones appear first; unavailable actions are dimmed with a reason badge.
   * When omitted, actions render in their canonical order with no availability
   * overlay (backwards-compatible with tests that don't supply energy).
   */
  actorEnergy?: number;
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
  actorId = '',
  actorEnergy,
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
    // Resolve the active card via closest() so nested elements (e.g. Preview
    // button inside a card) also work correctly.
    const activeCard = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
      '[data-action-id]',
    );
    const idx = activeCard ? cards.indexOf(activeCard) : -1;
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
      // Build a lookup map to avoid O(n*m) find inside the loop.
      const playerById = new Map(players?.map((p) => [p.id, p]) ?? []);
      previewDeltas = Array.from(selectedTargetIds).map((targetId) => ({
        targetId,
        targetName: playerById.get(targetId)?.name ?? targetId,
        delta: computeOutcomeScore(previewActionId, actorId, targetId, 'preview'),
      }));
    }
  }

  // Sort actions when actorEnergy is provided: affordable actions first.
  // When actorEnergy is undefined, preserve canonical order (backwards-compat).
  const sortedActions =
    actorEnergy !== undefined
      ? [...SOCIAL_ACTIONS].sort((a, b) => {
          const aCost = normalizeActionCost(a);
          const bCost = normalizeActionCost(b);
          const aAffordable = aCost <= actorEnergy;
          const bAffordable = bCost <= actorEnergy;
          if (aAffordable === bAffordable) return 0;
          return aAffordable ? -1 : 1;
        })
      : SOCIAL_ACTIONS;

  /** Returns an availability reason string, or empty string if the action is affordable. */
  function getAvailabilityReason(actionCost: number): string {
    if (actorEnergy === undefined) return '';
    if (actionCost > actorEnergy) {
      return `Insufficient energy: ${actionCost} ⚡ needed`;
    }
    return '';
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
        {sortedActions.map((action) => {
          const cost = normalizeActionCost(action);
          const availabilityReason = getAvailabilityReason(cost);
          const isAvailable = actorEnergy !== undefined && !availabilityReason;
          return (
            <ActionCard
              key={action.id}
              action={action}
              selected={selectedId === action.id}
              disabled={disabledIds.has(action.id)}
              availabilityReason={availabilityReason}
              available={actorEnergy !== undefined ? isAvailable : undefined}
              onClick={onActionClick}
              onPreview={onPreview}
              onHoverFocus={handleHoverFocus}
            />
          );
        })}
      </div>
      {previewDeltas !== null && <PreviewPopup deltas={previewDeltas} />}
    </>
  );
}
