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
}

/**
 * PlayerList — scrollable roster of selectable PlayerCard tiles.
 *
 * Selection semantics:
 *  - Single click → replaces selection with the clicked player.
 *  - Ctrl/Cmd + click → toggles the clicked player in/out of selection.
 *  - Shift + click → range-selects from the last-focused index to the clicked index.
 *  - Arrow Up/Down → moves keyboard focus.
 *  - Enter / Space → toggles selection (additive when Ctrl/Cmd is held).
 */
export default function PlayerList({
  players,
  humanPlayerId,
  relationships,
  disabledIds = [],
  onSelectionChange,
}: PlayerListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastFocusedIndexRef = useRef<number>(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const updateSelection = useCallback(
    (next: Set<string>) => {
      setSelectedIds(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  function handleSelect(playerId: string, additive: boolean) {
    const next = additive
      ? (() => {
          const s = new Set(selectedIds);
          if (s.has(playerId)) { s.delete(playerId); } else { s.add(playerId); }
          return s;
        })()
      : new Set([playerId]);
    updateSelection(next);
  }

  function handleShiftSelect(clickedIndex: number) {
    const anchor = lastFocusedIndexRef.current < 0 ? 0 : lastFocusedIndexRef.current;
    const lo = Math.min(anchor, clickedIndex);
    const hi = Math.max(anchor, clickedIndex);
    const rangeIds = players.slice(lo, hi + 1).map((p) => p.id);
    updateSelection(new Set(rangeIds));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>, index: number) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(index + 1, players.length - 1);
      itemRefs.current[next]?.focus();
      lastFocusedIndexRef.current = next;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(index - 1, 0);
      itemRefs.current[prev]?.focus();
      lastFocusedIndexRef.current = prev;
    }
  }

  return (
    <div className="pl" role="listbox" aria-multiselectable="true">
      {players.map((player, index) => {
        const disabled = (disabledIds as string[]).includes(player.id);

        // Affinity: the human's perception of this player (human → player relationship).
        let affinity: number | undefined;
        if (humanPlayerId && relationships) {
          const rel = relationships[humanPlayerId]?.[player.id];
          if (rel !== undefined) {
            affinity = Math.round(rel.affinity);
          }
        }

        return (
          <div
            key={player.id}
            role="option"
            aria-selected={selectedIds.has(player.id)}
            ref={(el) => { itemRefs.current[index] = el; }}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            <PlayerCard
              player={player}
              selected={selectedIds.has(player.id)}
              disabled={disabled}
              onSelect={(id, additive, shiftKey) => {
                lastFocusedIndexRef.current = index;
                if (shiftKey) {
                  handleShiftSelect(index);
                } else {
                  handleSelect(id, additive);
                }
              }}
              affinity={affinity}
            />
          </div>
        );
      })}
    </div>
  );
}
