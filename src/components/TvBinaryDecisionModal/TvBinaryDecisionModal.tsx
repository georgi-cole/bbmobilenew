import './TvBinaryDecisionModal.css';

interface Props {
  title: string;
  subtitle?: string;
  yesLabel: string;
  noLabel: string;
  onYes: () => void;
  onNo: () => void;
}

/**
 * TvBinaryDecisionModal — a TV-contained modal prompting the human player
 * with a Yes / No choice.  Used for the POV use decision.
 *
 * This decision is MANDATORY — there is intentionally no Escape key or
 * cancel mechanism; the game cannot progress until the player chooses.
 */
export default function TvBinaryDecisionModal({
  title,
  subtitle,
  yesLabel,
  noLabel,
  onYes,
  onNo,
}: Props) {
  return (
    <div
      className="tv-binary-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tvbm-title"
    >
      <div className="tv-binary-modal__card">
        <header className="tv-binary-modal__header">
          <h2 className="tv-binary-modal__title" id="tvbm-title">
            {title}
          </h2>
          {subtitle && <p className="tv-binary-modal__subtitle">{subtitle}</p>}
        </header>

        <div className="tv-binary-modal__body">
          <button
            className="tv-binary-modal__option tv-binary-modal__option--yes"
            onClick={onYes}
            type="button"
          >
            {yesLabel}
          </button>
          <button
            className="tv-binary-modal__option tv-binary-modal__option--no"
            onClick={onNo}
            type="button"
          >
            {noLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
