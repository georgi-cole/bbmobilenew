import { useEffect, useId, useRef, useState } from 'react';
import './SurvivorRulesModal.css';

interface Props {
  open: boolean;
  onContinue: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

const RULES = [
  'Play Survivor as a normal player run, not a debug sandbox.',
  'Read each prompt carefully before you confirm it.',
  'Stay with the run until it finishes or you are eliminated.',
  'Use the in-app controls only; do not rely on developer shortcuts.',
];

export default function SurvivorRulesModal({ open, onContinue, onCancel }: Props) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const cardRef = useRef<HTMLDivElement>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="survivor-rules-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="survivor-rules-modal__card" tabIndex={-1} ref={cardRef}>
        <p className="survivor-rules-modal__eyebrow">Survivor Mode</p>
        <h2 id={titleId} className="survivor-rules-modal__title">Before you jump in</h2>
        <p id={descId} className="survivor-rules-modal__desc">
          These are the player-facing rules for the mode.
        </p>

        <ul className="survivor-rules-modal__list">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        <label className="survivor-rules-modal__checkbox">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don't show again</span>
        </label>

        <div className="survivor-rules-modal__actions">
          <button
            type="button"
            className="survivor-rules-modal__btn survivor-rules-modal__btn--primary"
            onClick={() => onContinue(dontShowAgain)}
            autoFocus
          >
            Continue
          </button>
          <button
            type="button"
            className="survivor-rules-modal__btn survivor-rules-modal__btn--ghost"
            onClick={onCancel}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
