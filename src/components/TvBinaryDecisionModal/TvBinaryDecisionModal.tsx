import { useState, useCallback } from 'react';
import TvStingerOverlay from '../TvStingerOverlay/TvStingerOverlay';
import './TvBinaryDecisionModal.css';

interface Props {
  title: string;
  subtitle?: string;
  yesLabel: string;
  noLabel: string;
  onYes: () => void;
  onNo: () => void;
  /** Stinger message shown after confirm. Default: "Decision locked in!" */
  stingerMessage?: string;
}

/**
 * TvBinaryDecisionModal — a TV-contained modal prompting the human player
 * with a Yes / No choice.  Used for the POV use decision.
 *
 * Two-step confirm flow: first tap selects Yes or No (highlighted); the
 * player must then press Confirm to commit. A brief stinger overlay is
 * shown before the action is dispatched to add pacing and suspense.
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
  stingerMessage = 'Decision locked in!',
}: Props) {
  const [selected, setSelected] = useState<'yes' | 'no' | null>(null);
  const [showStinger, setShowStinger] = useState(false);

  function handleOptionClick(choice: 'yes' | 'no') {
    setSelected(choice);
  }

  function handleConfirm() {
    if (selected) {
      setShowStinger(true);
    }
  }

  const handleStingerDone = useCallback(() => {
    if (selected === 'yes') {
      onYes();
    } else if (selected === 'no') {
      onNo();
    } else {
      throw new Error('TvBinaryDecisionModal: handleStingerDone called without a selection');
    }
  }, [selected, onYes, onNo]);

  return (
    <>
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
              className={[
                'tv-binary-modal__option',
                'tv-binary-modal__option--yes',
                selected === 'yes' ? 'tv-binary-modal__option--selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleOptionClick('yes')}
              aria-pressed={selected === 'yes'}
              type="button"
            >
              {yesLabel}
            </button>
            <button
              className={[
                'tv-binary-modal__option',
                'tv-binary-modal__option--no',
                selected === 'no' ? 'tv-binary-modal__option--selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleOptionClick('no')}
              aria-pressed={selected === 'no'}
              type="button"
            >
              {noLabel}
            </button>
          </div>

          {selected && (
            <footer className="tv-binary-modal__footer">
              <button
                className="tv-binary-modal__btn-change"
                onClick={() => setSelected(null)}
                type="button"
              >
                Change
              </button>
              <button
                className="tv-binary-modal__btn-confirm"
                onClick={handleConfirm}
                type="button"
              >
                Confirm
              </button>
            </footer>
          )}
        </div>
      </div>

      {showStinger && (
        <TvStingerOverlay message={stingerMessage} onDone={handleStingerDone} />
      )}
    </>
  );
}
