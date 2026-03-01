/**
 * SpectatorView — fullscreen spectator mode overlay.
 *
 * Authoritative-first: subscribes to Redux game.hohId, the 'minigame:end'
 * CustomEvent, and window.game.__authoritativeWinner as fallbacks.
 *
 * Props:
 *   competitorIds   — player IDs competing (1–N)
 *   minigameId      — optional identifier for the competition
 *   variant         — visual style ('holdwall' | 'trivia' | 'maze')
 *   onDone          — called once the reveal animation completes
 *   showImmediately — skip the entry animation (default false)
 *   roundLabel      — e.g. "Final 3 · Part 3" shown in the HUD
 *   expectedWinnerId — pre-computed authoritative winner ID; the reveal always
 *                      matches this player (pass before opening the spectator).
 *   placement       — 'fullscreen' renders via portal to document.body (default);
 *                     'embed' renders inline in the current DOM node.
 */

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { openSpectator, closeSpectator } from '../../../store/gameSlice';
import { resolveAvatar } from '../../../utils/avatar';
import { useSpectatorSimulation } from './progressEngine';
import HoldWallVariant from './HoldWallVariant';
import TriviaVariant from './TriviaVariant';
import MazeVariant from './MazeVariant';
import './styles.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpectatorVariant = 'holdwall' | 'trivia' | 'maze';

export interface SpectatorViewProps {
  competitorIds: string[];
  minigameId?: string;
  variant?: SpectatorVariant;
  onDone?: () => void;
  showImmediately?: boolean;
  roundLabel?: string;
  /** Pre-known authoritative winner (e.g. from legacy adapter's winnerId). */
  initialWinnerId?: string;
  /**
   * Pre-computed authoritative winner ID resolved before the spectator opens.
   * Takes priority over initialWinnerId.  The reveal always matches this player.
   */
  expectedWinnerId?: string;
  /**
   * Render placement.  'fullscreen' (default) renders the overlay via portal
   * to document.body.  'embed' renders the overlay inline in the current DOM
   * node, suitable for the minigame panel in Final-3 parts.
   */
  placement?: 'fullscreen' | 'embed';
}

// ── Window type augmentation ──────────────────────────────────────────────────

declare global {
  interface Window {
    game?: {
      __authoritativeWinner?: string;
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VARIANT_LABELS: Record<SpectatorVariant, string> = {
  holdwall: 'Hold the Wall',
  trivia:   'Trivia Challenge',
  maze:     'Maze Run',
};

const VARIANT_ICONS: Record<SpectatorVariant, string> = {
  holdwall: '🧱',
  trivia:   '❓',
  maze:     '🌀',
};

const VARIANT_SIM_STATUS: Record<SpectatorVariant, string> = {
  holdwall: 'Simulating endurance…',
  trivia:   'Calculating scores…',
  maze:     'Generating maze paths…',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SpectatorView({
  competitorIds,
  minigameId,
  variant = 'holdwall',
  onDone,
  showImmediately = false,
  roundLabel = 'Final 3 · Part 3',
  initialWinnerId: propInitialWinnerId,
  expectedWinnerId: propExpectedWinnerId,
  placement = 'fullscreen',
}: SpectatorViewProps) {
  const dispatch = useAppDispatch();
  const players = useAppSelector((s) => s.game.players);
  const hohId   = useAppSelector((s) => s.game.hohId);

  // Sync onDone into a ref via effect (not during render) to satisfy the
  // react-hooks/refs lint rule while still keeping the callback fresh.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // ── Open / close spectator in Redux store ─────────────────────────────────
  // openSpectator blocks advance() while the overlay is mounted; closeSpectator
  // unblocks it.  closedRef tracks whether closeSpectator was already dispatched
  // via onReconciled so the cleanup does not issue a redundant second dispatch.
  // The parent (GameScreen) uses a `key` prop tied to competitorIds/minigameId,
  // so prop changes trigger a full remount — these values are stable per mount.

  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    if (import.meta.env.DEV) {
      console.log('[SpectatorView] mount — openSpectator', { competitorIds, minigameId, variant, placement });
    }
    dispatch(openSpectator({
      competitorIds,
      minigameId,
      variant,
      expectedWinnerId: propExpectedWinnerId ?? propInitialWinnerId ?? undefined,
      placement,
      startedAt: Date.now(),
    }));
    return () => {
      if (!closedRef.current) {
        if (import.meta.env.DEV) {
          console.log('[SpectatorView] unmount — closeSpectator (cleanup)');
        }
        dispatch(closeSpectator());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once — openSpectator records the mount-time snapshot

  // ── Resolve authoritative winner from multiple sources ────────────────────

  // Synchronous check at mount time only — window.game.__authoritativeWinner
  // is a legacy mutable global. Validated against competitorIds so a stale or
  // unrelated winner ID is ignored.
  const windowAuthWinner = useMemo<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const w = window.game?.__authoritativeWinner;
    if (w && competitorIds.includes(w)) return w;
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once at mount — this is synchronous detection only

  // hohId from Redux store — may be set before or after mount
  const reduxWinner = hohId && competitorIds.includes(hohId) ? hohId : null;

  // expectedWinnerId takes priority; falls back to initialWinnerId then other sources.
  const resolvedExpectedWinner =
    propExpectedWinnerId && competitorIds.includes(propExpectedWinnerId)
      ? propExpectedWinnerId
      : propInitialWinnerId && competitorIds.includes(propInitialWinnerId)
      ? propInitialWinnerId
      : null;

  const initialWinner = windowAuthWinner ?? reduxWinner ?? resolvedExpectedWinner ?? null;

  // ── Simulation hook ───────────────────────────────────────────────────────

  const { state: simState, setAuthoritativeWinner, skip } = useSpectatorSimulation({
    competitorIds,
    initialWinnerId: initialWinner ?? undefined,
    onReconciled: useCallback((winnerId: string) => {
      if (import.meta.env.DEV) {
        console.log('[SpectatorView] reveal complete — closeSpectator, onDone', { winnerId });
      }
      closedRef.current = true;
      dispatch(closeSpectator());
      onDoneRef.current?.();
    }, [dispatch]),
  });

  // Capture competitorIds in a ref so event handlers always see the current
  // list without needing to re-register on every render.
  const competitorIdsRef = useRef(competitorIds);
  useEffect(() => {
    competitorIdsRef.current = competitorIds;
  }, [competitorIds]);

  // ── Listen for Redux hohId arriving after mount ───────────────────────────

  useEffect(() => {
    if (reduxWinner) {
      setAuthoritativeWinner(reduxWinner);
    }
  }, [reduxWinner, setAuthoritativeWinner]);

  // ── Listen for 'minigame:end' CustomEvent ─────────────────────────────────
  // setAuthoritativeWinner is idempotent (no-op if already locked), so no
  // need to gate on simState.phase — removing the phase dependency avoids
  // the listener being torn down and re-registered on every phase transition.

  useEffect(() => {
    function handleMinigameEnd(e: Event) {
      const detail = (e as CustomEvent<{ winnerId?: string; winner?: string }>).detail;
      const wid = detail?.winnerId ?? detail?.winner;
      // Only accept a winner that is one of the known competitors.
      if (!wid || !competitorIdsRef.current.includes(wid)) return;
      setAuthoritativeWinner(wid);
    }
    window.addEventListener('minigame:end', handleMinigameEnd);
    return () => window.removeEventListener('minigame:end', handleMinigameEnd);
  }, [setAuthoritativeWinner]); // setAuthoritativeWinner is stable

  // ── Listen for legacy 'spectator:show' (optional winnerId in detail) ──────

  useEffect(() => {
    function handleSpectatorShow(e: Event) {
      const detail = (e as CustomEvent<{ winnerId?: string }>).detail;
      const wid = detail?.winnerId;
      if (!wid || !competitorIdsRef.current.includes(wid)) return;
      setAuthoritativeWinner(wid);
    }
    window.addEventListener('spectator:show', handleSpectatorShow);
    return () => window.removeEventListener('spectator:show', handleSpectatorShow);
  }, [setAuthoritativeWinner]); // setAuthoritativeWinner is stable

  // ── Keyboard support — Space / Enter to skip to results ──────────────────
  // Available immediately; delegates to skip() which is now always active.

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[SpectatorView] runPhase start', { variant, placement });
    }
    function handleKey(e: KeyboardEvent) {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      if (import.meta.env.DEV) {
        console.log('[SpectatorView] skip via keyboard', e.code);
      }
      skip();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [variant, placement, skip]);

  // ── Avatar + name helpers ─────────────────────────────────────────────────

  const getPlayerName = useCallback(
    (id: string | undefined) => {
      if (!id) return 'Unknown';
      return players.find((p) => p.id === id)?.name ?? id;
    },
    [players],
  );

  const resolveAvatarForId = useCallback(
    (id: string) => {
      const player = players.find((p) => p.id === id);
      if (player) return resolveAvatar(player);
      // Dicebear fallback — version pinned for stable avatar appearance.
      return `https://api.dicebear.com/7.0/pixel-art/svg?seed=${encodeURIComponent(id)}`;
    },
    [players],
  );

  // ── Determine status label ────────────────────────────────────────────────

  const winnerName = simState.authoritativeWinnerId
    ? getPlayerName(simState.authoritativeWinnerId)
    : 'Winner';

  const statusLabel =
    simState.phase === 'revealed'
      ? `${winnerName} wins!`
      : simState.phase === 'reconciling'
      ? 'Revealing winner…'
      : VARIANT_SIM_STATUS[variant];

  // ── HUD timer text ────────────────────────────────────────────────────────

  const hudTimerText = simState.phase === 'simulating'
    ? simState.simPct >= 90
      ? 'Reveal soon…'
      : `Sim ${simState.simPct}%`
    : simState.phase === 'reconciling'
    ? 'Revealing…'
    : '';

  const hudPillLabel = simState.phase === 'simulating'
    ? 'Simulating'
    : simState.phase === 'reconciling'
    ? 'Reveal'
    : 'Result';

  // ── Render via portal ─────────────────────────────────────────────────────

  const overlay = (
    <div
      className={`spectator-overlay${showImmediately ? ' spectator-overlay--immediate' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Spectator Mode: ${VARIANT_LABELS[variant]}`}
      data-phase={simState.phase}
      data-minigame-id={minigameId}
    >
      {/* Animated backdrop */}
      <div className="spectator-overlay__backdrop" aria-hidden="true" />

      {/* Broadcast HUD bar */}
      <div className="spectator-hud" aria-hidden="true">
        <div className="spectator-hud__left">
          <span className="spectator-hud__icon">{VARIANT_ICONS[variant]}</span>
          <div>
            <div className="spectator-hud__now-playing">Now Playing</div>
            <div className="spectator-hud__round">{roundLabel}</div>
          </div>
        </div>
        <div className="spectator-hud__right">
          <span className={`spectator-hud__pill spectator-hud__pill--${simState.phase}`}>
            <span className="spectator-hud__pill-dot" />
            {hudPillLabel}
          </span>
          {hudTimerText && (
            <span className="spectator-hud__timer">{hudTimerText}</span>
          )}
        </div>
      </div>

      {/* Content card */}
      <div className="spectator-overlay__card">
        {/* Header */}
        <header className="spectator-overlay__header">
          <div className="spectator-overlay__header-row">
            <h2 className="spectator-overlay__title">
              {VARIANT_ICONS[variant]} {VARIANT_LABELS[variant]}
            </h2>
            <span className={`spectator-overlay__status-chip spectator-overlay__status-chip--${simState.phase}`}>
              {hudPillLabel}
            </span>
          </div>
          <p
            className="spectator-overlay__status"
            aria-live="polite"
            aria-atomic="true"
          >
            {statusLabel}
          </p>
        </header>

        {/* Competitor chips (cast row) */}
        <div className="spectator-overlay__competitors" aria-label="Competitors">
          {simState.competitors.map((c) => (
            <div
              key={c.id}
              className={`spectator-overlay__chip${c.isWinner ? ' spectator-overlay__chip--winner' : ''}`}
            >
              <img
                src={resolveAvatarForId(c.id)}
                alt={getPlayerName(c.id)}
                className="spectator-overlay__chip-avatar"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <span className="spectator-overlay__chip-name">
                {getPlayerName(c.id)}
              </span>
              {c.isWinner && (
                <span className="spectator-overlay__chip-crown" aria-label="winner">
                  👑
                </span>
              )}
              {simState.phase === 'simulating' && !c.isWinner && (
                <span className="sv-thinking-dots" aria-hidden="true">
                  <span className="sv-thinking-dot" />
                  <span className="sv-thinking-dot" />
                  <span className="sv-thinking-dot" />
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Variant-specific visualization */}
        {variant === 'holdwall' && (
          <HoldWallVariant
            competitors={simState.competitors}
            phase={simState.phase}
            resolveAvatar={resolveAvatarForId}
            getPlayerName={getPlayerName}
          />
        )}
        {variant === 'trivia' && (
          <TriviaVariant
            competitors={simState.competitors}
            phase={simState.phase}
            simPct={simState.simPct}
            resolveAvatar={resolveAvatarForId}
            getPlayerName={getPlayerName}
          />
        )}
        {variant === 'maze' && (
          <MazeVariant
            competitors={simState.competitors}
            phase={simState.phase}
            resolveAvatar={resolveAvatarForId}
            getPlayerName={getPlayerName}
          />
        )}

        {/* Skip button — always enabled (skip is available immediately) */}
        <div className="spectator-overlay__skip-row">
          <button
            className="spectator-overlay__skip-btn"
            onClick={() => {
              if (import.meta.env.DEV) {
                console.log('[SpectatorView] skip via button click');
              }
              skip();
            }}
            aria-label="Skip to results"
            type="button"
          >
            Skip to Results
          </button>
        </div>
      </div>
    </div>
  );

  // For embed placement, render inline (no portal).
  if (placement === 'embed') {
    return overlay;
  }

  return createPortal(overlay, document.body);
}

