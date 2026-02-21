import { useState } from 'react';
import type { Player } from '../../types';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import './PlayerAvatar.css';

interface PlayerAvatarProps {
  player: Player;
  /** Called when avatar is tapped/clicked */
  onSelect?: (player: Player) => void;
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_BADGE: Record<string, string> = {
  hoh:            '👑',
  nominated:      '🎯',
  pov:            '🎭',
  'hoh+pov':      '👑🎭',
  'nominated+pov': '🎯🎭',
  evicted:        '🚪',
  jury:           '⚖️',
};

/**
 * PlayerAvatar — interactive avatar tile.
 *
 * Tap → shows a mini popover with name + stats.
 * Status is shown as a coloured badge overlay.
 *
 * To extend: add new PlayerStatus values in src/types/index.ts,
 * add a badge emoji to STATUS_BADGE above, add CSS in PlayerAvatar.css.
 */
export default function PlayerAvatar({ player, onSelect, size = 'md' }: PlayerAvatarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  function handleClick() {
    setPopoverOpen((v) => !v);
    onSelect?.(player);
  }

  const isEvicted = player.status === 'evicted' || player.status === 'jury';
  const badge = STATUS_BADGE[player.status];

  return (
    <div className={`player-avatar player-avatar--${size} player-avatar--${player.status} ${isEvicted ? 'player-avatar--out' : ''}`}>
      <button
        className="player-avatar__face"
        onClick={handleClick}
        aria-label={`${player.name} – ${player.status}`}
        aria-expanded={popoverOpen}
        type="button"
      >
        <img
          className="player-avatar__img"
          src={resolveAvatar(player)}
          alt={player.name}
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;
            img.src = getDicebear(player.name);
          }}
        />
        <span className="player-avatar__emoji player-avatar__emoji--fallback" aria-hidden="true">
          {player.avatar}
        </span>
        {badge && (
          <span className="player-avatar__badge" aria-hidden="true">
            {badge}
          </span>
        )}
        {player.isUser && (
          <span className="player-avatar__you" aria-label="You">YOU</span>
        )}
      </button>

      <span className="player-avatar__name">{player.name}</span>

      {popoverOpen && (
        <div
          className="player-avatar__popover"
          role="dialog"
          aria-label={`${player.name} details`}
        >
          <button
            className="player-avatar__popover-close"
            onClick={() => setPopoverOpen(false)}
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
          <div className="player-avatar__popover-face" aria-hidden="true">
            {player.avatar}
          </div>
          <strong className="player-avatar__popover-name">{player.name}</strong>
          <span className={`player-avatar__popover-status player-avatar__popover-status--${player.status}`}>
            {badge} {player.status.toUpperCase()}
          </span>
          {player.stats && (
            <ul className="player-avatar__popover-stats">
              <li>👑 HOH wins: {player.stats.hohWins}</li>
              <li>🎭 POV wins: {player.stats.povWins}</li>
              <li>🎯 Times nominated: {player.stats.timesNominated}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
