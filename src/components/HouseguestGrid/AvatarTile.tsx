import React from 'react'
import { avatarVariants } from '../../utils/avatarCase'
import { getBadgesForPlayer } from '../../utils/statusBadges'
import styles from './HouseguestGrid.module.css'

type Props = {
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
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
}

export default function AvatarTile({ name, avatarUrl, isEvicted, isYou, onClick, statuses, finalRank, showPermanentBadge = true }: Props) {
  const attemptRef = React.useRef(0)
  const variantsRef = React.useRef<string[] | null>(null)
  const exhaustedRef = React.useRef(false)

  React.useEffect(() => {
    attemptRef.current = 0
    variantsRef.current = null
    exhaustedRef.current = false
  }, [avatarUrl])

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
      onClick={onClick}
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
      <div className={styles.avatarWrap}>
        <div className={styles.nameOverlay} aria-hidden="true">
          {name}
        </div>

        {isYou && (
          <span className={styles.youBadge} aria-hidden="true">
            YOU
          </span>
        )}

        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className={styles.avatar} onError={handleImgError} />
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

        {/* Evictee X overlay — subtle thin-stroke red cross with low opacity */}
        {isEvicted && (
          <svg
            className={styles.cross}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1="15"
              y1="15"
              x2="85"
              y2="85"
              stroke="rgba(220, 38, 38, 0.65)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <line
              x1="85"
              y1="15"
              x2="15"
              y2="85"
              stroke="rgba(220, 38, 38, 0.65)"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <div className={styles.nameRow} aria-hidden="true" />
    </div>
  )
}
