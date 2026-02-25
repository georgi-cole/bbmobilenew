import { useState } from 'react';
import type { Player } from '../../types';
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar';
import { getRelationshipTone } from './relationshipOutline';
import './PlayerAvatar.css';

interface PlayerAvatarProps {
  player: Player;
  /** Whether this avatar is currently selected (shows selection ring) */
  selected?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Called when avatar is tapped/clicked */
  onClick?: (player: Player) => void;
  /** Affinity value toward this player (normalized -1..1 or percent 0..100). When provided, a relationship-tone ring is shown. */
  affinity?: number | null;
  /** Whether to show the relationship-tone outline ring. Defaults to true. Set to false to opt out (e.g. main roster tiles, jury panel). */
  showRelationshipOutline?: boolean;
  /** Whether to apply the greyscale evicted style when player.status is 'evicted'/'jury'. Defaults to true. Set to false to suppress during animations (e.g. vote reveal). */
  showEvictedStyle?: boolean;
}

/**
 * PlayerAvatar — reusable avatar tile for decision modals.
 *
 * Renders a circular photo avatar with:
 *  - Multi-step image fallback: iterates all resolveAvatarCandidates before emoji/initials
 *  - Load animation (fade-in)
 *  - Subtle border + status ring
 *  - Selected state (glow ring) and hover state
 *
 * Used in TvDecisionModal, TvMultiSelectModal, VoteResultsPopup, etc.
 */
export default function PlayerAvatar({
  player,
  selected = false,
  size = 'md',
  onClick,
  affinity,
  showRelationshipOutline = true,
  showEvictedStyle = true,
}: PlayerAvatarProps) {
  const [candidates] = useState(() => resolveAvatarCandidates(player));
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const avatarSrc = candidates[candidateIdx] ?? '';

  function handleError() {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((i) => i + 1);
    } else {
      setShowFallback(true);
    }
  }

  const isEvicted = showEvictedStyle && (player.status === 'evicted' || player.status === 'jury');

  const tone = showRelationshipOutline ? getRelationshipTone(affinity) : 'none';
  const toneLabel =
    tone === 'good' ? 'Allies' : tone === 'neutral' ? 'Neutral' : tone === 'bad' ? 'Rivals' : null;

  const classes = [
    'pa',
    `pa--${size}`,
    selected ? 'pa--selected' : '',
    isEvicted ? 'pa--evicted' : '',
    tone !== 'none' ? `pa--rel-${tone}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = showFallback ? (
    <span className="pa__fallback" aria-hidden="true">
      {isEmoji(player.avatar ?? '') ? player.avatar : player.name.charAt(0).toUpperCase()}
    </span>
  ) : (
    <img
      className={`pa__img${loaded ? ' pa__img--loaded' : ''}`}
      src={avatarSrc}
      alt=""
      onError={handleError}
      onLoad={() => setLoaded(true)}
      aria-hidden="true"
    />
  );

  if (onClick) {
    return (
      <button
        className={classes}
        onClick={() => onClick(player)}
        aria-pressed={selected}
        aria-label={toneLabel ? `${player.name} — ${toneLabel}` : player.name}
        title={toneLabel ? `${player.name} — ${toneLabel}` : player.name}
        type="button"
      >
        <span className="pa__ring" aria-hidden="true" />
        {inner}
      </button>
    );
  }

  return (
    <span
      className={classes}
      aria-label={toneLabel ? `${player.name} — ${toneLabel}` : undefined}
      title={toneLabel ? `${player.name} — ${toneLabel}` : undefined}
    >
      <span className="pa__ring" aria-hidden="true" />
      {inner}
    </span>
  );
}
