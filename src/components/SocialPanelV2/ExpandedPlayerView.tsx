import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import type { Player } from '../../types';
import { getRelationshipLabel } from './relationshipUtils';
import './ExpandedPlayerView.css';

interface ExpandedPlayerViewProps {
  player: Player;
  /** Human player's affinity toward this player. Undefined if no relationship data. */
  affinity?: number;
}

/**
 * ExpandedPlayerView — inline detail card shown below a selected PlayerCard.
 *
 * Displays a larger avatar, the player's name/status, relationship label,
 * and affinity ("—" when no relationship data exists).
 */
export default function ExpandedPlayerView({ player, affinity }: ExpandedPlayerViewProps) {
  const affinityDisplay =
    affinity !== undefined ? `${Math.max(0, Math.min(100, affinity))}%` : '—';
  const rel = affinity !== undefined ? getRelationshipLabel(affinity) : null;

  return (
    <div className="epv" aria-label={`${player.name} details`}>
      <PlayerAvatar player={player} size="md" affinity={affinity} />
      <div className="epv__details">
        <span className="epv__name">{player.name}</span>
        <span className={`epv__status epv__status--${player.status.split('+')[0]}`}>
          {player.status}
        </span>
        {rel && (
          <span className={`epv__rel-label epv__rel-label--${rel.key}`}>{rel.label}</span>
        )}
        <span className="epv__affinity-row">
          <span className="epv__affinity-label">Affinity</span>
          <span className="epv__affinity">{affinityDisplay}</span>
        </span>
      </div>
    </div>
  );
}
