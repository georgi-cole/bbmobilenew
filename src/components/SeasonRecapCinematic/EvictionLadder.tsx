import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { resolveSilhouetteFallback } from '../../utils/avatar';
import type { EvictionLadderEntry, EvictionLadderProps } from './evictionLadderModel';
import {
  deriveEvictionLadderStatus,
  formatEvictionRank,
  getEvictionLadderStatusIcon,
  getEvictionLadderStatusLabel,
  sortEvictionLadderEntries,
} from './evictionLadderModel';
import './EvictionLadder.css';

const HIGHLIGHT_CYCLE_STEP_MULTIPLIER = 3;
const MIN_HIGHLIGHT_CYCLE_INTERVAL_MS = 560;

function resolveAvatarSources(entry: EvictionLadderEntry): string[] {
  const fallback = resolveSilhouetteFallback({ id: entry.id, name: entry.name });
  return Array.from(new Set([entry.avatarUrl, fallback].filter((source): source is string => Boolean(source))));
}

function EntryImage({
  entry,
  className,
  alt,
}: {
  entry: EvictionLadderEntry;
  className: string;
  alt: string;
}) {
  const sources = useMemo(() => resolveAvatarSources(entry), [entry]);
  const [sourceIndex, setSourceIndex] = useState(0);

  function handleError(_event: SyntheticEvent<HTMLImageElement, Event>) {
    setSourceIndex((current) => Math.min(current + 1, sources.length - 1));
  }

  return (
    <img
      className={className}
      src={sources[Math.min(sourceIndex, sources.length - 1)]}
      alt={alt}
      onError={handleError}
      loading="eager"
    />
  );
}

function LadderAvatar({
  entry,
  highlighted,
}: {
  entry: EvictionLadderEntry;
  highlighted: boolean;
}) {
  return (
    <div className={`eviction-ladder__avatar-shell${highlighted ? ' eviction-ladder__avatar-shell--highlighted' : ''}`}>
      <EntryImage entry={entry} className="eviction-ladder__avatar" alt={entry.name} />
    </div>
  );
}

export default function EvictionLadder({
  entries,
  currentUserId,
  className,
  autoPlay = true,
  compact = false,
  animationDelayMs = 240,
  stepDelayMs = 180,
  revealCount,
  highlightedEntryIds,
  caption,
}: EvictionLadderProps) {
  const reducedMotion = useReducedMotion();
  const orderedEntries = useMemo(() => sortEvictionLadderEntries(entries), [entries]);
  const visibleEntries = useMemo(() => {
    const limit = Math.max(revealCount ?? orderedEntries.length, 0);
    return orderedEntries.slice(0, limit);
  }, [orderedEntries, revealCount]);
  const cycleEntries = useMemo(() => {
    const focusIds = new Set(highlightedEntryIds ?? visibleEntries.map((entry) => entry.id));
    const focusedEntries = visibleEntries.filter((entry) => focusIds.has(entry.id));
    return focusedEntries.length > 0 ? focusedEntries : visibleEntries;
  }, [highlightedEntryIds, visibleEntries]);
  const shouldCompact = compact || visibleEntries.length >= 6;
  const baseDelay = reducedMotion || !autoPlay ? 0 : animationDelayMs / 1000;
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion || !autoPlay || cycleEntries.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveEntryIndex((current) => {
        if (cycleEntries.length === 0) return 0;
        return (current + 1) % cycleEntries.length;
      });
    }, Math.max(stepDelayMs * HIGHLIGHT_CYCLE_STEP_MULTIPLIER, MIN_HIGHLIGHT_CYCLE_INTERVAL_MS));

    return () => window.clearInterval(interval);
  }, [autoPlay, cycleEntries, reducedMotion, stepDelayMs]);

  const activeEntry =
    cycleEntries.length > 0
      ? cycleEntries[activeEntryIndex % cycleEntries.length]
      : visibleEntries[0] ?? null;
  const activeEntryId = activeEntry?.id;
  const activeEntryStatus = activeEntry ? deriveEvictionLadderStatus(activeEntry) : null;
  const activeEntryStatusLabel = activeEntry ? getEvictionLadderStatusLabel(activeEntry) : '';
  const activeEntryStatusIcon = activeEntry ? getEvictionLadderStatusIcon(activeEntry) : '';

  return (
    <div className={['eviction-ladder', shouldCompact ? 'eviction-ladder--compact' : '', className].filter(Boolean).join(' ')}>
      <motion.header
        className="eviction-ladder__header"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.48, delay: baseDelay }}
      >
        <div className="eviction-ladder__header-rule" aria-hidden="true" />
        <div className="eviction-ladder__ornament" aria-hidden="true">
          ✦
        </div>
        <div className="eviction-ladder__header-rule" aria-hidden="true" />
        <p className="eviction-ladder__eyebrow">Eviction Ladder</p>
        <p className="eviction-ladder__subhead">In order of eviction</p>
      </motion.header>

      <div className="eviction-ladder__stage">
        {activeEntry && (
          <motion.section
            className={`eviction-ladder__spotlight eviction-ladder__spotlight--${activeEntryStatus ?? 'evicted'}`}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.52, delay: baseDelay + 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="eviction-ladder__spotlight-photo">
              <motion.div
                key={activeEntry.id}
                className="eviction-ladder__spotlight-photo-frame"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
              >
                <EntryImage
                  entry={activeEntry}
                  className="eviction-ladder__spotlight-image"
                  alt={`${activeEntry.name} spotlight portrait`}
                />
              </motion.div>
              <div className="eviction-ladder__spotlight-sheen" aria-hidden="true" />
            </div>

            <div className="eviction-ladder__spotlight-copy">
              <span className="eviction-ladder__spotlight-rank">{formatEvictionRank(activeEntry.rank)}</span>
              <h3 className="eviction-ladder__spotlight-name">{activeEntry.name}</h3>
              <p className="eviction-ladder__spotlight-status">
                <span aria-hidden="true">{activeEntryStatusIcon}</span>
                {activeEntryStatusLabel}
              </p>
              {activeEntry.id === currentUserId && (
                <span className="eviction-ladder__you-badge">You</span>
              )}
            </div>
          </motion.section>
        )}

        <div className="eviction-ladder__rankings" role="list" aria-label="Eviction ladder">
          {visibleEntries.map((entry, index) => {
            const highlighted = entry.id === activeEntryId;
            const status = deriveEvictionLadderStatus(entry);

            return (
              <motion.article
                key={entry.id}
                role="listitem"
                data-current-user={entry.id === currentUserId ? 'true' : undefined}
                className={`eviction-ladder__ranking eviction-ladder__ranking--${status}${highlighted ? ' eviction-ladder__ranking--active' : ''}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.36, delay: baseDelay + 0.16 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="eviction-ladder__ranking-main">
                  <span className="eviction-ladder__rank">{formatEvictionRank(entry.rank)}</span>
                  <div className="eviction-ladder__ranking-copy">
                    <h4 className="eviction-ladder__name">{entry.name}</h4>
                    <span className="eviction-ladder__status">
                      <span className="eviction-ladder__status-icon" aria-hidden="true">
                        {getEvictionLadderStatusIcon(entry)}
                      </span>
                      {getEvictionLadderStatusLabel(entry)}
                    </span>
                  </div>
                </div>
                <LadderAvatar entry={entry} highlighted={highlighted} />
              </motion.article>
            );
          })}
        </div>
      </div>

      {caption && (
        <motion.p
          className="eviction-ladder__caption"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.45, delay: baseDelay + 0.42 }}
        >
          {caption}
        </motion.p>
      )}
    </div>
  );
}
