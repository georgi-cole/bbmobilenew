/**
 * ColorMatchComp — React minigame component for Color Match.
 *
 * Gameplay:
 *  - A target color swatch is displayed with a creative color name.
 *  - The player adjusts R, G, B sliders to match the target color.
 *  - Live similarity % updates as sliders change, creating real-time feedback.
 *  - Each round has a time limit; missing it scores 0 for that round.
 *  - 5 rounds total. Score = average accuracy across rounds (0–100 scale).
 *
 * Challenge improvements over legacy:
 *  - Player sliders start at a random offset so 128/128/128 is no longer free.
 *  - Per-round countdown adds time pressure.
 *  - Live accuracy display rewards fine-tuning and punishes lazy guessing.
 *  - More rounds (5 vs 3) for a more comprehensive test.
 *
 * Supports generic MinigameHost path: calls onFinish(score) when done.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { mulberry32 } from '../../store/rng';
import './ColorMatchComp.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RGB {
  r: number;
  g: number;
  b: number;
}

type GamePhase = 'playing' | 'feedback' | 'results';

interface RoundResult {
  score: number;
  targetColor: RGB;
  playerColor: RGB;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUNDS = 5;
/** Seconds per round */
const ROUND_TIME_S = 25;
/** Max Euclidean distance in RGB space = sqrt(255^2 * 3) ≈ 441.67 */
const MAX_RGB_DIST = Math.sqrt(255 * 255 * 3);

/** Named colors with non-standard, creative names. */
const NAMED_COLORS: Array<{ name: string; rgb: RGB }> = [
  { name: 'Scarlet',        rgb: { r: 196, g: 30,  b: 58  } },
  { name: 'Baby Blue',      rgb: { r: 137, g: 207, b: 240 } },
  { name: 'Milky Grass',    rgb: { r: 134, g: 187, b: 95  } },
  { name: 'Blood Orange',   rgb: { r: 212, g: 81,  b: 19  } },
  { name: 'Sky Cyan',       rgb: { r: 55,  g: 195, b: 220 } },
  { name: 'Lavender Mist',  rgb: { r: 170, g: 140, b: 210 } },
  { name: 'Honey Gold',     rgb: { r: 230, g: 170, b: 35  } },
  { name: 'Coral Reef',     rgb: { r: 248, g: 131, b: 121 } },
  { name: 'Midnight Plum',  rgb: { r: 88,  g: 38,  b: 110 } },
  { name: 'Sea Foam',       rgb: { r: 78,  g: 200, b: 175 } },
  { name: 'Dusty Rose',     rgb: { r: 210, g: 145, b: 155 } },
  { name: 'Tangerine',      rgb: { r: 242, g: 133, b: 0   } },
  { name: 'Steel Teal',     rgb: { r: 42,  g: 135, b: 145 } },
  { name: 'Amber Dusk',     rgb: { r: 200, g: 120, b: 40  } },
  { name: 'Sage Whisper',   rgb: { r: 150, g: 180, b: 140 } },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function rgbDist(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function accuracy(target: RGB, player: RGB): number {
  return Math.max(0, 100 - (rgbDist(target, player) / MAX_RGB_DIST) * 100);
}

/**
 * Pick a random starting offset for the player sliders.
 * Offset by ±40–120 per channel so the answer is never trivially close,
 * but the sliders don't start out-of-range.
 */
function randomStartColor(target: RGB, rng: () => number): RGB {
  function offsetChannel(v: number): number {
    const delta = 40 + Math.floor(rng() * 80); // 40–120
    const sign = rng() < 0.5 ? 1 : -1;
    return Math.min(255, Math.max(0, v + sign * delta));
  }
  return { r: offsetChannel(target.r), g: offsetChannel(target.g), b: offsetChannel(target.b) };
}

/** Seeded shuffled selection of `count` unique indices from an array. */
function seededPick<T>(arr: T[], count: number, rng: () => number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onFinish?: (value: number) => void;
  seed?: number;
  autoStart?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ColorMatchComp({ onFinish, seed = 0, autoStart = false }: Props) {
  // Build seeded round data once on mount
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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundStartedRef = useRef(false);

  const currentRound = rounds[roundIndex];
  const liveAccuracy = Math.round(accuracy(currentRound.target, playerColor));

  // ── Timer ─────────────────────────────────────────────────────────────────

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const submitRound = useCallback(
    (color: RGB, didTimeOut: boolean) => {
      stopTimer();
      const score = didTimeOut ? 0 : Math.round(accuracy(currentRound.target, color));
      setLastScore(score);
      setTimedOut(didTimeOut);
      setResults((prev) => [
        ...prev,
        { score, targetColor: currentRound.target, playerColor: color },
      ]);
      setPhase('feedback');
    },
    [currentRound.target, stopTimer],
  );

  // Start timer when playing
  useEffect(() => {
    if (phase !== 'playing') return;
    roundStartedRef.current = true;
    setTimeLeft(ROUND_TIME_S);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // time's up — capture current color via state updater trick
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
    // submitRound/stopTimer are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roundIndex]);

  // Seed player color when round changes
  useEffect(() => {
    setPlayerColor(rounds[roundIndex].startColor);
  }, [roundIndex, rounds]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSliderChange = useCallback(
    (channel: keyof RGB, value: number) => {
      if (phase !== 'playing') return;
      setPlayerColor((prev) => ({ ...prev, [channel]: value }));
    },
    [phase],
  );

  const handleSubmit = useCallback(() => {
    if (phase !== 'playing') return;
    setPlayerColor((pc) => {
      submitRound(pc, false);
      return pc;
    });
  }, [phase, submitRound]);

  const handleNext = useCallback(() => {
    const nextIndex = roundIndex + 1;
    if (nextIndex >= MAX_ROUNDS) {
      setPhase('results');
    } else {
      setRoundIndex(nextIndex);
      setPhase('playing');
    }
  }, [roundIndex]);

  // ── Final score & finish ──────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'results') return;
    const total = results.reduce((sum, r) => sum + r.score, 0);
    const avg = Math.round(total / results.length);
    setTimeout(() => {
      if (onFinish) onFinish(avg);
    }, autoStart ? 0 : 2000);
    // only fire once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Derived values ────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'results') {
    const total = results.reduce((sum, r) => sum + r.score, 0);
    const avg = Math.round(total / results.length);
    return (
      <div className="cm" data-testid="color-match-comp">
        <div className="cm__card cm__card--results">
          <div className="cm__title">🎨 Color Match</div>
          <div className="cm__subtitle">Final Results</div>
          <div className="cm__final-score">{avg}<span className="cm__final-unit">%</span></div>
          <p className="cm__final-label">Average Accuracy</p>
          <ol className="cm__round-list">
            {results.map((r, i) => (
              <li key={i} className="cm__round-item">
                <span className="cm__round-num">Round {i + 1}</span>
                <span
                  className="cm__round-swatch"
                  style={{ background: rgbToHex(r.targetColor) }}
                  title={rounds[i].name}
                />
                <span
                  className="cm__round-swatch"
                  style={{ background: rgbToHex(r.playerColor) }}
                  title="Your color"
                />
                <span
                  className={[
                    'cm__round-score',
                    r.score >= 80 ? 'cm__round-score--great' : r.score >= 50 ? 'cm__round-score--ok' : 'cm__round-score--poor',
                  ].join(' ')}
                >
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
        {/* Header */}
        <header className="cm__header">
          <span className="cm__round-label">
            Round <strong>{roundIndex + 1}</strong>/{MAX_ROUNDS}
          </span>
          <span
            className={['cm__timer', isUrgent ? 'cm__timer--urgent' : ''].filter(Boolean).join(' ')}
            aria-live={isUrgent ? 'assertive' : 'off'}
            aria-atomic="true"
          >
            {timeLeft}s
          </span>
        </header>

        {/* Timer bar */}
        <div
          className="cm__timer-bar"
          role="progressbar"
          aria-valuenow={timeLeft}
          aria-valuemin={0}
          aria-valuemax={ROUND_TIME_S}
        >
          <div
            className={['cm__timer-fill', isUrgent ? 'cm__timer-fill--urgent' : ''].filter(Boolean).join(' ')}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Color name */}
        <div className="cm__color-name" aria-label="Target color name">
          {currentRound.name}
        </div>

        {/* Swatches */}
        <div className="cm__swatches">
          <div className="cm__swatch-col">
            <div
              className="cm__swatch cm__swatch--target"
              style={{ background: targetHex }}
              aria-label={`Target: ${currentRound.name}`}
            />
            <span className="cm__swatch-label">Target</span>
          </div>
          <div className="cm__accuracy-meter" aria-live="polite" aria-atomic="true">
            <span
              className={[
                'cm__accuracy-val',
                liveAccuracy >= 80 ? 'cm__accuracy-val--great' : liveAccuracy >= 50 ? 'cm__accuracy-val--ok' : 'cm__accuracy-val--poor',
              ].join(' ')}
            >
              {phase === 'playing' ? liveAccuracy : (lastScore ?? liveAccuracy)}%
            </span>
            <span className="cm__accuracy-sub">match</span>
          </div>
          <div className="cm__swatch-col">
            <div
              className="cm__swatch cm__swatch--player"
              style={{ background: playerHex }}
              aria-label="Your color"
            />
            <span className="cm__swatch-label">Yours</span>
          </div>
        </div>

        {/* Feedback overlay on feedback phase */}
        {phase === 'feedback' && (
          <div className="cm__feedback" aria-live="assertive">
            {timedOut ? (
              <span className="cm__feedback-text cm__feedback-text--timeout">⏱ Time's up! +0</span>
            ) : (
              <span className="cm__feedback-text">{feedbackLabel} — {lastScore}%</span>
            )}
          </div>
        )}

        {/* Sliders */}
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

        {/* Action button */}
        {phase === 'playing' && (
          <button className="cm__btn cm__btn--submit" onClick={handleSubmit} type="button">
            Submit Match
          </button>
        )}
        {phase === 'feedback' && (
          <button className="cm__btn cm__btn--next" onClick={handleNext} type="button" autoFocus>
            {roundIndex + 1 < MAX_ROUNDS ? 'Next Round →' : 'See Results →'}
          </button>
        )}
      </div>
    </div>
  );
}
