import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { advance, hydrateGame, setHasSeenConfessionalSpotlight } from '../../store/gameSlice'
import {
  openIncomingInbox,
  openSocialPanel,
  selectEnergyBank,
  selectPendingIncomingInteractionCount,
} from '../../social/socialSlice'
import { selectAllDirections } from '../../publicOpinion'
import {
  selectAdvanceEnabled,
  selectIsWaitingForInput,
  selectConfessionalAlertCount,
  selectHumanCanUseSocialModules,
  selectHumanCanUseIncomingSocialModule,
} from '../../store/selectors'
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import {
  getBlockedSocialModuleAnnouncementMessage,
  getIncomingSocialModuleAvailability,
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
  type SocialModuleAvailability,
} from '../../social/socialModuleAvailability'
import { selectActiveProfileId, selectIsGuest } from '../../store/profilesSlice'
import { clearSavedRun, loadSavedRunProfile } from '../../store/saveStatePersistence'
import {
  createSurvivorRun,
  getSurvivorCurrentDay,
  isSurvivorRunTerminal,
} from '../../modes/survivorRun'
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal'
import GameControlDock from '../GameControlDock/GameControlDock'
import ConfessionalSpotlightOverlay from './ConfessionalSpotlightOverlay'
import { resolveBalancedDockBottom } from './floatingActionBarLayout'
import { resolvePublicMeterDestination } from './publicMeterNavigation'

const CONFESSIONAL_FLASH_DURATION_MS = 1800
const SURVIVOR_DISABLED_MESSAGE_MS = 5000

type FloatingActionBarProps = {
  /** Called when the player activates Public Meter while public mode is disabled. */
  onPublicMeterBlocked?: () => void
  /** Called when the player activates a blocked social module. */
  onSocialModuleBlocked?: (availability: SocialModuleAvailability) => void
}

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Actions]  ●Play●  [Public Meter] [Diary Room]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input (replacement nominee, Final 4 POS vote, Final 3 LOH eviction).
 * - Left side: Social module + incoming social actions.
 * - Right side: Public Meter hook + Diary Room shortcut.
 */
export default function FloatingActionBar({
  onPublicMeterBlocked,
  onSocialModuleBlocked,
}: FloatingActionBarProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const canAdvance = useAppSelector(selectAdvanceEnabled)
  const isWaiting = useAppSelector(selectIsWaitingForInput)
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount)
  const confessionalAlertCount = useAppSelector(selectConfessionalAlertCount)
  const canUseSocialModules = useAppSelector(selectHumanCanUseSocialModules)
  const canUseIncomingSocialModule = useAppSelector(selectHumanCanUseIncomingSocialModule)
  const activeConfessionalDecision = useAppSelector(selectActiveConfessionalDecision)
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const isGuest = useAppSelector(selectIsGuest)
  const game = useAppSelector((s) => s.game)
  const players = useAppSelector((s) => s.game.players)
  const energyBank = useAppSelector(selectEnergyBank)
  const directions = useAppSelector(selectAllDirections)
  const advanceProgressKey = [
    game.phase,
    game.aiReplacementStep ?? 0,
    game.aiReplacementWaiting ? 'waiting-for-replacement-render' : 'replacement-ready',
    game.specialVeto?.vipUseStage ?? 0,
    game.voxPopuli?.finalThreePacingSeen?.join(',') ?? 'no-final-three-pacing',
    isWaiting ? 'waiting-for-input' : 'ready',
  ].join(':')
  const advancedProgressRef = useRef<string | null>(null)
  useEffect(() => {
    advancedProgressRef.current = null
  }, [advanceProgressKey])
  const isSurvivorMode = game.mode === 'survival'
  const survivorTerminalActive = isSurvivorRunTerminal(game)
  const battleBackAnnouncementActive =
    game.battleBack?.active === true && game.battleBack.competitionActive !== true
  const voxPopuliActive = game.voxPopuli?.status === 'active'
  const voxTransitionOwnsPlay =
    game.voxPopuli?.awaitingPublicVote === true || game.voxPopuli?.finaleStage === 'ready'

  const humanPlayer = players.find((p) => p.isUser)
  const humanEnergy = humanPlayer ? (energyBank?.[humanPlayer.id] ?? 0) : null
  const publicRequestCount = useMemo(
    () =>
      humanPlayer
        ? directions.filter(
            (direction) => direction.playerId === humanPlayer.id && direction.status === 'active'
          ).length
        : 0,
    [directions, humanPlayer]
  )
  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game])
  const incomingSocialModuleAvailability = useMemo(
    () => getIncomingSocialModuleAvailability(game),
    [game]
  )
  const socialModulesUnavailable = !canUseSocialModules
  const incomingSocialModuleUnavailable = !canUseIncomingSocialModule
  const survivorDay = getSurvivorCurrentDay(game)
  const bestSurvivorRecord = useMemo(
    () =>
      !isGuest && activeProfileId
        ? loadSavedRunProfile(activeProfileId).stats.maxSurvivorDaysSurvived
        : 0,
    [activeProfileId, isGuest]
  )
  const survivorEndDescription =
    bestSurvivorRecord > survivorDay
      ? `You were eliminated on Day ${survivorDay}. Best survival record: ${bestSurvivorRecord} days.`
      : `You were eliminated on Day ${survivorDay}.`

  // Flash the social button whenever the human player's energy changes.
  const [isFlashing, setIsFlashing] = useState(false)
  const [blockedAnnouncement, setBlockedAnnouncement] = useState<{
    id: number
    message: string
  } | null>(null)
  const prevEnergyRef = useRef(humanEnergy)
  useEffect(() => {
    if (humanEnergy === null || humanEnergy === prevEnergyRef.current) {
      prevEnergyRef.current = humanEnergy
      return
    }
    prevEnergyRef.current = humanEnergy
    // Defer to avoid synchronous setState inside an effect body.
    const flashOn = setTimeout(() => setIsFlashing(true), 0)
    const flashOff = setTimeout(() => setIsFlashing(false), 600)
    return () => {
      clearTimeout(flashOn)
      clearTimeout(flashOff)
    }
  }, [humanEnergy])

  useEffect(() => {
    if (!blockedAnnouncement) return undefined
    const timeout = window.setTimeout(() => {
      setBlockedAnnouncement((current) => (current?.id === blockedAnnouncement.id ? null : current))
    }, SURVIVOR_DISABLED_MESSAGE_MS)
    return () => window.clearTimeout(timeout)
  }, [blockedAnnouncement])

  const showSurvivorBlockedMessage = useCallback((message: string | null) => {
    if (!message) return
    setBlockedAnnouncement({ id: Date.now(), message })
  }, [])

  const [isConfessionalFlashing, setIsConfessionalFlashing] = useState(false)
  const [confessionalFlashTick, setConfessionalFlashTick] = useState(0)
  const [triggeredConfessionalDecisionKey, setTriggeredConfessionalDecisionKey] = useState<
    string | null
  >(null)
  const [showConfessionalSpotlight, setShowConfessionalSpotlight] = useState(false)
  const confessionalIconRef = useRef<HTMLImageElement | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const prevConfessionalCountRef = useRef(confessionalAlertCount)
  const hasPendingConfessionalDecision = activeConfessionalDecision !== null
  const hasSeenConfessionalSpotlight = game.hasSeenConfessionalSpotlight === true
  const activeConfessionalDecisionKey = activeConfessionalDecision
    ? `${activeConfessionalDecision.type}:${activeConfessionalDecision.week}:${activeConfessionalDecision.phase}`
    : null
  useEffect(() => {
    if (confessionalAlertCount <= prevConfessionalCountRef.current) {
      prevConfessionalCountRef.current = confessionalAlertCount
      return
    }

    prevConfessionalCountRef.current = confessionalAlertCount
    const flashOn = setTimeout(() => {
      setConfessionalFlashTick((tick) => tick + 1)
      setIsConfessionalFlashing(true)
    }, 0)
    const flashOff = setTimeout(
      () => setIsConfessionalFlashing(false),
      CONFESSIONAL_FLASH_DURATION_MS
    )
    return () => {
      clearTimeout(flashOn)
      clearTimeout(flashOff)
    }
  }, [confessionalAlertCount])
  const confessionalPromptActivated =
    activeConfessionalDecisionKey !== null &&
    triggeredConfessionalDecisionKey === activeConfessionalDecisionKey
  const primaryDisabled =
    survivorTerminalActive ||
    (hasPendingConfessionalDecision ? confessionalPromptActivated : isWaiting)
  const primaryPulse = survivorTerminalActive
    ? false
    : hasPendingConfessionalDecision
      ? !confessionalPromptActivated
      : canAdvance && !isWaiting
  const confessionalPersistentFlash = hasPendingConfessionalDecision && confessionalPromptActivated
  const confessionalSpotlightEligible =
    hasPendingConfessionalDecision && confessionalPromptActivated && !hasSeenConfessionalSpotlight

  const completeConfessionalSpotlight = useCallback(() => {
    setShowConfessionalSpotlight(false)
    if (!hasSeenConfessionalSpotlight) {
      dispatch(setHasSeenConfessionalSpotlight(true))
    }
  }, [dispatch, hasSeenConfessionalSpotlight])

  const handleChatClick = useCallback(() => {
    if (!canUseSocialModules) {
      logBlockedSocialModuleOpen(
        'Outgoing social module',
        socialModuleAvailability,
        'FloatingActionBar chat button'
      )
      if (isSurvivorMode) {
        showSurvivorBlockedMessage(
          getBlockedSocialModuleAnnouncementMessage(socialModuleAvailability)
        )
        return
      }
      onSocialModuleBlocked?.(socialModuleAvailability)
      return
    }
    dispatch(openSocialPanel())
  }, [
    canUseSocialModules,
    dispatch,
    isSurvivorMode,
    onSocialModuleBlocked,
    showSurvivorBlockedMessage,
    socialModuleAvailability,
  ])

  const handleIncomingRequestsClick = useCallback(() => {
    if (!canUseIncomingSocialModule) {
      logBlockedSocialModuleOpen(
        'Incoming social module',
        incomingSocialModuleAvailability,
        'FloatingActionBar incoming requests button'
      )
      if (isSurvivorMode) {
        showSurvivorBlockedMessage(
          getBlockedSocialModuleAnnouncementMessage(incomingSocialModuleAvailability)
        )
        return
      }
      onSocialModuleBlocked?.(incomingSocialModuleAvailability)
      return
    }
    dispatch(openIncomingInbox())
  }, [
    canUseIncomingSocialModule,
    dispatch,
    incomingSocialModuleAvailability,
    isSurvivorMode,
    onSocialModuleBlocked,
    showSurvivorBlockedMessage,
  ])

  const dispatchPlayPressedEvent = useCallback((): boolean => {
    try {
      return window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    } catch (error) {
      console.warn('Failed to dispatch ui:playPressed event.', error)
      return true
    }
  }, [])

  const handlePrimaryActionClick = useCallback(() => {
    if (survivorTerminalActive) return
    setBlockedAnnouncement(null)
    if (hasPendingConfessionalDecision) {
      setTriggeredConfessionalDecisionKey(activeConfessionalDecisionKey)
      setConfessionalFlashTick((tick) => tick + 1)
      if (!hasSeenConfessionalSpotlight) {
        setShowConfessionalSpotlight(true)
      }
      dispatchPlayPressedEvent()
      return
    }

    // Some presentation state machines use the global Play signal to perform
    // their own authoritative transition. They must get the press without an
    // additional generic advance() in the same event turn, even if an older
    // listener forgot to call preventDefault().
    if (battleBackAnnouncementActive || voxTransitionOwnsPlay) {
      dispatchPlayPressedEvent()
      return
    }

    if (advancedProgressRef.current === advanceProgressKey) {
      // Vox Populi can intentionally queue several manual broadcast cards
      // within one reducer phase. Repeated Play presses reveal those cards
      // without repeating the underlying phase transition.
      if (voxPopuliActive) {
        dispatchPlayPressedEvent()
      }
      return
    }
    // Faux TV gets first refusal on Play. A persistent major/critical card can
    // consume the press so its queued story beat is actually seen before the
    // reducer is allowed to generate the next phase behind it.
    if (!dispatchPlayPressedEvent()) return
    advancedProgressRef.current = advanceProgressKey
    dispatch(advance())
  }, [
    activeConfessionalDecisionKey,
    advanceProgressKey,
    battleBackAnnouncementActive,
    dispatch,
    dispatchPlayPressedEvent,
    hasPendingConfessionalDecision,
    hasSeenConfessionalSpotlight,
    survivorTerminalActive,
    voxPopuliActive,
    voxTransitionOwnsPlay,
  ])

  const handleToolClick = useCallback(() => {
    if (confessionalSpotlightEligible) {
      completeConfessionalSpotlight()
    }
    setTriggeredConfessionalDecisionKey(null)
    navigate('/diary-room')
  }, [completeConfessionalSpotlight, confessionalSpotlightEligible, navigate])

  const handlePublicMeterClick = useCallback(() => {
    if (game.publicModeEnabled !== true) {
      onPublicMeterBlocked?.()
      return
    }
    navigate(resolvePublicMeterDestination(true, publicRequestCount))
  }, [game.publicModeEnabled, navigate, onPublicMeterBlocked, publicRequestCount])

  const handleStartNewSurvivor = useCallback(() => {
    if (!isGuest && activeProfileId) {
      clearSavedRun(activeProfileId, 'survival')
    }
    dispatch({ type: 'challenge/setPendingChallenge', payload: null })
    dispatch(hydrateGame(createSurvivorRun()))
    navigate('/game', { replace: true })
  }, [activeProfileId, dispatch, isGuest, navigate])

  const handleReturnHome = useCallback(() => {
    dispatch({ type: 'challenge/setPendingChallenge', payload: null })
    navigate('/')
  }, [dispatch, navigate])

  const handleMoreClick = useCallback(
    (destination: 'settings' | 'profile' | 'rules' | 'leaderboard' | 'store') => {
      const routes = {
        settings: '/settings',
        profile: '/profile',
        rules: '/rules',
        leaderboard: '/leaderboard',
        store: '/store',
      } as const
      navigate(routes[destination])
    },
    [navigate]
  )

  // Center the dock in the real rendered space between the content immediately
  // above it and the navbar. The whole houseguest section is the upper boundary
  // because modes may append content after the roster list.
  useEffect(() => {
    const dock = dockRef.current
    const gameScreen = dock?.closest<HTMLElement>('.game-screen')
    if (!dock || !gameScreen) return undefined

    let frameId = 0
    const balanceDock = () => {
      const contentAbove = gameScreen.querySelector<HTMLElement>(
        'section[aria-labelledby="houseguests-heading"]'
      )
      const nav = document.querySelector<HTMLElement>('.nav-bar')
      if (!contentAbove || !nav) return

      const gameRect = gameScreen.getBoundingClientRect()
      const contentRect = contentAbove.getBoundingClientRect()
      const dockRect = dock.getBoundingClientRect()
      const navRect = nav.getBoundingClientRect()
      if (dockRect.height <= 0) return

      const lowerBoundary = Math.min(gameRect.bottom, navRect.top)
      const configuredGap = Number.parseFloat(
        getComputedStyle(gameScreen).getPropertyValue('--game-action-dock-gap')
      )
      const minimumGap = Number.isFinite(configuredGap) ? configuredGap : 8
      // On the game screen the nav is deliberately folded into the dock. Its
      // hidden rectangle must not become the dock's lower boundary.
      if (navRect.height <= 0) {
        dock.style.bottom = `${Math.round(minimumGap)}px`
        return
      }
      const bottomOffset = resolveBalancedDockBottom({
        gameBottom: gameRect.bottom,
        lowerBoundary,
        contentBottom: contentRect.bottom,
        dockHeight: dockRect.height,
        minimumGap,
      })
      dock.style.bottom = `${Math.round(bottomOffset)}px`
    }
    const scheduleBalance = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(balanceDock)
    }

    scheduleBalance()
    window.addEventListener('resize', scheduleBalance)
    window.visualViewport?.addEventListener('resize', scheduleBalance)
    const observed = [
      gameScreen,
      dock,
      gameScreen.querySelector<HTMLElement>('.tv-zone'),
      gameScreen.querySelector<HTMLElement>('section[aria-labelledby="houseguests-heading"]'),
      document.querySelector<HTMLElement>('.nav-bar'),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement)
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleBalance)
    observed.forEach((element) => resizeObserver?.observe(element))

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', scheduleBalance)
      window.visualViewport?.removeEventListener('resize', scheduleBalance)
      resizeObserver?.disconnect()
    }
  }, [])

  return (
    <>
      {blockedAnnouncement && (
        <div className="floating-action-bar__blocked-message" role="status" aria-live="polite">
          {blockedAnnouncement.message}
        </div>
      )}
      <ConfirmExitModal
        open={survivorTerminalActive}
        title="Surveyeval run ended"
        description={survivorEndDescription}
        confirmLabel="Start New Surveyeval"
        cancelLabel="Return Home"
        onConfirm={handleStartNewSurvivor}
        onCancel={handleReturnHome}
      />
      <GameControlDock
        dockRef={dockRef}
        onChatClick={handleChatClick}
        onIncomingRequestsClick={handleIncomingRequestsClick}
        onPrimaryActionClick={handlePrimaryActionClick}
        onPublicMeterClick={handlePublicMeterClick}
        onToolClick={handleToolClick}
        onHomeClick={handleReturnHome}
        onMoreClick={handleMoreClick}
        disabled={survivorTerminalActive}
        primaryDisabled={primaryDisabled}
        socialDisabled={socialModulesUnavailable}
        incomingRequestsDisabled={incomingSocialModuleUnavailable}
        publicMeterDisabled={game.publicModeEnabled !== true}
        chatBadgeCount={!socialModulesUnavailable && humanEnergy !== null ? humanEnergy : undefined}
        chatFlash={!socialModulesUnavailable && isFlashing}
        incomingRequestsBadgeCount={
          !incomingSocialModuleUnavailable && pendingCount > 0 ? pendingCount : undefined
        }
        publicMeterBadgeCount={
          game.publicModeEnabled === true && publicRequestCount > 0 ? publicRequestCount : undefined
        }
        primaryPulse={primaryPulse}
        confessionalBadgeCount={confessionalAlertCount > 0 ? confessionalAlertCount : undefined}
        confessionalFlash={isConfessionalFlashing}
        confessionalFlashTick={confessionalFlashTick}
        confessionalPersistentFlash={confessionalPersistentFlash}
        confessionalIconRef={confessionalIconRef}
      />
      <ConfessionalSpotlightOverlay
        active={showConfessionalSpotlight && confessionalSpotlightEligible}
        targetRef={confessionalIconRef}
        onComplete={completeConfessionalSpotlight}
      />
    </>
  )
}
