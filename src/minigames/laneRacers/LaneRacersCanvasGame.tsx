import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import { useQuickTapRaceAudio } from '../../hooks/useQuickTapRaceAudio';
import { attachQuickTapRaceInput } from './engine/input';
import { QuickTapRaceCanvasEngine } from './engine/quickTapRaceCanvasEngine';
import type {
  QuickTapRaceEngineSnapshot,
  QuickTapRaceParticipantConfig,
  QuickTapRaceResult,
} from './engine/types';
import type { MinigameParticipant } from '../../components/MinigameHost/MinigameHost';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import '../../components/QuickTapRace/QuickTapRace.css';

interface Props {
  session?: MinigameSession;
  players?: Player[];
  onFinish?: (value: number) => void;
  seed?: number;
  autoStart?: boolean;
  participantIds?: string[];
  participants?: MinigameParticipant[];
}

const EMPTY_PLAYERS: Player[] = [];
const EMPTY_PARTICIPANT_IDS: string[] = [];
const EMPTY_PARTICIPANTS: MinigameParticipant[] = [];
const RACER_COLORS = ['#38bdf8', '#f97316', '#f43f5e', '#22c55e', '#facc15', '#a855f7'];

function createEmptySnapshot(): QuickTapRaceEngineSnapshot {
  return {
    phase: 'countdown',
    countdownText: '3',
    timeLeftMs: 30_000,
    playerScore: 0,
    playerRawTaps: 0,
    playerCombo: 0,
    playerShieldCharges: 0,
    playerEffectLabel: null,
    playerEffectIcon: null,
    playerHeat: 0,
    statusText: 'Loading lanes…',
    leadingRacerId: null,
    rankings: [],
    result: null,
    seed: 0,
  };
}

function formatTimeLeft(timeLeftMs: number): string {
  return `${Math.max(0, timeLeftMs / 1000).toFixed(1)}s`;
}

function formatPlacement(index: number): string {
  if (index === 0) return '1st';
  if (index === 1) return '2nd';
  if (index === 2) return '3rd';
  return `${index + 1}th`;
}

function buildSessionRacers(
  session: MinigameSession,
  players: Player[],
  humanId: string | null,
): QuickTapRaceParticipantConfig[] {
  return session.participants.map((id, index) => {
    const player = players.find((candidate) => candidate.id === id);
    return {
      id,
      name: player?.name ?? id,
      isPlayer: id === humanId,
      color: RACER_COLORS[index % RACER_COLORS.length],
      targetScore: id === humanId ? 0 : session.aiScores[id] ?? 170,
      profile: player?.competitionProfile ?? null,
    };
  });
}

function buildHostedRacers(
  participantIds: string[],
  participants: MinigameParticipant[],
): QuickTapRaceParticipantConfig[] {
  const source = participants.length > 0
    ? participants
    : participantIds.map((id, index) => ({
        id,
        name: id,
        // Integration note: MinigameHost normally supplies full participant metadata.
        // This fallback only exists for minimal local/test harnesses that pass ids
        // without participant records, so the first slot becomes the human lane.
        isHuman: index === 0,
        precomputedScore: 0,
        previousPR: null,
      }));

  return source.map((participant, index) => ({
    id: participant.id,
    name: participant.name,
    isPlayer: participant.isHuman,
    color: RACER_COLORS[index % RACER_COLORS.length],
    // Integration note: hosted challenge flows already precompute AI scores in
    // MinigameHost, so reusing them keeps Lane Racers aligned with the host
    // leaderboard contract instead of drifting against a second score source.
    targetScore: participant.isHuman ? 0 : participant.precomputedScore,
    profile: null,
  }));
}

export default function LaneRacersCanvasGame({
  session,
  players = EMPTY_PLAYERS,
  onFinish,
  seed,
  participantIds = EMPTY_PARTICIPANT_IDS,
  participants = EMPTY_PARTICIPANTS,
}: Props) {
  const dispatch = useAppDispatch();
  const fallbackHumanId = useAppSelector((state) => state.game.players.find((player) => player.isUser)?.id ?? null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<QuickTapRaceCanvasEngine | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const audioSnapshotRef = useRef<{ rawTaps: number; effectLabel: string | null }>({ rawTaps: 0, effectLabel: null });

  const [snapshot, setSnapshot] = useState<QuickTapRaceEngineSnapshot>(() => createEmptySnapshot());
  const [result, setResult] = useState<QuickTapRaceResult | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  const humanId = session
    ? players.find((player) => player.isUser)?.id ?? fallbackHumanId
    : participants.find((participant) => participant.isHuman)?.id ?? participantIds[0] ?? fallbackHumanId;
  const timeLimitMs = (session?.options.timeLimit ?? 30) * 1000;
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const racers = useMemo(() => {
    if (session) {
      return buildSessionRacers(session, players, humanId);
    }
    return buildHostedRacers(participantIds, participants);
  }, [humanId, participantIds, participants, players, session]);

  const { playTap, playBooster, playHalfTap } = useQuickTapRaceAudio(snapshot.phase === 'active');

  const handleProgress = useCallback((nextSnapshot: QuickTapRaceEngineSnapshot) => {
    const previous = audioSnapshotRef.current;
    if (nextSnapshot.playerRawTaps > previous.rawTaps) {
      playTap();
    }
    if (nextSnapshot.playerEffectLabel !== previous.effectLabel && nextSnapshot.playerEffectLabel) {
      const ranking = nextSnapshot.rankings.find((entry) => entry.isPlayer);
      const playerLead = ranking ? nextSnapshot.rankings[0]?.id === ranking.id : false;
      if (playerLead || nextSnapshot.playerEffectIcon === '⚡' || nextSnapshot.playerEffectIcon === '🔥' || nextSnapshot.playerEffectIcon === '🛡️') {
        playBooster();
      } else {
        playHalfTap();
      }
    }
    audioSnapshotRef.current = {
      rawTaps: nextSnapshot.playerRawTaps,
      effectLabel: nextSnapshot.playerEffectLabel,
    };
    setSnapshot(nextSnapshot);
  }, [playBooster, playHalfTap, playTap]);

  const handleEngineFinish = useCallback((raceResult: QuickTapRaceResult) => {
    setResult(raceResult);
    setSnapshot((current) => ({ ...current, result: raceResult, rankings: raceResult.rankings, phase: 'completed' }));
    if (!session && onFinish) {
      onFinish(raceResult.humanScore);
    }
  }, [onFinish, session]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || racers.length === 0) {
      return undefined;
    }

    canvas.style.touchAction = 'manipulation';
    let detachInput: (() => void) | undefined;

    try {
      const engine = new QuickTapRaceCanvasEngine(canvas, {
        seed: session?.seed ?? seed,
        raceDurationMs: timeLimitMs,
        racers,
        reducedMotion,
        onProgress: handleProgress,
        onFinish: handleEngineFinish,
      });
      engineRef.current = engine;
      setSnapshot(engine.getSnapshot());
      detachInput = attachQuickTapRaceInput(canvas, engine);

      const measureAndResize = () => {
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        engine.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      };

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver(() => {
          measureAndResize();
        });
        resizeObserverRef.current.observe(container);
      } else {
        window.addEventListener('resize', measureAndResize);
      }

      const handleVisibility = () => {
        if (document.hidden) {
          engine.pause();
          return;
        }
        engine.resume();
      };

      document.addEventListener('visibilitychange', handleVisibility);
      measureAndResize();
      engine.start();
      setCanvasError(null);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
        window.removeEventListener('resize', measureAndResize);
        detachInput?.();
        engine.destroy();
        engineRef.current = null;
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Canvas initialization failed.';
      setCanvasError(message);
      detachInput?.();
      return undefined;
    }
  }, [handleEngineFinish, handleProgress, racers, reducedMotion, seed, session?.seed, timeLimitMs]);

  const handleContinue = useCallback(() => {
    if (!session || !result) return;
    const payload: CompleteMinigamePayload = {
      humanScore: result.humanScore,
      winnerId: result.winnerId,
      lastPlaceId: result.lastPlaceId ?? undefined,
    };
    dispatch(completeMinigame(payload));
  }, [dispatch, result, session]);

  const leader = snapshot.rankings[0] ?? null;
  const playerEntry = result?.rankings.find((entry) => entry.isPlayer)
    ?? snapshot.rankings.find((entry) => entry.isPlayer)
    ?? null;

  return (
    <div className="qtr" role="dialog" aria-modal="true" aria-label="Lane Racers Competition">
      <div className="qtr__card qtr__card--canvas">
        <header className="qtr__header qtr__header--canvas">
          <div>
            <h2 className="qtr__title">🏁 Lane Racers</h2>
            <p className="qtr__subtitle">Canvas broadcast mode • touch-first sprint chaos</p>
          </div>
          <div className="qtr__hud-cluster" aria-live="polite">
            <div className="qtr__hud-pill">
              <span className="qtr__hud-label">Score</span>
              <strong>{snapshot.playerScore}</strong>
            </div>
            <div className="qtr__hud-pill">
              <span className="qtr__hud-label">Clock</span>
              <strong>{formatTimeLeft(snapshot.timeLeftMs)}</strong>
            </div>
          </div>
        </header>

        <div className="qtr__canvas-layout">
          <div className="qtr__canvas-meta">
            <div className="qtr__status-block">
              <span className="qtr__status-label">Live status</span>
              <strong className="qtr__status-copy">{snapshot.statusText}</strong>
            </div>
            <div className="qtr__status-grid">
              <div className="qtr__metric-card">
                <span>Raw taps</span>
                <strong>{snapshot.playerRawTaps}</strong>
              </div>
              <div className="qtr__metric-card">
                <span>Combo</span>
                <strong>{snapshot.playerCombo.toFixed(1)}×</strong>
              </div>
              <div className="qtr__metric-card">
                <span>Shield</span>
                <strong>{snapshot.playerShieldCharges}</strong>
              </div>
              <div className="qtr__metric-card qtr__metric-card--wide">
                <span>Active effect</span>
                <strong>{snapshot.playerEffectLabel ? `${snapshot.playerEffectIcon ?? ''} ${snapshot.playerEffectLabel}` : 'None'}</strong>
              </div>
            </div>
          </div>

          <div ref={containerRef} className="qtr__arena-shell">
            <canvas ref={canvasRef} className="qtr__canvas" aria-label="Lane Racers lanes" />
            {canvasError && (
              <div className="qtr__canvas-fallback" role="alert">
                <p>{canvasError}</p>
                {!session && onFinish && (
                  <button type="button" className="qtr__button" onClick={() => onFinish(0)}>
                    Exit race
                  </button>
                )}
              </div>
            )}
          </div>

          <aside className="qtr__sidebar" aria-live="polite">
            <div className="qtr__leader-box">
              <span className="qtr__status-label">Leader</span>
              <strong>{leader ? `${leader.name} • ${leader.score}` : '—'}</strong>
            </div>
            <ol className="qtr__rankings">
              {snapshot.rankings.slice(0, 5).map((entry, index) => (
                <li key={entry.id} className={entry.isPlayer ? 'qtr__ranking qtr__ranking--player' : 'qtr__ranking'}>
                  <span>{formatPlacement(index)}</span>
                  <span>{entry.name}</span>
                  <strong>{entry.score}</strong>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        {session && result && (
          <section className="qtr__results-panel">
            <div>
              <h3 className="qtr__results-title">Race complete</h3>
              <p className="qtr__results-copy">
                {playerEntry?.isPlayer && result.winnerId === playerEntry.id
                  ? 'You took the race with a late burst.'
                  : `${result.rankings[0]?.name ?? 'Winner'} held on for the win.`}
              </p>
            </div>
            <button type="button" className="qtr__button" onClick={handleContinue}>
              Continue
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
