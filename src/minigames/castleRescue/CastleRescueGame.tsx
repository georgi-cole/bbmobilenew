/**
 * CastleRescueGame.tsx
 *
 * React component for the Castle Rescue minigame.
 *
 * Game flow:
 *  1. Component mounts in 'idle' state.
 *  2. User clicks "Start" — a map is generated from the provided seed and
 *     the run begins.
 *  3. User clicks pipe cells to trace a route from source (green) to sink (red).
 *     - Adjacent valid pipe cells are highlighted in yellow.
 *     - Correctly selected pipes turn blue.
 *     - Wrong clicks reset the selection and deduct RESPAWN_PENALTY.
 *  4. When all three route pipes are selected the run completes automatically.
 *     A countdown timer auto-finalises the run if the player times out.
 *  5. On completion, onFinish(score) is called with the final integer score.
 *
 * Prop contract:
 *  - seed (number) — competition seed, must be deterministic (no Date.now).
 *  - timeLimitMs (number, optional) — override default 60-second time limit.
 *  - onFinish ((score: number) => void, optional) — called once on completion.
 *  - autoStart (boolean, optional) — start immediately on mount (default false).
 */

import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { castleRescueReducer } from './castleRescueReducer';
import { createInitialRunState } from './castleRescueEngine';
import { generateMapForSeed } from './castleRescueGenerator';
import { selectClickablePipeIds, selectStatusSummary } from './castleRescueSelectors';
import { TIME_LIMIT_MS } from './castleRescueConstants';
import type { CellPos } from './castleRescueTypes';

// ─── Prop types ───────────────────────────────────────────────────────────────

interface CastleRescueGameProps {
  /** Deterministic competition seed. Must not derive from Date.now/Math.random. */
  seed?: number;
  /** Optional time-limit override in milliseconds. Default: 60 000. */
  timeLimitMs?: number;
  /**
   * Called exactly once when the run completes (whether by success or timeout).
   * Receives the final integer score.
   */
  onFinish?: (score: number) => void;
  /** If true the game starts automatically on mount (skips the Start button). */
  autoStart?: boolean;
}

// ─── Cell rendering helpers ───────────────────────────────────────────────────

const CELL_SIZE = 64; // px

/** Compute the CSS background colour for a single grid cell during active play. */
function getCellColor(
  row: number,
  col: number,
  state: ReturnType<typeof createInitialRunState>,
  clickableIds: ReadonlySet<string>,
): string {
  if (!state.map) return '#2d2d2d';

  const { source, sink, pipes } = state.map;
  const { selectedPipeIds } = state;

  if (source.row === row && source.col === col) return '#22c55e'; // green — inlet
  if (sink.row === row && sink.col === col) return '#ef4444';   // red — outlet

  const pipe = pipes.find((p) => p.row === row && p.col === col);
  if (!pipe) return '#1e1e2e'; // empty cell — dark background

  if (selectedPipeIds.includes(pipe.id)) return '#3b82f6'; // blue — selected
  if (clickableIds.has(pipe.id)) return '#fbbf24';          // yellow — clickable
  return '#6b7280';                                          // gray — pipe (non-clickable)
}

/** Compute post-game cell colour (reveals the route). */
function getCellColorComplete(
  row: number,
  col: number,
  state: ReturnType<typeof createInitialRunState>,
): string {
  if (!state.map) return '#2d2d2d';

  const { source, sink, pipes } = state.map;

  if (source.row === row && source.col === col) return '#22c55e';
  if (sink.row === row && sink.col === col) return '#ef4444';

  const pipe = pipes.find((p) => p.row === row && p.col === col);
  if (!pipe) return '#1e1e2e';

  if (pipe.isRoute) return '#3b82f6';   // blue — reveals route
  return '#374151';                      // dark gray — reveals decoys
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CastleRescueGame({
  seed = 1,
  timeLimitMs = TIME_LIMIT_MS,
  onFinish,
  autoStart = true,
}: CastleRescueGameProps) {
  const [state, dispatch] = useReducer(castleRescueReducer, undefined, createInitialRunState);

  /**
   * Remaining seconds shown in the countdown label.
   * Updated every 250 ms by a setInterval so the display counts down smoothly
   * even when the player is not interacting with the grid.
   */
  const [remainingSeconds, setRemainingSeconds] = useState(Math.ceil(timeLimitMs / 1000));

  // Keep onFinish in a ref so the timer callback always has the latest version
  // without needing to be listed as a useEffect dependency.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Track whether onFinish has already been called for this run.
  const finishCalledRef = useRef(false);

  // ── Auto-start ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoStart && state.status === 'idle') {
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // ── Completion callback ────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status === 'complete' && !finishCalledRef.current) {
      finishCalledRef.current = true;
      onFinishRef.current?.(state.score ?? 0);
    }
  }, [state.status, state.score]);

  // ── Timeout timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status !== 'active') return;

    const elapsed = Date.now() - state.startTimeMs;
    const remaining = timeLimitMs - elapsed;

    if (remaining <= 0) {
      // Already past the limit (shouldn't happen in practice but guard it).
      dispatch({ type: 'FINALIZE', nowMs: Date.now() });
      return;
    }

    const timerId = setTimeout(() => {
      dispatch({ type: 'FINALIZE', nowMs: Date.now() });
    }, remaining);

    return () => clearTimeout(timerId);
  }, [state.status, state.startTimeMs, timeLimitMs]);

  // ── Countdown display interval ──────────────────────────────────────────────
  // Re-compute remainingSeconds every 250 ms so the countdown label updates
  // without depending on user interactions.
  useEffect(() => {
    if (state.status !== 'active') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - state.startTimeMs;
      setRemainingSeconds(Math.ceil(Math.max(0, timeLimitMs - elapsed) / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [state.status, state.startTimeMs, timeLimitMs]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    finishCalledRef.current = false;
    const map = generateMapForSeed(seed);
    dispatch({ type: 'START', map, nowMs: Date.now() });
  }, [seed]);

  const handleCellClick = useCallback(
    (pos: CellPos) => {
      if (state.status !== 'active' || !state.map) return;
      const pipe = state.map.pipes.find((p) => p.row === pos.row && p.col === pos.col);
      if (!pipe) return;
      dispatch({ type: 'CLICK_PIPE', pipeId: pipe.id, nowMs: Date.now() });
    },
    [state.status, state.map],
  );

  const handleReset = useCallback(() => {
    finishCalledRef.current = false;
    dispatch({ type: 'RESET' });
  }, []);

  // ── Derived data for rendering ─────────────────────────────────────────────
  const clickableIds = selectClickablePipeIds(state);
  const statusSummary = selectStatusSummary(state);

  const rows = state.map?.gridRows ?? 5;
  const cols = state.map?.gridCols ?? 5;

  // remainingSeconds is maintained by the setInterval above; no Date.now() here.

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        color: '#f3f4f6',
        background: '#111827',
        minHeight: '100vh',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 24, letterSpacing: 1 }}>🏰 Castle Rescue</h2>

      {/* Status bar */}
      <p
        style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}
        aria-live="polite"
        aria-atomic="true"
      >
        {statusSummary}
      </p>

      {/* Timer (only shown while active) */}
      {state.status === 'active' && (
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: remainingSeconds <= 10 ? '#ef4444' : '#f9fafb' }}>
          ⏱ {remainingSeconds}s
        </p>
      )}

      {/* Grid */}
      {state.status !== 'idle' && (
        <div
          role="grid"
          aria-label="Castle Rescue pipe grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)`,
            gap: 4,
          }}
        >
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
              const pos: CellPos = { row: r, col: c };
              const isSource =
                state.map?.source.row === r && state.map?.source.col === c;
              const isSink = state.map?.sink.row === r && state.map?.sink.col === c;
              const pipe = state.map?.pipes.find((p) => p.row === r && p.col === c);
              const isClickable = pipe ? clickableIds.has(pipe.id) : false;
              const bgColor =
                state.status === 'complete'
                  ? getCellColorComplete(r, c, state)
                  : getCellColor(r, c, state, clickableIds);

              return (
                <div
                  key={`${r}-${c}`}
                  role="gridcell"
                  aria-label={
                    isSource
                      ? 'Source'
                      : isSink
                      ? 'Destination'
                      : pipe
                      ? `Pipe at row ${r + 1} col ${c + 1}`
                      : `Empty cell at row ${r + 1} col ${c + 1}`
                  }
                  // Keyboard support: clickable pipe cells are focusable and
                  // respond to Enter/Space so keyboard and AT users can play.
                  tabIndex={isClickable ? 0 : -1}
                  onClick={() => handleCellClick(pos)}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleCellClick(pos);
                    }
                  }}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    background: bgColor,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    cursor: isClickable ? 'pointer' : 'default',
                    border: isClickable ? '2px solid #fbbf24' : '2px solid transparent',
                    // Focus ring uses outline for keyboard/AT accessibility;
                    // non-clickable cells are excluded via tabIndex=-1.
                    outlineOffset: 2,
                    transition: 'background 0.15s, border 0.15s',
                    userSelect: 'none',
                  }}
                >
                  {isSource ? '🟢' : isSink ? '🔴' : pipe ? '🔧' : ''}
                </div>
              );
            }),
          )}
        </div>
      )}

      {/* Legend */}
      {state.status !== 'idle' && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9ca3af' }}>
          <span>🟢 Source</span>
          <span>🔴 Destination</span>
          <span style={{ color: '#fbbf24' }}>🔧 Clickable pipe</span>
          <span style={{ color: '#3b82f6' }}>🔧 Selected</span>
        </div>
      )}

      {/* Start / Reset buttons */}
      {state.status === 'idle' && (
        <button
          onClick={handleStart}
          aria-label="Start Castle Rescue"
          style={buttonStyle('#16a34a')}
        >
          ▶ Start
        </button>
      )}

      {state.status === 'complete' && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            🏁 Score: {state.score ?? 0}
          </p>
          <p style={{ color: '#9ca3af', margin: '0 0 16px', fontSize: 14 }}>
            Wrong attempts: {state.wrongAttempts}
          </p>
          <button
            onClick={handleReset}
            aria-label="Play Castle Rescue again"
            style={buttonStyle('#1d4ed8')}
          >
            🔁 Play Again
          </button>
        </div>
      )}
    </div>
  );
}

function buttonStyle(bg: string): React.CSSProperties {
  return {
    padding: '10px 28px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
