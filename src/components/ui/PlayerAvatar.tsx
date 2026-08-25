import { useState } from 'react';
import type { Player } from '../../types';
import { getDicebear } from '../../utils/avatar';
import { useResolvedAvatarSrc } from '../../hooks/useResolvedAvatarSrc';
import { getBadgesForPlayer } from '../../utils/statusBadges';
import { resolvePresentationAvatar } from '../../utils/presentationAvatar';
import './PlayerAvatar.css';

interface PlayerAvatarProps {
  player: Player;
  /** Called when avatar is tapped/clicked */
  onSelect?: (player: Player) => void;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * PlayerAvatar — interactive avatar tile.
 *
 * When onSelect is provided (e.g. Houseguests screen): tap opens the
 * HouseguestProfile modal; the popover is not shown.
 * When onSelect is absent: tap toggles the mini popover with name + stats.
 *
 * Badge rendering delegates to getBadgesForPlayer() from statusBadges utility:
 *   'loh' → LOH badge asset  'pos' → safety badge asset  'nominated' → nomination badge asset  'jury' → ⚖️
 *   finalRank 1/2/3 → 🥇/🥈/🥉
 *
 * Image loading uses a two-step fallback chain:
 *  1. /avatars/{Name}.png (via resolveAvatar)
 *  2. Dicebear pixel-art SVG (on first load error)
 *  3. Emoji / initials (if Dicebear also fails — shown accessibly)
 */
export default function PlayerAvatar({ player, onSelect, size = 'md' }: PlayerAvatarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { src: resolvedAvatarSrc } = useResolvedAvatarSrc(player);
  const presentationAvatarSrc = resolvePresentationAvatar(resolvedAvatarSrc);
  const [avatarState, setAvatarState] = useState({
    baseSrc: presentationAvatarSrc,
    src: presentationAvatarSrc,
    showEmojiAvatar: false,
  });
  const avatarSrc = avatarState.baseSrc === presentationAvatarSrc ? avatarState.src : presentationAvatarSrc;
  const showEmojiAvatar = avatarState.baseSrc === presentationAvatarSrc ? avatarState.showEmojiAvatar : false;

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
      setAvatarState({
        baseSrc: presentationAvatarSrc,
        src: dicebear,
        showEmojiAvatar: false,
      });
    } else {
      // Step 3: Dicebear also failed — show emoji fallback
      setAvatarState({
        baseSrc: presentationAvatarSrc,
        src: avatarSrc,
        showEmojiAvatar: true,
      });
    }
  }

  const isEvicted = player.status === 'evicted' || player.status === 'jury';
  const badges = getBadgesForPlayer(player.status, player.finalRank);
  // Collapsed badge string for popover status label (e.g. "👑 🛡️")
  const badgeStr = badges.map((b) => b.emoji).join(' ');
  const badgeLabels = badges.map((b) => b.label).join(', ');

  return (
    <div className={`player-avatar player-avatar--${size} player-avatar--${player.status} ${isEvicted ? 'player-avatar--out' : ''}`}>
      <button
        className="player-avatar__face"
        onClick={handleClick}
        aria-label={`${player.name} – ${player.status}${badgeLabels ? ` – ${badgeLabels}` : ''}`}
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
        {badges.length > 0 && (
          <span
            className="player-avatar__badge"
            aria-label={badgeLabels}
            title={badgeLabels}
          >
            {badges.map((b) => (
              <span
                key={b.code}
                className={`player-avatar__badge-item${b.imageSrc ? ' player-avatar__badge-item--image' : ''}`}
              >
                {b.imageSrc ? (
                  <img
                    className="player-avatar__badge-image"
                    src={b.imageSrc}
                    alt=""
                  />
                ) : (
                  b.emoji
                )}
              </span>
            ))}
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
            {`${badgeStr} ${player.status.toUpperCase()}`.trim()}
          </span>
          {player.stats && (
            <ul className="player-avatar__popover-stats">
              <li>👑 LOH wins: {player.stats.lohWins}</li>
              <li>🛡️ POS wins: {player.stats.posWins}</li>
              <li>❓ Times nominated: {player.stats.timesNominated}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
