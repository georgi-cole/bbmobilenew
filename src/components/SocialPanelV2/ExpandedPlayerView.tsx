import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import type { Player } from '../../types';
import './ExpandedPlayerView.css';

interface ExpandedPlayerViewProps {
  player: Player;
  /** Human player's affinity toward this player. Undefined if no relationship data. */
  affinity?: number;
}

/**
 * ExpandedPlayerView — inline detail card shown below a selected PlayerCard.
 *
 * Displays a larger avatar, the player's name/status, and their affinity
 * toward the human player ("—" when no relationship data exists).
 */
export default function ExpandedPlayerView({ player, affinity }: ExpandedPlayerViewProps) {
  const affinityDisplay =
    affinity !== undefined ? `${Math.max(0, Math.min(100, affinity))}%` : '—';

  return (
    <div className="epv" aria-label={`${player.name} details`}>
      <PlayerAvatar player={player} size="md" />
      <div className="epv__details">
        <span className="epv__name">{player.name}</span>
        <span className={`epv__status epv__status--${player.status.split('+')[0]}`}>
          {player.status}
        </span>
        <span className="epv__affinity-row">
          <span className="epv__affinity-label">Affinity</span>
          <span className="epv__affinity">{affinityDisplay}</span>
        </span>
      </div>
    </div>
  );
}
