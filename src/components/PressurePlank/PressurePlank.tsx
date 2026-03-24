/**
 * PressurePlank — native React minigame component.
 *
 * Modernized survival/endurance game. Players must keep a balance needle
 * inside a narrowing safe zone by tapping LEFT / RIGHT buttons, countering
 * natural drift and periodic surge events.
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(score)`.
 *
 * Scoring semantics:
 *  - Score = survival time in seconds, scaled to 0–100 range (cap at 120 s → 100).
 *  - Higher score = better (matches AI registry: scoreDirection = 'higher-is-better').
 *  - Last-place finisher = lowest score = shortest survival time.
 *  - The component derives lastPlaceId authoritatively and passes it to the store.
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
import './PressurePlank.css';
import {
  computePlankDriftForce,
  computeSafeZoneHalfWidth,
  computeSafeZoneWidthPercent,
  isWithinSafeZone,
  OUT_OF_ZONE_GRACE_MS,
  SAFE_ZONE_INITIAL,
  updateOutOfZoneTimer,
} from './pressurePlankUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max survival time for a perfect score of 100. */
const SCORE_CAP_SECONDS = 120;

/** Countdown seconds before game starts. */
const READY_COUNT = 3;

/** Balance range: -MAX_BALANCE to +MAX_BALANCE. */
const MAX_BALANCE = 100;

/** Immediate fall threshold — game ends when |balance| exceeds this. */
const FALL_THRESHOLD = 92;

/** Danger zone threshold — warning visual when |balance| exceeds this. */
const DANGER_THRESHOLD = 65;

/** Warning zone threshold — caution visual when |balance| exceeds this. */
const WARNING_THRESHOLD = 40;

/** Spring constant — how strongly balance is pulled back toward 0. */
const SPRING_K = 0.8;

/** Velocity damping factor per second. */
const DAMPING = 2.2;

/** Natural drift added to velocity per second (increases with difficulty). */
const BASE_DRIFT_ACCEL = 3;

/** Each tap shifts velocity by this amount. */
const TAP_IMPULSE = 18;

/** Surge event definition. */
interface SurgeEvent {
  /** Direction multiplier: -1 = left, +1 = right. */
  direction: number;
  /** Acceleration applied during the surge (units/s²). */
  strength: number;
  /** Seconds from game start when surge begins. */
  startsAt: number;
  /** Duration in seconds. */
  duration: number;
  /** Label shown in UI. */
  label: string;
}

/** Fixed surge schedule — becomes more intense over time. */
const SURGE_EVENTS: SurgeEvent[] = [
  { direction: 1,  strength: 14, startsAt: 8,  duration: 1.8, label: '💨 GUST!' },
  { direction: -1, strength: 16, startsAt: 18, duration: 2.0, label: '🌊 WAVE!' },
  { direction: 1,  strength: 20, startsAt: 30, duration: 1.5, label: '⚡ SURGE!' },
  { direction: -1, strength: 18, startsAt: 42, duration: 2.2, label: '💨 GUST!' },
  { direction: 1,  strength: 24, startsAt: 55, duration: 1.6, label: '🌊 WAVE!' },
  { direction: -1, strength: 28, startsAt: 68, duration: 1.8, label: '⚡ SURGE!' },
  { direction: 1,  strength: 32, startsAt: 80, duration: 2.0, label: '🔥 STORM!' },
  { direction: -1, strength: 36, startsAt: 95, duration: 2.0, label: '🔥 STORM!' },
  { direction: 1,  strength: 40, startsAt: 108, duration: 2.4, label: '🌪️ TORNADO!' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'ready' | 'playing' | 'results';

interface ScoreEntry {
  id: string;
  name: string;
  /** Survival time in seconds. */
  survivalSeconds: number;
  /** Normalised score 0–100. */
  score: number;
  isHuman: boolean;
  eliminated: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** HOH/LOH minigame path: full session data. */
  session?: MinigameSession;
  /** HOH/LOH minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final score. */
  onFinish?: (value: number) => void;
  /** MinigameHost path: competition seed (reserved). */
  seed?: number;
  /** MinigameHost path: when true, skip the start countdown delay. */
  autoStart?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Scale survival seconds to a 0–100 score. */
function survivalToScore(seconds: number): number {
  return Math.round(Math.min(100, (seconds / SCORE_CAP_SECONDS) * 100));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PressurePlank({
  session,
  players = [],
  onFinish,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  // ── Phase & countdown ──────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [countdown, setCountdown] = useState(READY_COUNT);

  // ── Rendered game state (updated from RAF loop) ────────────────────────────

  const [balance, setBalance] = useState(0);         // -100 to +100
  const [survivalMs, setSurvivalMs] = useState(0);
  const [safeZone, setSafeZone] = useState(SAFE_ZONE_INITIAL);
  const [outOfZoneMs, setOutOfZoneMs] = useState(0);
  const [activeSurge, setActiveSurge] = useState<SurgeEvent | null>(null);
  const [results, setResults] = useState<ScoreEntry[]>([]);

  // ── Refs for game loop (avoid stale closures) ──────────────────────────────

  const balanceRef = useRef(0);
  const velocityRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const activeSurgeRef = useRef<SurgeEvent | null>(null);
  const outOfZoneMsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const surgeTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /**
   * Keep stable refs for props that are read inside the RAF loop.
   * Props are guaranteed stable for one competition session but using refs
   * avoids any stale-closure lint concern and eliminates eslint suppressions.
   */
  const sessionRef = useRef(session);
  const humanIdRef = useRef(humanId);
  const playersRef = useRef(players);
  const onFinishRef = useRef(onFinish);
  useEffect(() => { sessionRef.current = session; });
  useEffect(() => { humanIdRef.current = humanId; });
  useEffect(() => { playersRef.current = players; });
  useEffect(() => { onFinishRef.current = onFinish; });

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      surgeTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // ── Ready countdown ────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'ready') return;
    const timeoutMs = countdown <= 0 || (autoStart && countdown === READY_COUNT) ? 0 : 1000;
    const t = setTimeout(() => {
      if (autoStart && countdown === READY_COUNT) {
        setCountdown(0);
        return;
      }
      if (countdown <= 0) {
        setGamePhase('playing');
        return;
      }
      setCountdown((c) => c - 1);
    }, timeoutMs);
    return () => clearTimeout(t);
  }, [gamePhase, countdown, autoStart]);

  // ── Surge scheduling (on play start) ──────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    SURGE_EVENTS.forEach((surge) => {
      // Activate surge
      timeouts.push(
        setTimeout(() => {
          activeSurgeRef.current = surge;
          setActiveSurge(surge);
        }, surge.startsAt * 1000),
      );
      // Deactivate surge
      timeouts.push(
        setTimeout(() => {
          activeSurgeRef.current = null;
          setActiveSurge(null);
        }, (surge.startsAt + surge.duration) * 1000),
      );
    });

    surgeTimeoutsRef.current = timeouts;
    return () => timeouts.forEach(clearTimeout);
  }, [gamePhase]);

  // ── Game over handler ──────────────────────────────────────────────────────

  const endGame = useCallback(
    (finalStartTime: number) => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      surgeTimeoutsRef.current.forEach(clearTimeout);
      surgeTimeoutsRef.current = [];

      const elapsed = Date.now() - finalStartTime;
      const survivalSec = elapsed / 1000;
      const humanScore = survivalToScore(survivalSec);

      const currentSession = sessionRef.current;
      const currentHumanId = humanIdRef.current;
      const currentPlayers = playersRef.current;

      if (currentSession) {
        // HOH/LOH path: build full leaderboard
        const allScores: Record<string, number> = { ...currentSession.aiScores };
        if (currentHumanId) allScores[currentHumanId] = humanScore;

        const entries: ScoreEntry[] = currentSession.participants.map((id) => {
          const p = currentPlayers.find((pl) => pl.id === id);
          const sc = allScores[id] ?? 0;
          const survival = (sc / 100) * SCORE_CAP_SECONDS;
          return {
            id,
            name: p?.name ?? id,
            survivalSeconds: id === currentHumanId ? survivalSec : survival,
            score: sc,
            isHuman: id === currentHumanId,
            eliminated: true,
          };
        });

        const ranked = [...entries].sort((a, b) => b.score - a.score);
        setResults(ranked);
        setGamePhase('results');
      } else {
        // MinigameHost path
        const cb = onFinishRef.current;
        if (cb) cb(humanScore);
      }
    },
    // Only refs and stable setters — no prop dependencies needed.
    [],
  );

  // ── RAF game loop ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    // Initialise refs
    balanceRef.current = 0;
    velocityRef.current = 0;
    outOfZoneMsRef.current = 0;
    const startTime = Date.now();
    const startPerf = performance.now();
    startTimeRef.current = startTime;
    lastFrameRef.current = startPerf;

    // Track when we last updated React state (throttle to ~20 fps for renders)
    let lastReactUpdate = 0;

    const loop = (now: number) => {
      const dtMs = now - lastFrameRef.current;
      lastFrameRef.current = now;
      const dt = Math.min(dtMs / 1000, 0.05); // cap delta to 50ms (handles tab blur)

      const elapsed = (now - startPerf) / 1000;

      // Difficulty ramp: drift acceleration increases with time
      const difficultyMult = 1 + elapsed / 60; // doubles at 60s
      const driftAccel = BASE_DRIFT_ACCEL * difficultyMult;

      // Spring restoring force
      const spring = -balanceRef.current * SPRING_K;
      // Damping
      const damp = -velocityRef.current * DAMPING;
      // Active surge
      const surge = activeSurgeRef.current;
      const surgeForce = surge ? surge.direction * surge.strength : 0;
      // Continuous sway so the plank never becomes static.
      const swayForce = computePlankDriftForce(elapsed, driftAccel);
      // Small random perturbation layered on top of the sway.
      const perturbation = (Math.random() - 0.5) * driftAccel * 0.7;

      const acceleration = spring + damp + surgeForce + swayForce + perturbation;
      velocityRef.current += acceleration * dt;
      balanceRef.current = Math.max(
        -MAX_BALANCE,
        Math.min(MAX_BALANCE, balanceRef.current + velocityRef.current * dt),
      );

      // Compute safe zone (shrinks over time)
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const currentSafeZone = computeSafeZoneHalfWidth(elapsedSeconds);
      const insideSafeZone = isWithinSafeZone(balanceRef.current, currentSafeZone);
      outOfZoneMsRef.current = updateOutOfZoneTimer(
        outOfZoneMsRef.current,
        dt * 1000,
        insideSafeZone,
      );

      // Throttle React state updates to ~20 fps
      if (now - lastReactUpdate >= 50) {
        lastReactUpdate = now;
        setBalance(Math.round(balanceRef.current));
        setSurvivalMs(Date.now() - startTime);
        setSafeZone(currentSafeZone);
        setOutOfZoneMs(outOfZoneMsRef.current);
      }

      // Game over: fell off
      if (Math.abs(balanceRef.current) >= FALL_THRESHOLD) {
        setBalance(balanceRef.current > 0 ? FALL_THRESHOLD : -FALL_THRESHOLD);
        setSurvivalMs(Date.now() - startTime);
        endGame(startTime);
        return;
      }

      if (outOfZoneMsRef.current >= OUT_OF_ZONE_GRACE_MS) {
        setSurvivalMs(Date.now() - startTime);
        endGame(startTime);
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [gamePhase, endGame]);

  // ── Tap handlers ───────────────────────────────────────────────────────────

  const handleTapLeft = useCallback(() => {
    if (gamePhase !== 'playing') return;
    velocityRef.current -= TAP_IMPULSE;
  }, [gamePhase]);

  const handleTapRight = useCallback(() => {
    if (gamePhase !== 'playing') return;
    velocityRef.current += TAP_IMPULSE;
  }, [gamePhase]);

  // ── Done handler (HOH path: dispatches to store) ───────────────────────────

  const handleDone = useCallback(() => {
    if (!session) return;
    const humanScore = results.find((e) => e.isHuman)?.score ?? 0;
    const lastPlaceId = results.length > 0 ? results[results.length - 1].id : undefined;
    const payload: CompleteMinigamePayload = { humanScore, lastPlaceId };
    dispatch(completeMinigame(payload));
  }, [dispatch, results, session]);

  // ── Derived UI values ──────────────────────────────────────────────────────

  const absBalance = Math.abs(balance);
  const isOutOfZone = !isWithinSafeZone(balance, safeZone);
  const isWarning =
    isOutOfZone || (absBalance > WARNING_THRESHOLD && absBalance <= DANGER_THRESHOLD);
  const isDanger = absBalance > DANGER_THRESHOLD || outOfZoneMs >= OUT_OF_ZONE_GRACE_MS / 2;
  const survivalSeconds = (survivalMs / 1000).toFixed(1);
  /** Needle position as percentage (0 = far left, 50 = centre, 100 = far right). */
  const needlePct = ((balance + MAX_BALANCE) / (2 * MAX_BALANCE)) * 100;
  const safeLeft = 50 - safeZone;
  const safeRight = 50 + safeZone;
  const safeZoneWidthPct = computeSafeZoneWidthPercent(safeZone);
  const graceRemainingSeconds = Math.max(0, (OUT_OF_ZONE_GRACE_MS - outOfZoneMs) / 1000);

  const medals = ['🥇', '🥈', '🥉'];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        'pp',
        isDanger ? 'pp--danger' : isWarning ? 'pp--warning' : '',
        gamePhase === 'playing' ? 'pp--playing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Pressure Plank Competition"
    >
      <div className="pp__card">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="pp__header">
          <h2 className="pp__title">⚖️ Pressure Plank</h2>
          <p className="pp__subtitle">The plank never stays still — survive the shrinking safe zone.</p>
        </header>

        {/* ── Ready phase ───────────────────────────────────────────────── */}
        {gamePhase === 'ready' && (
          <div className="pp__ready">
            <div className="pp__countdown" aria-live="polite" aria-atomic="true">
              {countdown > 0 ? countdown : '🏁'}
            </div>
            <p className="pp__hint">
              Tap <strong>◀ LEFT</strong> or <strong>RIGHT ▶</strong> to keep balance!
            </p>
          </div>
        )}

        {/* ── Playing phase ─────────────────────────────────────────────── */}
        {gamePhase === 'playing' && (
          <div className="pp__game">

            {/* Surge banner */}
            {activeSurge && (
              <div className="pp__surge" aria-live="assertive" aria-atomic="true">
                {activeSurge.label}
              </div>
            )}

            {/* Timer */}
            <div className="pp__timer" aria-label={`Survival time: ${survivalSeconds} seconds`}>
              <span className="pp__timer-value">{survivalSeconds}s</span>
              <span className="pp__timer-label">survived</span>
            </div>

            {/* Balance gauge */}
            <div
              className="pp__gauge"
              role="meter"
              aria-valuemin={-MAX_BALANCE}
              aria-valuemax={MAX_BALANCE}
              aria-valuenow={balance}
              aria-label="Balance gauge"
            >
              {/* Safe zone band */}
              <div
                className="pp__safe-zone"
                style={{
                  left: `${safeLeft}%`,
                  width: `${safeRight - safeLeft}%`,
                }}
              />

              {/* Danger markers */}
              <div className="pp__danger-left" />
              <div className="pp__danger-right" />

              {/* Needle */}
              <div
                className={[
                  'pp__needle',
                  isDanger ? 'pp__needle--danger' : isWarning ? 'pp__needle--warning' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${needlePct}%` }}
              />

              {/* Centre line */}
              <div className="pp__centre-line" />
            </div>

            {/* Balance zone label */}
            <div
              className={[
                'pp__zone-label',
                isDanger ? 'pp__zone-label--danger' : isWarning ? 'pp__zone-label--warning' : 'pp__zone-label--safe',
              ].join(' ')}
              aria-live="polite"
              aria-atomic="true"
            >
              {isOutOfZone
                ? `⚠ OUT OF ZONE · ${graceRemainingSeconds.toFixed(1)}s`
                : isDanger
                  ? '⚠️ DANGER!'
                  : isWarning
                    ? '⚠ CAUTION'
                    : '✓ BALANCED'}
            </div>

            {/* Control buttons */}
            <div className="pp__controls">
              <button
                className="pp__btn pp__btn--left"
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleTapLeft();
                }}
                onClick={(event) => {
                  if (event.detail === 0) handleTapLeft();
                }}
                aria-label="Tap left to shift balance left"
                type="button"
              >
                ◀ LEFT
              </button>
              <button
                className="pp__btn pp__btn--right"
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleTapRight();
                }}
                onClick={(event) => {
                  if (event.detail === 0) handleTapRight();
                }}
                aria-label="Tap right to shift balance right"
                type="button"
              >
                RIGHT ▶
              </button>
            </div>

            {/* Safe zone width indicator */}
            <div className="pp__safe-hint">
              Safe zone: <strong>{safeZoneWidthPct.toFixed(0)}%</strong> · Grace: <strong>1.0s</strong> outside zone
            </div>
          </div>
        )}

        {/* ── Results phase ─────────────────────────────────────────────── */}
        {gamePhase === 'results' && (
          <div className="pp__results">
            <div className="pp__results-fell">🫸 You fell off!</div>
            <div className="pp__results-time">Survived: {survivalSeconds}s</div>

            <ol className="pp__leaderboard" aria-label="Competition results">
              {results.map((entry, idx) => (
                <li
                  key={entry.id}
                  className={[
                    'pp__leaderboard-row',
                    entry.isHuman ? 'pp__leaderboard-row--human' : '',
                    idx === results.length - 1 ? 'pp__leaderboard-row--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="pp__rank">
                    {idx < medals.length ? medals[idx] : `#${idx + 1}`}
                  </span>
                  <span className="pp__player-name">
                    {entry.name}
                    {entry.isHuman ? ' (you)' : ''}
                  </span>
                  <span className="pp__player-score">
                    {entry.survivalSeconds.toFixed(1)}s
                  </span>
                </li>
              ))}
            </ol>

            {session && (
              <button
                className="pp__continue"
                onClick={handleDone}
                type="button"
              >
                Continue ▶
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
