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
  pairColor?: string
  pairIndex?: number
  pairLabel?: string
  partnerName?: string
  cupidLoveRevealed?: boolean
  cupidLoveReturning?: boolean
}

function CupidStatusBadgeIcon({ code }: { code: string }) {
  if (code === 'nominated') {
    return (
      <svg className={styles.cupidStatusIcon} viewBox="0 0 32 32" aria-hidden="true">
        <path
          className={styles.cupidStatusIconFill}
          d="M15.2 27.1C11.3 23.8 4.1 18.8 4.1 11.7c0-4 2.8-6.7 6.5-6.7 2.5 0 4.3 1.3 5.4 3.2C17.1 6.3 18.9 5 21.4 5c3.7 0 6.5 2.7 6.5 6.7 0 6.7-6.4 11.6-10.3 14.8"
        />
        <path
          className={styles.cupidStatusIconCrack}
          d="m17.5 7.3-3.3 6 3.6 2.1-3.7 4.1 2.2 1.7-1.1 5.9"
        />
      </svg>
    )
  }

  return null
}

function CupidEvictionMark() {
  return (
    <svg
      className={styles.cupidEvictionMark}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cupid-eviction-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff88b5" />
          <stop offset="0.55" stopColor="#dc4d86" />
          <stop offset="1" stopColor="#8f285d" />
        </linearGradient>
        <filter id="cupid-eviction-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#1a0613" floodOpacity=".72" />
        </filter>
      </defs>
      <g filter="url(#cupid-eviction-shadow)">
        <path
          className={styles.cupidEvictionHeartHalf}
          fill="url(#cupid-eviction-heart)"
          d="M56.5 98.5C39.2 84.4 14 67.6 14 43.6 14 28.4 24.6 18 38.5 18c9.2 0 15.5 4.7 20.1 11.8l-9.3 16.6 8.1 6.9-10.7 12 7.4 7.2-4.3 18.8 6.7 7.2Z"
        />
        <path
          className={styles.cupidEvictionHeartHalf}
          fill="url(#cupid-eviction-heart)"
          d="M63.2 98.6c17.4-14.1 42.8-31 42.8-55C106 28.4 95.4 18 81.5 18c-9.9 0-16.5 5.4-21 13.5L53 45l9.7 8.1-10.1 11.6 7.4 7.5-4.2 19.1 7.4 7.3Z"
        />
        <path
          className={styles.cupidEvictionCrack}
          d="m60.5 31.5-9.8 15.2 10.7 7-10.2 11.1 8.6 7.3-5.7 20.6"
        />
      </g>
    </svg>
  )
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
  pairColor,
  pairIndex,
  pairLabel,
  partnerName,
  cupidLoveRevealed = false,
  cupidLoveReturning = false,
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
    // Surveyeval robo tiles open their complete stats sheet on a normal tap.
    // Starting the generic long-press preview as well caused two dialogs to
    // appear in sequence on touch devices.
    if (isSurvivorRoboTile) return
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
        aria-label={
          pairLabel && partnerName
            ? `${ariaLabel}. ${pairLabel}, partnered with ${partnerName}`
            : ariaLabel
        }
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
        data-cupid-pair={pairLabel}
        style={
          pairColor
            ? ({
                '--cupid-pair-color': pairColor,
                '--cupid-pair-index': pairIndex ?? 0,
              } as React.CSSProperties)
            : undefined
        }
      >
        <motion.div
          className={[
            styles.avatarWrap,
            cupidLoveRevealed ? styles.cupidLoveRevealed : '',
            cupidLoveReturning ? styles.cupidLoveReturning : '',
            nominationCeremonyState ? styles[`nomination_${nominationCeremonyState}`] : '',
          ]
            .filter(Boolean)
            .join(' ')}
          layoutId={layoutId}
          data-ceremony-tile="true"
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

          {cupidLoveRevealed && (
            <span className={styles.cupidLoveStorm} aria-hidden="true">
              <i>♥</i><i>♥</i><i>♥</i><i>♥</i>
            </span>
          )}

          {pairLabel && (
            <span
              className={`${styles.cupidPairMarker}${cupidLoveRevealed ? ` ${styles.cupidPairMarkerReveal}` : ''}`}
              title={partnerName ? `${pairLabel}: partnered with ${partnerName}` : pairLabel}
              aria-label={pairLabel}
            >
              <span aria-hidden="true">{pairLabel.replace(/\D+/g, '')}</span>
            </span>
          )}

          {resolvedAvatarUrl ? (
            <img
              key={resolvedAvatarUrl}
              src={resolvedAvatarUrl}
              alt={name}
              className={`${styles.avatar}${cupidLoveRevealed ? ` ${styles.cupidLoveAvatar}` : ''}${cupidLoveReturning ? ` ${styles.cupidLoveReturnAvatar}` : ''}`}
              loading="eager"
              decoding="async"
              fetchPriority="high"
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
                  className={[
                    styles.statusBadge,
                    styles[`badge_${b.code}`] ?? '',
                    pairLabel && b.code === 'loh' ? styles.cupidPermanentLoh : '',
                    pairLabel && b.code === 'pos' ? styles.cupidPermanentPos : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="listitem"
                  aria-label={b.label}
                  title={b.label}
                >
                  {pairLabel && b.code === 'nominated' ? (
                    <CupidStatusBadgeIcon code={b.code} />
                  ) : b.imageSrc ? (
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
          {(isEvicted || isReturning) &&
            (pairLabel && isEvicted && !isReturning ? (
              <CupidEvictionMark />
            ) : (
              <img
                src={`${(import.meta.env.BASE_URL ?? '').replace(/\/$/, '')}/evictionmark/evictionmark.png`}
                alt=""
                aria-hidden="true"
                className={`${styles.cross}${isReturning ? ` ${styles.returningCross}` : ''}`}
              />
            ))}
        </motion.div>

        <div className={styles.nameRow} aria-hidden="true" />
      </div>
      {statsSheet}
    </>
  )
}
