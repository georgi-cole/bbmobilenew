import { useMemo, useState, type CSSProperties } from 'react';
import type { TvEvent } from '../../types';
import { tease } from '../../utils/tvLogTemplates';
import './TVLog.css';

const MAX_ADAPTIVE_VISIBLE_ROWS = 3;

const TYPE_ICONS: Record<TvEvent['type'], string> = {
  game: '🎮',
  social: '💬',
  vote: '🗳️',
  twist: '🌀',
  diary: '📖',
};

export interface TVLogProps {
  /** Full list of TV events, newest first. */
  entries: TvEvent[];
  /**
   * Text currently displayed in the main TV viewport.
   * When the first entry's text matches this value it is suppressed from the
   * log to avoid showing a duplicate row when older rows remain available.
   */
  mainTVMessage?: string;
  /**
   * Maximum number of rows visible before the list scrolls.
   * The log always keeps at least one visible row so older entries remain
   * reachable without letting the feed crowd the roster.
   * @default 3
   */
  maxVisible?: number;
  /**
   * When enabled, small screens clamp each collapsed feed entry to two text
   * lines while older messages remain reachable via scroll.
   */
  mobileTwoLineMode?: boolean;
}

/**
 * TVLog — a compact, scrollable event-log strip.
 *
 * Features:
 *   - Duplicate suppression: hides the first entry when it matches the main TV message and older entries remain.
 *   - Reserves at least one visible row; grows up to three rows when the viewport has room.
 *   - Teaser truncation: long lines are clipped to 60 chars; tap/click to expand.
 *   - Optional mobile two-line mode that clamps row copy without hiding the log.
 */
export default function TVLog({
  entries,
  mainTVMessage,
  maxVisible = MAX_ADAPTIVE_VISIBLE_ROWS,
  mobileTwoLineMode = false,
}: TVLogProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const effectiveMaxVisible = Math.max(1, maxVisible);

  // Suppress the first entry only when older rows remain, so the log never
  // collapses to an empty strip just because the main TV repeats the newest row.
  const visible = useMemo(() => {
    if (!mainTVMessage || entries.length <= 1) return entries;

    const [latestEntry, ...olderEntries] = entries;
    return latestEntry.text === mainTVMessage ? olderEntries : entries;
  }, [entries, mainTVMessage]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <ul
      className="tv-log"
      data-testid="tv-feed"
      data-mobile-two-line={mobileTwoLineMode ? 'true' : undefined}
      style={{ '--tv-log-max-vis': effectiveMaxVisible } as CSSProperties}
      aria-label="Game event log"
    >
      {visible.length === 0 && (
        <li className="tv-log__item tv-log__item--empty" aria-hidden="true">
          <span className="tv-log__icon" aria-hidden="true">•</span>
          <span className="tv-log__text">Game log</span>
        </li>
      )}
      {visible.map((ev) => {
        const isExpanded = expandedIds.has(ev.id);
        const displayText = isExpanded ? ev.text : tease(ev.text);
        return (
          <li
            key={ev.id}
            className={[
              'tv-log__item',
              `tv-log__item--${ev.type}`,
              isExpanded ? 'tv-log__item--expanded' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => toggleExpand(ev.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleExpand(ev.id);
              }
            }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? ev.text : displayText}
          >
            <span className="tv-log__icon" aria-hidden="true">
              {TYPE_ICONS[ev.type]}
            </span>
            <span className="tv-log__text">{displayText}</span>
          </li>
        );
      })}
    </ul>
  );
}
