/**
 * ColorMatchComp — React minigame component for Color Match.
 *
 * Gameplay:
 *  - A target color swatch is displayed with a creative color name.
 *  - The player adjusts R, G, B sliders to match the target color.
 *  - Live similarity % updates as sliders change, creating real-time feedback.
 *  - The player can buy up to 2 hints for the whole game; each hint costs 5
 *    points off the final average score and shows directional RGB guidance.
 *  - Each round has a time limit; missing it scores 0 for that round.
 *  - 5 rounds total. Final score = average accuracy - hint penalties.
 *
 * Supports generic MinigameHost path: calls onFinish(score) when done.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { mulberry32 } from '../../store/rng';
import useSound from '../../hooks/useSound';
import {
  type RGB,
  HINT_PENALTY_POINTS,
  applyHintPenalty,
  buildHintMessage,
  calculateColorMatchAccuracy,
  randomStartColor,
  rgbToHex,
  seededPick,
} from './colorMatchUtils';
import './ColorMatchComp.css';

type GamePhase = 'playing' | 'feedback' | 'results';

interface RoundResult {
  score: number;
  targetColor: RGB;
  playerColor: RGB;
  hintCount: number;
}

interface PendingHintWarning {
  nextHintNumber: number;
}

const MAX_ROUNDS = 5;
const ROUND_TIME_S = 25;
const MAX_HINTS_TOTAL = 2;

const CLICK_SOUND_KEY = 'ui:navigate';
const CORRECT_SOUND_KEY = 'ui:confirm';
const INCORRECT_SOUND_KEY = 'ui:error';
const WINNER_SOUND_KEY = 'minigame:results';

const NAMED_COLORS: Array<{ name: string; rgb: RGB }> = [
  { name: 'Scarlet', rgb: { r: 196, g: 30, b: 58 } },
  { name: 'Baby Blue', rgb: { r: 137, g: 207, b: 240 } },
  { name: 'Milky Grass', rgb: { r: 134, g: 187, b: 95 } },
  { name: 'Blood Orange', rgb: { r: 212, g: 81, b: 19 } },
  { name: 'Sky Cyan', rgb: { r: 55, g: 195, b: 220 } },
  { name: 'Lavender Mist', rgb: { r: 170, g: 140, b: 210 } },
  { name: 'Honey Gold', rgb: { r: 230, g: 170, b: 35 } },
  { name: 'Coral Reef', rgb: { r: 248, g: 131, b: 121 } },
  { name: 'Midnight Plum', rgb: { r: 88, g: 38, b: 110 } },
  { name: 'Sea Foam', rgb: { r: 78, g: 200, b: 175 } },
  { name: 'Dusty Rose', rgb: { r: 210, g: 145, b: 155 } },
  { name: 'Tangerine', rgb: { r: 242, g: 133, b: 0 } },
  { name: 'Steel Teal', rgb: { r: 42, g: 135, b: 145 } },
  { name: 'Amber Dusk', rgb: { r: 200, g: 120, b: 40 } },
  { name: 'Sage Whisper', rgb: { r: 150, g: 180, b: 140 } },
];

interface Props {
  onFinish?: (value: number) => void;
  seed?: number;
  autoStart?: boolean;
}

export default function ColorMatchComp({ onFinish, seed = 0, autoStart = false }: Props) {
  const { play } = useSound();

  const rounds = useMemo(() => {
    const rng = mulberry32((seed ^ 0x7f3da812) >>> 0);
    const picked = seededPick(NAMED_COLORS, MAX_ROUNDS, rng);
    return picked.map((nc) => ({
      name: nc.name,
      target: { ...nc.rgb },
      startColor: randomStartColor(nc.rgb, rng),
    }));
  }, [seed]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_S);
  const [playerColor, setPlayerColor] = useState<RGB>(rounds[0].startColor);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [hintWarning, setHintWarning] = useState<PendingHintWarning | null>(null);
  const [hintMessage, setHintMessage] = useState('');
  const [hintsUsedTotal, setHintsUsedTotal] = useState(0);
  const [hintsUsedThisRound, setHintsUsedThisRound] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const winnerPlayedRef = useRef(false);

  const currentRound = rounds[roundIndex];
  const liveAccuracy = Math.round(calculateColorMatchAccuracy(currentRound.target, playerColor));
  const hintsRemaining = MAX_HINTS_TOTAL - hintsUsedTotal;

  const playClick = useCallback(() => play(CLICK_SOUND_KEY), [play]);
  const playCorrect = useCallback(() => play(CORRECT_SOUND_KEY), [play]);
  const playIncorrect = useCallback(() => play(INCORRECT_SOUND_KEY), [play]);
  const playWinner = useCallback(() => play(WINNER_SOUND_KEY), [play]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const submitRound = useCallback(
    (color: RGB, didTimeOut: boolean) => {
      stopTimer();
      const score = didTimeOut ? 0 : Math.round(calculateColorMatchAccuracy(currentRound.target, color));
      if (didTimeOut || score < 80) {
        playIncorrect();
      } else {
        playCorrect();
      }
      setLastScore(score);
      setTimedOut(didTimeOut);
      setResults((prev) => [
        ...prev,
        {
          score,
          targetColor: currentRound.target,
          playerColor: color,
          hintCount: hintsUsedThisRound,
        },
      ]);
      setPhase('feedback');
    },
    [currentRound.target, hintsUsedThisRound, playCorrect, playIncorrect, stopTimer],
  );

  useEffect(() => {
    if (phase !== 'playing') return;
    setTimeLeft(ROUND_TIME_S);
    setHintMessage('');
    setHintsUsedThisRound(0);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPlayerColor((pc) => {
            submitRound(pc, true);
            return pc;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return stopTimer;
  }, [phase, roundIndex, stopTimer, submitRound]);

  useEffect(() => {
    setPlayerColor(rounds[roundIndex].startColor);
  }, [roundIndex, rounds]);

  useEffect(() => {
    if (phase !== 'results' || winnerPlayedRef.current) return;
    winnerPlayedRef.current = true;
    playWinner();
    const total = results.reduce((sum, r) => sum + r.score, 0);
    const rawAverage = Math.round(total / results.length);
    const finalScore = applyHintPenalty(rawAverage, hintsUsedTotal);
    const timeoutId = setTimeout(() => {
      if (onFinish) onFinish(finalScore);
    }, autoStart ? 0 : 2000);
    return () => clearTimeout(timeoutId);
  }, [autoStart, hintsUsedTotal, onFinish, phase, playWinner, results]);

  const handleSliderChange = useCallback(
    (channel: keyof RGB, value: number) => {
      if (phase !== 'playing') return;
      setPlayerColor((prev) => ({ ...prev, [channel]: value }));
    },
    [phase],
  );

  const handleSubmit = useCallback(() => {
    if (phase !== 'playing') return;
    playClick();
    setPlayerColor((pc) => {
      submitRound(pc, false);
      return pc;
    });
  }, [phase, playClick, submitRound]);

  const handleNext = useCallback(() => {
    playClick();
    const nextIndex = roundIndex + 1;
    if (nextIndex >= MAX_ROUNDS) {
      setPhase('results');
    } else {
      setRoundIndex(nextIndex);
      setPhase('playing');
    }
  }, [playClick, roundIndex]);

  const handleHintPress = useCallback(() => {
    if (phase !== 'playing' || hintsRemaining <= 0) return;
    playClick();
    setHintWarning({ nextHintNumber: hintsUsedTotal + 1 });
  }, [hintsRemaining, hintsUsedTotal, phase, playClick]);

  const confirmHintPurchase = useCallback(() => {
    if (!hintWarning || phase !== 'playing' || hintsRemaining <= 0) return;
    playClick();
    setHintsUsedTotal((prev) => prev + 1);
    setHintsUsedThisRound((prev) => prev + 1);
    setHintMessage(buildHintMessage(currentRound.target, playerColor));
    setHintWarning(null);
  }, [currentRound.target, hintWarning, hintsRemaining, phase, playClick, playerColor]);

  const cancelHintPurchase = useCallback(() => {
    playClick();
    setHintWarning(null);
  }, [playClick]);

  const targetHex = rgbToHex(currentRound.target);
  const playerHex = rgbToHex(playerColor);
  const progressPct = (timeLeft / ROUND_TIME_S) * 100;
  const isUrgent = timeLeft <= 5;

  const feedbackLabel =
    lastScore !== null
      ? lastScore >= 95
        ? '🎯 Perfect!'
        : lastScore >= 80
          ? '✅ Great!'
          : lastScore >= 60
            ? '👍 Good'
            : lastScore >= 40
              ? '😬 Close-ish'
              : '❌ Way off'
      : '';

  if (phase === 'results') {
    const total = results.reduce((sum, r) => sum + r.score, 0);
    const rawAverage = Math.round(total / results.length);
    const finalScore = applyHintPenalty(rawAverage, hintsUsedTotal);
    return (
      <div className="cm" data-testid="color-match-comp">
        <div className="cm__card cm__card--results">
          <div className="cm__title">🎨 Color Match</div>
          <div className="cm__subtitle">Final Results</div>
          <div className="cm__final-score">{finalScore}<span className="cm__final-unit">%</span></div>
          <p className="cm__final-label">Final Accuracy After Hint Penalties</p>
          <div className="cm__summary-grid">
            <div className="cm__summary-chip">
              <span className="cm__summary-label">Raw Avg</span>
              <strong>{rawAverage}%</strong>
            </div>
            <div className="cm__summary-chip">
              <span className="cm__summary-label">Hints Used</span>
              <strong>{hintsUsedTotal}</strong>
            </div>
            <div className="cm__summary-chip cm__summary-chip--penalty">
              <span className="cm__summary-label">Penalty</span>
              <strong>-{hintsUsedTotal * HINT_PENALTY_POINTS}%</strong>
            </div>
          </div>
          <ol className="cm__round-list">
            {results.map((r, i) => (
              <li key={i} className="cm__round-item">
                <span className="cm__round-num">Round {i + 1}</span>
                <span className="cm__round-swatch" style={{ background: rgbToHex(r.targetColor) }} title={rounds[i].name} />
                <span className="cm__round-swatch" style={{ background: rgbToHex(r.playerColor) }} title="Your color" />
                {r.hintCount > 0 && <span className="cm__round-hints">💡×{r.hintCount}</span>}
                <span className={[
                  'cm__round-score',
                  r.score >= 80 ? 'cm__round-score--great' : r.score >= 50 ? 'cm__round-score--ok' : 'cm__round-score--poor',
                ].join(' ')}>
                  {r.score}%
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="cm" data-testid="color-match-comp">
      <div className="cm__card">
        <header className="cm__header">
          <span className="cm__round-label">Round <strong>{roundIndex + 1}</strong>/{MAX_ROUNDS}</span>
          <span className={['cm__timer', isUrgent ? 'cm__timer--urgent' : ''].filter(Boolean).join(' ')} aria-live={isUrgent ? 'assertive' : 'off'} aria-atomic="true">
            {timeLeft}s
          </span>
        </header>

        <div className="cm__timer-bar" role="progressbar" aria-valuenow={timeLeft} aria-valuemin={0} aria-valuemax={ROUND_TIME_S}>
          <div className={['cm__timer-fill', isUrgent ? 'cm__timer-fill--urgent' : ''].filter(Boolean).join(' ')} style={{ width: `${progressPct}%` }} />
        </div>

        <div className="cm__color-name" aria-label="Target color name">{currentRound.name}</div>

        <div className="cm__meta-row">
          <div className="cm__hint-stock">💡 {hintsRemaining} hint{hintsRemaining === 1 ? '' : 's'} left</div>
          <div className="cm__penalty-chip">-{hintsUsedTotal * HINT_PENALTY_POINTS}% final score</div>
        </div>

        <div className="cm__swatches">
          <div className="cm__swatch-col">
            <div className="cm__swatch cm__swatch--target" style={{ background: targetHex }} aria-label={`Target: ${currentRound.name}`} />
            <span className="cm__swatch-label">Target</span>
          </div>
          <div className="cm__accuracy-meter" aria-live="polite" aria-atomic="true">
            <span className={[
              'cm__accuracy-val',
              liveAccuracy >= 80 ? 'cm__accuracy-val--great' : liveAccuracy >= 50 ? 'cm__accuracy-val--ok' : 'cm__accuracy-val--poor',
            ].join(' ')}>
              {phase === 'playing' ? liveAccuracy : (lastScore ?? liveAccuracy)}%
            </span>
            <span className="cm__accuracy-sub">match</span>
          </div>
          <div className="cm__swatch-col">
            <div className="cm__swatch cm__swatch--player" style={{ background: playerHex }} aria-label="Your color" />
            <span className="cm__swatch-label">Yours</span>
          </div>
        </div>

        {hintMessage && phase === 'playing' && (
          <div className="cm__hint-panel" aria-live="polite">
            <div className="cm__hint-panel-title">Hint {hintsUsedThisRound}</div>
            <div className="cm__hint-panel-body">{hintMessage}</div>
          </div>
        )}

        {phase === 'feedback' && (
          <div className="cm__feedback" aria-live="assertive">
            {timedOut ? (
              <span className="cm__feedback-text cm__feedback-text--timeout">⏱ Time's up! +0</span>
            ) : (
              <span className="cm__feedback-text">{feedbackLabel} — {lastScore}%</span>
            )}
          </div>
        )}

        <div className="cm__sliders" aria-label="RGB color controls">
          {(['r', 'g', 'b'] as const).map((ch) => {
            const labels: Record<typeof ch, string> = { r: 'Red', g: 'Green', b: 'Blue' };
            return (
              <div key={ch} className={`cm__slider-row cm__slider-row--${ch}`}>
                <label className="cm__slider-label" htmlFor={`cm-slider-${ch}`}>
                  {labels[ch]}
                  <span className="cm__slider-val">{playerColor[ch]}</span>
                </label>
                <input
                  id={`cm-slider-${ch}`}
                  type="range"
                  min={0}
                  max={255}
                  value={playerColor[ch]}
                  onChange={(e) => handleSliderChange(ch, Number(e.target.value))}
                  disabled={phase !== 'playing'}
                  className="cm__slider"
                  aria-label={`${labels[ch]} channel: ${playerColor[ch]}`}
                />
              </div>
            );
          })}
        </div>

        {phase === 'playing' && (
          <div className="cm__action-row">
            <button className="cm__btn cm__btn--hint" onClick={handleHintPress} type="button" disabled={hintsRemaining <= 0}>
              Buy Hint (-5%)
            </button>
            <button className="cm__btn cm__btn--submit" onClick={handleSubmit} type="button">
              Submit Match
            </button>
          </div>
        )}
        {phase === 'feedback' && (
          <button className="cm__btn cm__btn--next" onClick={handleNext} type="button" autoFocus>
            {roundIndex + 1 < MAX_ROUNDS ? 'Next Round →' : 'See Results →'}
          </button>
        )}
      </div>

      {hintWarning && (
        <div className="cm__modal-backdrop" role="presentation">
          <div className="cm__modal" role="dialog" aria-modal="true" aria-label="Hint purchase warning">
            <h3 className="cm__modal-title">Buy Hint {hintWarning.nextHintNumber}?</h3>
            <p className="cm__modal-copy">
              This hint will reduce your final score by <strong>{HINT_PENALTY_POINTS}%</strong>.
            </p>
            <p className="cm__modal-copy cm__modal-copy--muted">
              You can use both hints in one round or save one for later.
            </p>
            <div className="cm__modal-actions">
              <button className="cm__btn cm__btn--ghost" type="button" onClick={cancelHintPurchase}>Cancel</button>
              <button className="cm__btn cm__btn--hint" type="button" onClick={confirmHintPurchase}>Buy Hint</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
