/**
 * Hourglass — animated visual round-timer for HoldTheWall.
 *
 * Replaces the numeric `elapsedMs` display.  Sand drains from the top chamber
 * to the bottom, the glass flips, and the cycle repeats — giving a sense of
 * time passing without revealing exact milliseconds.
 *
 * Props:
 *   cycleDurationMs — duration (ms) for one half-cycle (top→bottom drain).
 *                     Default: 7 000 ms.
 *   running         — when false the animation is paused (e.g. between rounds).
 *                     Default: true.
 *
 * To restart the animation when a new round begins, pass a new React `key`
 * prop from the parent:
 *   <Hourglass key={roundStartKey} running={htw.status === 'active'} />
 */

import './Hourglass.css';

interface HourglassProps {
  /** Duration of one drain cycle in ms (default 7 000). */
  cycleDurationMs?: number;
  /** Whether the animation is running (default true). */
  running?: boolean;
}

/**
 * Pure CSS animated hourglass.  No numbers are shown; the user gets a
 * visual cue that time is passing but cannot infer exact seconds.
 */
export default function Hourglass({
  cycleDurationMs = 7000,
  running = true,
}: HourglassProps) {
  // CSS custom property drives animation duration; we use 2× because the
  // keyframes cover a full flip cycle (drain + flip + drain).
  const style = {
    '--htw-hg-dur': `${(cycleDurationMs / 1000).toFixed(2)}s`,
  } as React.CSSProperties;

  return (
    <div
      className={[
        'htw-hourglass',
        running ? '' : 'htw-hourglass--paused',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-label="Round timer"
      role="img"
      data-testid="htw-hourglass"
    >
      <div className="htw-hg-frame" data-testid="htw-hg-frame">
        {/* Top chamber */}
        <div className="htw-hg-top" data-testid="htw-hg-top">
          <div className="htw-hg-sand htw-hg-sand--top" data-testid="htw-hg-sand-top" />
        </div>

        {/* Neck */}
        <div className="htw-hg-neck" />

        {/* Bottom chamber */}
        <div className="htw-hg-bottom" data-testid="htw-hg-bottom">
          <div className="htw-hg-sand htw-hg-sand--bottom" data-testid="htw-hg-sand-bottom" />
        </div>
      </div>
    </div>
  );
}
