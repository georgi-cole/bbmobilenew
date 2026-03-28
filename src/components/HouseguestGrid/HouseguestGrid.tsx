import { useEffect, useRef } from 'react'
import AvatarTile from './AvatarTile'
import StatusPill from '../ui/StatusPill'
import styles from './HouseguestGrid.module.css'

const HOUSEMATES_SECTION_TITLE = 'HOUSEMATES'

export type Houseguest = {
  id: string | number
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
  /**
   * Game status string(s) to display as badge overlays.
   * Accepts a single PlayerStatus value (e.g. 'hoh', 'nominated+pov')
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
}

type Props = {
  houseguests: Houseguest[]
  showCountInHeader?: boolean
  headerSelector?: string
  footerSelector?: string
  overlaySelector?: string
  /** Total grid size (12 or 16). Placeholder tiles will pad to this count. */
  gridSize?: number
  /** Number of placeholder tiles to append after real houseguests. */
  placeholderCount?: number
  /** When true, reduces avatar/tile size and spacing for a denser layout. */
  compact?: boolean
  /** Optional alive/total chip shown beside the section heading. */
  occupancyLabel?: string
}

/** Minimum grid height (px) even when available space is very tight */
const MIN_GRID_HEIGHT = 220
/** Fallback nav-bar height (px) matching --nav-bar-height CSS variable */
const DEFAULT_FOOTER_HEIGHT = 62
/** Extra vertical margin subtracted from available height */
const GRID_VERTICAL_MARGIN = 20

export default function HouseguestGrid({
  houseguests,
  showCountInHeader = false,
  headerSelector = '.tv-zone',
  footerSelector = '.nav-bar',
  overlaySelector = '.game-control-dock',
  gridSize,
  placeholderCount = 0,
  compact = false,
  occupancyLabel,
}: Props) {
  const containerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function setAvailableHeight() {
      const viewportHeight = window.innerHeight
      let containerTop = 0
      let footerH = DEFAULT_FOOTER_HEIGHT
      let bottomBoundary = viewportHeight - footerH

      const footerEl = document.querySelector(footerSelector)
      const overlayEl = document.querySelector(overlaySelector)

      if (containerRef.current instanceof HTMLElement) {
        containerTop = containerRef.current.getBoundingClientRect().top
      } else {
        const headerEl = document.querySelector(headerSelector)
        if (headerEl instanceof HTMLElement) {
          containerTop = headerEl.getBoundingClientRect().bottom
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
        bottomBoundary - containerTop - GRID_VERTICAL_MARGIN,
      )
      if (containerRef.current) {
        containerRef.current.style.setProperty('--grid-available-height', `${available}px`)
      }
    }

    setAvailableHeight()
    window.addEventListener('resize', setAvailableHeight)
    return () => window.removeEventListener('resize', setAvailableHeight)
  }, [footerSelector, headerSelector, overlaySelector])

  const gridSizeClass = gridSize === 16 ? styles.hgGrid16 : gridSize === 12 ? styles.hgGrid12 : ''

  return (
    <section ref={containerRef} className={`${styles.container}${compact ? ` ${styles.compact}` : ''}`} aria-labelledby="houseguests-heading">
      <div className={styles.headerRow}>
        <h3 id="houseguests-heading" className={styles.header}>
          {HOUSEMATES_SECTION_TITLE}
          {showCountInHeader && <span className={styles.count}> ({houseguests.length})</span>}
          {!showCountInHeader && <span className="visually-hidden"> ({houseguests.length})</span>}
        </h3>
        {occupancyLabel && (
          <StatusPill variant="ghost" label={occupancyLabel} ariaLabel={`${occupancyLabel} housemates`} />
        )}
      </div>

      <ul className={`${styles.grid}${gridSizeClass ? ` ${gridSizeClass}` : ''}`} role="list">
        {houseguests.map((hg) => (
          <li key={hg.id} className={styles.gridItem} data-player-id={String(hg.id)}>
            <AvatarTile
              name={hg.name}
              avatarUrl={hg.avatarUrl}
              isEvicted={hg.isEvicted}
              isYou={hg.isYou}
              onClick={hg.onClick}
              statuses={hg.statuses}
              finalRank={hg.finalRank}
              showPermanentBadge={hg.showPermanentBadge}
              layoutId={hg.layoutId}
              isEvicting={hg.isEvicting}
            />
          </li>
        ))}
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <li key={`placeholder-${i}`} className={`${styles.gridItem} ${styles.hgTileInactive}`}>
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
