/**
 * FinaleControls — skip / finish buttons for the finale overlay.
 *
 * In 'clues' phase: only "Skip All" is shown (auto-reveal is the default flow).
 * In 'revealVotes' phase: "Skip All" remains until complete.
 * Once complete: "Continue" to dismiss.
 */
interface Props {
  phase: 'clues' | 'recap' | 'revealVotes';
  allRevealed: boolean;
  isComplete: boolean;
  onSkipAll: () => void;
  onDismiss: () => void;
}

export default function FinaleControls({
  phase,
  allRevealed,
  isComplete,
  onSkipAll,
  onDismiss,
}: Props) {
  if (isComplete) {
    return (
      <div className="fo-controls">
        <button className="fo-btn" onClick={onDismiss}>
          Continue 🎉
        </button>
      </div>
    );
  }

  // During recap the controls are not rendered (recap has its own Skip button)
  if (phase === 'recap') return null;

  return (
    <div className="fo-controls">
      <button
        className="fo-btn fo-btn--secondary"
        onClick={onSkipAll}
        disabled={phase === 'clues' && allRevealed}
      >
        {phase === 'clues' && allRevealed ? 'Starting recap…' : 'Skip All ▶▶'}
      </button>
    </div>
  );
}
