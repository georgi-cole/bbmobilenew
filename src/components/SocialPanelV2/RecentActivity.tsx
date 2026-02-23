import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectSessionLogs } from '../../social/socialSlice';
import { getActionById } from '../../social/SocialManeuvers';
import { getSocialNarrative } from './socialNarratives';
import type { Player } from '../../types';
import './RecentActivity.css';

export interface RecentActivityProps {
  /**
   * Player roster used to resolve target ids to display names.
   * Optional — if omitted, target ids are shown as-is.
   */
  players?: readonly Player[];
  /** Maximum number of entries to display. Defaults to 6. */
  maxEntries?: number;
}

/** Map a delta value to ✓/✗/– icon. */
function getResultIcon(entry: { delta: number }): string {
  if (entry.delta > 0) return '✓';
  if (entry.delta < 0) return '✗';
  return '–';
}

/** CSS modifier for the icon based on outcome. */
function getResultClass(entry: { delta: number }): string {
  if (entry.delta > 0) return 'positive';
  if (entry.delta < 0) return 'negative';
  return 'neutral';
}

/** Format a Unix timestamp as a relative "X ago" string. */
function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/**
 * RecentActivity — shows the last N social actions executed this session.
 *
 * Reads `state.social.sessionLogs` and displays each entry with:
 * timestamp (relative), action title, result label, numeric delta, and target name.
 *
 * A "Clear" button resets the visible list client-side without mutating domain logs.
 */
export default function RecentActivity({ players, maxEntries = 6 }: RecentActivityProps) {
  const sessionLogs = useAppSelector(selectSessionLogs);
  // Client-side clear: track the watermark timestamp; only show entries after it.
  const [clearedBefore, setClearedBefore] = useState(0);

  const playerById = new Map(players?.map((p) => [p.id, p]) ?? []);

  const visibleLogs = sessionLogs
    .filter((e) => e.timestamp > clearedBefore)
    .slice(-maxEntries);

  function handleClear() {
    setClearedBefore(Date.now());
  }

  return (
    <div className="ra-container" aria-label="Recent Activity">
      <div className="ra-header">
        <span className="ra-title">Recent Activity</span>
        {visibleLogs.length > 0 && (
          <button
            className="ra-clear-btn"
            type="button"
            aria-label="Clear recent activity"
            onClick={handleClear}
          >
            Clear
          </button>
        )}
      </div>

      {visibleLogs.length === 0 ? (
        <span className="ra-empty">No recent actions.</span>
      ) : (
        <ul className="ra-list" aria-label="Recent actions">
          {visibleLogs.map((entry, i) => {
            const action = getActionById(entry.actionId);
            const actionTitle = action?.title ?? entry.actionId;
            const targetName = playerById.get(entry.targetId)?.name ?? entry.targetId;
            const icon = getResultIcon(entry);
            const resultClass = getResultClass(entry);
            const sign = entry.delta > 0 ? '+' : '';
            const deltaText = entry.delta !== 0 ? `${sign}${entry.delta}` : '';
            const narrative = getSocialNarrative(entry.actionId, targetName, entry.timestamp);
            return (
              <li key={`${entry.timestamp}-${entry.actionId}-${entry.targetId}-${i}`} className="ra-entry">
                <span className={`ra-entry__icon ra-entry__icon--${resultClass}`} aria-hidden="true">
                  {icon}
                </span>
                <span className="ra-entry__body">
                  <span className="ra-entry__action-tag">{actionTitle}</span>
                  <span className="ra-entry__narrative">{narrative}</span>
                  {deltaText && (
                    <span className={`ra-entry__delta ra-entry__delta--${resultClass}`}>
                      {deltaText}
                    </span>
                  )}
                </span>
                <span className="ra-entry__time" aria-label={`Time: ${getRelativeTime(entry.timestamp)}`}>
                  {getRelativeTime(entry.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
