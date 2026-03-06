/**
 * HoldTheWallComp – "Hold the Wall" endurance competition screen.
 *
 * Phases:
 *   active   → players hold the wall; AI participants drop deterministically
 *   complete → winner announced, onComplete fires
 *
 * NOTE: This component intentionally has NO countdown logic and NO rules
 * display. Both are handled upstream by MinigameHost before this component
 * mounts. This ensures exactly one server-driven countdown occurs and rules
 * are shown exactly once.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  startHoldTheWall,
  dropPlayer,
  resetHoldTheWall,
} from '../../features/holdTheWall/holdTheWallSlice';
import { resolveHoldTheWallOutcome } from '../../features/holdTheWall/thunks';
import type { HoldTheWallState, HoldTheWallPrizeType } from '../../features/holdTheWall/holdTheWallSlice';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import './HoldTheWallComp.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  prizeType: HoldTheWallPrizeType;
  seed: number;
  onComplete?: () => void;
}

interface GamePlayer {
  id: string;
  name: string;
  avatar: string;
  isUser?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleAvatarError(e: React.SyntheticEvent<HTMLImageElement>, name: string) {
  const img = e.currentTarget;
  const fallback = getDicebear(name);
  if (img.src !== fallback) img.src = fallback;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${s}.${tenths}s`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HoldTheWallComp({
  participantIds,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const htw = useAppSelector(
    (s: RootState) => (s as RootState & { holdTheWall: HoldTheWallState }).holdTheWall,
  );
  const players = useAppSelector(
    (s: RootState) =>
      (s as RootState & { game: { players: GamePlayer[] } }).game?.players ?? [],
  );

  // Local UI state
  const [isHolding, setIsHolding] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const humanDroppedRef = useRef(false);

  // Derived helpers
  const humanPlayer = players.find((p) => p.isUser);
  const humanId: string | null = humanPlayer?.id ?? null;

  // ── Initialise competition on mount ──────────────────────────────────────
  useEffect(() => {
    dispatch(
      startHoldTheWall({
        participantIds,
        humanId,
        prizeType,
        seed,
      }),
    );
    return () => {
      dispatch(resetHoldTheWall());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Schedule AI drops when game becomes active ────────────────────────────
  useEffect(() => {
    if (htw.status !== 'active') return;

    startTimeRef.current = Date.now();

    // Schedule each AI's deterministic drop
    const timeouts = Object.entries(htw.aiDropSchedule).map(([id, delayMs]) =>
      window.setTimeout(() => {
        dispatch(dropPlayer(id));
      }, delayMs),
    );

    return () => {
      timeouts.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htw.status]);

  // ── Elapsed timer (requestAnimationFrame loop) ────────────────────────────
  useEffect(() => {
    if (htw.status !== 'active') return;

    const tick = () => {
      if (startTimeRef.current !== null) {
        setElapsedMs(Date.now() - startTimeRef.current);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, [htw.status]);

  // ── Resolve outcome and notify parent when game completes ─────────────────
  useEffect(() => {
    if (htw.status !== 'complete' || htw.outcomeResolved) return;
    dispatch(resolveHoldTheWallOutcome());
    onComplete?.();
  }, [htw.status, htw.outcomeResolved, dispatch, onComplete]);

  // ── Human hold / release handlers ─────────────────────────────────────────
  const handleHoldStart = useCallback(
    (e: React.PointerEvent) => {
      if (htw.status !== 'active' || humanDroppedRef.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsHolding(true);
    },
    [htw.status],
  );

  const handleHoldEnd = useCallback(() => {
    if (htw.status !== 'active' || humanDroppedRef.current) return;
    if (!isHolding) return;
    humanDroppedRef.current = true;
    setIsHolding(false);
    if (humanId) {
      dispatch(dropPlayer(humanId));
    }
  }, [htw.status, isHolding, humanId, dispatch]);

  // Prevent context menu on long press (mobile)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ─── Derived display data ─────────────────────────────────────────────────

  const aliveIds = htw.participantIds.filter((id) => !htw.droppedIds.includes(id));
  const remaining = aliveIds.length;

  // Build player info map for display
  const playerMap: Record<string, GamePlayer> = {};
  for (const p of players) {
    playerMap[p.id] = p;
  }

  const winnerPlayer = htw.winnerId ? playerMap[htw.winnerId] : null;
  const humanDropped = humanId ? htw.droppedIds.includes(humanId) : false;
  const humanIsWinner = htw.winnerId === humanId;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="htw-root" data-testid="htw-root">
      {/* HUD */}
      <div className="htw-hud">
        <div className="htw-hud-stat">
          <span className="htw-hud-label">Elapsed</span>
          <span className="htw-hud-value" data-testid="htw-elapsed">
            {formatElapsed(elapsedMs)}
          </span>
        </div>
        <div className="htw-hud-stat">
          <span className="htw-hud-label">Remaining</span>
          <span className="htw-hud-value" data-testid="htw-remaining">
            {remaining}
          </span>
        </div>
      </div>

      {/* Participants */}
      <div className="htw-participants" data-testid="htw-participants">
        {htw.participantIds.map((id) => {
          const p = playerMap[id];
          if (!p) return null;
          const dropped = htw.droppedIds.includes(id);
          const isHuman = id === humanId;
          return (
            <div
              key={id}
              className={[
                'htw-participant',
                dropped ? 'htw-participant--dropped' : 'htw-participant--alive',
                isHuman ? 'htw-participant--human' : '',
                htw.winnerId === id ? 'htw-participant--winner' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-testid={`htw-participant-${id}`}
            >
              <img
                src={resolveAvatar(p)}
                alt={p.name}
                className="htw-participant-avatar"
                onError={(e) => handleAvatarError(e, p.name)}
              />
              <span className="htw-participant-name">{p.name}</span>
              {dropped && <span className="htw-participant-dropped-badge">💧</span>}
              {htw.winnerId === id && <span className="htw-participant-winner-badge">🏆</span>}
            </div>
          );
        })}
      </div>

      {/* Wall panel — only shown while human is still active */}
      {htw.status === 'active' && !humanDropped && (
        <div
          className={['htw-wall', isHolding ? 'htw-wall--holding' : ''].filter(Boolean).join(' ')}
          data-testid="htw-wall"
          role="button"
          aria-label="Hold the wall"
          aria-pressed={isHolding}
          onPointerDown={handleHoldStart}
          onPointerUp={handleHoldEnd}
          onPointerLeave={handleHoldEnd}
          onContextMenu={handleContextMenu}
        >
          <span className="htw-wall-icon">🧱</span>
          <span className="htw-wall-instruction">
            {isHolding ? 'HOLDING!' : 'PRESS & HOLD'}
          </span>
        </div>
      )}

      {/* Human dropped — spectator message */}
      {htw.status === 'active' && humanDropped && (
        <div className="htw-spectating" data-testid="htw-spectating">
          <p>You dropped! Watching {remaining} player{remaining !== 1 ? 's' : ''} remaining…</p>
        </div>
      )}

      {/* Game over screen */}
      {htw.status === 'complete' && (
        <div className="htw-complete" data-testid="htw-complete">
          <div className="htw-complete-trophy">🏆</div>
          <h2 className="htw-complete-title">
            {humanIsWinner ? 'You Won!' : `${winnerPlayer?.name ?? 'Unknown'} Wins!`}
          </h2>
          <p className="htw-complete-subtitle">
            Last player standing after {formatElapsed(elapsedMs)}
          </p>
          <p className="htw-complete-prize">
            {prizeType === 'HOH' ? '👑 Head of Household' : '🔑 Power of Veto'} awarded!
          </p>
        </div>
      )}
    </div>
  );
}
