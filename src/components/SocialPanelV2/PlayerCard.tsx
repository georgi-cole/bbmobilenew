import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import type { Player } from '../../types';
import { getRelationshipLabel, getPlayerMood, getMoodClass } from './relationshipUtils';
import './PlayerCard.css';

interface PlayerCardProps {
  player: Player;
  selected: boolean;
  disabled: boolean;
  /** Called when the card is activated. additive=true when Ctrl/Cmd is held; shiftKey=true when Shift is held. */
  onSelect: (playerId: string, additive: boolean, shiftKey: boolean) => void;
  /** Optional affinity percentage toward the human player. Clamped to 0–100 before display. */
  affinity?: number;
  /**
   * Relationship delta accumulated this session (sum of action deltas for this
   * actor→target pair). Positive → green up arrow, negative → red down arrow,
   * zero or undefined → hidden.
   */
  affinityDelta?: number;
}

/**
 * PlayerCard — selectable card for a single houseguest in the social phase roster.
 *
 * Renders an avatar, name, status pill, relationship label, and optional affinity percent.
 * When selected, the card expands vertically in-place to show a larger avatar and
 * relationship detail row (no separate sibling component needed).
 * Keyboard accessible: responds to Enter and Space.
 */
export default function PlayerCard({
  player,
  selected,
  disabled,
  onSelect,
  affinity,
  affinityDelta,
}: PlayerCardProps) {
  const classes = [
    'pc',
    selected ? 'pc--selected' : '',
    disabled ? 'pc--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const rel = affinity !== undefined ? getRelationshipLabel(affinity) : null;
  const affinityDisplay =
    affinity !== undefined ? `${Math.max(0, Math.min(100, affinity))}%` : '—';
  const mood = getPlayerMood(player.id, affinity);
  const moodClass = getMoodClass(mood);

  function handleClick(e: React.MouseEvent) {
    if (disabled) return;
    onSelect(player.id, e.ctrlKey || e.metaKey, e.shiftKey);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'Escape' && selected) {
      e.preventDefault();
      onSelect(player.id, false, false);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(player.id, e.ctrlKey || e.metaKey, e.shiftKey);
    }
  }

  return (
    <button
      type="button"
      className={classes}
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      aria-expanded={selected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* ── Compact header row (always visible) ── */}
      <div className="pc__row">
        <PlayerAvatar player={player} size="sm" />
        <span className="pc__name">{player.name}</span>
        <span className={`pc__status pc__status--${player.status.split('+')[0]}`}>
          {player.status}
        </span>
      </div>

      {/* ── Expanded detail panel (visible when selected, no repeated info) ── */}
      {selected && (
        <div className="pc__expanded" aria-label={`${player.name} relationship details`}>
          {rel && (
            <span className={`pc__rel-label pc__rel-label--${rel.key}`}>{rel.label}</span>
          )}
          <span className="pc__expanded-affinity">{affinityDisplay}</span>
          {affinityDelta !== undefined && affinityDelta !== 0 && (
            <span
              className={`pc__delta-arrow pc__delta-arrow--${affinityDelta > 0 ? 'up' : 'down'}`}
              aria-label={affinityDelta > 0 ? 'Relationship improved' : 'Relationship declined'}
            >
              {affinityDelta > 0 ? '↑' : '↓'}
            </span>
          )}
          <span className={`pc__mood pc__mood--${moodClass}`}>{mood}</span>
        </div>
      )}
    </button>
  );
}
