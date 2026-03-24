/**
 * MemoryColorsComp — Full-screen Memory Colors competition component.
 *
 * Rendered by MinigameHost when reactComponentKey === 'MemoryColors'.
 *
 * Rules:
 *  - 4 color pads; sequence starts at length 3, +1 each round.
 *  - Player gets exactly 1 total mistake.
 *  - First mistake: warning, run continues from beginning of current sequence.
 *  - Second mistake: run ends immediately.
 *
 * On completion, dispatches resolveMemoryColorsOutcome() to store the
 * authoritative winner / last-place and then calls onComplete() for the host.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store/store';
import {
  initMemoryColors,
  beginInput,
  setStepStartMs,
  recordInput,
  resumeAfterWarning,
  startNextRound,
  resetMemoryColors,
  NUM_COLORS,
  type MemoryColorsCompetitionType,
  type MemoryColorsPlayerResult,
} from '../../features/memoryColors/memoryColorsSlice';
import { resolveMemoryColorsOutcome } from '../../features/memoryColors/thunks';
import type {
  MinigameParticipant,
  ReactMinigameCompletion,
} from '../MinigameHost/MinigameHost';
import HOUSEGUESTS from '../../data/houseguests';
import './MemoryColorsComp.css';

// ─── Constants ────────────────────────────────────────────────────────────────

/** How long each color is highlighted during the reveal (ms). */
const SHOW_DURATION_MS = 600;
/** Gap between highlights during the reveal (ms). */
const SHOW_GAP_MS = 300;
/** How long the warning-beat animation plays (ms). */
const WARNING_BEAT_MS = 1800;
/** How long the round-cleared celebration shows (ms). */
const ROUND_CLEARED_MS = 1400;
/** How long the results screen shows before auto-completing (ms, 0 = user must click). */

const COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow'] as const;
const COLOR_CLASSES = ['color-pad--red', 'color-pad--blue', 'color-pad--green', 'color-pad--yellow'] as const;
const COLOR_EMOJIS = ['🔴', '🔵', '🟢', '🟡'] as const;

function areAnimationsDisabled(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function animDelay(ms: number): number {
  return areAnimationsDisabled() ? 0 : ms;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPlayerName(id: string): string {
  const hg = HOUSEGUESTS.find((h) => h.id === id);
  return hg?.name ?? id;
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType?: MemoryColorsCompetitionType;
  seed?: number;
  onComplete: (completion?: ReactMinigameCompletion) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MemoryColorsComp({
  participantIds,
  participants,
  prizeType = 'HOH',
  seed = 0,
  onComplete,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const mc = useSelector((s: RootState) =>
    (s as RootState & { memoryColors?: ReturnType<typeof import('../../features/memoryColors/memoryColorsSlice').default> }).memoryColors,
  );

  const humanPlayerId = participants?.find((p) => p.isHuman)?.id ?? null;

  /** Index of the color currently lit during reveal (-1 = none). */
  const [litColorIndex, setLitColorIndex] = useState<number>(-1);
  /** Position (step index) of the currently lit color during reveal (-1 = none).
   *  Tracked separately so repeated colors highlight the correct step. */
  const [litStepIndex, setLitStepIndex] = useState<number>(-1);
  /** Index of the color just pressed by the player (for flash feedback). */
  const [pressedColor, setPressedColor] = useState<number>(-1);
  /** Whether last tap was wrong (for error flash). */
  const [flashError, setFlashError] = useState(false);
  /** Whether last tap was correct. */
  const [flashCorrect, setFlashCorrect] = useState(false);

  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundClearedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeDispatchedRef = useRef(false);
  const initDoneRef = useRef(false);

  // ── Initialization ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    dispatch(resetMemoryColors());
    dispatch(
      initMemoryColors({
        participantIds,
        competitionType: prizeType,
        seed,
        humanPlayerId,
      }),
    );
    return () => {
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (roundClearedTimeoutRef.current) clearTimeout(roundClearedTimeoutRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sequence reveal ────────────────────────────────────────────────────────
  const runReveal = useCallback(
    (sequence: number[]) => {
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
      setLitColorIndex(-1);
      setLitStepIndex(-1);

      let i = 0;
      function showNext() {
        if (i >= sequence.length) {
          // Reveal finished
          setLitColorIndex(-1);
          setLitStepIndex(-1);
          revealTimeoutRef.current = setTimeout(() => {
            dispatch(beginInput());
            dispatch(setStepStartMs(Date.now()));
          }, animDelay(200));
          return;
        }
        // Light up color at step i
        setLitColorIndex(sequence[i]);
        setLitStepIndex(i);
        revealTimeoutRef.current = setTimeout(() => {
          setLitColorIndex(-1);
          setLitStepIndex(-1);
          revealTimeoutRef.current = setTimeout(() => {
            i += 1;
            showNext();
          }, animDelay(SHOW_GAP_MS));
        }, animDelay(SHOW_DURATION_MS));
      }
      // Brief pause before starting reveal
      revealTimeoutRef.current = setTimeout(showNext, animDelay(400));
    },
    [dispatch],
  );

  // Trigger reveal when phase becomes 'showing'
  useEffect(() => {
    if (!mc || mc.phase !== 'showing') return;
    const revealStartTimeout = setTimeout(() => {
      runReveal(mc.sequence);
    }, 0);
    return () => clearTimeout(revealStartTimeout);
  }, [mc?.phase, mc?.sequence, runReveal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Warning beat ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mc || mc.phase !== 'warning_beat') return;
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => {
      dispatch(resumeAfterWarning());
    }, animDelay(WARNING_BEAT_MS));
  }, [mc?.phase, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Round cleared auto-advance ─────────────────────────────────────────────
  useEffect(() => {
    if (!mc || mc.phase !== 'round_cleared') return;
    if (roundClearedTimeoutRef.current) clearTimeout(roundClearedTimeoutRef.current);
    roundClearedTimeoutRef.current = setTimeout(() => {
      dispatch(startNextRound());
    }, animDelay(ROUND_CLEARED_MS));
  }, [mc?.phase, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Outcome resolution ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mc || mc.phase !== 'complete') return;
    if (outcomeDispatchedRef.current) return;
    outcomeDispatchedRef.current = true;
    dispatch(resolveMemoryColorsOutcome());
  }, [mc?.phase, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Color tap handler ──────────────────────────────────────────────────────
  const handleColorTap = useCallback(
    (colorIndex: number) => {
      if (!mc || mc.phase !== 'input') return;

      const expected = mc.sequence[mc.inputIndex];
      const isCorrect = colorIndex === expected;

      setPressedColor(colorIndex);
      if (isCorrect) {
        setFlashCorrect(true);
        setFlashError(false);
      } else {
        setFlashError(true);
        setFlashCorrect(false);
      }
      setTimeout(() => {
        setPressedColor(-1);
        setFlashCorrect(false);
        setFlashError(false);
      }, 300);

      dispatch(recordInput({ colorIndex, now: Date.now() }));
    },
    [dispatch, mc],
  );

  const handleDone = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // ── Early guards ───────────────────────────────────────────────────────────
  if (!mc || mc.phase === 'idle') {
    return (
      <div className="mc-host">
        <div className="mc-loading">Preparing…</div>
      </div>
    );
  }

  // ── Results screen ─────────────────────────────────────────────────────────
  if (mc.phase === 'complete') {
    const ranking = mc.finalRanking;
    const allResults: Record<string, MemoryColorsPlayerResult> = {
      ...mc.aiResults,
      ...(mc.humanPlayerId && mc.humanResult
        ? { [mc.humanPlayerId]: mc.humanResult }
        : {}),
    };

    return (
      <div className="mc-host mc-host--results">
        <div className="mc-results-panel">
          <div className="mc-results-title">🏁 Memory Colors</div>
          <div className="mc-results-subtitle">Final Results</div>

          <ol className="mc-results-list">
            {ranking.map((id, i) => {
              const r = allResults[id];
              const isHuman = id === mc.humanPlayerId;
              const isWinner = i === 0;
              const isLast = i === ranking.length - 1;
              return (
                <li
                  key={id}
                  className={[
                    'mc-results-row',
                    isHuman ? 'mc-results-row--you' : '',
                    isWinner ? 'mc-results-row--winner' : '',
                    isLast ? 'mc-results-row--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="mc-results-rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <span className="mc-results-name">
                    {getPlayerName(id)}
                    {isHuman && <span className="mc-results-you"> (You)</span>}
                    {isWinner && <span className="mc-results-badge mc-results-badge--win"> 🏆 Winner</span>}
                    {isLast && ranking.length > 1 && (
                      <span className="mc-results-badge mc-results-badge--last"> ⬇ Last Place</span>
                    )}
                  </span>
                  {r && (
                    <span className="mc-results-score">
                      Round {r.roundsCleared}
                      {r.failedAtStep > 0 && (
                        <span className="mc-results-detail"> (+{r.failedAtStep} steps)</span>
                      )}
                      {r.mistakesUsed > 0 && (
                        <span className="mc-results-detail mc-results-detail--mistake"> ⚠ strike used</span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <button className="mc-btn mc-btn--primary mc-btn--done" onClick={handleDone} autoFocus>
            Continue ▶
          </button>
        </div>
      </div>
    );
  }

  // ── Gameplay screen ────────────────────────────────────────────────────────
  const isShowing = mc.phase === 'showing';
  const isInput = mc.phase === 'input';
  const isWarning = mc.phase === 'warning_beat';
  const isRoundCleared = mc.phase === 'round_cleared';

  const sequenceLength = mc.sequence.length;
  // During input: how many steps the player has confirmed so far.
  // During showing: how far into the reveal we are (for aria-valuenow).
  const progress = isInput ? mc.inputIndex : isShowing ? Math.max(litStepIndex, 0) : 0;
  const hasStrike = mc.mistakesUsed > 0;

  return (
    <div className={['mc-host', isWarning ? 'mc-host--warning' : ''].filter(Boolean).join(' ')}>
      {/* Header */}
      <div className="mc-header">
        <div className="mc-round-label">
          Round <strong>{mc.round}</strong>
          <span className="mc-sequence-length"> ({sequenceLength} colors)</span>
        </div>
        <div className="mc-life-indicator" aria-label="Strikes remaining">
          {hasStrike ? (
            <span className="mc-strike mc-strike--used" title="Strike used">⚠️ 1/1 strike used</span>
          ) : (
            <span className="mc-strike mc-strike--safe" title="No strikes yet">✅ 1 strike available</span>
          )}
        </div>
      </div>

      {/* Sequence progress bar */}
      <div
        className="mc-progress-bar"
        aria-label="Sequence progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={sequenceLength}
        aria-valuenow={Math.min(Math.max(progress, 0), sequenceLength)}
      >
        {mc.sequence.map((colorIdx, i) => (
          <div
            key={i}
            className={[
              'mc-progress-step',
              `mc-progress-step--${COLOR_CLASSES[colorIdx].replace('color-pad--', '')}`,
              i < progress ? 'mc-progress-step--done' : '',
              isShowing && litStepIndex === i
                ? 'mc-progress-step--active'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>

      {/* Phase message */}
      <div className="mc-phase-message" aria-live="polite">
        {isShowing && <span className="mc-msg mc-msg--watch">👀 Watch carefully…</span>}
        {isInput && (
          <span className="mc-msg mc-msg--input">
            Tap <strong>{ordinal(mc.inputIndex + 1)}</strong> color
          </span>
        )}
        {isWarning && (
          <div className="mc-warning-block">
            <div className="mc-warning-icon">⚠️</div>
            <div className="mc-warning-title">Strike!</div>
            <div className="mc-warning-text">
              Next mistake ends your run — stay focused!
            </div>
          </div>
        )}
        {isRoundCleared && (
          <div className="mc-cleared-block">
            <div className="mc-cleared-icon">✅</div>
            <div className="mc-cleared-title">Round {mc.round} cleared!</div>
            <div className="mc-cleared-sub">Get ready for the next sequence…</div>
          </div>
        )}
      </div>

      {/* Color pads */}
      <div
        className={[
          'mc-pads',
          isShowing || isWarning || isRoundCleared ? 'mc-pads--disabled' : '',
          flashError ? 'mc-pads--error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Color pads"
      >
        {Array.from({ length: NUM_COLORS }, (_, i) => (
          <button
            key={i}
            className={[
              'mc-pad',
              COLOR_CLASSES[i],
              litColorIndex === i ? 'mc-pad--lit' : '',
              pressedColor === i ? 'mc-pad--pressed' : '',
              pressedColor === i && flashError ? 'mc-pad--error' : '',
              pressedColor === i && flashCorrect ? 'mc-pad--correct' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleColorTap(i)}
            disabled={!isInput}
            aria-label={COLOR_NAMES[i]}
            aria-pressed={pressedColor === i}
          >
            <span className="mc-pad-emoji" aria-hidden="true">{COLOR_EMOJIS[i]}</span>
            <span className="mc-pad-name">{COLOR_NAMES[i]}</span>
          </button>
        ))}
      </div>

      {/* Bottom instruction */}
      <div className="mc-footer-hint">
        {isInput && !hasStrike && (
          <span>You have <strong>1 strike</strong> available</span>
        )}
        {isInput && hasStrike && (
          <span className="mc-footer-hint--danger">⚠️ Last chance — one more mistake ends your run!</span>
        )}
        {(isShowing || isWarning || isRoundCleared) && (
          <span>&nbsp;</span>
        )}
      </div>
    </div>
  );
}
