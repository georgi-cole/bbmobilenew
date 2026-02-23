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
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(player.id, e.ctrlKey || e.metaKey, e.shiftKey);
    }
  }

  return (
    <div
      className={classes}
      role="button"
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
          <span className={`pc__mood pc__mood--${moodClass}`}>{mood}</span>
        </div>
      )}
    </div>
  );
}
