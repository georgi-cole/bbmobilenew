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
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
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
import { HoldTheWallGameController } from '../../games/hold-the-wall/GameController';
import { useHoldTheWallEffects } from '../../ui/games/HoldTheWall/hooks/useHoldTheWallEffects';
import { EffectsScheduler } from '../../ui/games/HoldTheWall/effects/EffectsScheduler';
import EffectsOverlay from '../../ui/games/HoldTheWall/effects/EffectsOverlay';
import Hourglass from '../../ui/games/HoldTheWall/Hourglass';
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
    "Alright players — grip that wall like your life depends on it! 💪",
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
    "There goes {name}! Gravity: 1, Housemate: 0! 🪂",
    "{name} drops! The competition just got tighter! 🔥",
  ],
  final_two: [
    "We're down to TWO! This is getting intense! 🔥",
    "Mano a mano! Who wants it more?! 💪",
    "Two players, one wall, zero mercy! 😤",
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

// ─── Timing & seed constants ──────────────────────────────────────────────────

/** How long the winner screen stays visible before MinigameHost dismisses it. */
const WINNER_SCREEN_DURATION_MS = 5000;
const SPECTATOR_FAST_FORWARD_SPEED = 2;

/** Minimum ms between periodic "still holding" narration messages. */
const MIN_NARRATION_INTERVAL_MS = 8000;

/** Extra random ms added on top of MIN_NARRATION_INTERVAL_MS (0–this value). */
const NARRATION_INTERVAL_RANGE_MS = 7000;

/**
 * XOR offsets applied to `seed` when creating RNG instances for different
 * narration contexts. Each narration effect gets its own independent RNG stream
 * so messages don't correlate across contexts.
 */
const NARRATION_SEED_OFFSET   = 0xdeadbeef; // start + holding messages
const DROP_EVENT_SEED_OFFSET  = 0xc0ffee;   // player-drop narration fallback
const COMPLETE_SEED_OFFSET    = 0xfacade;   // winner/loss narration

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
  const [fastForward, setFastForward] = useState(false);
  // Track round start for the complete screen "last player standing after Xs" message
  const [roundStartKey, setRoundStartKey] = useState(0);
  const [narrativeMsg, setNarrativeMsg] = useState('Get ready to hold on for dear life…');
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const humanDroppedRef = useRef(false);
  // Seeded RNG for narrative — advanced per message so each pick is different
  const rngRef = useRef<(() => number) | null>(null);
  const prevDropCountRef = useRef(0);

  // GameController for server-authoritative effects + 2-second hold rule
  const controllerRef = useRef<HoldTheWallGameController | null>(null);
  // The ref is used by pointer handlers; state makes the effects hook subscribe
  // after the controller is created (a ref assignment alone does not re-render).
  const [controller, setController] = useState<HoldTheWallGameController | null>(null);

  // Derived helpers
  const humanPlayer = Object.values(playerMap).find((p) => p.isUser);
  const humanId: string | null = humanPlayer?.id ?? null;

  // ── Effects hook — subscribes to controller events ────────────────────────
  const { activeEffects, isAutoDropped } = useHoldTheWallEffects(
    controller,
    humanId,
  );

  // Pressure is the arena's readable endurance system. Time is the baseline;
  // weather and production shocks add temporary load. It accelerates the
  // existing rival drop schedule at tier boundaries, without making a fake
  // phone call or a cosmetic effect secretly drop the human player.
  const effectPressure =
    ('rain' in activeEffects ? 8 : 0) +
    ('wind' in activeEffects ? 12 : 0) +
    ('paint' in activeEffects ? 5 : 0) +
    ('vibrate' in activeEffects ? 16 : 0) +
    ('sound' in activeEffects ? 4 : 0);
  const pressurePercent = Math.min(100, Math.max(8, Math.round((elapsedMs / 55_000) * 100) + effectPressure));
  const pressureTier = pressurePercent >= 78 ? 'critical' : pressurePercent >= 55 ? 'high' : pressurePercent >= 30 ? 'rising' : 'steady';
  const pressureState = pressureTier === 'critical' ? 'danger' : pressureTier === 'steady' ? 'steady' : 'strain';
  const pressureSpeed = pressureTier === 'critical' ? '38%' : pressureTier === 'high' ? '20%' : pressureTier === 'rising' ? '8%' : 'normal';
  const activeEffectClasses = [
    'wind', 'rain', 'paint', 'vibrate', 'sound',
  ].filter((effect) => effect in activeEffects).map((effect) => `htw-effects--${effect}`);

  // ── Initialise competition on mount ──────────────────────────────────────
  useEffect(() => {
    // Create a stable GameController for this game session (pass seed so
    // scheduler options are accessible if needed externally).
    const ctrl = new HoldTheWallGameController(`htw-${seed}`, { seed, intensity: 1 });
    controllerRef.current = ctrl;
    setController(ctrl);

    dispatch(
      startHoldTheWall({
        participantIds,
        humanId,
        prizeType,
        seed,
      }),
    );
    return () => {
      ctrl.destroy();
      controllerRef.current = null;
      setController(null);
      dispatch(resetHoldTheWall());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start round state + 2-second hold rule when game becomes active ──
  useEffect(() => {
    if (htw.status !== 'active') return;

    startTimeRef.current = Date.now();
    setFastForward(false);
    // Increment roundStartKey to restart the Hourglass animation on each new round
    setRoundStartKey((k) => k + 1);

    // Start the 2-second initial-hold enforcement rule (server-authoritative)
    let unsubElim: (() => void) | undefined;
    if (controllerRef.current && humanId) {
      const ctrl = controllerRef.current;
      ctrl.startRound(humanId);

      // When the controller fires PLAYER_ELIMINATED (no_initial_hold),
      // dispatch the drop so the Redux store reflects the authoritative result.
      unsubElim = ctrl.on('PLAYER_ELIMINATED', (payload) => {
        if (payload.reason === 'no_initial_hold' && payload.playerId === humanId) {
          humanDroppedRef.current = true;
          dispatch(dropPlayer(humanId));
        }
      });
    }

    // Start auto-scheduling randomised distraction effects for this round.
    // A new EffectsScheduler is created here using the controller that was
    // created on mount — the controllerRef is stable for the component lifetime.
    let effectsScheduler: EffectsScheduler | null = null;
    if (controllerRef.current) {
      effectsScheduler = new EffectsScheduler(controllerRef.current, seed, 1);
      effectsScheduler.start();
    }

    return () => {
      unsubElim?.();
      effectsScheduler?.destroy();
      controllerRef.current?.endRound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htw.status]);

  // ── Schedule AI drops; pressure shortens the remaining endurance window ──
  // This only changes rival endurance. The human rule stays deliberately simple:
  // press and keep holding the wall. A fake call remains distraction-only.
  useEffect(() => {
    if (htw.status !== 'active') return;

    const startTime = startTimeRef.current ?? Date.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = startTime;
    }

    const elapsed = Date.now() - startTime;
    const humanDroppedForSpeed = humanId ? htw.droppedIds.includes(humanId) : false;
    const timerSpeed =
      fastForward && humanDroppedForSpeed ? SPECTATOR_FAST_FORWARD_SPEED : 1;
    const pressureSpeed = pressureTier === 'critical' ? 1.38 : pressureTier === 'high' ? 1.2 : pressureTier === 'rising' ? 1.08 : 1;

    const timeouts = Object.entries(htw.aiDropSchedule)
      .filter(([id]) => !htw.droppedIds.includes(id))
      .map(([id, dropAtMs]) =>
        window.setTimeout(() => {
          dispatch(dropPlayer(id));
        }, Math.max(0, (dropAtMs - elapsed) / (timerSpeed * pressureSpeed))),
      );

    return () => {
      timeouts.forEach((t) => window.clearTimeout(t));
    };
  }, [dispatch, fastForward, htw.aiDropSchedule, htw.droppedIds, htw.status, humanId, pressureTier]);

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
    const t = window.setTimeout(() => onComplete?.(), WINNER_SCREEN_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [htw.status, onComplete]);

  // ── Narration: start message + periodic holding updates ───────────────────
  useEffect(() => {
    if (htw.status !== 'active') return;
    // Initialise the seeded RNG on first activation (offset by 999 so it's
    // independent from the AI-drop schedule which starts at seed directly).
    rngRef.current = mulberry32(seed ^ NARRATION_SEED_OFFSET);
    setNarrativeMsg(pickLine(NARRATION.start, rngRef.current));

    // Schedule periodic "still holding" updates (8–15 s between messages)
    const intervals: ReturnType<typeof window.setTimeout>[] = [];
    let nextDelay = MIN_NARRATION_INTERVAL_MS + Math.floor((rngRef.current?.() ?? 0.5) * NARRATION_INTERVAL_RANGE_MS);
    function scheduleNext() {
      const rng = rngRef.current!;
      const t = window.setTimeout(() => {
        setNarrativeMsg(pickLine(NARRATION.holding, rng));
        nextDelay = MIN_NARRATION_INTERVAL_MS + Math.floor(rng() * NARRATION_INTERVAL_RANGE_MS);
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

    const rng = rngRef.current ?? mulberry32(seed ^ DROP_EVENT_SEED_OFFSET);
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
    const rng = rngRef.current ?? mulberry32(seed ^ COMPLETE_SEED_OFFSET);
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
      // Notify the controller — cancels the 2-second auto-drop timer
      controllerRef.current?.onPlayerHoldStart();
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
  const canHoldWall = htw.status === 'active' && !humanDropped;
  const fastForwardActive = htw.status === 'active' && humanDropped && fastForward;
  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={['htw-root', `htw-root--${pressureState}`, ...activeEffectClasses].filter(Boolean).join(' ')}
      data-testid="htw-root"
      data-pressure={pressureState}
      style={{ position: 'relative' }}
    >
      {/* Distraction effects overlay (non-blocking visuals) */}
      <EffectsOverlay
        activeEffects={activeEffects}
        onDismissFakeCall={() => controllerRef.current?.emitEffectStop('fakeCall')}
      />

      {/* HUD */}
      <div className="htw-hud">
        <div className="htw-hud-stat">
          <div className="htw-hud-timer-row">
            <Hourglass
              key={roundStartKey}
              cycleDurationMs={7000}
              running={htw.status === 'active'}
            />
            {htw.status === 'active' && humanDropped && (
              <button
                type="button"
                className="htw-fast-forward"
                onClick={() => setFastForward(true)}
                disabled={fastForwardActive}
                aria-label={fastForwardActive ? 'Fast-forward 2x active' : 'Fast-forward 2x'}
                aria-pressed={fastForwardActive}
                title={fastForwardActive ? '2x speed active' : 'Fast-forward 2x'}
              >
                <span aria-hidden="true">⏩</span>
                <span>2×</span>
              </button>
            )}
          </div>
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

      {/* Wall panel — expands to fill remaining space and stays visible while spectating */}
      {htw.status === 'active' && (
        <div
          className={[
            'htw-wall',
            'htw-wall--expanded',
            isHolding ? 'htw-wall--holding' : '',
            !canHoldWall ? 'htw-wall--spectator' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="htw-wall"
          role={canHoldWall ? 'button' : 'img'}
          aria-label={canHoldWall ? `Hold the wall. Pressure ${pressurePercent}%. Rival fatigue is ${pressureSpeed}.` : 'Wall still in play'}
          aria-pressed={canHoldWall ? isHolding : undefined}
          onPointerDown={canHoldWall ? handleHoldStart : undefined}
          onPointerUp={canHoldWall ? handleHoldEnd : undefined}
          onPointerLeave={canHoldWall ? handleHoldEnd : undefined}
          onContextMenu={handleContextMenu}
        >
          <div className="htw-wall__arena-glow" aria-hidden="true" />
          <div className="htw-wall__floodlights" aria-hidden="true"><span /><span /></div>
          <div className="htw-wall__pressure" aria-label={`Wall pressure ${pressurePercent}%`}>
            <div className="htw-wall__pressure-copy">
              <span>Wall pressure</span>
              <strong>{pressureState === 'danger' ? 'CRITICAL' : pressureState === 'strain' ? 'RISING' : 'STABLE'}</strong>
            </div>
            <div className="htw-wall__pressure-track" aria-hidden="true"><span style={{ width: `${pressurePercent}%` }} /></div>
            <span className="htw-wall__pressure-impact">Rival fatigue: {pressureSpeed}</span>
          </div>
          <div className="htw-wall__grip-field" aria-hidden="true">
            {aliveIds.map((id, index) => {
              const player = playerMap[id];
              const isHumanGrip = id === humanId;
              return (
                <span
                  key={id}
                  className={['htw-wall__grip', isHumanGrip ? 'htw-wall__grip--human' : 'htw-wall__grip--rival', isHolding && isHumanGrip ? 'is-holding' : ''].filter(Boolean).join(' ')}
                  style={{ '--grip-index': index, '--grip-row': index % 2 } as CSSProperties}
                >
                  <span className="htw-wall__grip-hand">{isHumanGrip ? '✋' : '●'}</span>
                  <span className="htw-wall__grip-name">{player?.name ?? `AI ${index}`}</span>
                </span>
              );
            })}
          </div>
          <div className="htw-wall__hold-zone">
            <span className="htw-wall__hold-icon" aria-hidden="true">✋</span>
            <span className="htw-wall__hold-label">{canHoldWall ? (isHolding ? 'YOU ARE HOLDING' : 'PRESS & HOLD YOUR GRIP') : 'SPECTATING THE WALL'}</span>
            <span className="htw-wall__hold-copy">{canHoldWall ? 'Hold steady — shocks push rivals closer to the edge.' : `${remaining} still fighting.`}</span>
          </div>
        </div>
      )}

      {/* Human dropped — spectator message */}
      {htw.status === 'active' && humanDropped && (
        <div className="htw-spectating" data-testid="htw-spectating">
          <p>You dropped! Watching {remaining} player{remaining !== 1 ? 's' : ''} remaining…</p>
          {/* Auto-drop feedback: shown when eliminated by the 2-second rule */}
          {isAutoDropped && (
            <p className="htw-auto-drop-notice" data-testid="htw-auto-drop-notice">
              ⏱ Eliminated: you didn't press hold within 2 seconds of round start.
            </p>
          )}
        </div>
      )}

      {/* Auto-drop banner overlay (shown briefly when first eliminated) */}
      {isAutoDropped && humanDropped && (
        <div className="htw-auto-drop-banner" data-testid="htw-auto-drop-banner">
          ⏱ Too slow — auto-eliminated!
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
            {prizeType === 'LOH' ? '👑 Leader of the House' : '🔑 Power of Safety'} awarded!
          </p>
        </div>
      )}
    </div>
  );
}
