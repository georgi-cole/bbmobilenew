import { useState, useRef, useEffect, useMemo } from 'react';
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
  const listRef = useRef<HTMLUListElement>(null);
  // Track keys of newly added entries for the highlight animation.
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set());
  // Track the latest entry timestamp seen so new entries are detected even when
  // maxEntries is at capacity (array length doesn't change in that case).
  const prevNewestTimestampRef = useRef(0);

  const playerById = new Map(players?.map((p) => [p.id, p]) ?? []);

  const visibleLogs = useMemo(
    () => sessionLogs.filter((e) => e.timestamp > clearedBefore).slice(-maxEntries),
    [sessionLogs, clearedBefore, maxEntries],
  );

  // Auto-scroll to the newest entry whenever the visible list changes.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [visibleLogs.length]);

  // Highlight newly added entries briefly.
  useEffect(() => {
    const newestTimestamp = visibleLogs.length > 0 ? visibleLogs[visibleLogs.length - 1].timestamp : 0;
    if (newestTimestamp > prevNewestTimestampRef.current) {
      const newKeys = new Set<string>();
      for (const e of visibleLogs) {
        if (e.timestamp > prevNewestTimestampRef.current) {
          newKeys.add(`${e.timestamp}-${e.actionId}-${e.targetId}`);
        }
      }
      setHighlightedKeys((prev) => new Set([...prev, ...newKeys]));
      const timer = setTimeout(() => {
        setHighlightedKeys((prev) => {
          const next = new Set(prev);
          newKeys.forEach((k) => next.delete(k));
          return next;
        });
      }, 1200);
      prevNewestTimestampRef.current = newestTimestamp;
      return () => clearTimeout(timer);
    }
    prevNewestTimestampRef.current = newestTimestamp;
  }, [visibleLogs]);

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
        <ul className="ra-list" ref={listRef} aria-label="Recent actions">
          {visibleLogs.map((entry) => {
            const action = getActionById(entry.actionId);
            const actionTitle = action?.title ?? entry.actionId;
            const targetName = playerById.get(entry.targetId)?.name ?? entry.targetId;
            const icon = getResultIcon(entry);
            const resultClass = getResultClass(entry);
            const sign = entry.delta > 0 ? '+' : '';
            const deltaText = entry.delta !== 0 ? `${sign}${entry.delta}` : '';
            const narrative = getSocialNarrative(entry.actionId, targetName, entry.timestamp);
            const key = `${entry.timestamp}-${entry.actionId}-${entry.targetId}`;
            const isNew = highlightedKeys.has(key);
            return (
              <li key={key} className={`ra-entry${isNew ? ' ra-entry--new' : ''}`}>
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
