/**
 * HoldWallVariant — "endurance hold" spectator visualization.
 *
 * Displays each competitor climbing / holding a wall; progress bar
 * fills as their score increases. The winner's bar animates to 100%.
 * During simulation the leading competitor gets a soft glow + bounce;
 * all bars have a micro-jitter to feel alive.
 */

import type { CompetitorProgress } from './progressEngine';

interface HoldWallVariantProps {
  competitors: CompetitorProgress[];
  phase: 'simulating' | 'reconciling' | 'revealed';
  resolveAvatar: (id: string) => string;
  getPlayerName: (id: string | undefined) => string;
}

export default function HoldWallVariant({
  competitors,
  phase,
  resolveAvatar,
  getPlayerName,
}: HoldWallVariantProps) {
  const isSimulating = phase === 'simulating';

  // During simulation highlight the current leader
  const leaderId = isSimulating
    ? [...competitors].sort((a, b) => b.score - a.score)[0]?.id
    : null;

  return (
    <div className="sv-variant sv-holdwall" aria-label="Hold the Wall competition">
      <div className="sv-holdwall__track">
        {competitors.map((c) => {
          const isLeader = c.id === leaderId && !c.isWinner;
          return (
            <div
              key={c.id}
              className={[
                'sv-holdwall__lane',
                c.isWinner  ? 'sv-holdwall__lane--winner'  : '',
                isLeader    ? 'sv-holdwall__lane--leading'  : '',
                isSimulating ? 'sv-holdwall__lane--jitter'  : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Climber avatar */}
              <div
                className="sv-holdwall__climber"
                style={{ bottom: `max(4px, calc(${c.score}% - 24px))` }}
                aria-hidden="true"
              >
                <img
                  src={resolveAvatar(c.id)}
                  alt=""
                  className="sv-holdwall__avatar"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    const fb = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(c.id)}`;
                    if (img.src !== fb) { img.src = fb; } else { img.style.display = 'none'; }
                  }}
                />
                {c.isWinner && (
                  <span className="sv-holdwall__crown" aria-label="winner">
                    👑
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="sv-holdwall__bar-bg" aria-hidden="true">
                <div
                  className="sv-holdwall__bar-fill"
                  style={{ height: `${c.score}%` }}
                />
              </div>

              {/* Name label */}
              <span className="sv-holdwall__name">
                {getPlayerName(c.id)}
              </span>

              {/* Score pill */}
              <span className="sv-holdwall__score" aria-label={`${getPlayerName(c.id)} score ${Math.round(c.score)}`}>
                {Math.round(c.score)}
              </span>
            </div>
          );
        })}
      </div>

      {phase === 'revealed' && (
        <p className="sv-result-caption" aria-live="assertive">
          🏆 {getPlayerName(competitors.find((c) => c.isWinner)?.id ?? '')} wins!
        </p>
      )}
    </div>
  );
}
