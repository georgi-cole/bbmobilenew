import React from 'react'
import { motion } from 'framer-motion'
import { avatarVariants } from '../../utils/avatarCase'
import { getBadgesForPlayer } from '../../utils/statusBadges'
import styles from './HouseguestGrid.module.css'

const LONG_PRESS_DELAY_MS = 500

type Props = {
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
  /** Called when the user long-presses this tile on touch devices. */
  onLongPress?: () => void
  /**
   * Game statuses to display as badge overlays on the avatar.
   * Accepts a single PlayerStatus string (e.g. 'hoh', 'nominated+pov')
   * or an array of individual status codes.
   * Supported codes: 'hoh' 👑, 'pov' 🛡️, 'nominated' ❓, 'jury' ⚖️
   * Medal codes (derived from finalRank): 'first' 🥇, 'second' 🥈, 'third' 🥉
   */
  statuses?: string | string[]
  /**
   * Final placement rank (1 = winner 🥇, 2 = runner-up 🥈, 3 = 3rd place 🥉).
   * When set, replaces other status badges with the corresponding medal.
   */
  finalRank?: 1 | 2 | 3 | null
  /**
   * When false, the permanent badge stack (❓, 👑, etc.) is not rendered.
   * Use this to suppress permanent badges while a ceremony animation is playing
   * so the animated badge is the only one visible during the sequence.
   * Defaults to true.
   */
  showPermanentBadge?: boolean
  /**
   * Framer Motion layoutId for the avatar wrap — enables the match-cut shared
   * layout animation between the grid tile and EvictionSplash fullscreen portrait.
   */
  layoutId?: string
  /**
   * When true the tile's avatarWrap is hidden (opacity 0) so the shared-layout
   * overlay portrait is the only visible instance during the eviction animation.
   * The tile fades back in after a short delay matching the reverse animation.
   */
  isEvicting?: boolean
}

export default function AvatarTile({ name, avatarUrl, isEvicted, isYou, onClick, onLongPress, statuses, finalRank, showPermanentBadge = true, layoutId, isEvicting }: Props) {
  const attemptRef = React.useRef(0)
  const variantsRef = React.useRef<string[] | null>(null)
  const exhaustedRef = React.useRef(false)
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressActiveRef = React.useRef(false)

  React.useEffect(() => {
    attemptRef.current = 0
    variantsRef.current = null
    exhaustedRef.current = false
  }, [avatarUrl])

  // Clean up long-press timer on unmount
  React.useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    if (exhaustedRef.current) return
    const img = e.currentTarget
    if (!variantsRef.current) {
      variantsRef.current = avatarVariants(img.src)
      attemptRef.current = 0
    }

    attemptRef.current += 1
    const variants = variantsRef.current
    if (variants && attemptRef.current < variants.length) {
      img.src = variants[attemptRef.current]
      return
    }

    exhaustedRef.current = true
    img.src = '/avatars/placeholder.png'
  }

  // ── Long-press detection ───────────────────────────────────────────────────
  function startLongPress() {
    if (!onLongPress) return
    longPressActiveRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressActiveRef.current = true
      longPressTimerRef.current = null
      onLongPress()
    }, LONG_PRESS_DELAY_MS)
  }

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    // Only single-finger touches
    if (e.touches.length !== 1) return
    startLongPress()
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (longPressActiveRef.current) {
      e.preventDefault()
      longPressActiveRef.current = false
    }
    cancelLongPress()
  }

  function handleTouchMove() {
    cancelLongPress()
  }

  function handleClick() {
    // If a long press just fired, swallow the synthetic click that follows.
    if (longPressActiveRef.current) {
      longPressActiveRef.current = false
      return
    }
    onClick?.()
  }

  // Resolve badges: normalise statuses prop to a joined string then derive BadgeInfo[]
  const statusString = Array.isArray(statuses)
    ? statuses.join('+')
    : (statuses ?? '')
  const badges = getBadgesForPlayer(statusString, finalRank)

  // Build aria-label suffix from badges for screen readers
  const badgeLabels = badges.map((b) => b.label).join(', ')
  const ariaLabel = [name, isEvicted ? 'evicted' : null, badgeLabels || null]
    .filter(Boolean)
    .join(' – ')

  return (
    <div
      className={`${styles.tile} ${isEvicted ? styles.evicted : ''}`}
      aria-label={ariaLabel}
      title={name}
      role={onClick ? 'button' : 'group'}
      tabIndex={onClick ? 0 : undefined}
      onClick={handleClick}
      onTouchStart={onLongPress ? handleTouchStart : undefined}
      onTouchEnd={onLongPress ? handleTouchEnd : undefined}
      onTouchMove={onLongPress ? handleTouchMove : undefined}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <motion.div
        className={styles.avatarWrap}
        layoutId={layoutId}
        animate={
          // Only apply opacity animation when layoutId is present (shared-layout path).
          // isEvicting is only ever set to true for tiles participating in the match-cut
          // animation which always have a layoutId, so this coupling is intentional.
          layoutId ? { opacity: isEvicting ? 0 : 1 } : undefined
        }
        transition={layoutId ? {
          opacity: isEvicting ? { duration: 0.1 } : { duration: 0.2, delay: 0.3 },
        } : undefined}
      >
        <div className={styles.nameOverlay} aria-hidden="true">
          {name}
        </div>

        {isYou && (
          <span className={styles.youBadge} aria-hidden="true">
            YOU
          </span>
        )}

        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className={styles.avatar}
            onError={handleImgError}
            draggable={false}
          />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden="true" />
        )}

        {/* Status badge stack — top-left corner, stacked vertically */}
        {showPermanentBadge && badges.length > 0 && (
          <div className={styles.badgeStack} role="list">
            {badges.map((b) => (
              <span
                key={b.code}
                className={`${styles.statusBadge} ${styles[`badge_${b.code}`] ?? ''}`}
                role="listitem"
                aria-label={b.label}
                title={b.label}
              >
                {b.emoji}
              </span>
            ))}
          </div>
        )}

        {/* Evictee mark — paint brushstroke PNG overlay */}
        {isEvicted && (
          <img
            src={`${(import.meta.env.BASE_URL ?? '').replace(/\/$/, '')}/evictionmark/evictionmark.png`}
            alt=""
            aria-hidden="true"
            className={styles.cross}
            draggable={false}
          />
        )}
      </motion.div>

      <div className={styles.nameRow} aria-hidden="true" />
    </div>
  )
}
