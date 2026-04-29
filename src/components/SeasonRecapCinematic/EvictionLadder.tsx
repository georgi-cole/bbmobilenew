import { useMemo, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { resolveSilhouetteFallback } from '../../utils/avatar';
import type { EvictionLadderEntry, EvictionLadderProps } from './evictionLadder';
import {
  deriveEvictionLadderStatus,
  formatEvictionRank,
  getEvictionLadderStatusIcon,
  getEvictionLadderStatusLabel,
  sortEvictionLadderEntries,
} from './evictionLadder';
import './EvictionLadder.css';

function resolveAvatarSources(entry: EvictionLadderEntry): string[] {
  const fallback = resolveSilhouetteFallback({ id: entry.id, name: entry.name });
  return Array.from(new Set([entry.avatarUrl, fallback].filter((source): source is string => Boolean(source))));
}

function LadderAvatar({
  entry,
  highlighted,
}: {
  entry: EvictionLadderEntry;
  highlighted: boolean;
}) {
  const sources = useMemo(() => resolveAvatarSources(entry), [entry]);
  const [sourceIndex, setSourceIndex] = useState(0);

  function handleError(_event: SyntheticEvent<HTMLImageElement, Event>) {
    setSourceIndex((current) => Math.min(current + 1, sources.length - 1));
  }

  return (
    <div className={`eviction-ladder__avatar-shell${highlighted ? ' eviction-ladder__avatar-shell--highlighted' : ''}`}>
      <img
        className="eviction-ladder__avatar"
        src={sources[Math.min(sourceIndex, sources.length - 1)]}
        alt={entry.name}
        onError={handleError}
        loading="eager"
      />
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
  const visibleEntries = useMemo(
    () => orderedEntries.slice(0, Math.max(revealCount ?? orderedEntries.length, 0)),
    [orderedEntries, revealCount],
  );
  const highlightedIds = useMemo(
    () => new Set(highlightedEntryIds ?? visibleEntries.slice(-1).map((entry) => entry.id)),
    [highlightedEntryIds, visibleEntries],
  );
  const shouldCompact = compact || visibleEntries.length >= 6;
  const baseDelay = reducedMotion || !autoPlay ? 0 : animationDelayMs / 1000;
  const stepDelay = reducedMotion || !autoPlay ? 0 : stepDelayMs / 1000;

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
        <motion.div
          className="eviction-ladder__spine"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.56, delay: baseDelay + 0.12, ease: [0.22, 1, 0.36, 1] }}
        />

        <div className="eviction-ladder__entries" role="list" aria-label="Eviction ladder">
          {visibleEntries.map((entry, index) => {
            const orderWeight = visibleEntries.length <= 1 ? 1 : index / (visibleEntries.length - 1);
            const highlighted = highlightedIds.has(entry.id);
            const status = deriveEvictionLadderStatus(entry);
            const delay = baseDelay + 0.18 + index * stepDelay;
            const scale = 0.93 + orderWeight * 0.07 + (highlighted ? 0.015 : 0);
            const opacity = 0.52 + orderWeight * 0.4 + (highlighted ? 0.08 : 0);
            const translateX = index % 2 === 0 ? -8 + orderWeight * 8 : 8 - orderWeight * 8;

            return (
              <motion.article
                key={entry.id}
                className={`eviction-ladder__card eviction-ladder__card--${status}${highlighted ? ' eviction-ladder__card--highlighted' : ''}`}
                role="listitem"
                data-current-user={entry.id === currentUserId ? 'true' : undefined}
                style={
                  {
                    '--entry-scale': scale.toFixed(3),
                    '--entry-opacity': opacity.toFixed(3),
                    '--entry-translate-x': `${translateX}px`,
                  } as CSSProperties
                }
                initial={{ opacity: 0, y: 30, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="eviction-ladder__card-inner">
                  <div className="eviction-ladder__copy">
                    <div className="eviction-ladder__meta">
                      <motion.span
                        className="eviction-ladder__rank"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: [1, highlighted ? 1.08 : 1.04, 1] }}
                        transition={{ duration: reducedMotion ? 0 : 0.42, delay: delay + 0.06 }}
                      >
                        {formatEvictionRank(entry.rank)}
                      </motion.span>
                      <span className="eviction-ladder__divider" aria-hidden="true" />
                      <span className="eviction-ladder__status">
                        <span className="eviction-ladder__status-icon" aria-hidden="true">
                          {getEvictionLadderStatusIcon(entry)}
                        </span>
                        {getEvictionLadderStatusLabel(entry)}
                      </span>
                    </div>

                    <h3 className="eviction-ladder__name">{entry.name}</h3>

                    {entry.id === currentUserId && (
                      <span className="eviction-ladder__you-badge">You</span>
                    )}
                  </div>

                  <motion.div
                    className="eviction-ladder__avatar-wrap"
                    initial={{ opacity: 0, scale: 0.84 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: reducedMotion ? 0 : 0.36, delay: delay + 0.12 }}
                  >
                    <LadderAvatar entry={entry} highlighted={highlighted} />
                  </motion.div>
                </div>
              </motion.article>
            );
          })}
        </div>

        <div className="eviction-ladder__podium" aria-hidden="true" />
      </div>

      {caption && (
        <motion.p
          className="eviction-ladder__caption"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.45, delay: baseDelay + 0.24 + visibleEntries.length * stepDelay }}
        >
          {caption}
        </motion.p>
      )}
    </div>
  );
}
