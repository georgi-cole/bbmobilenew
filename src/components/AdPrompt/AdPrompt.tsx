/**
 * AdPrompt — generic rewarded-ad prompt modal.
 *
 * Shows a dismissible overlay with:
 *   - A title and description explaining the reward.
 *   - A "Watch Ad" button that triggers the rewarded ad.
 *   - A "No Thanks" button that dismisses without granting the reward.
 *
 * This component is purely presentational — the caller handles the actual
 * ad request and reward logic.
 */
import type { ReactNode } from 'react';
import './AdPrompt.css';

interface AdPromptProps {
  /** Modal heading (e.g. "Recharge Your Energy"). */
  title: string;
  /** Body text explaining the offer (e.g. "Watch a short ad to get +3 energy."). */
  description: string;
  /** Icon / emoji to display above the title. */
  icon?: ReactNode;
  /** Label on the primary "watch ad" button. Defaults to "Watch Ad". */
  watchLabel?: string;
  /** Label on the dismiss button. Defaults to "No Thanks". */
  skipLabel?: string;
  /** Called when the user taps the "Watch Ad" button. */
  onWatch: () => void;
  /** Called when the user taps "No Thanks" or otherwise dismisses. */
  onSkip: () => void;
  /** When true, the "Watch Ad" button is disabled (e.g. ad already requested). */
  pending?: boolean;
}

export default function AdPrompt({
  title,
  description,
  icon,
  watchLabel = 'Watch Ad',
  skipLabel = 'No Thanks',
  onWatch,
  onSkip,
  pending = false,
}: AdPromptProps) {
  return (
    <div className="ad-prompt__backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ad-prompt__card">
        {icon && <div className="ad-prompt__icon" aria-hidden="true">{icon}</div>}
        <h2 className="ad-prompt__title">{title}</h2>
        <p className="ad-prompt__description">{description}</p>
        <div className="ad-prompt__actions">
          <button
            type="button"
            className="ad-prompt__btn ad-prompt__btn--watch"
            onClick={onWatch}
            disabled={pending}
          >
            {watchLabel}
          </button>
          <button
            type="button"
            className="ad-prompt__btn ad-prompt__btn--skip"
            onClick={onSkip}
            disabled={pending}
          >
            {skipLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
