/**
 * MazeVariant — "labyrinth race" spectator visualization.
 *
 * Displays each competitor navigating a grid maze; their progress dot
 * moves forward as their score increases. Doors "open" randomly during
 * the simulation phase, cells at the frontier pulse, and each runner
 * leaves a short fading trail.
 */

import { useEffect, useRef, useState } from 'react';
import type { CompetitorProgress } from './progressEngine';

interface MazeVariantProps {
  competitors: CompetitorProgress[];
  phase: 'simulating' | 'reconciling' | 'revealed';
  resolveAvatar: (id: string) => string;
  getPlayerName: (id: string | undefined) => string;
}

const MAZE_CELLS = 12;
const TRAIL_LENGTH = 3; // how many ghost dots to render behind the runner

export default function MazeVariant({
  competitors,
  phase,
  resolveAvatar,
  getPlayerName,
}: MazeVariantProps) {
  const [openDoors, setOpenDoors] = useState<Set<number>>(new Set());
  // Trail: record last N positions (as left-% values) per competitor
  const [trails, setTrails] = useState<Record<string, number[]>>({});
  const prevPositionsRef = useRef<Record<string, number>>({});

  // Randomly open doors + frontier cell pulsing during simulation
  useEffect(() => {
    if (phase !== 'simulating') return;
    const interval = setInterval(() => {
      setOpenDoors((prev) => {
        const next = new Set(prev);
        const candidate = Math.floor(Math.random() * MAZE_CELLS);
        next.add(candidate);
        return next;
      });
    }, 900);
    return () => clearInterval(interval);
  }, [phase]);

  // Update trail whenever competitor positions change
  useEffect(() => {
    if (phase !== 'simulating') return;
    competitors.forEach((c) => {
      const pct = (Math.floor((c.score / 100) * (MAZE_CELLS - 1)) / (MAZE_CELLS - 1)) * 100;
      const prev = prevPositionsRef.current[c.id] ?? pct;
      if (pct !== prev) {
        setTrails((t) => {
          const existing = t[c.id] ?? [];
          return { ...t, [c.id]: [...existing.slice(-(TRAIL_LENGTH - 1)), prev] };
        });
      }
      prevPositionsRef.current[c.id] = pct;
    });
  }, [competitors, phase]);

  return (
    <div className="sv-variant sv-maze" aria-label="Maze competition">
      {/* Maze track / door grid */}
      <div className="sv-maze__track" aria-hidden="true">
        {Array.from({ length: MAZE_CELLS }).map((_, i) => {
          // Frontier = cell just ahead of any competitor
          const isFrontier = competitors.some((c) => {
            const pos = Math.floor((c.score / 100) * (MAZE_CELLS - 1));
            return i === pos + 1;
          });
          return (
            <div
              key={i}
              className={[
                'sv-maze__cell',
                openDoors.has(i) ? 'sv-maze__cell--open' : '',
                isFrontier && phase === 'simulating' ? 'sv-maze__cell--frontier' : '',
              ].filter(Boolean).join(' ')}
            />
          );
        })}
      </div>

      {/* Competitor lanes */}
      <div className="sv-maze__lanes">
        {competitors.map((c) => {
          const cellIndex = Math.floor((c.score / 100) * (MAZE_CELLS - 1));
          const dotPct = (cellIndex / (MAZE_CELLS - 1)) * 100;
          const trailPositions = trails[c.id] ?? [];

          return (
            <div
              key={c.id}
              className={`sv-maze__lane${c.isWinner ? ' sv-maze__lane--winner' : ''}`}
            >
              <img
                src={resolveAvatar(c.id)}
                alt=""
                className="sv-maze__avatar"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="sv-maze__path">
                {/* Trail ghost dots */}
                {trailPositions.map((tp, ti) => (
                  <div
                    key={ti}
                    className={`sv-maze__trail-dot${c.isWinner ? ' sv-maze__trail-dot--winner' : ''}`}
                    style={{
                      left: `calc(${tp}% - 5px)`,
                      opacity: (ti + 1) / (TRAIL_LENGTH + 1),
                    }}
                    aria-hidden="true"
                  />
                ))}
                {/* Main dot */}
                <div
                  className={`sv-maze__dot${c.isWinner ? ' sv-maze__dot--winner' : ''}`}
                  style={{ left: `calc(${dotPct}% - 8px)` }}
                  aria-label={`${getPlayerName(c.id)} at position ${cellIndex + 1}`}
                />
              </div>
              <span className="sv-maze__name">{getPlayerName(c.id)}</span>
              {c.isWinner && (
                <span className="sv-maze__crown" aria-label="winner">
                  🏆
                </span>
              )}
            </div>
          );
        })}
      </div>

      {phase === 'revealed' && (
        <p className="sv-result-caption" aria-live="assertive">
          🌟 {getPlayerName(competitors.find((c) => c.isWinner)?.id ?? '')} escapes the maze!
        </p>
      )}
    </div>
  );
}
