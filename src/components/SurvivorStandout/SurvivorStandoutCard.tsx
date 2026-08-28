import { resolveAvatar } from '../../utils/avatar';
import type { SurvivorStandoutMode, SurvivorStandoutResult } from '../../modes/survivorStandout';
import './SurvivorStandoutCard.css';

type Props = {
  standout: SurvivorStandoutResult;
  mode: SurvivorStandoutMode;
  onPlayerClick?: (playerId: string) => void;
};

function formatAveragePlacement(value: number | null) {
  if (value === null) return null;
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function formatTiedNames(standout: SurvivorStandoutResult) {
  const names = standout.tiedPlayers.map((row) => row.player.name);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

export default function SurvivorStandoutCard({ standout, mode, onPlayerClick }: Props) {
  if (standout.status === 'unavailable') return null;

  const primary = standout.status === 'leader' ? standout.leader : standout.tiedPlayers[0];
  if (!primary) return null;

  const tied = standout.status === 'tied';
  const averagePlacement = formatAveragePlacement(primary.averagePlacement);
  const wins = primary.lohWins + primary.posWins;
  const title = tied ? 'Leaders tied' : primary.player.name;
  const subtitle = tied ? formatTiedNames(standout) : `${primary.daysInGame} days in game`;
  const ariaLabel = tied
    ? `Surveyeval leaders tied: ${formatTiedNames(standout)}`
    : `Current Surveyeval leader: ${primary.player.name}, ${primary.daysInGame} days in game`;

  return (
    <section
      className={`survivor-standout survivor-standout--${mode}`}
      aria-label={ariaLabel}
      data-survivor-standout-mode={mode}
    >
      <button
        type="button"
        className="survivor-standout__body"
        onClick={() => onPlayerClick?.(primary.player.id)}
        disabled={!onPlayerClick || tied}
      >
        <span className="survivor-standout__avatar-wrap" aria-hidden="true">
          <img className="survivor-standout__avatar" src={resolveAvatar(primary.player)} alt="" />
        </span>
        <span className="survivor-standout__copy">
          <span className="survivor-standout__eyebrow">Surveyeval Standout</span>
          <strong className="survivor-standout__title">{title}</strong>
          <span className="survivor-standout__subtitle">{subtitle}</span>
        </span>
        <span className="survivor-standout__stats" aria-hidden="true">
          <span>
            <strong>{primary.daysInGame}</strong>
            <small>days</small>
          </span>
          {averagePlacement && (
            <span>
              <strong>{averagePlacement}</strong>
              <small>avg rank</small>
            </span>
          )}
          {wins > 0 && (
            <span>
              <strong>{wins}</strong>
              <small>wins</small>
            </span>
          )}
        </span>
      </button>
    </section>
  );
}
