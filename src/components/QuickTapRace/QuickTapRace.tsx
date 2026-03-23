/**
 * QuickTapRace — native React minigame component.
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(effectiveScore)`.
 *
 * Features:
 *  - 30-second game duration
 *  - Escalating heat / intensity visual system
 *  - Emoji burst particle effects on every tap
 *  - Special timed multipliers (2× boost and ½× fumble)
 *  - Competitive AI scoring via pre-computed `session.aiScores`
 *  - Canonical last-place derivation from effective scores
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import { useQuickTapRaceAudio } from '../../hooks/useQuickTapRaceAudio';
import './QuickTapRace.css';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Total game duration in seconds. */
const GAME_DURATION = 30;

/** Ready-phase countdown start value. */
const READY_COUNT = 3;

/** Multiplier event definition. */
interface MultiplierEvent {
  id: number;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Emoji icon for the event badge. */
  icon: string;
  /** Multiplier applied to tap value while active (e.g. 2 = double, 0.5 = half). */
  multiplier: number;
  /** Time offset (seconds from game start) when the event appears. */
  startsAt: number;
  /** Duration in seconds the event stays active. */
  duration: number;
  /** Whether this is a beneficial (true) or debilitating (false) modifier. */
  beneficial: boolean;
}

// Multiplier events are deterministic for each game instance: they are defined
// in a fixed order and always appear regardless of the seed.
const MULTIPLIER_EVENTS: Omit<MultiplierEvent, 'id'>[] = [
  {
    label: '2× FRENZY!',
    icon: '⚡',
    multiplier: 2,
    startsAt: 8,
    duration: 5,
    beneficial: true,
  },
  {
    label: '½ FUMBLE',
    icon: '🥴',
    multiplier: 0.5,
    startsAt: 18,
    duration: 4,
    beneficial: false,
  },
  {
    label: '3× TURBO!',
    icon: '🔥',
    multiplier: 3,
    startsAt: 24,
    duration: 4,
    beneficial: true,
  },
];

/** Particle emojis used on tap bursts, indexed by heat level [0-5]. */
const HEAT_EMOJIS: string[][] = [
  ['👆', '✨'],
  ['👆', '✨', '💥'],
  ['🔥', '✨', '💥', '⚡'],
  ['🔥', '💥', '⚡', '🌟'],
  ['🔥', '💥', '🌪️', '🌟', '⚡'],
  ['💥', '🌪️', '🌟', '⚡', '🔥', '☄️'],
];

const MEDALS = ['🥇', '🥈', '🥉'];

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'ready' | 'playing' | 'results';

interface Particle {
  id: number;
  emoji: string;
  x: number;
  y: number;
}

interface ScoreEntry {
  id: string;
  name: string;
  effectiveScore: number;
  rawTaps: number;
  isHuman: boolean;
  modifiersApplied: string[];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** HOH/LOH minigame path: full session data. */
  session?: MinigameSession;
  /** HOH/LOH minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final effective score. */
  onFinish?: (value: number) => void;
  /** MinigameHost path: competition seed (unused currently; reserved for future determinism). */
  seed?: number;
  /** MinigameHost path: when true, skip an extra start button. */
  autoStart?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuickTapRace({
  session,
  players = [],
  onFinish,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);
  const resolvedDuration = session?.options.timeLimit ?? GAME_DURATION;

  // ── State ──────────────────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [countdown, setCountdown] = useState(READY_COUNT);
  const [timeLeft, setTimeLeft] = useState(resolvedDuration);
  const [tapCount, setTapCount] = useState(0);
  const [effectiveScore, setEffectiveScore] = useState(0);
  const [heatLevel, setHeatLevel] = useState(0); // 0–5
  const [particles, setParticles] = useState<Particle[]>([]);
  const [activeMultiplier, setActiveMultiplier] = useState<MultiplierEvent | null>(null);
  const [appliedModifiers, setAppliedModifiers] = useState<string[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>([]);

  // Refs for values accessed inside intervals / callbacks without causing re-renders
  const tapCountRef = useRef(0);
  const effectiveScoreRef = useRef(0);
  const lastTapTime = useRef<number>(0);
  const recentTapTimes = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const particleIdRef = useRef(0);
  const activeMultiplierRef = useRef<MultiplierEvent | null>(null);
  const appliedModifiersRef = useRef<string[]>([]);
  const particleTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const { playTap, playBooster, playHalfTap } = useQuickTapRaceAudio(gamePhase === 'playing');

  useEffect(() => {
    return () => {
      particleTimeoutsRef.current.forEach(clearTimeout);
      particleTimeoutsRef.current = [];
    };
  }, []);

  // ── Multiplier events ──────────────────────────────────────────────────────

  // Attach multiplier events once the game starts
  useEffect(() => {
    if (gamePhase !== 'playing') return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    MULTIPLIER_EVENTS.forEach((ev, i) => {
      const event: MultiplierEvent = { ...ev, id: i };

      // Activate
      timeouts.push(
        setTimeout(() => {
          setActiveMultiplier(event);
          activeMultiplierRef.current = event;
          // Play booster stinger for beneficial events, half-tap stinger for debilitating ones
          if (event.beneficial) {
            playBooster();
          } else {
            playHalfTap();
          }
        }, event.startsAt * 1000),
      );

      // Deactivate
      timeouts.push(
        setTimeout(() => {
          setActiveMultiplier(null);
          activeMultiplierRef.current = null;
          setAppliedModifiers((prev) => {
            const updated = [...prev, event.label];
            appliedModifiersRef.current = updated;
            return updated;
          });
        }, (event.startsAt + event.duration) * 1000),
      );
    });

    return () => timeouts.forEach(clearTimeout);
  }, [gamePhase, playBooster, playHalfTap]);

  // ── Ready countdown ────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'ready') return;
    if (countdown <= 0) {
      setGamePhase('playing');
      return;
    }
    // For MinigameHost autoStart, skip the countdown delay on first render
    if (autoStart && countdown === READY_COUNT) {
      setCountdown(0);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [gamePhase, countdown, autoStart]);

  // ── Playing timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = Math.round((prev - 0.1) * 10) / 10;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          finishGame();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // finishGame is stable via useCallback; session/humanId/players are intentionally
    // excluded: they are stable for a single competition and must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase]);

  // ── Heat level derivation ──────────────────────────────────────────────────

  // Decay heat when not tapping
  useEffect(() => {
    if (gamePhase !== 'playing') return;
    const decay = setInterval(() => {
      const now = Date.now();
      // Remove taps older than 2 seconds from the recent-tap window
      recentTapTimes.current = recentTapTimes.current.filter((t) => now - t < 2000);
      const rate = recentTapTimes.current.length; // taps in last 2 s
      const newHeat = Math.min(5, Math.floor(rate / 2));
      setHeatLevel(newHeat);
    }, 300);
    return () => clearInterval(decay);
  }, [gamePhase]);

  // ── Tap handler ────────────────────────────────────────────────────────────

  const handleTap = useCallback(() => {
    if (gamePhase !== 'playing') return;

    const now = Date.now();
    lastTapTime.current = now;
    recentTapTimes.current.push(now);

    // Play tap sound
    playTap();

    // Resolve multiplier
    const multiplier = activeMultiplierRef.current?.multiplier ?? 1;
    const taps = tapCountRef.current + 1;
    tapCountRef.current = taps;
    const newEffective = effectiveScoreRef.current + multiplier;
    effectiveScoreRef.current = newEffective;

    setTapCount(taps);
    setEffectiveScore(Math.round(newEffective));

    // Spawn particles
    const heatNow = Math.min(5, Math.floor(recentTapTimes.current.length / 2));
    const emojiPool = HEAT_EMOJIS[heatNow];
    const count = 1 + heatNow;
    const newParticles: Particle[] = Array.from({ length: count }, () => {
      particleIdRef.current += 1;
      return {
        id: particleIdRef.current,
        emoji: emojiPool[Math.floor(Math.random() * emojiPool.length)],
        x: 35 + Math.random() * 30,
        y: 20 + Math.random() * 40,
      };
    });

    setParticles((prev) => [...prev.slice(-20), ...newParticles]);
    // Expire particles after 700 ms
    const ids = newParticles.map((p) => p.id);
    const timeoutId = setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !ids.includes(p.id)));
    }, 700);
    particleTimeoutsRef.current.push(timeoutId);
  }, [gamePhase, playTap]);

  // ── Game finish ────────────────────────────────────────────────────────────

  const finishGame = useCallback(() => {
    const humanEffective = Math.round(effectiveScoreRef.current);
    const humanRaw = tapCountRef.current;
    const modifiers = appliedModifiersRef.current;

    if (session) {
      // HOH/LOH path — build full leaderboard and dispatch to Redux
      const allScores: Record<string, number> = {
        ...session.aiScores,
        ...(humanId ? { [humanId]: humanEffective } : {}),
      };

      const entries: ScoreEntry[] = session.participants.map((id) => {
        const p = players.find((pl) => pl.id === id);
        const isHuman = id === humanId;
        return {
          id,
          name: p?.name ?? id,
          effectiveScore: allScores[id] ?? 0,
          rawTaps: isHuman ? humanRaw : allScores[id] ?? 0,
          isHuman,
          modifiersApplied: isHuman ? modifiers : [],
        };
      });
      const ranked = [...entries].sort((a, b) => b.effectiveScore - a.effectiveScore);
      setScores(ranked);
      setGamePhase('results');
    } else {
      // MinigameHost path — just report the score
      if (onFinish) onFinish(humanEffective);
    }
  }, [session, humanId, players, onFinish]);

  // ── Done handler ───────────────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    if (!session) return;
    const humanEffective = Math.round(effectiveScoreRef.current);
    const lastPlaceId = scores.length > 0 ? scores[scores.length - 1].id : undefined;

    const payload: CompleteMinigamePayload = { humanScore: humanEffective, lastPlaceId };
    dispatch(completeMinigame(payload));
  }, [dispatch, scores, session]);

  // ── Derived UI values ──────────────────────────────────────────────────────

  const progressPct = (timeLeft / resolvedDuration) * 100;
  const isUrgent = timeLeft <= 5;
  const currentMultiplier = activeMultiplier?.multiplier ?? 1;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        'qtr',
        `qtr--heat-${heatLevel}`,
        gamePhase === 'playing' ? 'qtr--playing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Quick Tap Race Competition"
    >
      <div className="qtr__card">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="qtr__header">
          <h2 className="qtr__title">⚡ Quick Tap Race</h2>
          <p className="qtr__subtitle">Tap as fast as you can for 30 seconds!</p>
        </header>

        {/* ── Ready phase ───────────────────────────────────────────────── */}
        {gamePhase === 'ready' && (
          <div className="qtr__ready">
            <span className="qtr__countdown" aria-live="assertive">
              {countdown === 0 ? 'GO!' : countdown}
            </span>
            <p className="qtr__hint">Get ready to tap!</p>
          </div>
        )}

        {/* ── Playing phase ─────────────────────────────────────────────── */}
        {gamePhase === 'playing' && (
          <div className="qtr__playing">
            {/* Stats row */}
            <div className="qtr__stats">
              <div className="qtr__score-block">
                <span className="qtr__score-value" aria-live="polite" aria-atomic="true">
                  {Math.round(effectiveScore)}
                </span>
                {currentMultiplier !== 1 && (
                  <span className="qtr__raw-taps" aria-hidden="true">
                    {tapCount} raw
                  </span>
                )}
                <span className="qtr__score-label">taps</span>
              </div>
              <span
                className={['qtr__time', isUrgent ? 'qtr__time--urgent' : ''].filter(Boolean).join(' ')}
                aria-live={isUrgent ? 'assertive' : 'off'}
                aria-atomic="true"
              >
                {timeLeft.toFixed(1)}s
              </span>
            </div>

            {/* Progress bar */}
            <div
              className="qtr__progress-bar"
              role="progressbar"
              aria-valuenow={timeLeft}
              aria-valuemin={0}
              aria-valuemax={resolvedDuration}
            >
              <div
                className="qtr__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Active multiplier badge */}
            {activeMultiplier && (
              <div
                className={[
                  'qtr__multiplier-badge',
                  activeMultiplier.beneficial ? 'qtr__multiplier-badge--good' : 'qtr__multiplier-badge--bad',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="status"
                aria-live="polite"
              >
                <span className="qtr__multiplier-icon">{activeMultiplier.icon}</span>
                <span className="qtr__multiplier-label">{activeMultiplier.label}</span>
              </div>
            )}

            {/* Heat meter */}
            <div className="qtr__heat-row" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={[
                    'qtr__heat-dot',
                    i <= heatLevel ? 'qtr__heat-dot--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              ))}
            </div>

            {/* TAP button + particles */}
            <div className="qtr__tap-area">
              {/* Particle layer */}
              <div className="qtr__particles" aria-hidden="true">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    className="qtr__particle"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  >
                    {p.emoji}
                  </span>
                ))}
              </div>

              <button
                className="qtr__tap-btn"
                onClick={handleTap}
                type="button"
                aria-label="Tap!"
              >
                {heatLevel >= 4 ? '💥' : heatLevel >= 2 ? '🔥' : 'TAP!'}
              </button>
            </div>
          </div>
        )}

        {/* ── Results phase ─────────────────────────────────────────────── */}
        {gamePhase === 'results' && scores.length > 0 && (
          <div className="qtr__results">
            <p className="qtr__winner-line">
              🏆 {scores[0].name} wins with {scores[0].effectiveScore} taps!
            </p>
            <ol className="qtr__leaderboard">
              {scores.map((entry, i) => (
                <li
                  key={entry.id}
                  className={[
                    'qtr__entry',
                    entry.isHuman ? 'qtr__entry--you' : '',
                    i === 0 ? 'qtr__entry--winner' : '',
                    i === scores.length - 1 ? 'qtr__entry--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="qtr__rank" aria-hidden="true">
                    {MEDALS[i] ?? `${i + 1}.`}
                  </span>
                  <span className="qtr__entry-name">
                    {entry.name}
                    {entry.isHuman && <span className="qtr__you-tag"> (You)</span>}
                  </span>
                  <span className="qtr__entry-score">{entry.effectiveScore} taps</span>
                  {entry.modifiersApplied.length > 0 && (
                    <span className="qtr__entry-mods" title={entry.modifiersApplied.join(', ')}>
                      ✨
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {appliedModifiers.length > 0 && (
              <p className="qtr__mod-summary" aria-label="Active modifiers this game">
                Modifiers: {appliedModifiers.join(' → ')}
              </p>
            )}
            <button
              className="qtr__done-btn"
              onClick={handleDone}
              type="button"
            >
              Continue ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
