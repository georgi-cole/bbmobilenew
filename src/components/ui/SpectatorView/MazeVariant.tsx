/**
 * MazeVariant — "labyrinth race" spectator visualization.
 *
 * Displays each competitor navigating a grid maze; their progress dot
 * moves forward as their score increases. Doors "open" randomly during
 * the simulation phase.
 */

import { useEffect, useState } from 'react';
import type { CompetitorProgress } from './progressEngine';

interface MazeVariantProps {
  competitors: CompetitorProgress[];
  phase: 'simulating' | 'reconciling' | 'revealed';
  resolveAvatar: (id: string) => string;
  getPlayerName: (id: string) => string;
}

const MAZE_CELLS = 12;

export default function MazeVariant({
  competitors,
  phase,
  resolveAvatar,
  getPlayerName,
}: MazeVariantProps) {
  const [openDoors, setOpenDoors] = useState<Set<number>>(new Set());

  // Randomly open doors during simulation
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

  return (
    <div className="sv-variant sv-maze" aria-label="Maze competition">
      {/* Maze track */}
      <div className="sv-maze__track" aria-hidden="true">
        {Array.from({ length: MAZE_CELLS }).map((_, i) => (
          <div
            key={i}
            className={`sv-maze__cell${openDoors.has(i) ? ' sv-maze__cell--open' : ''}`}
          />
        ))}
      </div>

      {/* Competitor lanes */}
      <div className="sv-maze__lanes">
        {competitors.map((c) => {
          const cellIndex = Math.floor((c.score / 100) * (MAZE_CELLS - 1));
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
                {/* Dot showing current position */}
                <div
                  className={`sv-maze__dot${c.isWinner ? ' sv-maze__dot--winner' : ''}`}
                  style={{
                    left: `calc(${(cellIndex / (MAZE_CELLS - 1)) * 100}% - 8px)`,
                  }}
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
