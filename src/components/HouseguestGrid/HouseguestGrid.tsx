import { useEffect, useMemo, useRef } from 'react'
import AvatarTile from './AvatarTile'
import StatusPill from '../ui/StatusPill'
import styles from './HouseguestGrid.module.css'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { clearSurvivorReplacementTransition } from '../../store/gameSlice'
import type { CompactRosterLayout } from '../../store/settingsSlice'

const HOUSEMATES_SECTION_TITLE = 'HOUSEMATES'

type RoboStatsSummary = {
  daysInGame?: number | null
  lohWins?: number | null
  posWins?: number | null
  averageLohRank?: number | null
  averagePosRank?: number | null
}

export type Houseguest = {
  id: string | number
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
  roboStats?: RoboStatsSummary
  /**
   * Called when the user has held their finger down long enough to trigger the
   * hold-preview threshold. The caller should show a transient profile preview.
   */
  onHoldPreviewStart?: () => void
  /**
   * Called when the user lifts or cancels their finger after a hold-preview was
   * triggered. The caller should dismiss the transient preview.
   */
  onHoldPreviewEnd?: () => void
  /**
   * Game status string(s) to display as badge overlays.
   * Accepts a single PlayerStatus value (e.g. 'loh', 'nominated+pos')
   * or an array of status codes.
   */
  statuses?: string | string[]
  /**
   * Final placement rank: 1 (winner 🥇), 2 (runner-up 🥈), or 3 (3rd 🥉).
   */
  finalRank?: 1 | 2 | 3 | null
  /**
   * When false, suppresses the permanent badge stack on this tile.
   * Set to false while a ceremony animation is playing so the animated badge
   * is the only badge visible during the sequence.
   */
  showPermanentBadge?: boolean
  /**
   * Framer Motion layoutId for the shared layout match-cut animation.
   * When set, the avatar tile participates in the hero animation with EvictionSplash.
   */
  layoutId?: string
  /**
   * When true, the tile hides itself (opacity 0) while the eviction overlay is
   * active, so the shared-layout portrait is the only visible instance.
   */
  isEvicting?: boolean
  nominationCeremonyState?: 'loh' | 'danger' | 'locked'
}

type Props = {
  houseguests: Houseguest[]
  showCountInHeader?: boolean
  headerSelector?: string
  footerSelector?: string
  overlaySelector?: string | null
  /** Total grid size (12 or 16). Placeholder tiles will pad to this count. */
  gridSize?: number
  /** Number of placeholder tiles to append after real houseguests. */
  placeholderCount?: number
  /** When true, reduces avatar/tile size and spacing for a denser layout. */
  compact?: boolean
  /** Optional compact roster presentation chosen in Settings. */
  compactLayout?: CompactRosterLayout
  /** Optional alive/total chip shown beside the section heading. */
  occupancyLabel?: string
}

/** Minimum grid height (px) even when available space is very tight */
const MIN_GRID_HEIGHT = 220
/** Fallback nav-bar height (px) matching --nav-bar-height CSS variable */
const DEFAULT_FOOTER_HEIGHT = 60
/** Extra vertical margin subtracted from available height */
const GRID_VERTICAL_MARGIN = 4

export default function HouseguestGrid({
  houseguests,
  showCountInHeader = false,
  headerSelector = '.tv-zone',
  footerSelector = '.nav-bar',
  overlaySelector,
  gridSize,
  placeholderCount = 0,
  compact = false,
  compactLayout = 'slider',
  occupancyLabel,
}: Props) {
  const containerRef = useRef<HTMLElement | null>(null)
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const survivorReplacementTransition = game.modeSpecific?.kind === 'survivor'
    ? game.modeSpecific.replacementTransition ?? null
    : null
  const survivorRoboStatsById = useMemo(() => {
    const statsById = new Map<string, RoboStatsSummary>()
    if (game.mode !== 'survivor') return statsById
    const currentDay = game.modeSpecific?.kind === 'survivor'
      ? game.modeSpecific.currentDay
      : game.week
    game.players.forEach((player) => {
      if (!player.isRobo) return
      const entryDay = player.survivorEntryDay ?? 1
      statsById.set(player.id, {
        daysInGame: Math.max(1, currentDay - entryDay + 1),
        lohWins: player.stats?.lohWins ?? 0,
        posWins: player.stats?.posWins ?? 0,
        averageLohRank: null,
        averagePosRank: null,
      })
    })
    return statsById
  }, [game.mode, game.modeSpecific, game.players, game.week])
  const renderedHouseguests = useMemo(() => {
    if (game.mode !== 'survivor' || survivorReplacementTransition === null) return houseguests

    const outgoing = survivorReplacementTransition.outgoingPlayerSnapshot
    const incomingId = survivorReplacementTransition.incomingPlayerId
    const slot = survivorReplacementTransition.slot
    const incomingIndex = houseguests.findIndex((houseguest) => String(houseguest.id) === incomingId)
    const slotIndex = game.players.findIndex((player) => player.survivorSlot === slot)
    const targetIndex = incomingIndex >= 0 ? incomingIndex : slotIndex
    if (targetIndex < 0 || targetIndex >= houseguests.length) return houseguests

    return houseguests.map((houseguest, index) => (
      index === targetIndex
        ? {
            id: outgoing.id,
            name: outgoing.name,
            avatarUrl: outgoing.avatar,
            isEvicted: true,
            isYou: outgoing.isUser,
            roboStats: outgoing.isRobo
              ? {
                  daysInGame: Math.max(1, game.week - (outgoing.survivorEntryDay ?? 1) + 1),
                  lohWins: outgoing.stats?.lohWins ?? 0,
                  posWins: outgoing.stats?.posWins ?? 0,
                  averageLohRank: null,
                  averagePosRank: null,
                }
              : undefined,
            statuses: [],
            showPermanentBadge: false,
          }
        : houseguest
    ))
  }, [game.mode, game.players, game.week, houseguests, survivorReplacementTransition])
  const headerSignal = occupancyLabel ?? `${renderedHouseguests.length}`

  useEffect(() => {
    if (survivorReplacementTransition === null) return undefined
    const remainingMs = Math.max(
      0,
      survivorReplacementTransition.startedAt + survivorReplacementTransition.durationMs - Date.now(),
    )
    const timer = window.setTimeout(() => {
      dispatch(clearSurvivorReplacementTransition())
    }, remainingMs)
    return () => window.clearTimeout(timer)
  }, [dispatch, survivorReplacementTransition])

  useEffect(() => {
    function setAvailableHeight() {
      const visualViewport = window.visualViewport
      const viewportHeight = visualViewport?.height ?? window.innerHeight
      const viewportTop = visualViewport?.offsetTop ?? 0
      let listTop = 0
      let footerH = DEFAULT_FOOTER_HEIGHT
      let bottomBoundary = viewportTop + viewportHeight - footerH

      const footerEl = document.querySelector(footerSelector)
      const overlayEl = overlaySelector ? document.querySelector(overlaySelector) : null

      if (containerRef.current instanceof HTMLElement) {
        const listEl = containerRef.current.querySelector('ul[role="list"]')
        listTop = listEl instanceof HTMLElement
          ? listEl.getBoundingClientRect().top
          : containerRef.current.getBoundingClientRect().top
      } else {
        const headerEl = document.querySelector(headerSelector)
        if (headerEl instanceof HTMLElement) {
          listTop = headerEl.getBoundingClientRect().bottom
        }
      }

      if (footerEl instanceof HTMLElement) {
        const footerRect = footerEl.getBoundingClientRect()
        footerH = footerRect.height
        bottomBoundary = Math.min(bottomBoundary, footerRect.top)
      }

      if (overlayEl instanceof HTMLElement) {
        bottomBoundary = Math.min(bottomBoundary, overlayEl.getBoundingClientRect().top)
      }

      const available = Math.max(
        MIN_GRID_HEIGHT,
        bottomBoundary - listTop - GRID_VERTICAL_MARGIN,
      )
      if (containerRef.current) {
        containerRef.current.style.setProperty('--grid-available-height', `${available}px`)
      }
    }

    setAvailableHeight()
    window.addEventListener('resize', setAvailableHeight)
    window.visualViewport?.addEventListener('resize', setAvailableHeight)
    window.visualViewport?.addEventListener('scroll', setAvailableHeight)
    return () => {
      window.removeEventListener('resize', setAvailableHeight)
      window.visualViewport?.removeEventListener('resize', setAvailableHeight)
      window.visualViewport?.removeEventListener('scroll', setAvailableHeight)
    }
  }, [headerSelector, footerSelector, overlaySelector])

  const gridSizeClass = gridSize === 16 ? styles.hgGrid16 : gridSize === 12 ? styles.hgGrid12 : ''
  const effectiveCompactLayout = compact ? compactLayout : 'default'
  const listClassName = effectiveCompactLayout === 'slider'
    ? styles.slider
    : `${styles.grid}${gridSizeClass ? ` ${gridSizeClass}` : ''}`
  const itemClassName = effectiveCompactLayout === 'slider' ? styles.sliderItem : styles.gridItem
  const sectionClassName = [
    styles.container,
    compact ? styles.compact : '',
    effectiveCompactLayout === 'small' ? styles.compactSmall : '',
    effectiveCompactLayout === 'two-rows' ? styles.compactTwoRows : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      ref={containerRef}
      className={sectionClassName}
      aria-labelledby="houseguests-heading"
      data-compact-layout={effectiveCompactLayout}
    >
      <div key={headerSignal} className={styles.headerRow} aria-live="polite">
        <h3 id="houseguests-heading" className={styles.header}>
          {HOUSEMATES_SECTION_TITLE}
          {showCountInHeader && <span className={styles.count}> ({renderedHouseguests.length})</span>}
          {!showCountInHeader && <span className="visually-hidden"> ({renderedHouseguests.length})</span>}
        </h3>
        {occupancyLabel && (
          <StatusPill variant="ghost" label={occupancyLabel} ariaLabel={`${occupancyLabel} housemates`} />
        )}
      </div>

      <ul className={listClassName} role="list">
        {renderedHouseguests.map((hg) => {
          const resolvedRoboStats = hg.roboStats ?? survivorRoboStatsById.get(String(hg.id))
          return (
            <li key={hg.id} className={itemClassName} data-player-id={String(hg.id)}>
              <AvatarTile
                name={hg.name}
                avatarUrl={hg.avatarUrl}
                isEvicted={hg.isEvicted}
                isYou={hg.isYou}
                onClick={hg.onClick}
                roboStats={resolvedRoboStats}
                onHoldPreviewStart={hg.onHoldPreviewStart}
                onHoldPreviewEnd={hg.onHoldPreviewEnd}
                statuses={hg.statuses}
                finalRank={hg.finalRank}
                showPermanentBadge={hg.showPermanentBadge}
                layoutId={hg.layoutId}
                isEvicting={hg.isEvicting}
                nominationCeremonyState={hg.nominationCeremonyState}
              />
            </li>
          )
        })}
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <li key={`placeholder-${i}`} className={`${itemClassName} ${styles.hgTileInactive}`}>
            <img
              src={`${import.meta.env.BASE_URL}avatars/placeholder.png`}
              alt=""
              aria-hidden="true"
              className={styles.hgPlaceholderImg}
            />
            <span className={styles.hgPlaceholderLabel}>Inactive</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
