/**
 * MemoryColorsComp — full-screen Memory Colors competition component.
 *
 * Rules:
 *  - Pool of 20 named colors.
 *  - Round 1 flashes a sequence of 5 colors; each new round adds 1 more color.
 *  - Player must reproduce the exact order from the full color pool.
 *  - The run ends on the 3rd total mistake.
 *  - Ranking priority: furthest round, then fewer mistakes, then lower time.
 */
import { useEffect, useRef, useCallback, useState, type CSSProperties } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store/store';
import useSound from '../../hooks/useSound';
import {
  initMemoryColors,
  beginInput,
  setStepStartMs,
  recordInput,
  resumeAfterWarning,
  startNextRound,
  resetMemoryColors,
  MEMORY_COLOR_POOL,
  MAX_MISTAKES,
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

const SHOW_DURATION_MS = 900;
const SHOW_GAP_MS = 300;
const WARNING_BEAT_MS = 1400;
const ROUND_CLEARED_MS = 1200;

const CLICK_SOUND_KEY = 'ui:navigate';
const CORRECT_SOUND_KEY = 'ui:confirm';
const INCORRECT_SOUND_KEY = 'ui:error';
const WINNER_SOUND_KEY = 'minigame:results';

function areAnimationsDisabled(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function animDelay(ms: number): number {
  return areAnimationsDisabled() ? 0 : ms;
}

function getPlayerName(id: string): string {
  const hg = HOUSEGUESTS.find((h) => h.id === id);
  return hg?.name ?? id;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType?: MemoryColorsCompetitionType;
  seed?: number;
  onComplete: (completion?: ReactMinigameCompletion) => void;
}

export default function MemoryColorsComp({
  participantIds,
  participants,
  prizeType = 'HOH',
  seed = 0,
  onComplete,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { play } = useSound();
  const mc = useSelector((s: RootState) =>
    (s as RootState & { memoryColors?: ReturnType<typeof import('../../features/memoryColors/memoryColorsSlice').default> }).memoryColors,
  );

  const humanPlayerId = participants?.find((p) => p.isHuman)?.id ?? null;
  const [litColorIndex, setLitColorIndex] = useState<number>(-1);
  const [litStepIndex, setLitStepIndex] = useState<number>(-1);
  const [pressedColor, setPressedColor] = useState<number>(-1);
  const [flashError, setFlashError] = useState(false);
  const [flashCorrect, setFlashCorrect] = useState(false);
  /** Index of a recently-tapped chip to trigger the paint-splash animation */
  const [splatColor, setSplatColor] = useState<number>(-1);
  /** When set, shows a brief color-mix animation for a correct sequence step */
  const [mixingPair, setMixingPair] = useState<[string, string] | null>(null);

  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundClearedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mixingPairTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outcomeDispatchedRef = useRef(false);
  const winnerPlayedRef = useRef(false);
  const initDoneRef = useRef(false);

  const playClick = useCallback(() => play(CLICK_SOUND_KEY), [play]);
  const playCorrect = useCallback(() => play(CORRECT_SOUND_KEY), [play]);
  const playIncorrect = useCallback(() => play(INCORRECT_SOUND_KEY), [play]);
  const playWinner = useCallback(() => play(WINNER_SOUND_KEY), [play]);

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
      if (pressResetTimeoutRef.current) clearTimeout(pressResetTimeoutRef.current);
      if (mixingPairTimeoutRef.current) clearTimeout(mixingPairTimeoutRef.current);
    };
  }, [dispatch, humanPlayerId, participantIds, prizeType, seed]);

  const runReveal = useCallback((sequence: number[]) => {
    if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
    setLitColorIndex(-1);
    setLitStepIndex(-1);

    let i = 0;
    function showNext() {
      if (i >= sequence.length) {
        setLitColorIndex(-1);
        setLitStepIndex(-1);
        revealTimeoutRef.current = setTimeout(() => {
          dispatch(beginInput());
          dispatch(setStepStartMs(Date.now()));
        }, animDelay(200));
        return;
      }
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

    revealTimeoutRef.current = setTimeout(showNext, animDelay(260));
  }, [dispatch]);

  useEffect(() => {
    if (!mc || mc.phase !== 'showing') return;
    const revealStartTimeout = setTimeout(() => runReveal(mc.sequence), 0);
    return () => clearTimeout(revealStartTimeout);
  }, [mc, mc?.phase, mc?.sequence, runReveal]);

  useEffect(() => {
    if (!mc || mc.phase !== 'warning_beat') return;
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => {
      dispatch(resumeAfterWarning());
    }, animDelay(WARNING_BEAT_MS));
  }, [dispatch, mc, mc?.phase]);

  useEffect(() => {
    if (!mc || mc.phase !== 'round_cleared') return;
    if (roundClearedTimeoutRef.current) clearTimeout(roundClearedTimeoutRef.current);
    roundClearedTimeoutRef.current = setTimeout(() => {
      dispatch(startNextRound());
    }, animDelay(ROUND_CLEARED_MS));
  }, [dispatch, mc, mc?.phase]);

  useEffect(() => {
    if (!mc || mc.phase !== 'complete') return;
    if (outcomeDispatchedRef.current) return;
    outcomeDispatchedRef.current = true;
    dispatch(resolveMemoryColorsOutcome());
  }, [dispatch, mc, mc?.phase]);

  useEffect(() => {
    if (!mc || mc.phase !== 'complete' || winnerPlayedRef.current) return;
    winnerPlayedRef.current = true;
    playWinner();
  }, [mc, playWinner]);

  const handleColorTap = useCallback((colorIndex: number) => {
    if (!mc || mc.phase !== 'input') return;

    playClick();
    const expected = mc.sequence[mc.inputIndex];
    const isCorrect = colorIndex === expected;
    setPressedColor(colorIndex);
    setSplatColor(colorIndex);
    if (isCorrect) {
      playCorrect();
      setFlashCorrect(true);
      setFlashError(false);
      // Show a quick 2-color mix animation using the previous and current color
      const prevIndex = mc.inputIndex > 0 ? mc.sequence[mc.inputIndex - 1] : -1;
      if (prevIndex >= 0) {
        if (mixingPairTimeoutRef.current) clearTimeout(mixingPairTimeoutRef.current);
        setMixingPair([MEMORY_COLOR_POOL[prevIndex].hex, MEMORY_COLOR_POOL[colorIndex].hex]);
        mixingPairTimeoutRef.current = setTimeout(() => setMixingPair(null), 700);
      }
    } else {
      playIncorrect();
      setFlashError(true);
      setFlashCorrect(false);
    }
    if (pressResetTimeoutRef.current) clearTimeout(pressResetTimeoutRef.current);
    pressResetTimeoutRef.current = setTimeout(() => {
      setPressedColor(-1);
      setFlashCorrect(false);
      setFlashError(false);
      setSplatColor(-1);
    }, 320);

    dispatch(recordInput({ colorIndex, now: Date.now() }));
  }, [dispatch, mc, playClick, playCorrect, playIncorrect]);

  const handleDone = useCallback(() => {
    playClick();
    onComplete();
  }, [onComplete, playClick]);

  if (!mc || mc.phase === 'idle') {
    return <div className="mc-host"><div className="mc-loading">Preparing…</div></div>;
  }

  if (mc.phase === 'complete') {
    const ranking = mc.finalRanking;
    const allResults: Record<string, MemoryColorsPlayerResult> = {
      ...mc.aiResults,
      ...(mc.humanPlayerId && mc.humanResult ? { [mc.humanPlayerId]: mc.humanResult } : {}),
    };

    return (
      <div className="mc-host mc-host--results">
        <div className="mc-results-panel">
          <div className="mc-results-title">🧠 Memory Colors</div>
          <div className="mc-results-subtitle">20-color pool • 3 mistakes max</div>

          <ol className="mc-results-list">
            {ranking.map((id, i) => {
              const r = allResults[id];
              const isHuman = id === mc.humanPlayerId;
              const isWinner = i === 0;
              const isLast = i === ranking.length - 1;
              const furthestRound = r?.furthestRoundReached ?? r?.roundsCleared ?? 0;
              return (
                <li
                  key={id}
                  className={[
                    'mc-results-row',
                    isHuman ? 'mc-results-row--you' : '',
                    isWinner ? 'mc-results-row--winner' : '',
                    isLast ? 'mc-results-row--last' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="mc-results-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                  <span className="mc-results-name">
                    {getPlayerName(id)}
                    {isHuman && <span className="mc-results-you"> (You)</span>}
                    {isWinner && <span className="mc-results-badge mc-results-badge--win">🏆 Winner</span>}
                    {isLast && ranking.length > 1 && <span className="mc-results-badge mc-results-badge--last">⬇ Last Place</span>}
                  </span>
                  {r && (
                    <span className="mc-results-score">
                      Round {furthestRound}
                      <span className="mc-results-detail"> • {r.mistakesUsed}/{MAX_MISTAKES} mistakes</span>
                      <span className="mc-results-detail"> • {(r.totalResponseMs / 1000).toFixed(1)}s</span>
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

  const isShowing = mc.phase === 'showing';
  const isInput = mc.phase === 'input';
  const isWarning = mc.phase === 'warning_beat';
  const isRoundCleared = mc.phase === 'round_cleared';
  const sequenceLength = mc.sequence.length;
  const progress = isInput ? mc.inputIndex : isShowing ? Math.max(litStepIndex + 1, 0) : 0;
  const mistakesRemaining = Math.max(0, MAX_MISTAKES - mc.mistakesUsed);
  const litColor = litColorIndex >= 0 ? MEMORY_COLOR_POOL[litColorIndex] : null;

  return (
    <div className={['mc-host', isWarning ? 'mc-host--warning' : ''].filter(Boolean).join(' ')}>
      <div className="mc-header">
        <div className="mc-round-label">
          Round <strong>{mc.round}</strong>
          <span className="mc-sequence-length"> ({sequenceLength} colors)</span>
        </div>
        <div className="mc-life-indicator" aria-label="Mistakes remaining">
          <span className={['mc-strike', mistakesRemaining <= 1 ? 'mc-strike--used' : 'mc-strike--safe'].join(' ')}>
            {mistakesRemaining} error{mistakesRemaining === 1 ? '' : 's'} left
          </span>
        </div>
      </div>

      <div className="mc-progress-bar" aria-label="Sequence progress" role="progressbar" aria-valuemin={0} aria-valuemax={sequenceLength} aria-valuenow={Math.min(Math.max(progress, 0), sequenceLength)}>
        {mc.sequence.map((colorIdx, i) => (
          <div
            key={i}
            className={[
              'mc-progress-step',
              i < (isInput ? mc.inputIndex : litStepIndex + (litColorIndex === -1 ? 0 : 1)) ? 'mc-progress-step--done' : '',
              isShowing && litStepIndex === i ? 'mc-progress-step--active' : '',
            ].filter(Boolean).join(' ')}
            style={{ backgroundColor: i < progress ? MEMORY_COLOR_POOL[colorIdx].hex : undefined, borderColor: `${MEMORY_COLOR_POOL[colorIdx].hex}66` }}
          />
        ))}
      </div>

      <div className="mc-reveal-panel" aria-live="polite">
        {isShowing && litColor ? (
          <>
            <div className="mc-reveal-label">Watch the sequence</div>
            <div className="mc-reveal-swatch" style={{ backgroundColor: litColor.hex }}>
              <span className="mc-reveal-emoji" aria-hidden="true">{litColor.emoji}</span>
            </div>
            <div className="mc-reveal-name">{litColor.name}</div>
          </>
        ) : mixingPair ? (
          <div className="mc-mixing-row" aria-live="polite" aria-label="Colors mixing">
            <div className="mc-mix-chip" style={{ background: mixingPair[0] }} />
            <span className="mc-mix-plus">+</span>
            <div className="mc-mix-chip" style={{ background: mixingPair[1] }} />
            <span className="mc-mix-arrow">→</span>
            <div
              className="mc-mix-result"
              style={{ background: `linear-gradient(135deg, ${mixingPair[0]}, ${mixingPair[1]})` }}
            />
          </div>
        ) : isInput ? (
          <div className="mc-reveal-copy">Tap the <strong>{ordinal(mc.inputIndex + 1)}</strong> color in the same order</div>
        ) : isWarning ? (
          <div className="mc-reveal-copy mc-reveal-copy--warning">⚠️ Mistake {mc.mistakesUsed}/{MAX_MISTAKES} — the sequence will replay.</div>
        ) : (
          <div className="mc-reveal-copy mc-reveal-copy--good">✅ Round cleared — next sequence incoming.</div>
        )}
      </div>

      <div className={['mc-grid', isShowing || isWarning || isRoundCleared ? 'mc-grid--disabled' : '', flashError ? 'mc-grid--error' : ''].filter(Boolean).join(' ')} aria-label="Color pool">
        {MEMORY_COLOR_POOL.map((color, i) => (
          <button
            key={color.name}
            className={[
              'mc-tile',
              pressedColor === i && flashCorrect ? 'mc-tile--correct' : '',
              pressedColor === i && flashError ? 'mc-tile--error' : '',
              pressedColor === i ? 'mc-tile--pressed' : '',
              splatColor === i ? 'mc-tile--splat' : '',
            ].filter(Boolean).join(' ')}
            style={{ '--mc-color': color.hex } as CSSProperties}
            onClick={() => handleColorTap(i)}
            disabled={!isInput}
            aria-label={color.name}
            aria-pressed={pressedColor === i}
            type="button"
          >
            <span className="mc-tile-emoji" aria-hidden="true">{color.emoji}</span>
            <span className="mc-tile-name">{color.name}</span>
          </button>
        ))}
      </div>

      <div className="mc-footer-hint">
        {isInput ? (
          <span>Reach the furthest round with the fewest mistakes and the fastest time.</span>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
    </div>
  );
}
