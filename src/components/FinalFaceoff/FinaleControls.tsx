/**
 * FinaleControls — reveal / skip / finish buttons for the finale overlay.
 */
interface Props {
  allRevealed: boolean;
  isComplete: boolean;
  onRevealNext: () => void;
  onSkipAll: () => void;
  onDismiss: () => void;
}

export default function FinaleControls({
  allRevealed,
  isComplete,
  onRevealNext,
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

  return (
    <div className="fo-controls">
      <button
        className="fo-btn fo-btn--secondary"
        onClick={onSkipAll}
        disabled={allRevealed}
      >
        Reveal All
      </button>
      <button
        className="fo-btn"
        onClick={onRevealNext}
        disabled={allRevealed}
      >
        {allRevealed ? 'Tallying…' : 'Next Juror ▶'}
      </button>
    </div>
  );
}
