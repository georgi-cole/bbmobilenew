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
  loadSavedRunProfile,
  type SavedSeasonSnapshot,
} from '../../store/saveStatePersistence'
import { createSurvivorRun, isSurvivorRunTerminal } from '../../modes/survivorRun'
import {
  canOfferSurpriseMe,
  getActiveFiniteSeason,
  getEligibleSeasonRulesets,
  getPlayableLastRun,
  pickSurpriseRuleset,
  rulesetExpansion,
  rulesetLabel,
  type SeasonRuleset,
} from '../../modes/seasonRulesets'
import { withSeasonLaunchIntent } from '../../modes/seasonLaunchIntent'
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate'
import useBackgroundTheme from '../../hooks/useBackgroundTheme'
import KolequantSplash from '../../components/KolequantSplash/KolequantSplash'
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay'
import PermissionPrompts from '../../components/PermissionPrompts/PermissionPrompts'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import SurvivorRulesModal from '../../components/ConfirmExitModal/SurvivorRulesModal'
import { SoundManager } from '../../services/sound/SoundManager'
import { beginGameplayAudioExit } from '../../services/sound/audioRouteOwnership'
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

const HUB_BUTTONS = [
  { to: '/game', label: 'Play', icon: 'play', variant: 'primary_large' },
  { to: '/rules', label: 'Rules', icon: 'rules', variant: 'secondary_medium' },
  { to: '/profile', label: 'Profile', icon: 'profile', variant: 'secondary_medium' },
  { to: '/housemates', label: 'Hubmates', icon: 'housemates', variant: 'secondary_wide' },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard', variant: 'secondary_wide' },
  { to: '/credits', label: 'Credits', icon: 'credits', variant: 'secondary_small' },
] as const satisfies ReadonlyArray<{
  to: string
  label: string
  icon: HomeHubIconName
  variant: GameButtonVariant
}>

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
      <div className="homehub-content home-hub">
        <div className="home-hub__hero" aria-hidden="true" />
        {splashDone && assetReady && (
          <nav
            className="home-hub__buttons"
            aria-label={playSelectionOpen ? 'Play menu' : 'Main menu'}
          >
            {playSelectionOpen
              ? playSelectionButtons.map(
                  ({ key, label, icon, badge, className, variant, onClick }) => (
                    <GameButton
                      key={key}
                      label={label}
                      icon={icon}
                      badge={badge}
                      className={className}
                      variant={variant}
                      onClick={onClick}
                    />
                  )
                )
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
                                  // The muted video still starts immediately if a browser rejects
                                  // soundtrack playback during route navigation.
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
  const cupidArrowAvailable = ownsCupidArrow || debugExpansionUnlocks.cupidArrow
  const voxPopuliAvailable = ownsVoxPopuli || debugExpansionUnlocks.voxPopuli
  const eligibleSeasonRulesets = useMemo(
    () =>
      getEligibleSeasonRulesets({
        cupidArrow: cupidArrowAvailable,
        voxPopuli: voxPopuliAvailable,
      }),
    [cupidArrowAvailable, voxPopuliAvailable]
  )
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
  const effectiveBgUrl = introHubBgUrl ?? remoteBgUrl ?? bgUrl
  const [isInitialAppSplash] = useState(() => !hasShownHomeHubSplashThisSession())
  const [splashExitRequested, setSplashExitRequested] = useState(false)
  const [hubAssetState, setHubAssetState] = useState<HubAssetState>({
    ready: false,
    progress: 0,
    status: 'Opening the house doors.',
  })
  const splashDone = splashExitRequested && hubAssetState.ready
  const [preloading, setPreloading] = useState(autoStartGame)
  const shouldRestorePlayMenu = new URLSearchParams(location.search).get('menu') === 'play'
  const [playSelectionOpen, setPlaySelectionOpen] = useState(shouldRestorePlayMenu)
  const [housematesBioOpen, setHousematesBioOpen] = useState(false)
  const [survivorPrompt, setSurvivorPrompt] = useState<SurvivorPrompt>(null)
  const [survivorRulesOpen, setSurvivorRulesOpen] = useState(false)
  const survivorRulesDismissed = hasSeenSurvivorRules(activeProfileId)
  const gameRoute = '/game'

  const savedRuns = useMemo(
    () => (!isGuest && activeProfileId ? loadSavedRunProfile(activeProfileId) : null),
    [activeProfileId, isGuest]
  )
  const activeSeason = useMemo(() => getActiveFiniteSeason(savedRuns), [savedRuns])
  const activeSeasonSnapshot = activeSeason?.snapshot ?? null
  const survivorSnapshot = savedRuns?.runs.survival ?? null
  const lastSnapshot = useMemo(() => getPlayableLastRun(savedRuns), [savedRuns])
  const hasEndedSurvivorRecord =
    !survivorSnapshot && (savedRuns?.stats.maxSurvivorDaysSurvived ?? 0) > 0

  useEffect(() => {
    const gameWindow = window as Window & { game?: Record<string, unknown> }
    gameWindow.game = gameWindow.game ?? {}
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

    beginGameplayAudioExit()
    withRunAutosaveSuspended(() => {
      dispatch(hydrateGame(snapshot.game))
      dispatch(hydrateFinale(snapshot.finale))
      dispatch(hydrateSocial(snapshot.social))
      if (snapshot.publicOpinion) dispatch(hydratePublicOpinion(snapshot.publicOpinion))
      if (snapshot.challenge) dispatch(hydrateChallenge(snapshot.challenge))
    })
    navigate(gameRoute)
  }

  function startSeasonRun(ruleset: SeasonRuleset) {
    SoundManager.unlockFromGesture()

    if (ruleset === 'cupidArrow' && !cupidArrowAvailable) {
      openStoreFromPlayMenu()
      return
    }
    if (ruleset === 'voxPopuli' && !voxPopuliAvailable) {
      openStoreFromPlayMenu()
      return
    }
    if (activeSeasonSnapshot) {
      hydrateSnapshot(activeSeasonSnapshot)
      return
    }

    beginGameplayAudioExit()
    // resetGame creates the new run ID. Keep reset + ruleset selection inside a
    // single autosave-suspended operation so an expansion never briefly saves a
    // second Classic slot before expansionMode is applied. The transient launch
    // intent also lets reset-time schedulers distinguish Classic from Vox/Cupid.
    withRunAutosaveSuspended(() => {
      withSeasonLaunchIntent(ruleset, () => {
        if (!isGuest && activeProfileId) {
          const archives = loadSeasonArchives(archiveKeyForProfile(activeProfileId)) ?? []
          dispatch(resetGame(archives))
        } else {
          dispatch(resetGame(undefined))
        }

        const expansion = rulesetExpansion(ruleset)
        dispatch(setSeasonExpansion(expansion))
        if (expansion === 'cupidArrow') {
          dispatch(setVoxPopuliSchedule(null))
          dispatch(activateCupidArrowNow())
        } else if (expansion === 'voxPopuli') {
          dispatch(setCupidArrowSchedule(null))
          dispatch(activateVoxPopuliNow())
        }
      })
    })

    setPlaySelectionOpen(false)
    setPreloading(true)
  }

  function openExpansion(expansion: ExpansionSelection, unlocked: boolean) {
    SoundManager.unlockFromGesture()
    if (!unlocked) {
      openStoreFromPlayMenu()
      return
    }
    startSeasonRun(expansion)
  }

  function startSurpriseSeason() {
    const ruleset = pickSurpriseRuleset(eligibleSeasonRulesets)
    if (!ruleset) return
    startSeasonRun(ruleset)
  }

  function openStoreFromPlayMenu() {
    navigate('/store', { state: { returnTo: '/?menu=play' } })
  }

  function resumeActiveSeason() {
    SoundManager.unlockFromGesture()
    if (!activeSeasonSnapshot) return
    hydrateSnapshot(activeSeasonSnapshot)
  }

  function startSurvivorRun() {
    beginGameplayAudioExit()
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

  if (activeSeason) {
    const activeRunId = activeSeasonSnapshot?.game.runId ?? activeSeasonSnapshot?.game.gameId
    const lastRunId = lastSnapshot?.game.runId ?? lastSnapshot?.game.gameId
    if (!lastSnapshot || activeRunId !== lastRunId) {
      playSelectionButtons.push({
        key: 'active-season',
        label: rulesetLabel(activeSeason.ruleset),
        icon: <HomeHubButtonIcon name="campaign" />,
        variant: 'secondary_wide',
        onClick: resumeActiveSeason,
      })
    }
  } else {
    playSelectionButtons.push(
      {
        key: 'classic',
        label: 'Classic',
        icon: <HomeHubButtonIcon name="campaign" />,
        variant: 'secondary_wide',
        onClick: () => startSeasonRun('classic'),
      },
      {
        key: 'vox-populi',
        label: 'Vox Populi',
        icon: <StoreProductIcon name="voxPopuli" className="home-hub__expansion-icon" />,
        badge: voxPopuliAvailable ? undefined : <StoreProductIcon name="vip" />,
        variant: 'secondary_wide',
        className: 'home-hub__mode-button home-hub__mode-button--vox',
        onClick: () => openExpansion('voxPopuli', voxPopuliAvailable),
      },
      {
        key: 'cupid-arrow',
        label: "Cupid's Arrow",
        icon: <StoreProductIcon name="cupidArrow" className="home-hub__expansion-icon" />,
        badge: cupidArrowAvailable ? undefined : <StoreProductIcon name="vip" />,
        variant: 'secondary_wide',
        className: 'home-hub__mode-button home-hub__mode-button--cupid',
        onClick: () => openExpansion('cupidArrow', cupidArrowAvailable),
      }
    )

    if (canOfferSurpriseMe(eligibleSeasonRulesets)) {
      playSelectionButtons.push({
        key: 'surprise-me',
        label: 'Surprise Me',
        icon: <HomeHubButtonIcon name="campaign" />,
        variant: 'secondary_wide',
        className: 'home-hub__mode-button',
        onClick: startSurpriseSeason,
      })
    }
  }

  playSelectionButtons.push(
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
        openSurvivorMode()
      },
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

  const handleSplashFinish = useCallback(() => {
    setSplashExitRequested(true)
  }, [])

  useEffect(() => {
    if (!hubAssetState.ready) return
    // Make a best-effort start as soon as Intro Hub loading reaches 100%.
    // Native builds and permissive browser sessions start immediately; if a
    // browser rejects autoplay, SoundManager retains its first-gesture retry.
    SoundManager.unlockOnUserGesture()
  }, [hubAssetState.ready])

  useEffect(() => {
    if (!splashDone) return
    markHomeHubSplashSeenForGame(gameId)
  }, [gameId, splashDone])

  return (
    <>
      {!splashDone && (
        <KolequantSplash
          duration={isInitialAppSplash ? 5000 : 0}
          ready={hubAssetState.ready}
          progress={hubAssetState.progress}
          status={hubAssetState.status}
          onFinish={handleSplashFinish}
        />
      )}

      {preloading && <AssetPreloaderOverlay destination={gameRoute} />}

      {housematesBioOpen && (
        <HousematesBioCinematic onComplete={() => setHousematesBioOpen(false)} />
      )}

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
        description="This will replace your saved Surveyeval run only. Your active season will not be affected."
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

          <div id="intro-hub" />
        </div>
      </div>
    </>
  )
}
