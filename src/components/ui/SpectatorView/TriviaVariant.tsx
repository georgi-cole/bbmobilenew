/**
 * TriviaVariant — "timed trivia" spectator visualization.
 *
 * Shows each competitor's point tally growing as scores increase.
 * When the authoritative winner is revealed, their score surges to 100.
 */

import type { CompetitorProgress } from './progressEngine';

interface TriviaVariantProps {
  competitors: CompetitorProgress[];
  phase: 'simulating' | 'reconciling' | 'revealed';
  resolveAvatar: (id: string) => string;
  getPlayerName: (id: string) => string;
}

export default function TriviaVariant({
  competitors,
  phase,
  resolveAvatar,
  getPlayerName,
}: TriviaVariantProps) {
  return (
    <div className="sv-variant sv-trivia" aria-label="Trivia competition">
      <div className="sv-trivia__board">
        {[...competitors]
          .sort((a, b) => b.score - a.score)
          .map((c, rank) => (
            <div
              key={c.id}
              className={`sv-trivia__row${c.isWinner ? ' sv-trivia__row--winner' : ''}`}
            >
              <span className="sv-trivia__rank" aria-hidden="true">
                {rank + 1}
              </span>

              <img
                src={resolveAvatar(c.id)}
                alt=""
                className="sv-trivia__avatar"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />

              <span className="sv-trivia__name">{getPlayerName(c.id)}</span>

              {/* Inline progress bar */}
              <div className="sv-trivia__bar-bg" aria-hidden="true">
                <div
                  className="sv-trivia__bar-fill"
                  style={{ width: `${c.score}%` }}
                />
              </div>

              <span
                className="sv-trivia__pts"
                aria-label={`${getPlayerName(c.id)} ${Math.round(c.score)} points`}
              >
                {Math.round(c.score)} pts
              </span>

              {c.isWinner && (
                <span className="sv-trivia__badge" aria-label="winner">
                  🏆
                </span>
              )}
            </div>
          ))}
      </div>

      {phase === 'revealed' && (
        <p className="sv-result-caption" aria-live="assertive">
          🎉 {getPlayerName(competitors.find((c) => c.isWinner)?.id ?? '')} wins the trivia!
        </p>
      )}
    </div>
  );
}
