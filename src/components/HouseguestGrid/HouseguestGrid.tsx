import React, { useEffect, useRef } from 'react'
import AvatarTile from './AvatarTile'
import styles from './HouseguestGrid.module.css'

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
   * Optional ref forwarded to the outer tile `<div>` so that callers (e.g.
   * GameScreen) can measure the tile's DOM position for animations.
   */
  tileRef?: React.Ref<HTMLDivElement>
}

type Props = {
  houseguests: Houseguest[]
  showCountInHeader?: boolean
  headerSelector?: string
  footerSelector?: string
}

/** Minimum grid height (px) even when available space is very tight */
const MIN_GRID_HEIGHT = 220
/** Fallback nav-bar height (px) matching --nav-bar-height CSS variable */
const DEFAULT_FOOTER_HEIGHT = 58
/** Extra vertical margin subtracted from available height */
const GRID_VERTICAL_MARGIN = 32

export default function HouseguestGrid({
  houseguests,
  showCountInHeader = false,
  headerSelector = '.tv-zone',
  footerSelector = '.nav-bar',
}: Props) {
  const containerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function setAvailableHeight() {
      const viewportHeight = window.innerHeight
      let headerH = 0
      let footerH = DEFAULT_FOOTER_HEIGHT

      const headerEl = document.querySelector(headerSelector)
      const footerEl = document.querySelector(footerSelector)

      if (headerEl instanceof HTMLElement) headerH = headerEl.getBoundingClientRect().height
      if (footerEl instanceof HTMLElement) footerH = footerEl.getBoundingClientRect().height

      const available = Math.max(
        MIN_GRID_HEIGHT,
        viewportHeight - headerH - footerH - GRID_VERTICAL_MARGIN,
      )
      if (containerRef.current) {
        containerRef.current.style.setProperty('--grid-available-height', `${available}px`)
      }
    }

    setAvailableHeight()
    window.addEventListener('resize', setAvailableHeight)
    return () => window.removeEventListener('resize', setAvailableHeight)
  }, [headerSelector, footerSelector])

  return (
    <section ref={containerRef} className={styles.container} aria-labelledby="houseguests-heading">
      <div className={styles.headerRow}>
        <h3 id="houseguests-heading" className={styles.header}>
          HOUSEGUESTS
          {showCountInHeader && <span className={styles.count}> ({houseguests.length})</span>}
          {!showCountInHeader && <span className="visually-hidden"> ({houseguests.length})</span>}
        </h3>
      </div>

      <ul className={styles.grid} role="list">
        {houseguests.map((hg) => (
          <li key={hg.id} className={styles.gridItem}>
            <AvatarTile
              ref={hg.tileRef}
              name={hg.name}
              avatarUrl={hg.avatarUrl}
              isEvicted={hg.isEvicted}
              isYou={hg.isYou}
              onClick={hg.onClick}
              statuses={hg.statuses}
              finalRank={hg.finalRank}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
