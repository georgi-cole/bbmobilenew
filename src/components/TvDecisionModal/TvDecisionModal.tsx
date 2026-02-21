import type { Player } from '../../types';
import './TvDecisionModal.css';

interface Props {
  title: string;
  subtitle?: string;
  options: Player[];
  onSelect: (playerId: string) => void;
  danger?: boolean;
}

/**
 * TvDecisionModal — a TV-contained modal prompting the human player to select
 * a houseguest. Used for:
 *   - HOH replacement nominee selection (after POV auto-save)
 *   - Final 4 eviction vote (human POV holder)
 */
export default function TvDecisionModal({ title, subtitle, options, onSelect, danger = false }: Props) {
  return (
    <div className="tv-decision-modal" role="dialog" aria-modal="true" aria-labelledby="tvdm-title">
      <div className="tv-decision-modal__card">
        <header className="tv-decision-modal__header">
          <h2 className="tv-decision-modal__title" id="tvdm-title">{title}</h2>
          {subtitle && <p className="tv-decision-modal__subtitle">{subtitle}</p>}
        </header>

        <div className="tv-decision-modal__body">
          {options.map((player) => (
            <button
              key={player.id}
              className={`tv-decision-modal__option${danger ? ' tv-decision-modal__option--danger' : ''}`}
              onClick={() => onSelect(player.id)}
              type="button"
            >
              <span className="tv-decision-modal__option-avatar" aria-hidden="true">
                {player.avatar}
              </span>
              <span className="tv-decision-modal__option-name">{player.name}</span>
              <span className="tv-decision-modal__option-tag">{player.status}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
