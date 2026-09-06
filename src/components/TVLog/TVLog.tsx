import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { TvEvent } from '../../types'
import { useRefinedGameChrome } from '../../hooks/useRefinedGameChrome'
import { normalizeGameCopy, tease } from '../../utils/tvLogTemplates'
import GameBackButton from '../ui/GameBackButton/GameBackButton'
import './TVLog.css'

const MAX_ADAPTIVE_VISIBLE_ROWS = 3
type ActivityFilter = 'all' | TvEvent['type']

const TYPE_ICONS: Record<TvEvent['type'], string> = {
  game: '🎮',
  social: '💬',
  vote: '🗳️',
  twist: '🌀',
  diary: '📖',
}
const TYPE_LABELS: Record<TvEvent['type'], string> = {
  game: 'Game',
  social: 'Social',
  vote: 'Vote',
  twist: 'Shock',
  diary: 'Diary',
}
const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'game', label: 'Game' },
  { value: 'social', label: 'Social' },
  { value: 'vote', label: 'Votes' },
  { value: 'twist', label: 'Shocks' },
  { value: 'diary', label: 'Diary' },
]

export interface TVLogProps {
  entries: TvEvent[]
  mainTVMessage?: string
  maxVisible?: number
  mobileTwoLineMode?: boolean
  inlineVisible?: boolean
  launcherHidden?: boolean
  launcherSuppressed?: boolean
  suppressLauncher?: boolean
}

function formatEventAge(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

export default function TVLog({
  entries,
  mainTVMessage,
  maxVisible = MAX_ADAPTIVE_VISIBLE_ROWS,
  mobileTwoLineMode = false,
  inlineVisible = false,
  launcherHidden = false,
  launcherSuppressed = false,
  suppressLauncher = false,
}: TVLogProps) {
  const refined = useRefinedGameChrome()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [logOpen, setLogOpen] = useState(false)
  const effectiveMaxVisible = Math.max(1, maxVisible)

  const visible = useMemo(() => {
    const normalizedMainTvMessage = mainTVMessage ? normalizeGameCopy(mainTVMessage) : undefined
    const deduplicated =
      !normalizedMainTvMessage || entries.length <= 1
        ? entries
        : normalizeGameCopy(entries[0].text) === normalizedMainTvMessage
          ? entries.slice(1)
          : entries
    return activityFilter === 'all'
      ? deduplicated
      : deduplicated.filter((entry) => entry.type === activityFilter)
  }, [activityFilter, entries, mainTVMessage])

  useEffect(() => {
    if (!logOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLogOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [logOpen])

  useEffect(() => {
    if (!suppressLauncher && !launcherSuppressed) return undefined
    const closeTimer = window.setTimeout(() => setLogOpen(false), 0)
    return () => window.clearTimeout(closeTimer)
  }, [launcherSuppressed, suppressLauncher])

  useEffect(() => {
    const openFromRoster = () => setLogOpen(true)
    window.addEventListener('tv:open-game-log', openFromRoster)
    return () => window.removeEventListener('tv:open-game-log', openFromRoster)
  }, [])

  function toggleExpand(id: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openFullLogFromInlineFeed = refined && inlineVisible

  const activityContent = (isInlineFeed = false) => (
    <>
      <div className="tv-log__toolbar">
        <div className="tv-log__heading-group">
          <span className="tv-log__heading" id="tv-log-heading">
            Game log
          </span>
          <span className="tv-log__count" aria-label={`${visible.length} visible events`}>
            {visible.length}
          </span>
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
            <span className="tv-log__icon" aria-hidden="true">
              •
            </span>
            <span className="tv-log__text">No matching events yet</span>
          </li>
        )}
        {visible.map((event) => {
          const isExpanded = expandedIds.has(event.id)
          const normalizedText = normalizeGameCopy(event.text)
          const displayText = isExpanded ? normalizedText : tease(event.text)
          return (
            <li
              key={event.id}
              className={`tv-log__item tv-log__item--${event.type}${isExpanded ? ' tv-log__item--expanded' : ''}`}
            >
              <button
                type="button"
                className="tv-log__event"
                onClick={() => (isInlineFeed ? setLogOpen(true) : toggleExpand(event.id))}
                aria-expanded={isInlineFeed ? undefined : isExpanded}
                aria-label={
                  isInlineFeed
                    ? `Open game log from ${TYPE_LABELS[event.type]} event: ${normalizedText}`
                    : `${TYPE_LABELS[event.type]} event: ${normalizedText}`
                }
              >
                <span className="tv-log__icon" aria-hidden="true">
                  {TYPE_ICONS[event.type]}
                </span>
                <span className="tv-log__copy">
                  <span className="tv-log__type">{TYPE_LABELS[event.type]}</span>
                  <span className="tv-log__text">{displayText}</span>
                </span>
                <time className="tv-log__time" dateTime={new Date(event.timestamp).toISOString()}>
                  {formatEventAge(event.timestamp)}
                </time>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )

  const logModal =
    logOpen &&
    createPortal(
      <div className="tv-log-modal__backdrop" role="presentation" onClick={() => setLogOpen(false)}>
        <section
          className="tv-log-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-log-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="tv-log-modal__header">
            <div>
              <span className="tv-log-modal__eyebrow">Hub history</span>
              <h2 id="tv-log-modal-title">Game log</h2>
            </div>
            <GameBackButton
              className="tv-log-modal__close"
              label="Close game log"
              onClick={() => setLogOpen(false)}
            />
          </header>
          {activityContent()}
        </section>
      </div>,
      document.body
    )

  if (suppressLauncher) return null

  if (!refined || inlineVisible) {
    return (
      <>
        <section
          className={`tv-log-shell${refined ? ' tv-log-shell--inline' : ''}`}
          aria-labelledby="tv-log-heading"
        >
          {activityContent(openFullLogFromInlineFeed)}
        </section>
        {logModal}
      </>
    )
  }

  return (
    <>
      {!suppressLauncher && !launcherSuppressed && (
        <button
          type="button"
          className={`tv-log__launcher${launcherHidden ? ' tv-log__launcher--hidden' : ''}`}
          aria-label={`Open game log, ${entries.length} events`}
          onClick={() => setLogOpen(true)}
        >
          <span aria-hidden="true">☷</span>
          <span>Log</span>
        </button>
      )}
      {logModal}
    </>
  )
}
