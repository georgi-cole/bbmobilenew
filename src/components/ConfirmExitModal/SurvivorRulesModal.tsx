import { useEffect, useId, useRef, useState } from 'react';
import './SurvivorRulesModal.css';

interface Props {
  open: boolean;
  onContinue: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

const RULES = [
  {
    title: 'Endless days',
    description: 'Survive as long as you can. The run ends only when you are eliminated.',
  },
  {
    title: 'Synthetic replacements',
    description: 'AI contestants are replaced after eviction, keeping the house full.',
  },
  {
    title: 'Social mode off',
    description: 'The AI players are not here to make friends.',
  },
  {
    title: 'Public mode off',
    description: 'No audience saves. No popularity shield. Only survival.',
  },
  {
    title: 'Every day counts',
    description: 'Your highest Survivor day and unlocked milestones are saved to your profile.',
  },
] as const;

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
        <div className="survivor-rules-modal__glow survivor-rules-modal__glow--left" aria-hidden="true" />
        <div className="survivor-rules-modal__glow survivor-rules-modal__glow--right" aria-hidden="true" />

        <header className="survivor-rules-modal__header">
          <p className="survivor-rules-modal__eyebrow">Survivor Mode</p>
          <h2 id={titleId} className="survivor-rules-modal__title">
            Before You Enter Survivor
          </h2>
          <p id={descId} className="survivor-rules-modal__desc">
            Survivor Mode is an endless pressure run. There is no finale, no public rescue,
            and no social safety net.
          </p>
        </header>

        <div className="survivor-rules-modal__rules" role="list" aria-label="Survivor rules">
          {RULES.map((rule, index) => (
            <article className="survivor-rules-modal__rule" key={rule.title} role="listitem">
              <div className="survivor-rules-modal__rule-index" aria-hidden="true">
                {index + 1}
              </div>
              <div className="survivor-rules-modal__rule-copy">
                <h3 className="survivor-rules-modal__rule-title">{rule.title}</h3>
                <p className="survivor-rules-modal__rule-desc">{rule.description}</p>
              </div>
            </article>
          ))}
        </div>

        <footer className="survivor-rules-modal__footer">
          <label className="survivor-rules-modal__checkbox">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>Don&apos;t show this again</span>
          </label>

          <div className="survivor-rules-modal__actions">
            <button
              type="button"
              className="survivor-rules-modal__btn game-button game-button--primary"
              onClick={() => onContinue(dontShowAgain)}
              autoFocus
            >
              Enter Survivor
            </button>
            <button
              type="button"
              className="survivor-rules-modal__btn game-button game-button--ghost"
              onClick={onCancel}
            >
              Back
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
