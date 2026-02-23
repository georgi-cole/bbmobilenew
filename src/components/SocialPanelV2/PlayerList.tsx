import { useState, useRef, useCallback } from 'react';
import type { Player } from '../../types';
import type { RelationshipsMap } from '../../social/types';
import PlayerCard from './PlayerCard';

interface PlayerListProps {
  players: Player[];
  /** Human player's ID – used to derive affinity values from the relationships map. */
  humanPlayerId?: string;
  /** Full social relationships map. Used to extract affinity toward the human. */
  relationships?: RelationshipsMap;
  /** IDs that should be rendered as disabled (non-selectable). */
  disabledIds?: ReadonlyArray<string>;
  /** Called whenever the selection changes. */
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /**
   * External controlled selection. When provided, overrides internal selection
   * state for display purposes (controlled mode). If omitted, the component
   * manages selection internally (uncontrolled mode — backwards-compatible).
   */
  selectedIds?: ReadonlySet<string>;
  /**
   * Per-target relationship deltas accumulated this session (actorId → sum of
   * delta values from sessionLogs). Used to render the delta arrow in the
   * expanded PlayerCard view.
   */
  deltasByTargetId?: ReadonlyMap<string, number>;
}

/**
 * PlayerList — scrollable roster of selectable PlayerCard tiles.
 *
 * Selection semantics:
 *  - Single click → toggles selection (selects when unselected; deselects when selected).
 *    Selecting a player also expands an ExpandedPlayerView beneath their card.
 *  - Ctrl/Cmd + click → toggles the clicked player in/out of multi-select.
 *  - Shift + click → range-selects from the last-focused index to the clicked index
 *    (disabled players in the range are skipped).
 *  - Arrow Up/Down → moves keyboard focus between cards.
 *  - Enter / Space → toggles selection and expands/collapses.
 */
export default function PlayerList({
  players,
  humanPlayerId,
  relationships,
  disabledIds = [],
  onSelectionChange,
  selectedIds: controlledSelectedIds,
  deltasByTargetId,
}: PlayerListProps) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const lastFocusedIndexRef = useRef<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // When selectedIds prop is provided use it for display; otherwise fall back to internal state.
  const displaySelectedIds = controlledSelectedIds ?? internalSelectedIds;

  const updateSelection = useCallback(
    (next: Set<string>) => {
      setInternalSelectedIds(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  function handleSelect(playerId: string, additive: boolean) {
    // Use the authoritative current selection (controlled or internal) for toggle logic.
    const effectiveSelectedIds = controlledSelectedIds ?? internalSelectedIds;
    let next: Set<string>;
    if (additive) {
      // Ctrl/Cmd: toggle individual player in/out of multi-select.
      const s = new Set(effectiveSelectedIds);
      if (s.has(playerId)) { s.delete(playerId); } else { s.add(playerId); }
      next = s;
    } else {
      // Plain tap: select if unselected, deselect (collapse) if already selected.
      next = effectiveSelectedIds.has(playerId) ? new Set<string>() : new Set([playerId]);
    }
    updateSelection(next);
  }

  function handleShiftSelect(clickedIndex: number) {
    const disabledSet = new Set(disabledIds);
    const clickedPlayer = players[clickedIndex];
    if (clickedPlayer && disabledSet.has(clickedPlayer.id)) return;

    const anchor = lastFocusedIndexRef.current < 0 ? 0 : lastFocusedIndexRef.current;
    const lo = Math.min(anchor, clickedIndex);
    const hi = Math.max(anchor, clickedIndex);
    const rangeIds = players
      .slice(lo, hi + 1)
      .filter((p) => !disabledSet.has(p.id))
      .map((p) => p.id);
    if (rangeIds.length === 0) return;
    updateSelection(new Set(rangeIds));
  }

  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[role="button"], button.pc') ?? [],
    );
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLElement);
    const next =
      idx === -1
        ? e.key === 'ArrowDown' ? 0 : buttons.length - 1
        : e.key === 'ArrowDown'
          ? Math.min(idx + 1, buttons.length - 1)
          : Math.max(idx - 1, 0);
    buttons[next]?.focus();
    lastFocusedIndexRef.current = next;
  }

  return (
    <div ref={containerRef} onKeyDown={handleContainerKeyDown}>
      {players.map((player, index) => {
        const disabled = disabledIds.includes(player.id);
        const isSelected = displaySelectedIds.has(player.id);

        // Affinity: the human's perception of this player (human → player relationship).
        let affinity: number | undefined;
        if (humanPlayerId && relationships) {
          const rel = relationships[humanPlayerId]?.[player.id];
          if (rel !== undefined) {
            affinity = Math.round(rel.affinity);
          }
        }

        return (
          <div key={player.id}>
            <PlayerCard
              player={player}
              selected={isSelected}
              disabled={disabled}
              onSelect={(id, additive, shiftKey) => {
                if (shiftKey) {
                  handleShiftSelect(index);
                } else {
                  lastFocusedIndexRef.current = index;
                  handleSelect(id, additive);
                }
              }}
              affinity={affinity}
              affinityDelta={deltasByTargetId?.get(player.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
