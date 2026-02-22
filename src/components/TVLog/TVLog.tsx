import { useState } from 'react';
import type { TvEvent } from '../../types';
import { tease } from '../../utils/tvLogTemplates';
import './TVLog.css';

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
   * log to avoid showing a duplicate row.
   */
  mainTVMessage?: string;
  /**
   * Maximum number of rows visible before the list scrolls.
   * Exposed as the `--tv-log-max-vis` CSS variable on the root element.
   * @default 3
   */
  maxVisible?: number;
}

/**
 * TVLog — a compact, scrollable event-log strip.
 *
 * Features:
 *   - Duplicate suppression: hides the first entry when it matches the main TV message.
 *   - Shows `maxVisible` (default 3) rows; older entries are accessible via scroll.
 *   - Teaser truncation: long lines are clipped to 60 chars; tap/click to expand.
 */
export default function TVLog({ entries, mainTVMessage, maxVisible = 3 }: TVLogProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Suppress the first entry when its text duplicates the main viewport message.
  const visible = mainTVMessage
    ? entries.filter((ev, i) => !(i === 0 && ev.text === mainTVMessage))
    : entries;

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
      style={{ '--tv-log-max-vis': maxVisible } as React.CSSProperties}
      aria-label="Game event log"
    >
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
            onKeyDown={(e) => e.key === 'Enter' && toggleExpand(ev.id)}
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
