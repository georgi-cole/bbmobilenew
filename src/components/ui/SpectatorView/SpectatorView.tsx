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
 */

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppSelector } from '../../../store/hooks';
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function SpectatorView({
  competitorIds,
  minigameId,
  variant = 'holdwall',
  onDone,
  showImmediately = false,
}: SpectatorViewProps) {
  const players = useAppSelector((s) => s.game.players);
  const hohId   = useAppSelector((s) => s.game.hohId);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // ── Resolve authoritative winner from multiple sources ────────────────────

  // Check window.game.__authoritativeWinner eagerly (synchronous legacy path)
  const windowAuthWinner = useMemo<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const w = window.game?.__authoritativeWinner;
    if (w && competitorIds.includes(w)) return w;
    return null;
  }, [competitorIds]);

  // hohId from Redux store — may be set before or after mount
  const reduxWinner = hohId && competitorIds.includes(hohId) ? hohId : null;

  const initialWinner = windowAuthWinner ?? reduxWinner ?? null;

  // ── Simulation hook ───────────────────────────────────────────────────────

  const { state: simState, setAuthoritativeWinner } = useSpectatorSimulation({
    competitorIds,
    initialWinnerId: initialWinner ?? undefined,
    onReconciled: useCallback((winnerId: string) => {
      if (import.meta.env.DEV) {
        console.log('[SpectatorView] Authoritative winner revealed:', winnerId);
      }
      onDoneRef.current?.();
    }, []),
  });

  // ── Listen for Redux hohId arriving after mount ───────────────────────────

  useEffect(() => {
    if (reduxWinner && simState.phase === 'simulating') {
      setAuthoritativeWinner(reduxWinner);
    }
  }, [reduxWinner, simState.phase, setAuthoritativeWinner]);

  // ── Listen for 'minigame:end' CustomEvent ─────────────────────────────────

  useEffect(() => {
    function handleMinigameEnd(e: Event) {
      const detail = (e as CustomEvent<{ winnerId?: string; winner?: string }>).detail;
      const wid = detail?.winnerId ?? detail?.winner;
      if (!wid) return;
      if (simState.phase === 'simulating') {
        setAuthoritativeWinner(wid);
      }
    }
    window.addEventListener('minigame:end', handleMinigameEnd);
    return () => window.removeEventListener('minigame:end', handleMinigameEnd);
  }, [simState.phase, setAuthoritativeWinner]);

  // ── Listen for legacy 'spectator:show' (for completeness / secondary show) ─

  useEffect(() => {
    function handleSpectatorShow(e: Event) {
      const detail = (e as CustomEvent<{ winnerId?: string }>).detail;
      const wid = detail?.winnerId;
      if (!wid) return;
      if (simState.phase === 'simulating') {
        setAuthoritativeWinner(wid);
      }
    }
    window.addEventListener('spectator:show', handleSpectatorShow);
    return () => window.removeEventListener('spectator:show', handleSpectatorShow);
  }, [simState.phase, setAuthoritativeWinner]);

  // ── Keyboard support — Space / Enter to skip to results ──────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        // Resolve to winner immediately if known, otherwise fallback
        const winner =
          simState.authoritativeWinnerId ??
          window.game?.__authoritativeWinner ??
          competitorIds[0];
        if (winner) {
          setAuthoritativeWinner(winner);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [simState.authoritativeWinnerId, competitorIds, setAuthoritativeWinner]);

  // ── Avatar + name helpers ─────────────────────────────────────────────────

  const getPlayerName = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? id,
    [players],
  );

  const resolveAvatarForId = useCallback(
    (id: string) => {
      const player = players.find((p) => p.id === id);
      if (player) return resolveAvatar(player);
      // Dicebear fallback
      return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(id)}`;
    },
    [players],
  );

  // ── Determine status label ────────────────────────────────────────────────

  const statusLabel =
    simState.phase === 'revealed'
      ? `${getPlayerName(simState.authoritativeWinnerId ?? '')} wins!`
      : simState.phase === 'reconciling'
      ? 'Revealing winner…'
      : 'Competition in progress…';

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
      {/* Backdrop */}
      <div className="spectator-overlay__backdrop" aria-hidden="true" />

      {/* Content card */}
      <div className="spectator-overlay__card">
        {/* Header */}
        <header className="spectator-overlay__header">
          <h2 className="spectator-overlay__title">
            {VARIANT_LABELS[variant]}
          </h2>
          <p
            className="spectator-overlay__status"
            aria-live="polite"
            aria-atomic="true"
          >
            {statusLabel}
          </p>
        </header>

        {/* Competitor chips */}
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

        {/* Skip hint */}
        {simState.phase === 'simulating' && (
          <p className="spectator-overlay__skip-hint" aria-hidden="true">
            Press Space / Enter to skip to results
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
