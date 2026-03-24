/**
 * BullseyeBlitz — native React minigame component (migrated from legacy targetPractice).
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload`
 *     (humanScore + winnerId + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(finalScore)`.
 *
 * Gameplay — "Bullseye Blitz":
 *  - 20-second game with targets that appear and shrink at random positions
 *  - Three target types with distinct risk/reward:
 *      Standard (🎯)  +10 pts   —  medium lifetime, appears most often
 *      Bonus    (⭐)  +25 pts   —  shorter lifetime, less frequent
 *      Hazard   (💣) −15 pts   —  long lifetime, penalises greedy tapping
 *  - Canonical scoring: sum of all scored hits (including penalties)
 *  - Canonical last-place: lowest scorer, tie-broken by participant index
 */

import type { CSSProperties } from 'react';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import {
  TARGET_CONFIGS,
  buildRankedLeaderboard,
  pickTargetKind,
} from './bullseyeBlitzUtils';
import type {
  ScoreEntry,
  TargetKind,
} from './bullseyeBlitzUtils';
import './BullseyeBlitz.css';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Total gameplay duration in seconds. */
const GAME_DURATION = 20;

/** Ready countdown start value. */
const READY_COUNT = 3;

/** How often (ms) to attempt spawning a new target. */
const SPAWN_INTERVAL_MS = 600;

/** Maximum number of targets visible at once. */
const MAX_TARGETS = 7;

const MEDALS = ['🥇', '🥈', '🥉'];

// ── Internal target state ─────────────────────────────────────────────────────

interface ActiveTarget {
  id: number;
  kind: TargetKind;
  /** Left position as % of container width. */
  x: number;
  /** Top position as % of container height. */
  y: number;
  /** Unix ms when spawned. */
  spawnedAt: number;
  /** How long this target lives. */
  lifetimeMs: number;
}

type GamePhase = 'ready' | 'playing' | 'results';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** HOH/LOH minigame path: full session data. */
  session?: MinigameSession;
  /** HOH/LOH minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final score. */
  onFinish?: (value: number) => void;
  /** MinigameHost path: competition seed (reserved for future seeded RNG). */
  seed?: number;
  /** MinigameHost path: when true, skip the ready countdown delay. */
  autoStart?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BullseyeBlitz({
  session,
  players = [],
  onFinish,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  const configuredDuration = session?.options?.timeLimit ?? GAME_DURATION;

  // ── State ──────────────────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [countdown, setCountdown] = useState(READY_COUNT);
  const [timeLeft, setTimeLeft] = useState(configuredDuration);
  const [score, setScore] = useState(0);
  const [targets, setTargets] = useState<ActiveTarget[]>([]);
  const [hits, setHits] = useState({ standard: 0, bonus: 0, hazard: 0 });
  const [popEffects, setPopEffects] = useState<{ id: number; emoji: string; x: number; y: number; kind: TargetKind }[]>([]);
  const [rankedScores, setRankedScores] = useState<ScoreEntry[]>([]);

  // Stable refs for values accessed in intervals/callbacks
  const scoreRef = useRef(0);
  const hitsRef = useRef({ standard: 0, bonus: 0, hazard: 0 });
  const targetIdRef = useRef(0);
  const popIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearPopTimeouts = useCallback(() => {
    popTimeoutsRef.current.forEach(clearTimeout);
    popTimeoutsRef.current = [];
  }, []);

  // Cleanup pop timeouts on unmount
  useEffect(() => {
    return clearPopTimeouts;
  }, [clearPopTimeouts]);

  // ── Ready countdown ────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'ready') return;
    if (countdown <= 0) {
      setGamePhase('playing');
      return;
    }
    if (autoStart && countdown === READY_COUNT) {
      setCountdown(0);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [gamePhase, countdown, autoStart]);

  // ── Playing — game timer ───────────────────────────────────────────────────

  const finishGame = useCallback(() => {
    if (spawnRef.current) clearInterval(spawnRef.current);
    if (expireRef.current) clearInterval(expireRef.current);
    setTargets([]);

    const humanFinalScore = scoreRef.current;
    const humanFinalHits = { ...hitsRef.current };

    if (session) {
      const allScores: Record<string, number> = {
        ...session.aiScores,
        ...(humanId ? { [humanId]: humanFinalScore } : {}),
      };
      const ranked = buildRankedLeaderboard(
        session.participants,
        allScores,
        humanId,
        players,
        humanFinalHits,
      );
      setRankedScores(ranked);
      setGamePhase('results');
    } else {
      if (onFinish) onFinish(humanFinalScore);
    }
    // finishGame is called from the timer interval; session/humanId/players/onFinish
    // are stable for a single competition run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // finishGame is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase]);

  // ── Playing — target spawner ───────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    spawnRef.current = setInterval(() => {
      setTargets((prev) => {
        if (prev.length >= MAX_TARGETS) return prev;
        targetIdRef.current += 1;
        const kind = pickTargetKind(Math.random());
        const cfg = TARGET_CONFIGS[kind];
        const newTarget: ActiveTarget = {
          id: targetIdRef.current,
          kind,
          x: 5 + Math.random() * 82, // keep off the edge
          y: 5 + Math.random() * 82,
          spawnedAt: Date.now(),
          lifetimeMs: cfg.lifetimeMs,
        };
        return [...prev, newTarget];
      });
    }, SPAWN_INTERVAL_MS);

    return () => {
      if (spawnRef.current) clearInterval(spawnRef.current);
    };
  }, [gamePhase]);

  // ── Playing — target expiry ────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    expireRef.current = setInterval(() => {
      const now = Date.now();
      setTargets((prev) => prev.filter((t) => now - t.spawnedAt < t.lifetimeMs));
    }, 150);

    return () => {
      if (expireRef.current) clearInterval(expireRef.current);
    };
  }, [gamePhase]);

  // ── Tap handler ────────────────────────────────────────────────────────────

  const handleTargetTap = useCallback(
    (target: ActiveTarget) => {
      if (gamePhase !== 'playing') return;

      const cfg = TARGET_CONFIGS[target.kind];

      // Update score ref
      scoreRef.current += cfg.points;
      setScore(scoreRef.current);

      // Update hits ref
      hitsRef.current = {
        ...hitsRef.current,
        [target.kind]: hitsRef.current[target.kind] + 1,
      };
      setHits({ ...hitsRef.current });

      // Pop effect
      popIdRef.current += 1;
      const popId = popIdRef.current;
      setPopEffects((prev) => [
        ...prev.slice(-12),
        { id: popId, emoji: cfg.emoji, x: target.x, y: target.y, kind: target.kind },
      ]);
      const tId = setTimeout(() => {
        setPopEffects((prev) => prev.filter((p) => p.id !== popId));
      }, 600);
      popTimeoutsRef.current.push(tId);

      // Remove tapped target
      setTargets((prev) => prev.filter((t) => t.id !== target.id));
    },
    [gamePhase],
  );

  // ── Done handler (results → Redux) ─────────────────────────────────────────

  const handleDone = useCallback(() => {
    if (!session) return;
    const humanFinalScore = scoreRef.current;
    const winnerId = rankedScores.length > 0 ? rankedScores[0].id : undefined;
    const lastPlaceId =
      rankedScores.length > 0
        ? rankedScores[rankedScores.length - 1].id
        : undefined;

    const payload: CompleteMinigamePayload = {
      humanScore: humanFinalScore,
      winnerId,
      lastPlaceId,
    };
    dispatch(completeMinigame(payload));
  }, [dispatch, rankedScores, session]);

  // ── Derived UI ─────────────────────────────────────────────────────────────

  const progressPct = (timeLeft / configuredDuration) * 100;
  const isUrgent = timeLeft <= 5;
  const now = Date.now();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="bbl"
      role="dialog"
      aria-modal="true"
      aria-label="Bullseye Blitz Competition"
      data-testid="bullseye-blitz-comp"
    >
      <div className="bbl__card">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="bbl__header">
          <h2 className="bbl__title">🎯 Bullseye Blitz</h2>
          <p className="bbl__subtitle">Pop targets, dodge the bombs — 20 seconds!</p>
        </header>

        {/* ── Legend (always visible) ──────────────────────────────────── */}
        <div className="bbl__legend" aria-label="Target legend">
          <span className="bbl__legend-item bbl__legend-item--standard">🎯 +10</span>
          <span className="bbl__legend-item bbl__legend-item--bonus">⭐ +25</span>
          <span className="bbl__legend-item bbl__legend-item--hazard">💣 −15</span>
        </div>

        {/* ── Ready phase ──────────────────────────────────────────────── */}
        {gamePhase === 'ready' && (
          <div className="bbl__ready">
            <span className="bbl__countdown" aria-live="assertive">
              {countdown === 0 ? 'GO!' : countdown}
            </span>
            <p className="bbl__hint">Tap 🎯 &amp; ⭐ — avoid 💣!</p>
          </div>
        )}

        {/* ── Playing phase ─────────────────────────────────────────────── */}
        {gamePhase === 'playing' && (
          <div className="bbl__playing">
            {/* Stats row */}
            <div className="bbl__stats">
              <div className="bbl__score-block">
                <span
                  className="bbl__score-value"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {score}
                </span>
                <span className="bbl__score-label">pts</span>
              </div>
              <span
                className={[
                  'bbl__time',
                  isUrgent ? 'bbl__time--urgent' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-live={isUrgent ? 'assertive' : 'off'}
                aria-atomic="true"
              >
                {timeLeft.toFixed(1)}s
              </span>
            </div>

            {/* Progress bar */}
            <div
              className="bbl__progress-bar"
              role="progressbar"
              aria-valuenow={timeLeft}
              aria-valuemin={0}
              aria-valuemax={configuredDuration}
            >
              <div
                className="bbl__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Game arena */}
            <div className="bbl__arena" aria-label="Target arena">
              {/* Pop effects layer */}
              <div className="bbl__pops" aria-hidden="true">
                {popEffects.map((p) => (
                  <span
                    key={p.id}
                    className={['bbl__pop', `bbl__pop--${p.kind}`].join(' ')}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    aria-hidden="true"
                  >
                    {p.emoji}
                  </span>
                ))}
              </div>

              {/* Active targets */}
              {targets.map((t) => {
                const cfg = TARGET_CONFIGS[t.kind];
                const age = now - t.spawnedAt;
                const lifeFraction = Math.min(1, age / t.lifetimeMs);
                // Scale shrinks from 1 → 0.4 as target ages
                const scale = Math.max(0.4, 1 - lifeFraction * 0.6);
                // Opacity fades from 1 → 0.3 in last quarter of lifetime
                const opacity =
                  lifeFraction > 0.75
                    ? Math.max(0.3, 1 - (lifeFraction - 0.75) * 2.8)
                    : 1;

                return (
                  <button
                    key={t.id}
                    className={['bbl__target', cfg.cls].join(' ')}
                    style={{
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      ...(t.kind === 'hazard'
                        ? { '--bbl-scale': scale.toFixed(3) } as CSSProperties
                        : {
                          transform: `translate(-50%, -50%) scale(${scale.toFixed(3)})`,
                        }),
                      opacity,
                    }}
                    onClick={() => handleTargetTap(t)}
                    type="button"
                    aria-label={cfg.label}
                  >
                    {cfg.emoji}
                  </button>
                );
              })}
            </div>

            {/* Mini hit counters */}
            <div className="bbl__hit-row" aria-label="Hit counters">
              <span className="bbl__hit-item bbl__hit-item--standard">
                🎯 ×{hits.standard}
              </span>
              <span className="bbl__hit-item bbl__hit-item--bonus">
                ⭐ ×{hits.bonus}
              </span>
              <span className="bbl__hit-item bbl__hit-item--hazard">
                💣 ×{hits.hazard}
              </span>
            </div>
          </div>
        )}

        {/* ── Results phase ─────────────────────────────────────────────── */}
        {gamePhase === 'results' && rankedScores.length > 0 && (
          <div className="bbl__results">
            <p className="bbl__winner-line">
              🏆 {rankedScores[0].name} wins with {rankedScores[0].score} pts!
            </p>
            <ol className="bbl__leaderboard">
              {rankedScores.map((entry, i) => (
                <li
                  key={entry.id}
                  className={[
                    'bbl__entry',
                    entry.isHuman ? 'bbl__entry--you' : '',
                    i === 0 ? 'bbl__entry--winner' : '',
                    i === rankedScores.length - 1 ? 'bbl__entry--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="bbl__rank">
                    {i < 3 ? MEDALS[i] : `${i + 1}.`}
                  </span>
                  <span className="bbl__entry-name">
                    {entry.name}
                    {entry.isHuman && (
                      <span className="bbl__you-tag"> (You)</span>
                    )}
                  </span>
                  <span className="bbl__entry-score">{entry.score} pts</span>
                  {i === rankedScores.length - 1 && (
                    <span className="bbl__last-tag" aria-label="Last place">
                      💔
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {/* Human hit breakdown */}
            {rankedScores.some((e) => e.isHuman) && (
              <p className="bbl__hit-summary">
                Your hits: 🎯 ×{rankedScores.find((e) => e.isHuman)?.hits.standard ?? 0}{' '}
                ⭐ ×{rankedScores.find((e) => e.isHuman)?.hits.bonus ?? 0}{' '}
                💣 ×{rankedScores.find((e) => e.isHuman)?.hits.hazard ?? 0}
              </p>
            )}
            <button
              className="bbl__done-btn"
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
