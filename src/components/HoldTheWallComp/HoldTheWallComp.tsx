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
import { mulberry32 } from '../../store/rng';
import './HoldTheWallComp.css';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal participant shape accepted via props (mirrors MinigameParticipant). */
interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
}

interface Props {
  participantIds: string[];
  /** Optional rich participant info (name, isHuman). Used as a fallback when
   * the player is not found in the Redux store (e.g. GameDebug). */
  participants?: ParticipantProp[];
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

// ─── Narration lines ──────────────────────────────────────────────────────────

const NARRATION = {
  start: [
    "Alright houseguests — grip that wall like your life depends on it! 💪",
    "Welcome to the wall of pain. Hope you all had a good breakfast! 🏋️",
    "Let's see who has the strength… and who has the noodle arms! 🍝",
  ],
  holding: [
    "You're doing great! Your arms definitely won't regret this tomorrow… 😅",
    "Look at you, still hanging on! Literally! 🤩",
    "The wall loves you… the wall won't let you go… 👻",
    "Impressive grip strength. Have you been opening jars? 🫙",
    "Everybody is still holding on — production is NOT happy! 😤",
    "The crowd is on the edge of their seats right now! 🎤",
  ],
  someone_dropped: [
    "{name} has hit the ground! That's gonna leave a mark! 💥",
    "{name} is out! Don't worry, we have ice packs! 🧊",
    "{name} couldn't hold on — the wall claims another victim! 😱",
    "There goes {name}! Gravity: 1, Houseguest: 0! 🪂",
    "{name} drops! The competition just got tighter! 🔥",
  ],
  final_two: [
    "We're down to TWO! This is getting intense! 🔥",
    "Mano a mano! Who wants it more?! 💪",
    "Two houseguests, one wall, zero mercy! 😤",
  ],
  victory: [
    "WE HAVE A WINNER! What an incredible performance! 🏆",
    "VICTORY! Your arms may be dead but your spirit is alive! 🎉",
    "CHAMPION! You've conquered the wall! 👑",
  ],
  loss: [
    "And you're down! Great effort though! 💔",
    "Gravity wins this round! Better luck next time! 🌍",
    "The wall claims another victim! At least you tried! 😢",
  ],
};

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

/** Pick a random line from an array using a seeded RNG at a given step. */
function pickLine(lines: string[], rng: () => number): string {
  return lines[Math.floor(rng() * lines.length)];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HoldTheWallComp({
  participantIds,
  participants: participantsProp,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const htw = useAppSelector(
    (s: RootState) => (s as RootState & { holdTheWall: HoldTheWallState }).holdTheWall,
  );
  const storePlayers = useAppSelector(
    (s: RootState) =>
      (s as RootState & { game: { players: GamePlayer[] } }).game?.players ?? [],
  );

  // Build a merged player map: Redux store data takes priority (has real avatars);
  // fall back to prop data so the component works in GameDebug / test contexts.
  const playerMap: Record<string, { id: string; name: string; avatar: string; isUser: boolean }> = {};
  // Seed from props first (lowest priority)
  if (participantsProp) {
    for (const p of participantsProp) {
      playerMap[p.id] = {
        id: p.id,
        name: p.name,
        avatar: getDicebear(p.name),
        isUser: p.isHuman,
      };
    }
  }
  // Then overlay with real store data (higher priority — has proper avatars)
  for (const p of storePlayers) {
    playerMap[p.id] = {
      id: p.id,
      name: p.name,
      avatar: resolveAvatar(p),
      isUser: !!p.isUser,
    };
  }

  // Local UI state
  const [isHolding, setIsHolding] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [narrativeMsg, setNarrativeMsg] = useState('Get ready to hold on for dear life…');
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const humanDroppedRef = useRef(false);
  // Seeded RNG for narrative — advanced per message so each pick is different
  const rngRef = useRef<(() => number) | null>(null);
  const prevDropCountRef = useRef(0);

  // Derived helpers
  const humanPlayer = Object.values(playerMap).find((p) => p.isUser);
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

  // ── Resolve outcome when game completes ──────────────────────────────────
  useEffect(() => {
    if (htw.status !== 'complete' || htw.outcomeResolved) return;
    dispatch(resolveHoldTheWallOutcome());
  }, [htw.status, htw.outcomeResolved, dispatch]);

  // ── Notify parent after a short delay so the winner screen is visible ─────
  useEffect(() => {
    if (htw.status !== 'complete') return;
    const t = window.setTimeout(() => onComplete?.(), 5000);
    return () => window.clearTimeout(t);
  }, [htw.status, onComplete]);

  // ── Narration: start message + periodic holding updates ───────────────────
  useEffect(() => {
    if (htw.status !== 'active') return;
    // Initialise the seeded RNG on first activation (offset by 999 so it's
    // independent from the AI-drop schedule which starts at seed directly).
    rngRef.current = mulberry32(seed ^ 0xdeadbeef);
    setNarrativeMsg(pickLine(NARRATION.start, rngRef.current));

    // Schedule periodic "still holding" updates (8–15 s between messages)
    const intervals: ReturnType<typeof window.setTimeout>[] = [];
    let nextDelay = 8000 + Math.floor((rngRef.current?.() ?? 0.5) * 7000);
    function scheduleNext() {
      const rng = rngRef.current!;
      const t = window.setTimeout(() => {
        setNarrativeMsg(pickLine(NARRATION.holding, rng));
        nextDelay = 8000 + Math.floor(rng() * 7000);
        scheduleNext();
      }, nextDelay);
      intervals.push(t);
    }
    scheduleNext();

    return () => {
      intervals.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htw.status]);

  // ── Narration: player drop events ─────────────────────────────────────────
  useEffect(() => {
    if (htw.status !== 'active') return;
    const newDropCount = htw.droppedIds.length;
    if (newDropCount <= prevDropCountRef.current) return;

    const rng = rngRef.current ?? mulberry32(seed ^ 0xc0ffee);
    // Detect the newly dropped player (last entry in droppedIds)
    const droppedId = htw.droppedIds[newDropCount - 1];
    const droppedPlayer = droppedId ? playerMap[droppedId] : null;
    const aliveNow = htw.participantIds.filter((id) => !htw.droppedIds.includes(id));

    if (aliveNow.length === 2) {
      setNarrativeMsg(pickLine(NARRATION.final_two, rng));
    } else if (droppedPlayer) {
      const template = pickLine(NARRATION.someone_dropped, rng);
      setNarrativeMsg(template.replace('{name}', droppedPlayer.name));
    }
    prevDropCountRef.current = newDropCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htw.droppedIds]);

  // ── Narration: game complete ───────────────────────────────────────────────
  useEffect(() => {
    if (htw.status !== 'complete') return;
    const rng = rngRef.current ?? mulberry32(seed ^ 0xfacade);
    if (htw.winnerId === humanId) {
      setNarrativeMsg(pickLine(NARRATION.victory, rng));
    } else {
      setNarrativeMsg(pickLine(NARRATION.loss, rng));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htw.status]);

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
          // Fallback: show placeholder with id if player data unavailable
          const name = p?.name ?? id;
          const avatarSrc = p?.avatar ?? getDicebear(id);
          const isHuman = p?.isUser ?? (id === humanId);
          const dropped = htw.droppedIds.includes(id);
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
                src={avatarSrc}
                alt={name}
                className="htw-participant-avatar"
                onError={(e) => handleAvatarError(e, name)}
              />
              <span className="htw-participant-name">{name}</span>
              {dropped && <span className="htw-participant-dropped-badge">💧</span>}
              {htw.winnerId === id && <span className="htw-participant-winner-badge">🏆</span>}
            </div>
          );
        })}
      </div>

      {/* Narration box */}
      <div className="htw-narrative" data-testid="htw-narrative">
        <span className="htw-narrative-icon">📢</span>
        <span className="htw-narrative-text">{narrativeMsg}</span>
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
