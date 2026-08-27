import { useEffect, useId, useRef, useState } from 'react';
import './SurvivorRulesModal.css';

interface Props {
  open: boolean;
  onContinue?: (dontShowAgain: boolean) => void;
  onCancel: () => void;
  variant?: 'entry' | 'reference';
}

const RULES = [
  {
    kicker: 'RUN',
    title: 'Endless survival',
    description: 'There is no finale. Keep advancing through days until you are eliminated.',
  },
  {
    kicker: 'HUB',
    title: 'The hub stays full',
    description: 'Every eliminated AI is replaced, so each new day restores the pressure.',
  },
  {
    kicker: 'RULES',
    title: 'Competition only',
    description: 'Social and public modes are off. There are no alliances, audience saves, or approval shields.',
  },
  {
    kicker: 'RECORD',
    title: 'Every day counts',
    description: 'Your best day and unlocked Surveyeval milestones are saved to your profile.',
  },
] as const;

export default function SurvivorRulesModal({ open, onContinue, onCancel, variant = 'entry' }: Props) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const cardRef = useRef<HTMLDivElement>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const isReference = variant === 'reference';

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
      <div
        className={`survivor-rules-modal__card${isReference ? ' survivor-rules-modal__card--reference' : ''}`}
        tabIndex={-1}
        ref={cardRef}
      >
        <div className="survivor-rules-modal__glow survivor-rules-modal__glow--left" aria-hidden="true" />
        <div className="survivor-rules-modal__glow survivor-rules-modal__glow--right" aria-hidden="true" />

        <header className="survivor-rules-modal__header">
          <div className="survivor-rules-modal__brand">
            <span className="survivor-rules-modal__logo" aria-hidden="true">∞</span>
            <div>
              <p className="survivor-rules-modal__eyebrow">Surveyeval Mode</p>
              <p className="survivor-rules-modal__guide-label">The Big Eye — Surveyeval Guide</p>
            </div>
          </div>
          <h2 id={titleId} className="survivor-rules-modal__title">
            How Surveyeval Works
          </h2>
          <p id={descId} className="survivor-rules-modal__desc">
            An endless elimination run: win challenges, survive the vote, and keep your place in
            a hub that never gets smaller.
          </p>
        </header>

        <div className="survivor-rules-modal__rules" role="list" aria-label="Surveyeval rules">
          {RULES.map((rule) => (
            <article className="survivor-rules-modal__rule" key={rule.title} role="listitem">
              <span className="survivor-rules-modal__rule-kicker">{rule.kicker}</span>
              <h3 className="survivor-rules-modal__rule-title">{rule.title}</h3>
              <p className="survivor-rules-modal__rule-desc">{rule.description}</p>
            </article>
          ))}
        </div>

        {isReference ? (
          <footer className="survivor-rules-modal__footer survivor-rules-modal__footer--reference">
            <div className="survivor-rules-modal__actions survivor-rules-modal__actions--reference">
              <button
                type="button"
                className="survivor-rules-modal__btn game-button game-button--primary"
                onClick={onCancel}
                autoFocus
              >
                Close Rules
              </button>
            </div>
          </footer>
        ) : (
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
                onClick={() => onContinue?.(dontShowAgain)}
                autoFocus
              >
                Enter Surveyeval
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
        )}
      </div>
    </div>
  );
}
