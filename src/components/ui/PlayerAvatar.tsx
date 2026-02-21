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
 * When onSelect is provided (e.g. Houseguests screen): tap opens the
 * HouseguestProfile modal; the popover is not shown.
 * When onSelect is absent: tap toggles the mini popover with name + stats.
 *
 * Image loading uses a two-step fallback chain:
 *  1. /avatars/{Name}.png (via resolveAvatar)
 *  2. Dicebear pixel-art SVG (on first load error)
 *  3. Emoji / initials (if Dicebear also fails — shown accessibly)
 */
export default function PlayerAvatar({ player, onSelect, size = 'md' }: PlayerAvatarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(() => resolveAvatar(player));
  const [showEmojiAvatar, setShowEmojiAvatar] = useState(false);

  function handleClick() {
    if (onSelect) {
      onSelect(player);
    } else {
      setPopoverOpen((v) => !v);
    }
  }

  function handleImgError() {
    const dicebear = getDicebear(player.name);
    if (avatarSrc !== dicebear) {
      // Step 2: swap to Dicebear
      setAvatarSrc(dicebear);
    } else {
      // Step 3: Dicebear also failed — show emoji fallback
      setShowEmojiAvatar(true);
    }
  }

  const isEvicted = player.status === 'evicted' || player.status === 'jury';
  const badge = STATUS_BADGE[player.status];

  return (
    <div className={`player-avatar player-avatar--${size} player-avatar--${player.status} ${isEvicted ? 'player-avatar--out' : ''}`}>
      <button
        className="player-avatar__face"
        onClick={handleClick}
        aria-label={`${player.name} – ${player.status}`}
        aria-expanded={onSelect ? undefined : popoverOpen}
        type="button"
      >
        {showEmojiAvatar ? (
          <span className="player-avatar__emoji" role="img" aria-label={player.name}>
            {player.avatar}
          </span>
        ) : (
          <img
            className="player-avatar__img"
            src={avatarSrc}
            alt={player.name}
            onError={handleImgError}
          />
        )}
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
