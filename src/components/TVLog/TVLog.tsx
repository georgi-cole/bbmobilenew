import { useMemo, useState, type CSSProperties } from 'react';
import type { TvEvent } from '../../types';
import { tease } from '../../utils/tvLogTemplates';
import './TVLog.css';

const MAX_ADAPTIVE_VISIBLE_ROWS = 3;
type ActivityFilter = 'all' | TvEvent['type'];

const TYPE_ICONS: Record<TvEvent['type'], string> = {
  game: '🎮', social: '💬', vote: '🗳️', twist: '🌀', diary: '📖',
};
const TYPE_LABELS: Record<TvEvent['type'], string> = {
  game: 'Game', social: 'Social', vote: 'Vote', twist: 'Shock', diary: 'Diary',
};
const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'game', label: 'Game' },
  { value: 'social', label: 'Social' },
  { value: 'vote', label: 'Votes' },
  { value: 'twist', label: 'Shocks' },
  { value: 'diary', label: 'Diary' },
];

export interface TVLogProps {
  entries: TvEvent[];
  mainTVMessage?: string;
  maxVisible?: number;
  mobileTwoLineMode?: boolean;
}

function formatEventAge(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export default function TVLog({
  entries,
  mainTVMessage,
  maxVisible = MAX_ADAPTIVE_VISIBLE_ROWS,
  mobileTwoLineMode = false,
}: TVLogProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const effectiveMaxVisible = Math.max(1, maxVisible);

  const visible = useMemo(() => {
    const deduplicated = !mainTVMessage || entries.length <= 1
      ? entries
      : entries[0].text === mainTVMessage ? entries.slice(1) : entries;
    return activityFilter === 'all'
      ? deduplicated
      : deduplicated.filter((entry) => entry.type === activityFilter);
  }, [activityFilter, entries, mainTVMessage]);

  function toggleExpand(id: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="tv-log-shell" aria-labelledby="tv-log-heading">
      <div className="tv-log__toolbar">
        <div className="tv-log__heading-group">
          <span className="tv-log__heading" id="tv-log-heading">Recent events</span>
          <span className="tv-log__count" aria-label={`${visible.length} visible events`}>{visible.length}</span>
        </div>
        <div className="tv-log__filters" role="group" aria-label="Filter game events">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`tv-log__filter${activityFilter === filter.value ? ' tv-log__filter--active' : ''}`}
              aria-pressed={activityFilter === filter.value}
              onClick={() => setActivityFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <ul
        className="tv-log"
        data-testid="tv-feed"
        data-mobile-two-line={mobileTwoLineMode ? 'true' : undefined}
        style={{ '--tv-log-max-vis': effectiveMaxVisible } as CSSProperties}
        aria-label="Game event log"
      >
        {visible.length === 0 && (
          <li className="tv-log__item tv-log__item--empty" aria-live="polite">
            <span className="tv-log__icon" aria-hidden="true">•</span>
            <span className="tv-log__text">No matching events yet</span>
          </li>
        )}
        {visible.map((event) => {
          const isExpanded = expandedIds.has(event.id);
          const displayText = isExpanded ? event.text : tease(event.text);
          return (
            <li key={event.id} className={`tv-log__item tv-log__item--${event.type}${isExpanded ? ' tv-log__item--expanded' : ''}`}>
              <button
                type="button"
                className="tv-log__event"
                onClick={() => toggleExpand(event.id)}
                aria-expanded={isExpanded}
                aria-label={`${TYPE_LABELS[event.type]} event: ${event.text}`}
              >
                <span className="tv-log__icon" aria-hidden="true">{TYPE_ICONS[event.type]}</span>
                <span className="tv-log__copy">
                  <span className="tv-log__type">{TYPE_LABELS[event.type]}</span>
                  <span className="tv-log__text">{displayText}</span>
                </span>
                <time className="tv-log__time" dateTime={new Date(event.timestamp).toISOString()}>{formatEventAge(event.timestamp)}</time>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}