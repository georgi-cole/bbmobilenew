import React from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { avatarVariants } from '../../utils/avatarCase'
import { getLocalAvatarFallback, getProfilePhotoAvatarId } from '../../utils/avatar'
import { imageIdToDataUrl } from '../../utils/imageDb'
import { getBadgesForPlayer } from '../../utils/statusBadges'
import styles from './HouseguestGrid.module.css'

/** How long (ms) a finger must be held before it is treated as a long-press. */
export const AVATAR_TILE_LONG_PRESS_DELAY_MS = 450
/** How long (ms) after a long-press fires to suppress the subsequent click event. */
export const LONG_PRESS_CLICK_SUPPRESSION_MS = 600
/** Pixel-distance threshold: if the finger moves more than this the long-press is cancelled. */
export const LONG_PRESS_MOVE_THRESHOLD_PX = 10

type RoboStatsSummary = {
  daysInGame?: number | null
  lohWins?: number | null
  posWins?: number | null
  averageLohRank?: number | null
  averagePosRank?: number | null
}

type Props = {
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
  /** Optional compact Survivor robo stats shown when tapping robo tiles. */
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
   * Game statuses to display as badge overlays on the avatar.
   * Accepts a single PlayerStatus string (e.g. 'loh', 'nominated+pos')
   * or an array of individual status codes.
   * Supported codes: 'loh' 👑, 'pos' 🛡️, 'veto_safe' 🔰, 'nominated' ❓, 'jury' ⚖️
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
  /** Runs the reverse-eviction treatment directly on this roster tile. */
  isReturning?: boolean
  nominationCeremonyState?: 'loh' | 'danger' | 'locked'
  /** Shared instructions announced when this tile is interactive. */
  descriptionId?: string
}

function formatStat(value: number | null | undefined, options: { decimals?: number } = {}) {
  if (value == null || Number.isNaN(value)) return '—'
  return options.decimals != null ? value.toFixed(options.decimals) : String(value)
}

export default function AvatarTile({
  name,
  avatarUrl,
  isEvicted,
  isYou,
  onClick,
  roboStats,
  onHoldPreviewStart,
  onHoldPreviewEnd,
  statuses,
  finalRank,
  showPermanentBadge = true,
  layoutId,
  isEvicting,
  isReturning = false,
  nominationCeremonyState,
  descriptionId,
}: Props) {
  const profilePhotoId = getProfilePhotoAvatarId(avatarUrl)
  const attemptRef = React.useRef(0)
  const variantsRef = React.useRef<string[] | null>(null)
  const exhaustedRef = React.useRef(false)
  const longPressTimeoutRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const suppressClickUntilRef = React.useRef(0)
  const touchStartPosRef = React.useRef<{ x: number; y: number } | null>(null)
  const isHoldActiveRef = React.useRef(false)
  const [statsOpen, setStatsOpen] = React.useState(false)
  const [isPressing, setIsPressing] = React.useState(false)
  const [profilePhotoUrl, setProfilePhotoUrl] = React.useState<string | null>(null)
  const resolvedAvatarUrl = profilePhotoUrl ?? (profilePhotoId ? undefined : avatarUrl)
  const isSurvivorRoboTile = Boolean(roboStats) || Boolean(avatarUrl?.includes('bottts'))

  React.useEffect(() => {
    attemptRef.current = 0
    variantsRef.current = null
    exhaustedRef.current = false
  }, [avatarUrl])

  React.useEffect(() => {
    let cancelled = false
    setProfilePhotoUrl(null)
    if (!profilePhotoId) return undefined

    imageIdToDataUrl(profilePhotoId).then((url) => {
      if (!cancelled) setProfilePhotoUrl(url)
    })

    return () => {
      cancelled = true
    }
  }, [profilePhotoId])

  React.useEffect(
    () => () => {
      if (longPressTimeoutRef.current !== null) {
        window.clearTimeout(longPressTimeoutRef.current)
      }
    },
    []
  )

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
    img.src = getLocalAvatarFallback(name, isYou)
  }

  // Resolve badges: normalise statuses prop to a joined string then derive BadgeInfo[]
  const statusString = Array.isArray(statuses) ? statuses.join('+') : (statuses ?? '')
  const badges = getBadgesForPlayer(statusString, finalRank)
  const suppressSurvivalLeaderStats = isSurvivorRoboTile && statusString.split('+').includes('loh')

  // Build aria-label suffix from badges for screen readers
  const badgeLabels = badges.map((b) => b.label).join(', ')
  const ariaLabel = [name, isEvicted ? 'evicted' : null, badgeLabels || null]
    .filter(Boolean)
    .join(' – ')

  function clearLongPressTimeout() {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!onHoldPreviewStart) return
    setIsPressing(true)
    clearLongPressTimeout()
    isHoldActiveRef.current = false
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    const timeoutId = window.setTimeout(() => {
      if (longPressTimeoutRef.current !== timeoutId) return
      longPressTimeoutRef.current = null
      // If there is no hold-preview behavior, don't mark a hold as active or suppress clicks.
      if (!onHoldPreviewStart) return
      // Mark hold as active and notify the parent to show the transient preview.
      isHoldActiveRef.current = true
      suppressClickUntilRef.current = Date.now() + LONG_PRESS_CLICK_SUPPRESSION_MS
      onHoldPreviewStart()
    }, AVATAR_TILE_LONG_PRESS_DELAY_MS)
    longPressTimeoutRef.current = timeoutId
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!touchStartPosRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartPosRef.current.x
    const dy = touch.clientY - touchStartPosRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD_PX) {
      // Once the hold-preview is visible, keep it open until the touch ends/cancels
      // so the player can drag their finger away and still read the dialog.
      if (isHoldActiveRef.current) return
      clearLongPressTimeout()
      setIsPressing(false)
      touchStartPosRef.current = null
    }
  }

  function handleTouchEnd() {
    clearLongPressTimeout()
    setIsPressing(false)
    touchStartPosRef.current = null
    if (isHoldActiveRef.current) {
      isHoldActiveRef.current = false
      if (onHoldPreviewEnd) onHoldPreviewEnd()
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (Date.now() < suppressClickUntilRef.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (isSurvivorRoboTile && !isEvicted && !suppressSurvivalLeaderStats) {
      setStatsOpen(true)
    }
    if (onClick) onClick()
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    if (!onClick && !onHoldPreviewStart && !isSurvivorRoboTile) return
    e.preventDefault()
    e.stopPropagation()
  }

  const isInteractive = Boolean(onClick ?? onHoldPreviewStart ?? isSurvivorRoboTile)

  const statsSheet = statsOpen
    ? createPortal(
        <div
          className={styles.roboStatsBackdrop}
          role="presentation"
          onClick={() => setStatsOpen(false)}
        >
          <section
            className={styles.roboStatsSheet}
            role="dialog"
            aria-modal="true"
            aria-label={`${name} robo stats`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.roboStatsHandle} aria-hidden="true" />
            <div className={styles.roboStatsHeader}>
              <div>
                <p className={styles.roboStatsEyebrow}>Synthetic Contestant</p>
                <h2 className={styles.roboStatsName}>{name}</h2>
              </div>
              <button
                type="button"
                className={styles.roboStatsClose}
                onClick={() => setStatsOpen(false)}
                aria-label="Close stats"
              >
                ×
              </button>
            </div>
            <dl className={styles.roboStatsGrid}>
              <div>
                <dt>Days in game</dt>
                <dd>{formatStat(roboStats?.daysInGame)}</dd>
              </div>
              <div>
                <dt>LOHs won</dt>
                <dd>{formatStat(roboStats?.lohWins)}</dd>
              </div>
              <div>
                <dt>POS won</dt>
                <dd>{formatStat(roboStats?.posWins)}</dd>
              </div>
              <div>
                <dt>Avg LOH rank</dt>
                <dd>{formatStat(roboStats?.averageLohRank, { decimals: 1 })}</dd>
              </div>
              <div>
                <dt>Avg POS rank</dt>
                <dd>{formatStat(roboStats?.averagePosRank, { decimals: 1 })}</dd>
              </div>
            </dl>
          </section>
        </div>,
        document.body
      )
    : null

  return (
    <>
      <div
        className={[
          styles.tile,
          isEvicted ? styles.evicted : '',
          isReturning ? styles.returning : '',
          isInteractive ? styles.interactive : '',
          isPressing ? styles.pressing : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={ariaLabel}
        aria-describedby={isInteractive ? descriptionId : undefined}
        title={name}
        role={isInteractive ? 'button' : 'group'}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onKeyDown={
          isInteractive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (isSurvivorRoboTile && !isEvicted && !suppressSurvivalLeaderStats)
                    setStatsOpen(true)
                  if (onClick) onClick()
                }
              }
            : undefined
        }
      >
        <motion.div
          className={[
            styles.avatarWrap,
            nominationCeremonyState ? styles[`nomination_${nominationCeremonyState}`] : '',
          ]
            .filter(Boolean)
            .join(' ')}
          layoutId={layoutId}
          data-nomination-ceremony-state={nominationCeremonyState}
          animate={
            // Only apply opacity animation when layoutId is present (shared-layout path).
            // isEvicting is only ever set to true for tiles participating in the match-cut
            // animation which always have a layoutId, so this coupling is intentional.
            layoutId ? { opacity: isEvicting ? 0 : 1 } : undefined
          }
          transition={
            layoutId
              ? {
                  opacity: isEvicting ? { duration: 0.1 } : { duration: 0.2, delay: 0.3 },
                }
              : undefined
          }
        >
          <div className={styles.nameOverlay} aria-hidden="true">
            {name}
          </div>
          {isPressing && <span className={styles.holdProgress} aria-hidden="true" />}

          {isYou && (
            <span className={styles.youBadge} aria-hidden="true">
              YOU
            </span>
          )}

          {resolvedAvatarUrl ? (
            <img
              src={resolvedAvatarUrl}
              alt={name}
              className={styles.avatar}
              onError={handleImgError}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
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
                  {b.imageSrc ? (
                    <img
                      src={b.imageSrc}
                      alt=""
                      aria-hidden="true"
                      className={styles.statusBadgeImage}
                    />
                  ) : (
                    b.emoji
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Evictee mark — paint brushstroke PNG overlay */}
          {(isEvicted || isReturning) && (
            <img
              src={`${(import.meta.env.BASE_URL ?? '').replace(/\/$/, '')}/evictionmark/evictionmark.png`}
              alt=""
              aria-hidden="true"
              className={`${styles.cross}${isReturning ? ` ${styles.returningCross}` : ''}`}
            />
          )}
        </motion.div>

        <div className={styles.nameRow} aria-hidden="true" />
      </div>
      {statsSheet}
    </>
  )
}
