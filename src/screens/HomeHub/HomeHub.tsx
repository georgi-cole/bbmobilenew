import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, type NavigateFunction } from 'react-router'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import {
  resetGame,
  hydrateGame,
  activateCupidArrowNow,
  activateVoxPopuliNow,
  setCupidArrowSchedule,
  setVoxPopuliSchedule,
  setSeasonExpansion,
} from '../../store/gameSlice'
import { hydrateFinale } from '../../store/finaleSlice'
import { hydrateSocial } from '../../social/socialSlice'
import { hydratePublicOpinion } from '../../publicOpinion/publicOpinionSlice'
import { hydrateChallenge } from '../../store/challengeSlice'
import { loadSeasonArchives } from '../../store/archivePersistence'
import {
  selectActiveProfileId,
  selectIsGuest,
  archiveKeyForProfile,
} from '../../store/profilesSlice'
import {
  clearSavedRun,
  getLastPlayedRun,
  getSavedRun,
  loadSavedRunProfile,
  type SavedSeasonSnapshot,
} from '../../store/saveStatePersistence'
import type { GameMode } from '../../modes/modeTypes'
import { createSurvivorRun, isSurvivorRunTerminal } from '../../modes/survivorRun'
import useBackgroundTheme from '../../hooks/useBackgroundTheme'
import KolequantSplash from '../../components/KolequantSplash/KolequantSplash'
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay'
import PermissionPrompts from '../../components/PermissionPrompts/PermissionPrompts'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import SurvivorRulesModal from '../../components/ConfirmExitModal/SurvivorRulesModal'
import { SoundManager } from '../../services/sound/SoundManager'
import { startCreditsSoundtrackFromGesture } from '../../cinematic/audio/creditsSoundtrack'
import GameButton, { type GameButtonVariant } from '../../components/GameButton/GameButton'
import HousematesBioCinematic from '../../components/HousematesBioCinematic/HousematesBioCinematic'
import StoreProductIcon from '../../components/StoreProductModal/StoreProductIcon'
import { MYSTERY_WILDCARD_BIOS } from '../../components/HousematesBioCinematic/housematesBioData'
import useHomeHubAssets from '../../hooks/useHomeHubAssets'
import useIntroHubBackground from '../../hooks/useIntroHubBackground'
import {
  hasShownHomeHubSplashThisSession,
  markHomeHubSplashSeenForGame,
} from './homeHubSplashSession'
import { hasSeenSurvivorRules, markSurvivorRulesSeen } from './survivorRulesSeen'
import {
  selectRemoteIntroHubBg,
  selectRemoteIntroHubOverlay,
} from '../../remoteConfig/remoteConfigSlice'
import { buildAchievementSummary } from '../../store/achievementSummary'
import {
  selectHasCupidArrowAccess,
  selectHasSurvivalModeAccess,
  selectHasVoxPopuliAccess,
} from '../../store/vipSlice'
import { selectDebugExpansionUnlocks } from '../../store/uiSlice'
import './HomeHub.css'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

type HomeHubIconName =
  | 'play'
  | 'rules'
  | 'profile'
  | 'leaderboard'
  | 'credits'
  | 'campaign'
  | 'survival'
  | 'housemates'
  | 'back'

function HomeHubButtonIcon({ name }: { name: HomeHubIconName }) {
  return (
    <img
      className="home-hub__button-icon"
      src={`${BASE}/assets/intro_hub_icons/${name}.svg`}
      alt=""
      draggable={false}
    />
  )
}

/**
 * HomeHub — entry screen with BB hero branding and button stack.
 *
 * Buttons map to named routes in src/routes.tsx.
 * To add a new hub button: add an entry to HUB_BUTTONS.
 *
 * Load ordering:
 *   1. KolequantSplash shown — logo only, no dialogs, hub preloads in background.
 *   2. Hub assets preload during the splash: background, buttons, fonts, and
 *      the intro-hub runtime are all loaded before the screen is revealed.
 *   3. If the splash finishes first, a loading overlay stays up until the full
 *      hub bundle is ready so the UI never appears half-built.
 *   4. After the hub is ready, PermissionPrompts appear over the hub (location only).
 *   5. When Play is pressed AssetPreloaderOverlay runs then navigates to /game.
 */
const HUB_BUTTONS = [
  { to: '/game', label: 'Play', icon: 'play', variant: 'primary_large' },
  { to: '/rules', label: 'Rules', icon: 'rules', variant: 'secondary_medium' },
  { to: '/profile', label: 'Profile', icon: 'profile', variant: 'secondary_medium' },
  { to: '/housemates', label: 'Housemates', icon: 'housemates', variant: 'secondary_wide' },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard', variant: 'secondary_wide' },
  { to: '/credits', label: 'Credits', icon: 'credits', variant: 'secondary_small' },
] as const satisfies ReadonlyArray<{
  to: string
  label: string
  icon: HomeHubIconName
  variant: GameButtonVariant
}>

type ClassicPrompt = 'resume-or-new' | 'confirm-new' | null
type SurvivorPrompt = 'resume-or-new' | 'ended' | 'confirm-new' | null
type ExpansionSelection = 'cupidArrow' | 'voxPopuli'

interface HubAssetState {
  ready: boolean
  progress: number
  status: string
}

interface PlaySelectionButton {
  key: string
  label: string
  icon: ReactNode
  badge?: ReactNode
  className?: string
  variant: GameButtonVariant
  onClick: () => void
}

interface HomeHubAssetLayerProps {
  splashDone: boolean
  effectiveBgUrl: string | null
  backgroundReady: boolean
  playSelectionOpen: boolean
  playSelectionButtons: PlaySelectionButton[]
  onPlay: () => void
  onOpenHousemates: () => void
  onNavigate: NavigateFunction
  onAssetStateChange: (state: HubAssetState) => void
}

function HomeHubAssetLayer({
  splashDone,
  effectiveBgUrl,
  backgroundReady,
  playSelectionOpen,
  playSelectionButtons,
  onPlay,
  onOpenHousemates,
  onNavigate,
  onAssetStateChange,
}: HomeHubAssetLayerProps) {
  const {
    ready: homeHubReady,
    progress: homeHubLoadProgress,
    status: homeHubLoadStatus,
  } = useHomeHubAssets(effectiveBgUrl)
  const assetReady = backgroundReady && homeHubReady
  const status = backgroundReady ? homeHubLoadStatus : 'Choosing the right house exterior...'
  const progress = backgroundReady ? homeHubLoadProgress : Math.min(20, homeHubLoadProgress)

  useEffect(() => {
    onAssetStateChange({
      ready: assetReady,
      progress,
      status,
    })
  }, [assetReady, onAssetStateChange, progress, status])

  return (
    <>
      {splashDone && assetReady && <PermissionPrompts showSoundPrompt={false} />}

      {/* Foreground content — hidden until the full hub asset bundle is ready. */}
      <div className="homehub-content home-hub">
        {/* Hero / icon area (no branding text — logo is shown in the splash) */}
        <div className="home-hub__hero" aria-hidden="true" />

        {/* Button stack: only rendered once the splash has dismissed and the
            full hub bundle is ready. */}
        {splashDone && assetReady && (
          <nav
            className="home-hub__buttons"
            aria-label={playSelectionOpen ? 'Play menu' : 'Main menu'}
          >
            {playSelectionOpen
              ? playSelectionButtons.map(({ key, label, icon, badge, className, variant, onClick }) => (
                  <GameButton
                    key={key}
                    label={label}
                    icon={icon}
                    badge={badge}
                    className={className}
                    variant={variant}
                    onClick={onClick}
                  />
                ))
              : HUB_BUTTONS.map(({ to, label, icon, variant }) => (
                  <GameButton
                    key={to}
                    label={label}
                    icon={<HomeHubButtonIcon name={icon} />}
                    variant={variant}
                    onClick={
                      to === '/game'
                        ? onPlay
                        : to === '/housemates'
                          ? onOpenHousemates
                        : to === '/credits'
                          ? () => {
                              void startCreditsSoundtrackFromGesture().catch(() => {
                                // The Credits screen keeps a direct-link tap fallback for browsers
                                // that still reject media playback during route navigation.
                              })
                              onNavigate(to)
                            }
                          : () =>
                              onNavigate(
                                to,
                                to === '/profile' ? { state: { from: '/' } } : undefined
                              )
                    }
                  />
                ))}
          </nav>
        )}
      </div>
    </>
  )
}

export default function HomeHub() {
  const location = useLocation()
  const routeState = location.state as {
    autoStartGame?: boolean
    openHubUtility?: string
  } | null
  const autoStartGame = routeState?.autoStartGame === true
  const requestedHubUtility = routeState?.openHubUtility ?? null
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const gameId = useAppSelector((state) => state.game.gameId)
  const season = useAppSelector((state) => state.game.season)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const twinShockRevealed = useAppSelector((state) => state.game.twinShockConsumed === true)
  const introHubPlayer = useAppSelector(
    (state) => state.game.players.find((player) => player.isUser) ?? null
  )
  const seasonArchives = useAppSelector((state) => state.game.seasonArchives ?? [])
  const ownsCupidArrow = useAppSelector(selectHasCupidArrowAccess)
  const ownsSurvivalMode = useAppSelector(selectHasSurvivalModeAccess)
  const ownsVoxPopuli = useAppSelector(selectHasVoxPopuliAccess)
  const debugExpansionUnlocks = useAppSelector(selectDebugExpansionUnlocks)
  // `game.week` is the legacy state field name, but in the current game flow it
  // represents the current in-game day count.
  const dayCount = week
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const isGuest = useAppSelector(selectIsGuest)
  const { url: bgUrl } = useBackgroundTheme()
  const remoteBgUrl = useAppSelector(selectRemoteIntroHubBg)
  const remoteOverlayOpacity = useAppSelector(selectRemoteIntroHubOverlay)
  const { url: introHubBgUrl, ready: introHubBgReady } = useIntroHubBackground(remoteBgUrl, bgUrl)
  const achievementSummary = useMemo(
    () =>
      buildAchievementSummary({
        userPlayer: introHubPlayer,
        seasonArchives,
        day: dayCount,
        phase,
      }),
    [dayCount, introHubPlayer, phase, seasonArchives]
  )
  // Remote background takes priority over weather/time-of-day background.
  const effectiveBgUrl = introHubBgUrl ?? remoteBgUrl ?? bgUrl
  const [isInitialAppSplash] = useState(() => !hasShownHomeHubSplashThisSession())
  const [splashExitRequested, setSplashExitRequested] = useState(false)
  const [hubAssetState, setHubAssetState] = useState<HubAssetState>({
    ready: false,
    progress: 0,
    status: 'Opening the house doors.',
  })
  const splashDone = !isInitialAppSplash || (splashExitRequested && hubAssetState.ready)
  // Seed preloading from transient route state so "Start New Season" can
  // reuse the existing Play → preloader → /game flow without setting state in
  // an effect on mount.
  const [preloading, setPreloading] = useState(autoStartGame)
  const shouldRestorePlayMenu = new URLSearchParams(location.search).get('menu') === 'play'
  const [playSelectionOpen, setPlaySelectionOpen] = useState(shouldRestorePlayMenu)
  const [housematesBioOpen, setHousematesBioOpen] = useState(false)
  const [classicPrompt, setClassicPrompt] = useState<ClassicPrompt>(null)
  const [survivorPrompt, setSurvivorPrompt] = useState<SurvivorPrompt>(null)
  const [survivorRulesOpen, setSurvivorRulesOpen] = useState(false)
  const [expansionPrompt, setExpansionPrompt] = useState<ExpansionSelection | null>(null)
  const survivorRulesDismissed = hasSeenSurvivorRules(activeProfileId)
  const gameRoute = '/game'

  const savedRuns = useMemo(
    () => (!isGuest && activeProfileId ? loadSavedRunProfile(activeProfileId) : null),
    [activeProfileId, isGuest]
  )
  const classicSnapshot = savedRuns?.runs.classic ?? null
  const survivorSnapshot = savedRuns?.runs.survival ?? null
  const cupidArrowSnapshot = savedRuns?.runs.cupidArrow ?? null
  const voxPopuliSnapshot = savedRuns?.runs.voxPopuli ?? null
  const lastSnapshot = !isGuest && activeProfileId ? getLastPlayedRun(activeProfileId) : null
  const hasEndedSurvivorRecord =
    !survivorSnapshot && (savedRuns?.stats.maxSurvivorDaysSurvived ?? 0) > 0

  useEffect(() => {
    const gameWindow = window as Window & { game?: Record<string, unknown> }
    gameWindow.game = gameWindow.game ?? {}
    // Legacy IntroHub/achievements scripts still read from window.game, so keep
    // the specific season fields they depend on in sync while HomeHub is mounted.
    Object.assign(gameWindow.game, {
      season,
      day: dayCount,
      week,
      phase,
      players: introHubPlayer ? [introHubPlayer] : [],
      seasonArchives,
      achievementSummary,
      twinShockConsumed: twinShockRevealed,
      mysteryWildcards: MYSTERY_WILDCARD_BIOS,
      assetBase: import.meta.env.BASE_URL || '/',
    })
  }, [
    achievementSummary,
    dayCount,
    season,
    week,
    phase,
    introHubPlayer,
    seasonArchives,
    twinShockRevealed,
  ])

  useEffect(() => {
    if (!autoStartGame) return
    // Clear the transient route state after mount so browser back/refresh
    // doesn't auto-start another season from the same history entry.
    navigate('/', { replace: true })
  }, [autoStartGame, navigate])
  useEffect(() => {
    if (!splashDone || !requestedHubUtility) return undefined
    let attempts = 0
    const openRequestedUtility = window.setInterval(() => {
      attempts += 1
      const button = document.querySelector<HTMLButtonElement>(
        `[data-hub-id="${requestedHubUtility}"]`
      )
      if (button) {
        window.clearInterval(openRequestedUtility)
        button.click()
        navigate('/', { replace: true })
      } else if (attempts >= 40) {
        window.clearInterval(openRequestedUtility)
      }
    }, 50)
    return () => window.clearInterval(openRequestedUtility)
  }, [navigate, requestedHubUtility, splashDone])

  function hydrateSnapshot(snapshot: SavedSeasonSnapshot) {
    if (isSurvivorRunTerminal(snapshot.game)) {
      setSurvivorPrompt('ended')
      setPlaySelectionOpen(true)
      return
    }
    dispatch(hydrateGame(snapshot.game))
    dispatch(hydrateFinale(snapshot.finale))
    dispatch(hydrateSocial(snapshot.social))
    if (snapshot.publicOpinion) dispatch(hydratePublicOpinion(snapshot.publicOpinion))
    if (snapshot.challenge) dispatch(hydrateChallenge(snapshot.challenge))
    navigate(gameRoute)
  }

  function startClassicRun(expansion: ExpansionSelection | null = null) {
    if (!isGuest && activeProfileId) {
      clearSavedRun(activeProfileId, expansion ?? 'classic')
      const archives = loadSeasonArchives(archiveKeyForProfile(activeProfileId)) ?? []
      dispatch(resetGame(archives))
    } else {
      dispatch(resetGame(undefined))
    }
    dispatch(setSeasonExpansion(expansion))
    if (expansion === 'cupidArrow') {
      dispatch(setVoxPopuliSchedule(null))
      dispatch(activateCupidArrowNow())
    } else if (expansion === 'voxPopuli') {
      dispatch(setCupidArrowSchedule(null))
      dispatch(activateVoxPopuliNow())
    }
    setClassicPrompt(null)
    setExpansionPrompt(null)
    setPlaySelectionOpen(false)
    setPreloading(true)
  }

  function openExpansion(expansion: ExpansionSelection, unlocked: boolean) {
    SoundManager.unlockFromGesture()
    if (!unlocked) {
      openStoreFromPlayMenu()
      return
    }
    const savedExpansion = expansion === 'cupidArrow' ? cupidArrowSnapshot : voxPopuliSnapshot
    if (savedExpansion) {
      setExpansionPrompt(expansion)
      return
    }
    startClassicRun(expansion)
  }

  function resumeExpansionRun(expansion: ExpansionSelection) {
    const snapshot = expansion === 'cupidArrow' ? cupidArrowSnapshot : voxPopuliSnapshot
    if (!snapshot) {
      startClassicRun(expansion)
      return
    }
    try {
      setExpansionPrompt(null)
      hydrateSnapshot(snapshot)
    } catch {
      startClassicRun(expansion)
    }
  }

  function openStoreFromPlayMenu() {
    navigate('/store', { state: { returnTo: '/?menu=play' } })
  }

  function resumeClassicRun() {
    if (!classicSnapshot) {
      setClassicPrompt(null)
      startClassicRun()
      return
    }
    try {
      setClassicPrompt(null)
      hydrateSnapshot(classicSnapshot)
    } catch {
      startClassicRun()
    }
  }

  function startSurvivorRun() {
    if (!isGuest && activeProfileId) {
      clearSavedRun(activeProfileId, 'survival')
    }
    setSurvivorPrompt(null)
    setPlaySelectionOpen(false)
    dispatch(hydrateGame(createSurvivorRun()))
    setPreloading(true)
  }

  function requestSurvivorRunStart() {
    if (!survivorRulesDismissed) {
      setSurvivorRulesOpen(true)
      return
    }
    startSurvivorRun()
  }

  function handleSurvivorRulesContinue(dontShowAgain: boolean) {
    if (dontShowAgain) {
      markSurvivorRulesSeen(activeProfileId)
    }
    setSurvivorRulesOpen(false)
    startSurvivorRun()
  }

  function resumeSurvivorRun() {
    if (!survivorSnapshot) {
      setSurvivorPrompt('ended')
      return
    }
    setSurvivorPrompt(null)
    hydrateSnapshot(survivorSnapshot)
  }

  function openSurvivorMode() {
    SoundManager.unlockFromGesture()
    if (survivorSnapshot) {
      setSurvivorPrompt('resume-or-new')
      return
    }
    if (hasEndedSurvivorRecord) {
      setSurvivorPrompt('ended')
      return
    }
    requestSurvivorRunStart()
  }

  function startOrResumeMode(mode: GameMode) {
    SoundManager.unlockFromGesture()
    if (mode === 'survival') {
      openSurvivorMode()
      return
    }

    if (!isGuest && activeProfileId) {
      const snapshot = getSavedRun(activeProfileId, mode)
      if (snapshot?.profileId === activeProfileId) {
        setClassicPrompt('resume-or-new')
        return
      }
    }

    startClassicRun()
  }

  function continueLastRun() {
    SoundManager.unlockFromGesture()
    if (lastSnapshot?.profileId === activeProfileId) {
      try {
        hydrateSnapshot(lastSnapshot)
        return
      } catch {
        setPlaySelectionOpen(true)
      }
    }
  }

  const playSelectionButtons: PlaySelectionButton[] = []
  if (lastSnapshot) {
    playSelectionButtons.push({
      key: 'continue-last',
      label: 'Continue Last',
      icon: <HomeHubButtonIcon name="play" />,
      variant: 'primary_large',
      onClick: continueLastRun,
    })
  }
  playSelectionButtons.push(
    {
      key: 'classic',
      label: 'Campaign',
      icon: <HomeHubButtonIcon name="campaign" />,
      variant: 'secondary_wide',
      onClick: () => startOrResumeMode('classic'),
    },
    {
      key: 'survival',
      label: 'Surveyeval',
      icon: <HomeHubButtonIcon name="survival" />,
      badge: ownsSurvivalMode ? undefined : <StoreProductIcon name="vip" />,
      variant: 'secondary_wide',
      className: 'home-hub__mode-button home-hub__mode-button--surveyeval',
      onClick: () => {
        SoundManager.unlockFromGesture()
        if (!ownsSurvivalMode) {
          openStoreFromPlayMenu()
          return
        }
        startOrResumeMode('survival')
      },
    },
    {
      key: 'vox-populi',
      label: 'Vox Populi',
      icon: <StoreProductIcon name="voxPopuli" className="home-hub__expansion-icon" />,
      badge:
        ownsVoxPopuli || debugExpansionUnlocks.voxPopuli ? undefined : (
          <StoreProductIcon name="vip" />
        ),
      variant: 'secondary_wide',
      className: 'home-hub__mode-button home-hub__mode-button--vox',
      onClick: () =>
        openExpansion('voxPopuli', ownsVoxPopuli || debugExpansionUnlocks.voxPopuli),
    },
    {
      key: 'cupid-arrow',
      label: "Cupid's Arrow",
      icon: <StoreProductIcon name="cupidArrow" className="home-hub__expansion-icon" />,
      badge:
        ownsCupidArrow || debugExpansionUnlocks.cupidArrow ? undefined : (
          <StoreProductIcon name="vip" />
        ),
      variant: 'secondary_wide',
      className: 'home-hub__mode-button home-hub__mode-button--cupid',
      onClick: () =>
        openExpansion(
          'cupidArrow',
          ownsCupidArrow || debugExpansionUnlocks.cupidArrow
        ),
    },
    {
      key: 'back',
      label: 'Back',
      icon: <HomeHubButtonIcon name="back" />,
      variant: 'secondary_medium',
      onClick: () => setPlaySelectionOpen(false),
    }
  )

  const handlePlay = () => {
    // Unlock audio in the gesture context.  We intentionally do NOT follow up
    // with SoundManager.panicStopAllMusic() here — that used to race with the
    // syncMusic() call inside unlockFromGesture() (play-then-stop glitch) and
    // also violated the single-source-of-truth rule: BGM state is owned by
    // AudioStateSync via the resolver, which will transition the track
    // naturally when the route/phase changes below.
    SoundManager.unlockFromGesture()
    setPlaySelectionOpen(true)
  }

  const handleHubAssetStateChange = useCallback((nextState: HubAssetState) => {
    setHubAssetState((current) => {
      if (
        current.ready === nextState.ready &&
        current.progress === nextState.progress &&
        current.status === nextState.status
      ) {
        return current
      }

      return nextState
    })
  }, [])

  function handleSplashFinish() {
    setSplashExitRequested(true)
  }

  useEffect(() => {
    if (!splashDone) {
      return
    }

    markHomeHubSplashSeenForGame(gameId)
  }, [gameId, splashDone])

  return (
    <>
      {/* Cold-load intro splash — logo only, hub preloads in background.
          Exits automatically after the animation completes (~1.2s). */}
      {!splashDone && (
        <KolequantSplash
          duration={isInitialAppSplash ? 5000 : 0}
          ready={hubAssetState.ready}
          progress={hubAssetState.progress}
          status={hubAssetState.status}
          onFinish={handleSplashFinish}
        />
      )}

      {/* Asset preloader overlay — shown when Play is pressed (fresh start or new season) */}
      {preloading && <AssetPreloaderOverlay destination={gameRoute} />}

      {housematesBioOpen && (
        <HousematesBioCinematic onComplete={() => setHousematesBioOpen(false)} />
      )}

      <ConfirmExitModal
        open={classicPrompt === 'resume-or-new'}
        title="Classic Campaign"
        description="Resume your saved Classic campaign or start over?"
        confirmLabel="Resume"
        secondaryLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={resumeClassicRun}
        onSecondary={() => setClassicPrompt('confirm-new')}
        onCancel={() => setClassicPrompt(null)}
      />

      <ConfirmExitModal
        open={classicPrompt === 'confirm-new'}
        title="Start new Classic campaign?"
        description="This will replace your saved Classic campaign only. Survivor progress will not be affected."
        confirmLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={startClassicRun}
        onCancel={() => setClassicPrompt('resume-or-new')}
      />

      <ConfirmExitModal
        open={expansionPrompt !== null}
        title={expansionPrompt === 'cupidArrow' ? "Cupid's Arrow" : 'Vox Populi'}
        description="Resume this expansion season or begin a new one? Your Classic campaign and Surveyeval run stay untouched."
        confirmLabel="Resume"
        secondaryLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={() => expansionPrompt && resumeExpansionRun(expansionPrompt)}
        onSecondary={() => expansionPrompt && startClassicRun(expansionPrompt)}
        onCancel={() => setExpansionPrompt(null)}
      />

      <ConfirmExitModal
        open={survivorPrompt === 'resume-or-new'}
        title="Surveyeval Mode"
        description="Resume your saved run or start over?"
        confirmLabel="Resume"
        secondaryLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={resumeSurvivorRun}
        onSecondary={() => setSurvivorPrompt('confirm-new')}
        onCancel={() => setSurvivorPrompt(null)}
      />

      <ConfirmExitModal
        open={survivorPrompt === 'ended'}
        title="Surveyeval Mode"
        description="Your previous Surveyeval run has ended."
        confirmLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={requestSurvivorRunStart}
        onCancel={() => {
          setSurvivorPrompt(null)
          setPlaySelectionOpen(false)
        }}
      />

      <ConfirmExitModal
        open={survivorPrompt === 'confirm-new'}
        title="Start new Surveyeval run?"
        description="This will replace your saved Surveyeval run only. Classic progress will not be affected."
        confirmLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={requestSurvivorRunStart}
        onCancel={() => setSurvivorPrompt('resume-or-new')}
      />

      {survivorRulesOpen && (
        <SurvivorRulesModal
          open={survivorRulesOpen}
          onContinue={handleSurvivorRulesContinue}
          onCancel={() => setSurvivorRulesOpen(false)}
        />
      )}

      <div className="homehub-shell">
        <div className="homehub-frame">
          <div
            className="homehub-intro-bg"
            style={effectiveBgUrl ? { backgroundImage: `url("${effectiveBgUrl}")` } : undefined}
            aria-hidden="true"
          />

          {remoteOverlayOpacity != null && remoteOverlayOpacity > 0 && (
            <div
              className="homehub-remote-overlay"
              style={{ opacity: remoteOverlayOpacity }}
              aria-hidden="true"
            />
          )}

          <HomeHubAssetLayer
            key={effectiveBgUrl ?? 'default'}
            splashDone={splashDone}
            effectiveBgUrl={effectiveBgUrl}
            backgroundReady={introHubBgReady}
            playSelectionOpen={playSelectionOpen}
            playSelectionButtons={playSelectionButtons}
            onPlay={handlePlay}
            onOpenHousemates={() => {
              SoundManager.unlockFromGesture()
              setHousematesBioOpen(true)
            }}
            onNavigate={navigate}
            onAssetStateChange={handleHubAssetStateChange}
          />

          {/* Intro hub overlay — chips rendered only while HomeHub is mounted */}
          <div id="intro-hub" />
        </div>
      </div>
    </>
  )
}
