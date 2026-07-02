import { useEffect, useMemo, useRef, useState } from 'react'
import AvatarTile from './AvatarTile'
import StatusPill from '../ui/StatusPill'
import styles from './HouseguestGrid.module.css'
import { useAppSelector } from '../../store/hooks'
import type { CompactRosterLayout } from '../../store/settingsSlice'

const HOUSEMATES_SECTION_TITLE = 'HOUSEMATES'
const SURVIVOR_REPLACEMENT_HOLD_MS = 900

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

function buildSurvivorReplacementHold(
  previous: Houseguest[],
  current: Houseguest[],
  hiddenIds: Set<string>,
  restoredIds: Set<string>,
): Houseguest[] {
  const visible = current
    .filter((houseguest) => !hiddenIds.has(String(houseguest.id)))
    .map((houseguest) => ({ ...houseguest }))

  const visibleIds = new Set(visible.map((houseguest) => String(houseguest.id)))
  restoredIds.forEach((id) => {
    if (visibleIds.has(id)) return
    const restored = previous.find((houseguest) => String(houseguest.id) === id)
    if (!restored) return
    visible.push({ ...restored, isEvicted: true })
    visibleIds.add(id)
  })

  const order = new Map(previous.map((houseguest, index) => [String(houseguest.id), index]))
  return visible
    .sort((left, right) => (order.get(String(left.id)) ?? 0) - (order.get(String(right.id)) ?? 0))
    .map((houseguest) => (restoredIds.has(String(houseguest.id))
      ? { ...houseguest, isEvicted: true }
      : houseguest))
}

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
  const previousHouseguestsRef = useRef<Houseguest[]>(houseguests)
  const survivorHoldTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const survivorHoldClearTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const game = useAppSelector((s) => s.game)
  const gamePlayersById = useMemo(
    () => new Map(game.players.map((player) => [String(player.id), player])),
    [game.players],
  )
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
  const [survivorHoldRoster, setSurvivorHoldRoster] = useState<Houseguest[] | null>(null)
  const renderedHouseguests = game.mode === 'survivor' && survivorHoldRoster !== null
    ? survivorHoldRoster
    : houseguests

  useEffect(() => {
    return () => {
      if (survivorHoldTimerRef.current !== null) {
        window.clearTimeout(survivorHoldTimerRef.current)
        survivorHoldTimerRef.current = null
      }
      if (survivorHoldClearTimerRef.current !== null) {
        window.clearTimeout(survivorHoldClearTimerRef.current)
        survivorHoldClearTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const previous = previousHouseguestsRef.current
    previousHouseguestsRef.current = houseguests

    if (game.mode !== 'survivor') {
      if (survivorHoldTimerRef.current !== null) {
        window.clearTimeout(survivorHoldTimerRef.current)
        survivorHoldTimerRef.current = null
      }
      if (survivorHoldClearTimerRef.current !== null) {
        window.clearTimeout(survivorHoldClearTimerRef.current)
      }
      if (survivorHoldRoster !== null) {
        survivorHoldClearTimerRef.current = window.setTimeout(() => {
          survivorHoldClearTimerRef.current = null
          setSurvivorHoldRoster(null)
        }, 0)
      }
      return
    }

    const currentDay = game.modeSpecific?.kind === 'survivor' ? game.modeSpecific.currentDay : null
    if (currentDay == null || currentDay <= 1) return
    if (survivorHoldRoster !== null) return

    const previousIds = new Set(previous.map((houseguest) => String(houseguest.id)))
    const currentIds = new Set(houseguests.map((houseguest) => String(houseguest.id)))
    const addedIds = houseguests
      .map((houseguest) => String(houseguest.id))
      .filter((id) => !previousIds.has(id))
    const addedRoboIds = addedIds.filter((id) => gamePlayersById.get(id)?.isRobo)
    if (addedRoboIds.length === 0) return

    const removedIds = previous
      .map((houseguest) => String(houseguest.id))
      .filter((id) => !currentIds.has(id))

    const holdRoster = buildSurvivorReplacementHold(
      previous,
      houseguests,
      new Set(addedRoboIds),
      new Set(removedIds),
    )

    setSurvivorHoldRoster(holdRoster)
    if (survivorHoldTimerRef.current !== null) {
      window.clearTimeout(survivorHoldTimerRef.current)
    }
    survivorHoldTimerRef.current = window.setTimeout(() => {
      survivorHoldTimerRef.current = null
      setSurvivorHoldRoster(null)
    }, SURVIVOR_REPLACEMENT_HOLD_MS)
  }, [game.mode, game.modeSpecific, gamePlayersById, houseguests, survivorHoldRoster])

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
      <div className={styles.headerRow}>
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
