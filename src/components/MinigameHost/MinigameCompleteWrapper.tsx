/**
 * MinigameCompleteWrapper
 *
 * Shared layout shell for every minigame "complete" / results screen.
 * Wraps:
 *  - hero content   (title, winner badge, subtitle, etc.)
 *  - placements     (rendered inside a constrained, scrollable region)
 *  - continue area  (button always visible below the scroll region)
 *  - optional footer (extra controls)
 *
 * Focuses the Continue button on mount so keyboard users can tab through
 * the list and then press Enter/Space to advance.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import './minigameCommon.css';

export interface MinigameCompleteWrapperProps {
  /** Hero / top content: title, trophy, winner name, etc. */
  children: ReactNode;
  /** Content rendered inside the scrollable placement list area. */
  placementsNode?: ReactNode;
  /** Called when the user taps Continue. */
  onContinue: () => void;
  /** Button label. Defaults to "Continue". */
  continueLabel?: string;
  /** Optional extra controls rendered below the Continue button. */
  footerNode?: ReactNode;
}

export default function MinigameCompleteWrapper({
  children,
  placementsNode,
  onContinue,
  continueLabel = 'Continue',
  footerNode,
}: MinigameCompleteWrapperProps) {
  const continueRef = useRef<HTMLButtonElement>(null);

  // Focus Continue on mount so keyboard users can press Enter immediately.
  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  return (
    <div className="minigame-complete">
      {/* Hero: title, trophy, winner name, subtitle */}
      {children}

      {/* Scrollable placements */}
      {placementsNode !== undefined && (
        <div
          className="minigame-placement-list"
          role="list"
          aria-label="Final placements"
        >
          {placementsNode}
        </div>
      )}

      {/* Continue button — always visible below the scroll area */}
      <div className="minigame-continue-area">
        <button ref={continueRef} onClick={onContinue} aria-label={continueLabel}>
          {continueLabel}
        </button>
        {footerNode}
      </div>
    </div>
  );
}
