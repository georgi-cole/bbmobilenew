/**
 * QuickTapRaceCanvasGame — canvas-backed Quick Tap Race minigame.
 *
 * Supports two rendering modes:
 *  1. LOH/POS path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(effectiveScore)`.
 *
 * The gameplay area (tap button, booster prompt, particles, heat dots, countdown)
 * is rendered entirely on an HTMLCanvasElement via QuickTapRaceCanvasEngine.
 * The score/timer HUD and results leaderboard are React DOM elements for
 * accessibility and readability.
 *
 * If the canvas context cannot be acquired a graceful fallback continue path
 * is shown so the player is never trapped.
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
import { resolveHybridAiScores } from '../../ai/competition/hybridScoreResolver';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import { QuickTapRaceCanvasEngine } from './engine/quickTapRaceCanvasEngine';
import type { QTREngineSnapshot, QTRTimingDiagnostics } from './engine/types';
import './QuickTapRaceCanvasGame.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const GAME_DURATION = 30;
const MEDALS = ['🥇', '🥈', '🥉'];

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScoreEntry {
  id: string;
  name: string;
  effectiveScore: number;
  rawTaps: number;
  isHuman: boolean;
  modifiersApplied: string[];
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  /** LOH/POS minigame path: full session data. */
  session?: MinigameSession;
  /** LOH/POS minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final effective score. */
  onFinish?: (value: number) => void;
  /** Competition seed. Accepted for GenericMinigameProps interface compatibility but
   *  intentionally ignored when no session is present — a fresh cryptoSeed() is always
   *  generated on mount so that challenge retries produce different booster sequences. */
  seed?: number;
  /** When true the ready countdown is skipped. */
  autoStart?: boolean;
  /** Forwarded from MinigameHost; not consumed directly (matches GenericMinigameProps). */
  participantIds?: string[];
  /** Forwarded from MinigameHost; not consumed directly (matches GenericMinigameProps). */
  participants?: Array<{
    id: string;
    name: string;
    isHuman: boolean;
    avatar?: string;
    precomputedScore: number;
    previousPR: number | null;
  }>;
  /** Dev-only experiment hook. Ignored in production builds. */
  experimental?: {
    seed: number;
    onFinish: (result: {
      effectiveScore: number;
      rawTaps: number;
      modifiers: string[];
      timing: QTRTimingDiagnostics;
    }) => void;
  };
}

// Stable empty-array sentinels.
const EMPTY_PLAYERS: Player[] = [];

function makeEmptySnapshot(): QTREngineSnapshot {
  return {
    phase: 'idle',
    countdown: 3,
    timeLeft: GAME_DURATION,
    tapCount: 0,
    effectiveScore: 0,
    heatLevel: 0,
    activeMultiplier: null,
    visibleBooster: null,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function QuickTapRaceCanvasGame({
  session,
  players = EMPTY_PLAYERS,
  onFinish,
  seed: _seed,
  autoStart = false,
  experimental,
}: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<QuickTapRaceCanvasEngine | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastResizeRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  const completionRef = useRef(false);

  const [uiPhase, setUiPhase] = useState<'playing' | 'results' | 'fallback'>('playing');
  const [snapshot, setSnapshot] = useState<QTREngineSnapshot>(() => makeEmptySnapshot());
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [appliedModifiers, setAppliedModifiers] = useState<string[]>([]);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  // Always generate a fresh per-session seed when no authoritative session seed is
  // provided.  Using the prop seed directly (e.g. pendingChallenge.seed from the
  // challenge slice) would fix the booster sequence to the same values for every
  // retry/remount within the same week because that seed never changes.
  // In the LOH/POS path session.seed is already a fresh invocationSeed generated
  // by startMinigame, so determinism is preserved there.
  const [resolvedSeed] = useState(() =>
    import.meta.env.DEV && experimental
      ? experimental.seed
      : session?.seed && session.seed !== 0
        ? session.seed
        : cryptoSeed(),
  );
  const [resolvedDuration] = useState(() => session?.options.timeLimit ?? GAME_DURATION);
  const [resolvedAutoStart] = useState(() => autoStart);
  const latestFinishContextRef = useRef({
    session,
    players,
    humanId,
    onFinish,
    experimental,
  });
  const latestAudioRef = useRef({
    playTap: () => {},
    playBooster: () => {},
    playHalfTap: () => {},
  });

  // Audio — active only during the playing phase.
  const { playTap, playBooster, playHalfTap } = useQuickTapRaceAudio(
    snapshot.phase === 'playing',
  );

  useEffect(() => {
    latestFinishContextRef.current = {
      session,
      players,
      humanId,
      onFinish,
      experimental,
    };
  }, [session, players, humanId, onFinish, experimental]);

  useEffect(() => {
    latestAudioRef.current = {
      playTap,
      playBooster,
      playHalfTap,
    };
  }, [playBooster, playHalfTap, playTap]);

  // ── Finish handler ─────────────────────────────────────────────────────────

  const handleEngineFinish = useCallback(
    (
      finalScore: number,
      rawTaps: number,
      modifiers: string[],
      timing: QTRTimingDiagnostics,
    ) => {
      const {
        session: currentSession,
        players: currentPlayers,
        humanId: currentHumanId,
        onFinish: currentOnFinish,
        experimental: currentExperiment,
      } = latestFinishContextRef.current;
      if (completionRef.current) return;
      completionRef.current = true;
      setAppliedModifiers(modifiers);

      if (import.meta.env.DEV && currentExperiment) {
        currentExperiment.onFinish({ effectiveScore: finalScore, rawTaps, modifiers, timing });
      }

      if (currentSession) {
        // LOH/POS path — build full leaderboard and transition to results.
        let resolvedAiScores: Record<string, number>;
        if (currentSession.hybridResolveOnComplete) {
          const aiParticipants = currentSession.participants
            .filter((id) => id !== currentHumanId)
            .map((id) => {
              const p = currentPlayers.find((pl) => pl.id === id);
              return { id, profile: p?.competitionProfile };
            });
          resolvedAiScores = resolveHybridAiScores({
            gameKey: currentSession.key,
            humanScore: finalScore,
            aiParticipants,
            seed: currentSession.seed,
          });
        } else {
          resolvedAiScores = currentSession.aiScores;
        }

        const allScores: Record<string, number> = {
          ...resolvedAiScores,
          ...(currentHumanId ? { [currentHumanId]: finalScore } : {}),
        };

        const entries: ScoreEntry[] = currentSession.participants.map((id) => {
          const p = currentPlayers.find((pl) => pl.id === id);
          const isHuman = id === currentHumanId;
          return {
            id,
            name: p?.name ?? id,
            effectiveScore: allScores[id] ?? 0,
            rawTaps: isHuman ? rawTaps : allScores[id] ?? 0,
            isHuman,
            modifiersApplied: isHuman ? modifiers : [],
          };
        });
        const ranked = [...entries].sort((a, b) => b.effectiveScore - a.effectiveScore);
        setScores(ranked);
        setUiPhase('results');
      } else {
        // MinigameHost path — report score immediately.
        currentOnFinish?.(finalScore);
      }
    },
    [],
  );

  // ── Done handler (LOH/POS "Continue ▶" button) ─────────────────────────────

  const handleDone = useCallback(() => {
    if (!session) return;
    const human = scores.find((e) => e.isHuman);
    const humanEffective = human?.effectiveScore ?? 0;
    const lastPlaceId = scores.length > 0 ? scores[scores.length - 1].id : undefined;
    const payload: CompleteMinigamePayload = { humanScore: humanEffective, lastPlaceId };
    dispatch(completeMinigame(payload));
  }, [dispatch, scores, session]);

  // ── Fallback resolve (canvas error path) ───────────────────────────────────

  const handleFallbackContinue = useCallback(() => {
    if (onFinish) {
      onFinish(0);
    } else if (session) {
      const payload: CompleteMinigamePayload = { humanScore: 0 };
      dispatch(completeMinigame(payload));
    }
  }, [dispatch, onFinish, session]);

  // ── Canvas engine lifecycle ────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    let engine: QuickTapRaceCanvasEngine | null = null;

    try {
      engine = new QuickTapRaceCanvasEngine(canvas, {
        seed: resolvedSeed,
        duration: resolvedDuration,
        autoStart: resolvedAutoStart,
        strictWallClock: Boolean(import.meta.env.DEV && experimental),
        lowLatencyInput: Boolean(import.meta.env.DEV && experimental),
        onTick: (next) => {
          setSnapshot(next);
        },
        onFinish: handleEngineFinish,
        onTap: () => {
          latestAudioRef.current.playTap();
        },
        onBoosterActivated: (beneficial) => {
          if (beneficial) {
            latestAudioRef.current.playBooster();
          } else {
            latestAudioRef.current.playHalfTap();
          }
        },
      });
      engineRef.current = engine;

      const measureAndResize = (width?: number, height?: number) => {
        const nextWidth = Math.round(width ?? container.clientWidth);
        const nextHeight = Math.round(height ?? container.clientHeight);
        const nextDpr = Math.max(1, window.devicePixelRatio || 1);
        if (nextWidth <= 0 || nextHeight <= 0) return;
        if (
          lastResizeRef.current?.width === nextWidth &&
          lastResizeRef.current?.height === nextHeight &&
          lastResizeRef.current?.dpr === nextDpr
        ) {
          return;
        }
        lastResizeRef.current = { width: nextWidth, height: nextHeight, dpr: nextDpr };
        engine?.resize(nextWidth, nextHeight, nextDpr);
      };

      const handleWindowResize = () => {
        measureAndResize();
      };

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries.find((candidate) => candidate.target === container);
          measureAndResize(entry?.contentRect.width, entry?.contentRect.height);
        });
        resizeObserverRef.current.observe(container);
      }
      window.addEventListener('resize', handleWindowResize);

      measureAndResize();
      engine.start();

      return () => {
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
        lastResizeRef.current = null;
        window.removeEventListener('resize', handleWindowResize);
        engine?.destroy();
        engineRef.current = null;
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Canvas initialization failed.';
      queueMicrotask(() => {
        setCanvasError(message);
        setUiPhase('fallback');
      });
      engine?.destroy();
      return undefined;
    }
  }, [experimental, handleEngineFinish, resolvedAutoStart, resolvedDuration, resolvedSeed]);

  // ── Pointer forwarding to engine ───────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !engineRef.current) return;
    const rect = canvas.getBoundingClientRect();
    engineRef.current.handlePointerDown(e.pointerId, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }, e.timeStamp, performance.now(), e.pointerType);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    engineRef.current?.handlePointerUp(e.pointerId);
  }, []);

  // ── Derived HUD values ─────────────────────────────────────────────────────

  const timeLeft = snapshot.timeLeft;
  const isUrgent = timeLeft <= 5 && snapshot.phase === 'playing';
  const progressPct = Math.min(100, (timeLeft / resolvedDuration) * 100);
  const currentMultiplier = snapshot.activeMultiplier ?? 1;
  const showHud = snapshot.phase === 'playing';
  const heatLevel = snapshot.heatLevel;
  const heatClass = heatLevel >= 2 ? `qtr-canvas--heat-${Math.min(heatLevel, 5)}` : '';

  // ── Render ─────────────────────────────────────────────────────────────────

  if (uiPhase === 'results' && scores.length > 0) {
    return (
      <div
        className="qtr-canvas"
        role="dialog"
        aria-modal="true"
        aria-label="Quick Tap Race Results"
      >
        <div className="qtr-canvas__card">
          <header className="qtr-canvas__header">
            <h2 className="qtr-canvas__title">⚡ Quick Tap Race</h2>
            <p className="qtr-canvas__subtitle">Results</p>
          </header>

          <div className="qtr-canvas__results">
            <p className="qtr-canvas__winner-line">
              🏆 {scores[0].name} wins with {scores[0].effectiveScore} taps!
            </p>
            <ol className="qtr-canvas__leaderboard">
              {scores.map((entry, i) => (
                <li
                  key={entry.id}
                  className={[
                    'qtr-canvas__entry',
                    entry.isHuman ? 'qtr-canvas__entry--you' : '',
                    i === 0 ? 'qtr-canvas__entry--winner' : '',
                    i === scores.length - 1 ? 'qtr-canvas__entry--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="qtr-canvas__rank" aria-hidden="true">
                    {MEDALS[i] ?? `${i + 1}.`}
                  </span>
                  <span className="qtr-canvas__entry-name">
                    {entry.name}
                    {entry.isHuman && <span className="qtr-canvas__you-tag"> (You)</span>}
                  </span>
                  <span className="qtr-canvas__entry-score">{entry.effectiveScore} taps</span>
                  {entry.modifiersApplied.length > 0 && (
                    <span
                      className="qtr-canvas__entry-mods"
                      title={entry.modifiersApplied.join(', ')}
                    >
                      ✨
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {appliedModifiers.length > 0 && (
              <p
                className="qtr-canvas__mod-summary"
                aria-label="Active modifiers this game"
              >
                Modifiers: {appliedModifiers.join(' → ')}
              </p>
            )}
            <button
              className="qtr-canvas__continue-btn"
              onClick={handleDone}
              type="button"
            >
              Continue ▶
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={['qtr-canvas', heatClass].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Quick Tap Race Competition"
    >
      <div className="qtr-canvas__card">
        <header className="qtr-canvas__header">
          <h2 className="qtr-canvas__title">⚡ Quick Tap Race</h2>
          <p className="qtr-canvas__subtitle">Tap as fast as you can for 30 seconds!</p>
        </header>

        {/* HUD — score + timer shown above canvas during playing phase */}
        {showHud && (
          <>
            <div className="qtr-canvas__hud">
              <div className="qtr-canvas__score-block">
                <span
                  className={['qtr-canvas__score-value', heatClass && 'qtr-canvas__score-value--heat'].filter(Boolean).join(' ')}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {snapshot.effectiveScore}
                </span>
                {currentMultiplier !== 1 && (
                  <span className="qtr-canvas__raw-taps" aria-hidden="true">
                    {snapshot.tapCount} raw
                  </span>
                )}
                <span className="qtr-canvas__score-label">taps</span>
              </div>
              <span
                className={[
                  'qtr-canvas__time',
                  isUrgent ? 'qtr-canvas__time--urgent' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-live={isUrgent ? 'assertive' : 'off'}
                aria-atomic="true"
              >
                {timeLeft.toFixed(1)}s
              </span>
            </div>

            <div
              className="qtr-canvas__progress-bar"
              role="progressbar"
              aria-valuenow={timeLeft}
              aria-valuemin={0}
              aria-valuemax={resolvedDuration}
            >
              <div
                className="qtr-canvas__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {snapshot.activeMultiplier !== null && (
              <div
                className={[
                  'qtr-canvas__multiplier-badge',
                  snapshot.activeMultiplier > 1
                    ? 'qtr-canvas__multiplier-badge--good'
                    : 'qtr-canvas__multiplier-badge--bad',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="status"
                aria-live="polite"
              >
                {snapshot.activeMultiplier < 0
                  ? `${snapshot.activeMultiplier}× DRAIN`
                  : `${snapshot.activeMultiplier}×`}{' '}
                active
              </div>
            )}
          </>
        )}

        {/* Canvas stage — interactive game area */}
        <div className="qtr-canvas__stage">
          <div ref={containerRef} className="qtr-canvas__shell">
            <canvas
              ref={canvasRef}
              className="qtr-canvas__canvas"
              data-testid="quick-tap-race-canvas"
              aria-label="Quick Tap Race canvas — tap the button as fast as possible"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            {uiPhase === 'fallback' && (
              <div className="qtr-canvas__fallback" role="alert">
                <p className="qtr-canvas__fallback-title">Game arena unavailable</p>
                <p className="qtr-canvas__fallback-copy">
                  {canvasError ?? 'Could not start the canvas game.'}
                </p>
                <button
                  className="qtr-canvas__continue-btn"
                  onClick={handleFallbackContinue}
                  type="button"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
