import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch } from '../../store/hooks';
import { applyMinigameWinner } from '../../store/gameSlice';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import type { ReactMinigameCompletion } from '../../components/MinigameHost/MinigameHost';
import type { MinigameParticipant } from '../../components/MinigameHost/MinigameHost';
import {
  ATTEMPT_BAND_LABELS,
  CODE_LENGTH,
  computeAllAiSolveProfiles,
  computeSolvedScore,
  getAttemptBand,
  rankScores,
  type GuessResult,
} from '../../components/CodeBreakerComp/codeBreakerLogic';
import { attachVaultCrackerInput } from './engine/input';
import type {
  VaultCrackerEngineSnapshot,
  VaultCrackerWinPayload,
} from './engine/types';
import { VaultCrackerCanvasEngine } from './engine/vaultCrackerCanvasEngine';
import '../../components/CodeBreakerComp/CodeBreakerComp.css';

export type CodeBreakerPrizeType = 'LOH' | 'POS';

type GamePhase = 'playing' | 'solved' | 'results' | 'fallback';

interface Props {
  participantIds?: string[];
  participants?: MinigameParticipant[];
  prizeType?: CodeBreakerPrizeType;
  seed?: number;
  onComplete?: (completion?: ReactMinigameCompletion) => void;
  onFinish?: (value: number) => void;
  autoStart?: boolean;
}

// Stable empty-array sentinels used as default prop values.
// Defining them at module level ensures the same reference is returned on every
// render when the caller omits the prop, which prevents unnecessary useMemo /
// useCallback / useEffect re-executions caused by inline `[]` literals in
// default parameters creating a new array identity on every render.
const EMPTY_PARTICIPANT_IDS: string[] = [];
const EMPTY_PARTICIPANTS: MinigameParticipant[] = [];
const MEDALS = ['🥇', '🥈', '🥉'];
const RESULT_DELAY_MS = 1_800;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getAttemptSummary(result: GuessResult): string {
  if (result.bulls === CODE_LENGTH) {
    return 'Tumblers aligned. Vault unlocked.';
  }
  if (result.bulls === 0 && result.cows === 0) {
    return 'Lock resisting. No tumblers aligned.';
  }

  const exactLabel = result.bulls === 1 ? '1 exact' : `${result.bulls} exact`;
  const closeLabel = result.cows === 1 ? '1 displaced' : `${result.cows} displaced`;
  return `${exactLabel} • ${closeLabel}`;
}

function formatAttemptCount(attempts: number): string {
  return `${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`;
}

function makeEmptySnapshot(): VaultCrackerEngineSnapshot {
  return {
    phase: 'idle',
    digits: Array(CODE_LENGTH).fill(0),
    attempts: 0,
    elapsedMs: 0,
    bestBulls: 0,
    lastGuess: null,
    guessHistory: [],
    pressure: 0.06,
  };
}

export default function VaultCrackerCanvasGame({
  participantIds = EMPTY_PARTICIPANT_IDS,
  participants = EMPTY_PARTICIPANTS,
  prizeType = 'LOH',
  seed = 0,
  onComplete,
  onFinish,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const isCompetitionMode = participantIds.length > 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<VaultCrackerCanvasEngine | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastResizeRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionRef = useRef(false);

  const [phase, setPhase] = useState<GamePhase>('playing');
  const [snapshot, setSnapshot] = useState<VaultCrackerEngineSnapshot>(() => makeEmptySnapshot());
  const [humanScore, setHumanScore] = useState(0);
  const [secretCode, setSecretCode] = useState<number[] | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  const sessionSeed = useMemo(() => (seed === 0 || seed === undefined ? cryptoSeed() : seed), [seed]);
  const humanParticipant = participants.find((candidate) => candidate.isHuman) ?? null;
  const humanId = humanParticipant?.id ?? null;

  const { aiSolveProfiles, aiScores } = useMemo(() => {
    const profiles = computeAllAiSolveProfiles(sessionSeed, participantIds, humanId);
    return {
      aiSolveProfiles: profiles,
      aiScores: Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, profile.score])),
    };
  }, [humanId, participantIds, sessionSeed]);

  const clearResolveTimeout = useCallback(() => {
    if (resolveTimeoutRef.current !== null) {
      clearTimeout(resolveTimeoutRef.current);
      resolveTimeoutRef.current = null;
    }
  }, []);

  // Stable ref so the engine's onWin callback always invokes the latest version
  // of finalizeSolvedRun without requiring the engine to be destroyed/recreated
  // when dependency-chain re-renders occur (e.g. after applyMinigameWinner).
  // The no-op default is safe: the ref is updated synchronously in the render
  // body (below) before the engine useEffect ever runs.
  const onWinRef = useRef<(payload: VaultCrackerWinPayload) => void>(() => {});

  const resolveCompetition = useCallback((score: number) => {
    if (!isCompetitionMode || completionRef.current) return;
    completionRef.current = true;

    const allScores: Record<string, number> = { ...aiScores };
    if (humanId) {
      allScores[humanId] = score;
    }

    const ranked = rankScores(allScores, participantIds);
    const winnerId = ranked[0]?.id ?? participantIds[0];
    const rawLastPlaceId = ranked[ranked.length - 1]?.id ?? null;
    const lastPlaceId = rawLastPlaceId !== null && rawLastPlaceId !== winnerId ? rawLastPlaceId : null;

    if (import.meta.env.DEV) {
      console.log('[VaultCrackerCanvasGame] Resolving competition', {
        competitionPhase: prizeType === 'LOH' ? 'loh_comp' : 'pos_comp',
        winnerId,
        lastPlaceId,
        scores: allScores,
      });
    }

    dispatch(
      applyMinigameWinner({
        winnerId,
        participants: participantIds,
        scores: allScores,
        lastPlaceId,
        lastPlaceType: 'scored',
      }),
    );
  }, [aiScores, dispatch, humanId, isCompetitionMode, participantIds, prizeType]);

  const finalizeSolvedRun = useCallback((payload: VaultCrackerWinPayload) => {
    setSnapshot(payload);
    setSecretCode(payload.secretCode);
    const score = computeSolvedScore(payload.attempts, payload.elapsedMs);
    setHumanScore(score);
    resolveCompetition(score);
    setPhase('solved');
    clearResolveTimeout();
    resolveTimeoutRef.current = setTimeout(() => {
      setPhase('results');
    }, RESULT_DELAY_MS);
  }, [clearResolveTimeout, resolveCompetition]);

  // Keep the ref up-to-date on every render so the engine always calls the
  // latest closure without needing to be destroyed and recreated.
  onWinRef.current = finalizeSolvedRun;

  const resolveFallback = useCallback(() => {
    clearResolveTimeout();
    resolveCompetition(0);
    if (onFinish) {
      onFinish(0);
      return;
    }
    onComplete?.();
  }, [clearResolveTimeout, onComplete, onFinish, resolveCompetition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    let detachInput: (() => void) | null = null;

    try {
      const engine = new VaultCrackerCanvasEngine(canvas, {
        seed: sessionSeed,
        onProgress: (nextSnapshot) => {
          setSnapshot(nextSnapshot);
        },
        onWin: (payload) => onWinRef.current(payload),
      });
      engineRef.current = engine;
      detachInput = attachVaultCrackerInput(canvas, engine);
      lastResizeRef.current = null;

      const measureAndResize = (width = container.clientWidth, height = container.clientHeight) => {
        const nextWidth = Math.round(width);
        const nextHeight = Math.round(height);
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
        engine.resize(nextWidth, nextHeight, nextDpr);
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
      if (!autoStart && !isCompetitionMode) {
        setSnapshot(engine.getSnapshot());
      }

      return () => {
        clearResolveTimeout();
        detachInput?.();
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
        lastResizeRef.current = null;
        window.removeEventListener('resize', handleWindowResize);
        engine.destroy();
        engineRef.current = null;
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Canvas initialization failed.';
      setCanvasError(message);
      setPhase('fallback');
      detachInput?.();
      return undefined;
    }
  }, [autoStart, clearResolveTimeout, isCompetitionMode, sessionSeed]);

  useEffect(() => () => {
    clearResolveTimeout();
  }, [clearResolveTimeout]);

  const attempts = snapshot.attempts;
  const elapsedLabel = formatElapsed(snapshot.elapsedMs);
  const statusText =
    phase === 'solved'
      ? `Vault breached in ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`
      : snapshot.lastGuess
        ? getAttemptSummary(snapshot.lastGuess)
        : null;
  const hintText =
    phase === 'solved'
      ? `${elapsedLabel} Elapsed • Score ${humanScore}`
      : attempts > 0
        ? `Best alignment so far: ${snapshot.bestBulls}/${CODE_LENGTH} exact`
        : null;

  const vaultStateLabel =
    canvasError !== null
      ? 'Offline'
      : phase === 'solved' || phase === 'results'
        ? 'Opened'
        : attempts > 0
          ? 'Cracking'
          : 'Locked';

  const leaderboard = useMemo(() => {
    if (phase !== 'results') return [];
    const allScores: Record<string, number> = { ...aiScores };
    if (humanId) {
      allScores[humanId] = humanScore;
    }
    return rankScores(allScores, participantIds).map((entry) => {
      const participant = participants.find((candidate) => candidate.id === entry.id);
      const isYou = entry.id === humanId;
      const solveProfile = isYou
        ? { attempts, elapsedMs: snapshot.elapsedMs, score: humanScore }
        : aiSolveProfiles[entry.id];
      return {
        ...entry,
        participantName: participant?.name ?? entry.id,
        isYou,
        solveProfile,
      };
    });
  }, [aiScores, aiSolveProfiles, attempts, humanId, humanScore, participantIds, participants, phase, snapshot.elapsedMs]);

  if (phase === 'results') {
    return (
      <div className="cb">
        <div className="cb__header">
          <h2 className="cb__title">Vault Cracker</h2>
          <div className="cb__stats-panel cb__stats-panel--results">
            <div className="cb__stat-chip">
              <span className="cb__stat-label">Attempts</span>
              <strong className="cb__stat-value">{attempts}</strong>
            </div>
            <div className="cb__stat-chip">
              <span className="cb__stat-label">Elapsed</span>
              <strong className="cb__stat-value">{elapsedLabel}</strong>
            </div>
            <div className="cb__stat-chip">
              <span className="cb__stat-label">Score</span>
              <strong className="cb__stat-value">{humanScore}</strong>
            </div>
          </div>
          <p className="cb__code-reveal">
            Code was: <strong>{secretCode?.join('') ?? '----'}</strong>
          </p>
        </div>

        <div className="cb__results">
          <p className="cb__results-headline">🔓 Vault Cracked!</p>
          <ol className="cb__leaderboard">
            {leaderboard.map((entry, index) => {
              const isWinner = index === 0;
              const isLast = index === leaderboard.length - 1;
              const cls = [
                'cb__lb-entry',
                isWinner ? 'cb__lb-entry--winner' : '',
                isLast ? 'cb__lb-entry--last' : '',
                entry.isYou ? 'cb__lb-entry--you' : '',
              ].filter(Boolean).join(' ');
              return (
                <li key={entry.id} className={cls}>
                  <span className="cb__lb-rank">{index < 3 ? MEDALS[index] : `${index + 1}.`}</span>
                  <span className="cb__lb-details">
                    <span className="cb__lb-name">
                      {entry.participantName}
                      {entry.isYou ? ' (You)' : ''}
                    </span>
                    {entry.solveProfile && (
                      <span className="cb__lb-meta">
                        {formatAttemptCount(entry.solveProfile.attempts)} • {formatElapsed(entry.solveProfile.elapsedMs)}
                      </span>
                    )}
                  </span>
                  <span className="cb__lb-score-wrap">
                    <span className="cb__lb-score-label">Score</span>
                    <span className="cb__lb-score">{entry.score}</span>
                    {entry.solveProfile && (() => {
                      const band = getAttemptBand(entry.solveProfile.attempts);
                      return <span className={`cb__lb-band cb__lb-band--${band}`}>{ATTEMPT_BAND_LABELS[band]}</span>;
                    })()}
                  </span>
                </li>
              );
            })}
          </ol>
          <button className="cb__continue-btn" onClick={() => {
            if (onFinish) {
              onFinish(humanScore);
            } else {
              onComplete?.();
            }
          }}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cb">
      <div className="cb__header">
        <h2 className="cb__title">Vault Cracker</h2>
        <div className="cb__stats-panel" aria-label="Vault status">
          <div className="cb__stat-chip">
            <span className="cb__stat-label">Status</span>
            <strong className="cb__stat-value">{vaultStateLabel}</strong>
          </div>
          <div className="cb__stat-chip">
            <span className="cb__stat-label">Attempts</span>
            <strong className="cb__stat-value">{attempts}</strong>
          </div>
          <div className="cb__stat-chip">
            <span className="cb__stat-label">Elapsed</span>
            <strong className="cb__stat-value">{elapsedLabel}</strong>
          </div>
        </div>
      </div>

      <div className="cb__canvas-stage">
        <div ref={containerRef} className="cb__canvas-shell">
          <canvas
            ref={canvasRef}
            className="cb__canvas"
            data-testid="vault-cracker-canvas"
            aria-label="Vault Cracker canvas interface"
          />
          {canvasError && (
            <div className="cb__fallback" role="alert">
              <p className="cb__fallback-title">Vault terminal unavailable</p>
              <p className="cb__fallback-copy">{canvasError}</p>
              <button className="cb__continue-btn" onClick={resolveFallback}>
                Resolve and continue
              </button>
            </div>
          )}
        </div>

        {(statusText !== null || hintText !== null) && (
          <div className="cb__status-card" aria-live="polite">
            {statusText !== null && <p className="cb__status">{statusText}</p>}
            {hintText !== null && <p className="cb__hint">{hintText}</p>}
          </div>
        )}
      </div>

      {snapshot.guessHistory.length > 0 && (
        <div className="cb__history">
          <div className="cb__history-head">
            <span className="cb__history-label">Attempt History</span>
            <span className="cb__history-count">
              {snapshot.guessHistory.length} {snapshot.guessHistory.length === 1 ? 'attempt' : 'attempts'}
            </span>
          </div>
          <div className="cb__history-list">
            {[...snapshot.guessHistory].reverse().map((guess, index) => {
              const attemptNum = snapshot.guessHistory.length - index;
              return (
                <div key={attemptNum} className="cb__guess-row">
                  <div className="cb__guess-main">
                    <span className="cb__guess-meta">Attempt #{attemptNum}</span>
                    <span className="cb__guess-digits">{guess.digits.join(' ')}</span>
                  </div>
                  <div className="cb__guess-feedback">
                    {Array.from({ length: CODE_LENGTH }, (_, i) => {
                      const type = i < guess.bulls ? 'bull' : i < guess.bulls + guess.cows ? 'cow' : 'miss';
                      return <span key={i} className={`cb__pip cb__pip--${type}`} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
