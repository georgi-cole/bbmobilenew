import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import AvatarTile from './AvatarTile'
import StatusPill from '../ui/StatusPill'
import SurvivorStandoutCard from '../SurvivorStandout/SurvivorStandoutCard'
import SpotlightEvictionOverlay from '../Eviction/SpotlightEvictionOverlay'
import styles from './HouseguestGrid.module.css'
import './cupidRoseGold/CupidRoseGold.css'

import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { clearSurvivorReplacementTransition } from '../../store/gameSlice'
import { selectSurvivorStandout, type SurvivorStandoutMode } from '../../modes/survivorStandout'
import { getCupidPair, isCupidArrowVisualsRevealed } from '../../features/twists/cupidArrow'
import { resolveCupidLoveAvatar } from '../../utils/cupidLoveAvatar'
import { getDailyAtmosphere, type DailyAtmosphere } from '../../broadcasting/dailyMoodSystem'
import useSound from '../../hooks/useSound'

const HOUSEMATES_SECTION_TITLE = 'HUBMATES'

const WEATHER_REVEAL_SOUNDS: Record<
  DailyAtmosphere,
  { key: string; volume: number; delayMs: number }
> = {
  sunny: { key: 'ui:confirm', volume: 0.2, delayMs: 0 },
  cloudy: { key: 'ui:navigate', volume: 0.16, delayMs: 0 },
  rainy: { key: 'ui:navigate', volume: 0.14, delayMs: 0 },
  misty: { key: 'ui:navigate', volume: 0.12, delayMs: 80 },
  snowy: { key: 'ui:confirm', volume: 0.14, delayMs: 80 },
  sunset: { key: 'ui:confirm', volume: 0.16, delayMs: 0 },
  starry: { key: 'ui:navigate', volume: 0.13, delayMs: 100 },
  stormy: { key: 'minigame:cinematic_thunder', volume: 0.28, delayMs: 840 },
}

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
  /** Responsive budget-selected roster behavior. */
  rosterMode?: 'normal' | 'compact-small' | 'scroll'
  /** Whether the HOUSEMATES row stays above the board or moves into the TV chip. */
  headerMode?: 'tv-chip' | 'persistent'
  /** Changes when the measured layout budget changes. */
  layoutRevision?: number
  /** Optional alive/total chip shown beside the section heading. */
  occupancyLabel?: string
  /** Active player whose eviction cinematic is being played in reverse. */
  returningPlayerId?: string | null
  /** Called after the reverse-eviction cinematic settles into the roster tile. */
  onReturnAnimationDone?: () => void
  /** Shows the game-log launcher at the right edge of a persistent roster header. */
  showRosterLogLauncher?: boolean
}

/** Minimum grid height (px) even when available space is very tight */
const MIN_GRID_HEIGHT = 220
/** Fallback nav-bar height (px) matching --nav-bar-height CSS variable */
const DEFAULT_FOOTER_HEIGHT = 60
/** Extra vertical margin subtracted from available height */
const GRID_VERTICAL_MARGIN = 4

function resolveSurvivorStandoutMode(options: {
  compact: boolean
  rosterMode: 'normal' | 'compact-small' | 'scroll'
  viewportWidth: number
  viewportHeight: number
}): SurvivorStandoutMode {
  if (
    options.rosterMode === 'scroll' ||
    options.viewportHeight < 700 ||
    options.viewportWidth < 360
  ) {
    return 'mini-chip'
  }
  if (options.viewportWidth >= 720) return 'full-card'
  if (options.compact || options.rosterMode === 'compact-small') return 'compact-strip'
  return 'full-card'
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
  rosterMode = 'normal',
  headerMode = 'tv-chip',
  layoutRevision = 0,
  occupancyLabel,
  returningPlayerId = null,
  onReturnAnimationDone,
  showRosterLogLauncher = false,
}: Props) {
  const containerRef = useRef<HTMLElement | null>(null)
  const weatherRevealKeyRef = useRef<string | null>(null)
  const dispatch = useAppDispatch()
  const { play } = useSound()
  const game = useAppSelector((s) => s.game)
  const [weatherReveal, setWeatherReveal] = useState<DailyAtmosphere | null>(null)
  const cupidVisualsRevealed = isCupidArrowVisualsRevealed(game)
  const previousCupidVisualsRevealedRef = useRef(cupidVisualsRevealed)
  const cupidPairFocusTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [cupidRevealAnimating, setCupidRevealAnimating] = useState(false)
  const [cupidReturnAnimating, setCupidReturnAnimating] = useState(false)
  const [focusedCupidPairId, setFocusedCupidPairId] = useState<string | null>(null)
  const challengeHistory = useAppSelector((s) => s.challenge?.history ?? [])

  useEffect(() => {
    const wasRevealed = previousCupidVisualsRevealedRef.current
    previousCupidVisualsRevealedRef.current = cupidVisualsRevealed
    if (!wasRevealed && cupidVisualsRevealed) {
      const revealTimer = window.setTimeout(() => setCupidRevealAnimating(true), 0)
      const resetTimer = window.setTimeout(() => setCupidRevealAnimating(false), 2200)
      return () => {
        window.clearTimeout(revealTimer)
        window.clearTimeout(resetTimer)
      }
    }
    if (wasRevealed && !cupidVisualsRevealed && game.cupidArrow?.status === 'broken') {
      const returnTimer = window.setTimeout(() => {
        setCupidRevealAnimating(false)
        setCupidReturnAnimating(true)
      }, 0)
      const resetTimer = window.setTimeout(() => setCupidReturnAnimating(false), 1350)
      return () => {
        window.clearTimeout(returnTimer)
        window.clearTimeout(resetTimer)
      }
    }
    if (!cupidVisualsRevealed) {
      const resetTimer = window.setTimeout(() => setCupidRevealAnimating(false), 0)
      return () => window.clearTimeout(resetTimer)
    }
  }, [cupidVisualsRevealed, game.cupidArrow?.status])

  useEffect(
    () => () => {
      if (cupidPairFocusTimerRef.current) window.clearTimeout(cupidPairFocusTimerRef.current)
    },
    []
  )

  const focusCupidPair = (pairId: string | null, hold = false) => {
    if (!cupidVisualsRevealed || !pairId) return
    if (cupidPairFocusTimerRef.current) window.clearTimeout(cupidPairFocusTimerRef.current)
    setFocusedCupidPairId(pairId)
    if (hold) {
      cupidPairFocusTimerRef.current = window.setTimeout(() => {
        setFocusedCupidPairId(null)
        cupidPairFocusTimerRef.current = null
      }, 1200)
    }
  }
  const returningPlayer = useMemo(
    () =>
      returningPlayerId
        ? (game.players.find((player) => player.id === returningPlayerId) ?? null)
        : null,
    [game.players, returningPlayerId]
  )
  const survivorReplacementTransition =
    game.modeSpecific?.kind === 'survival'
      ? (game.modeSpecific.replacementTransition ?? null)
      : null
  const survivorRoboStatsById = useMemo(() => {
    const statsById = new Map<string, RoboStatsSummary>()
    if (game.mode !== 'survival') return statsById
    const currentDay =
      game.modeSpecific?.kind === 'survival' ? game.modeSpecific.currentDay : game.week
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
    if (game.mode !== 'survival' || survivorReplacementTransition === null) return houseguests

    const outgoing = survivorReplacementTransition.outgoingPlayerSnapshot
    const incomingId = survivorReplacementTransition.incomingPlayerId
    const slot = survivorReplacementTransition.slot
    const incomingIndex = houseguests.findIndex(
      (houseguest) => String(houseguest.id) === incomingId
    )
    const slotIndex = game.players.findIndex((player) => player.survivorSlot === slot)
    const targetIndex = incomingIndex >= 0 ? incomingIndex : slotIndex
    if (targetIndex < 0 || targetIndex >= houseguests.length) return houseguests

    return houseguests.map((houseguest, index) =>
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
    )
  }, [game.mode, game.players, game.week, houseguests, survivorReplacementTransition])
  const headerSignal = occupancyLabel ?? `${renderedHouseguests.length}`
  const showSurvivorStandout = game.mode === 'survival' && overlaySelector === '.game-control-dock'
  const survivorStandout = useMemo(
    () => (showSurvivorStandout ? selectSurvivorStandout(game, challengeHistory) : null),
    [challengeHistory, game, showSurvivorStandout]
  )
  const visualViewport = typeof window === 'undefined' ? undefined : window.visualViewport
  const viewportWidth =
    visualViewport?.width ?? (typeof window === 'undefined' ? 0 : window.innerWidth)
  const viewportHeight =
    visualViewport?.height ?? (typeof window === 'undefined' ? 0 : window.innerHeight)
  const survivorStandoutMode = resolveSurvivorStandoutMode({
    compact,
    rosterMode,
    viewportWidth,
    viewportHeight,
  })

  useEffect(() => {
    if (game.phase !== 'week_start' && game.phase !== 'week_end') {
      return undefined
    }

    const atmosphere = getDailyAtmosphere(game.gameId, game.week, game.phase)
    if (!atmosphere) return undefined

    const revealKey = `${game.week}-${game.phase}-${atmosphere}`
    if (weatherRevealKeyRef.current === revealKey) return undefined
    weatherRevealKeyRef.current = revealKey
    const revealTimer = window.setTimeout(() => setWeatherReveal(atmosphere), 0)
    const sound = WEATHER_REVEAL_SOUNDS[atmosphere]
    const soundTimer = window.setTimeout(
      () => play(sound.key, { volume: sound.volume }),
      sound.delayMs
    )
    const timer = window.setTimeout(() => setWeatherReveal(null), 3000)
    return () => {
      window.clearTimeout(revealTimer)
      window.clearTimeout(soundTimer)
      window.clearTimeout(timer)
    }
  }, [game.gameId, game.phase, game.week, play])

  useEffect(() => {
    if (survivorReplacementTransition === null) return undefined
    const remainingMs = Math.max(
      0,
      survivorReplacementTransition.startedAt +
        survivorReplacementTransition.durationMs -
        Date.now()
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
        listTop =
          listEl instanceof HTMLElement
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

      const available = Math.max(MIN_GRID_HEIGHT, bottomBoundary - listTop - GRID_VERTICAL_MARGIN)
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
  }, [headerSelector, footerSelector, layoutRevision, overlaySelector])

  const gridSizeClass = gridSize === 16 ? styles.hgGrid16 : gridSize === 12 ? styles.hgGrid12 : ''
  const effectiveCompactLayout = compact ? 'small' : 'default'
  const listClassName = `${styles.grid}${gridSizeClass ? ` ${gridSizeClass}` : ''}`
  const itemClassName = styles.gridItem
  const sectionClassName = [
    styles.container,
    compact ? styles.compact : '',
    effectiveCompactLayout === 'small' ? styles.compactSmall : '',
    rosterMode === 'scroll' ? styles.scrollRoster : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <section
        ref={containerRef}
        className={sectionClassName}
        aria-labelledby="houseguests-heading"
        data-compact-layout={effectiveCompactLayout}
        data-roster-mode={rosterMode}
        data-header-mode={headerMode}
        data-houseguest-roster="true"
      >
        <div key={headerSignal} className={styles.headerRow} aria-live="polite">
          <h3 id="houseguests-heading" className={styles.header}>
            {HOUSEMATES_SECTION_TITLE}
            {showCountInHeader && (
              <span className={styles.count}> ({renderedHouseguests.length})</span>
            )}
            {!showCountInHeader && (
              <span className="visually-hidden"> ({renderedHouseguests.length})</span>
            )}
          </h3>
          {occupancyLabel && (
            <StatusPill
              variant="ghost"
              label={occupancyLabel}
              ariaLabel={`${occupancyLabel} players`}
            />
          )}
          {showRosterLogLauncher && (
            <button
              type="button"
              className={styles.rosterLogLauncher}
              aria-label="Open game log"
              onClick={() => window.dispatchEvent(new CustomEvent('tv:open-game-log'))}
            >
              <span aria-hidden="true">☷</span>
              <span>Log</span>
            </button>
          )}
        </div>

        <p id="houseguests-interaction-instructions" className={styles.interactionInstructions}>
          Tap a player to interact. Press and hold to preview their profile.
        </p>

        {weatherReveal && (game.phase === 'week_start' || game.phase === 'week_end') && (
          <div className={styles.weatherReveal} data-weather={weatherReveal} aria-hidden="true" />
        )}

        <ul
          className={listClassName}
          role="list"
          data-roster-scroll={rosterMode === 'scroll' ? 'true' : undefined}
        >
          {renderedHouseguests.map((hg) => {
            const resolvedRoboStats = hg.roboStats ?? survivorRoboStatsById.get(String(hg.id))
            const cupidPair = cupidVisualsRevealed ? getCupidPair(game, String(hg.id)) : null
            const cupidPartnerId = cupidPair?.memberIds.find((id) => id !== String(hg.id))
            const cupidPartnerName = cupidPartnerId
              ? game.players.find((player) => player.id === cupidPartnerId)?.name
              : undefined
            return (
              <li
                key={hg.id}
                className={`${itemClassName}${focusedCupidPairId === cupidPair?.id ? ` ${styles.cupidPairFocused}` : ''}`}
                data-player-id={String(hg.id)}
                onPointerEnter={() => focusCupidPair(cupidPair?.id ?? null)}
                onPointerLeave={() => setFocusedCupidPairId(null)}
                onFocusCapture={() => focusCupidPair(cupidPair?.id ?? null)}
                onBlurCapture={() => setFocusedCupidPairId(null)}
                onPointerDown={() => focusCupidPair(cupidPair?.id ?? null, true)}
              >
                <AvatarTile
                  name={hg.name}
                  avatarUrl={
                    cupidVisualsRevealed ? resolveCupidLoveAvatar(hg.avatarUrl) : hg.avatarUrl
                  }
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
                  descriptionId="houseguests-interaction-instructions"
                  pairColor={cupidPair?.color}
                  pairIndex={cupidPair ? Number(cupidPair.id.replace(/\D+/g, '')) - 1 : undefined}
                  pairLabel={
                    cupidPair ? `Pair ${cupidPair.id.replace('cupid-pair-', '')}` : undefined
                  }
                  partnerName={cupidPartnerName}
                  cupidLoveRevealed={cupidRevealAnimating}
                  cupidLoveReturning={cupidReturnAnimating}
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
        {survivorStandout && (
          <SurvivorStandoutCard standout={survivorStandout} mode={survivorStandoutMode} />
        )}
      </section>

      <AnimatePresence>
        {returningPlayer && onReturnAnimationDone && (
          <SpotlightEvictionOverlay
            key={`battle-back-return-${returningPlayer.id}`}
            evictee={returningPlayer}
            contextLabel={`Season ${game.season} · Day ${game.week}`}
            layoutId={`avatar-tile-${returningPlayer.id}`}
            variant="return"
            onDone={onReturnAnimationDone}
            devSkip={import.meta.env.DEV || import.meta.env.CI === 'true'}
          />
        )}
      </AnimatePresence>
    </>
  )
}
