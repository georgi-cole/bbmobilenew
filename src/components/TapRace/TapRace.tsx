import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import type { MinigameSession, Player } from '../../types';
import './TapRace.css';

interface Props {
  session: MinigameSession;
  players: Player[];
}

type GamePhase = 'ready' | 'playing' | 'results';

interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  isHuman: boolean;
  /** True if this run's score beats the player's previous personal record. */
  isPR: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * TapRace — playable tap minigame for HOH and POV competitions.
 *
 * Flow:
 *  1. "Ready" countdown (3 s) before tapping starts.
 *  2. "Playing" phase: tap as fast as possible within `session.options.timeLimit`.
 *  3. "Results" phase: ranked leaderboard + PR notifications.
 *     Pressing "Continue ▶" dispatches completeMinigame(humanTapCount).
 */
export default function TapRace({ session, players }: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(session.options.timeLimit);
  const [tapCount, setTapCount] = useState(0);
  const [scores, setScores] = useState<ScoreEntry[]>([]);

  const tapCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Ready countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'ready') return;
    if (countdown <= 0) {
      setGamePhase('playing');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [gamePhase, countdown]);

  // ── Playing timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = Math.round((prev - 0.1) * 10) / 10;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          const built = buildScores(session, tapCountRef.current, humanId, players);
          setScores(built);
          setGamePhase('results');
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // `session`, `humanId`, and `players` are intentionally excluded: they are
  // stable for the lifetime of a single competition and should NOT restart the
  // timer if they somehow change.  tapCountRef is a ref (always current).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase]);

  // ── Tap handler ──────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (gamePhase !== 'playing') return;
    tapCountRef.current += 1;
    setTapCount(tapCountRef.current);
  }, [gamePhase]);

  // ── Done handler ─────────────────────────────────────────────────────────
  const handleDone = useCallback(() => {
    dispatch(completeMinigame(tapCountRef.current));
  }, [dispatch]);

  const progressPct = (timeLeft / session.options.timeLimit) * 100;

  return (
    <div className="taprace" role="dialog" aria-modal="true" aria-label="TapRace Competition">
      <div className="taprace__card">
        <header className="taprace__header">
          <h2 className="taprace__title">🏃 TapRace Competition</h2>
          <p className="taprace__subtitle">Tap as fast as you can!</p>
        </header>

        {/* ── Ready phase ─────────────────────────────────────────────── */}
        {gamePhase === 'ready' && (
          <div className="taprace__ready">
            <span className="taprace__countdown" aria-live="assertive">
              {countdown === 0 ? 'GO!' : countdown}
            </span>
            <p className="taprace__hint">Get ready…</p>
          </div>
        )}

        {/* ── Playing phase ────────────────────────────────────────────── */}
        {gamePhase === 'playing' && (
          <div className="taprace__playing">
            <div className="taprace__stats">
              <span className="taprace__taps" aria-live="polite" aria-atomic="true">
                {tapCount}
                <span className="taprace__taps-label"> taps</span>
              </span>
              <span className="taprace__time">{timeLeft.toFixed(1)}s</span>
            </div>
            <div
              className="taprace__progress-bar"
              role="progressbar"
              aria-valuenow={timeLeft}
              aria-valuemin={0}
              aria-valuemax={session.options.timeLimit}
            >
              <div
                className="taprace__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <button
              className="taprace__tap-btn"
              onClick={handleTap}
              type="button"
              aria-label="Tap!"
            >
              TAP!
            </button>
          </div>
        )}

        {/* ── Results phase ────────────────────────────────────────────── */}
        {gamePhase === 'results' && scores.length > 0 && (
          <div className="taprace__results">
            <p className="taprace__winner-line">
              🏆 {scores[0].name} wins with {scores[0].score} taps!
            </p>
            <ol className="taprace__leaderboard">
              {scores.map((entry, i) => (
                <li
                  key={entry.id}
                  className={[
                    'taprace__entry',
                    entry.isHuman ? 'taprace__entry--you' : '',
                    i === 0 ? 'taprace__entry--winner' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="taprace__rank" aria-hidden="true">
                    {MEDALS[i] ?? `${i + 1}.`}
                  </span>
                  <span className="taprace__entry-name">
                    {entry.name}
                    {entry.isHuman && (
                      <span className="taprace__you-tag"> (You)</span>
                    )}
                  </span>
                  <span className="taprace__entry-score">{entry.score} taps</span>
                  {entry.isPR && (
                    <span className="taprace__pr-badge" title="Personal Record!">
                      🏅 PR
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <button
              className="taprace__done-btn"
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

// ── Helper ───────────────────────────────────────────────────────────────────

function buildScores(
  session: MinigameSession,
  humanScore: number,
  humanId: string | undefined,
  players: Player[],
): ScoreEntry[] {
  const entries: ScoreEntry[] = session.participants.map((id) => {
    const player = players.find((p) => p.id === id);
    const isHuman = id === humanId;
    const score = isHuman ? humanScore : (session.aiScores[id] ?? 0);
    const prevPR = player?.stats?.tapRacePR ?? null;
    return {
      id,
      name: player?.name ?? id,
      score,
      isHuman,
      isPR: prevPR == null || score > prevPR,
    };
  });
  return entries.sort((a, b) => b.score - a.score);
}
