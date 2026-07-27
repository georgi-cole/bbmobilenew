import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { LayoutGroup, AnimatePresence } from 'framer-motion'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  addTvEvent,
  applyMinigameWinner,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  selectAlivePlayers,
  selectF3Part3PredictedWinnerId,
  selectF3Part2PredictedWinnerId,
  submitPovDecision,
  submitCoupReplacement,
  submitVipSecondUseDecision,
  submitDemocraciaVote,
  submitCoLohNomination,
  resetGame,
} from '../../store/gameSlice'
import { completeChallenge, type PendingChallenge } from '../../store/challengeSlice'
import { selectLastSocialReport } from '../../social/socialSlice'
import { setEnergyBankEntry } from '../../social/socialSlice'
import { useNavigate, useSearchParams } from 'react-router'
import { selectActiveProfileId, selectIsGuest } from '../../store/profilesSlice'
import {
  clearSavedRun,
  clearSeasonSnapshot,
  savedStateKeyForProfile,
} from '../../store/saveStatePersistence'
import { selectSocialSummaryOpen } from '../../store/uiSlice'
import TvZone from '../../components/ui/TvZone'
import HouseguestGrid from '../../components/HouseguestGrid/HouseguestGrid'
import HouseguestInfoDialog from '../../components/HouseguestGrid/HouseguestInfoDialog'
import TvDecisionModal from '../../components/TvDecisionModal/TvDecisionModal'
import TvMultiSelectModal from '../../components/TvDecisionModal/TvMultiSelectModal'
import TvBinaryDecisionModal from '../../components/TvBinaryDecisionModal/TvBinaryDecisionModal'
import QuickTapRace from '../../components/QuickTapRace/QuickTapRace'
import LaneRacersCanvasGame from '../../minigames/laneRacers/LaneRacersCanvasGame'
import PressurePlank from '../../components/PressurePlank/PressurePlank'
import BullseyeBlitz from '../../components/BullseyeBlitz/BullseyeBlitz'
import TravelingDots from '../../components/TravelingDots/TravelingDots'
import MinigameHost from '../../components/MinigameHost/MinigameHost'
import type { MinigameParticipant } from '../../components/MinigameHost/MinigameHost'
import { computeScores } from '../../minigames/scoring'
import FloatingActionBar from '../../components/FloatingActionBar/FloatingActionBar'
import SpotlightEvictionOverlay from '../../components/Eviction/SpotlightEvictionOverlay'
import DayStartShockPopup from '../../components/DayStartShockPopup/DayStartShockPopup'
import CeremonyOverlay from '../../components/CeremonyOverlay/CeremonyOverlay'
import SpotlightAnimation from '../../components/SpotlightAnimation/spotlight-animation'
import ChatOverlay from '../../components/ChatOverlay/ChatOverlay'
import SocialPanel from '../../components/SocialPanel/SocialPanel'
import SocialPanelV2 from '../../components/SocialPanelV2/SocialPanelV2'
import IncomingInteractionsInbox from '../../components/IncomingInteractionsInbox/IncomingInteractionsInbox'
import SurvivorAchievementCelebration from '../../components/SurvivorAchievementCelebration'
import { FEATURE_SOCIAL_V2, FEATURE_SPECTATOR_REACT } from '../../config/featureFlags'
import SocialSummaryPopup from '../../components/SocialSummary/SocialSummaryPopup'
import SpectatorView from '../../components/ui/SpectatorView'
import Capitalization from '../../components/Capitalization/Capitalization'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import Final3Ceremony from '../../components/Final3Ceremony/Final3Ceremony'
import { getProfilePhotoAvatarId, resolveAvatar } from '../../utils/avatar'
import { statusBadgeImageSrc } from '../../utils/statusBadges'
import type { Player } from '../../types'
import { isSurvivorRunTerminal } from '../../modes/survivorRun'
import PublicFavoriteOverlay from '../../components/PublicFavoriteOverlay/PublicFavoriteOverlay'
import JuryPhaseRevealOverlay from '../../components/JuryPhaseRevealOverlay/JuryPhaseRevealOverlay'
import TwinShockRevealOverlay from '../../components/TwinShockRevealOverlay/TwinShockRevealOverlay'
import TwinShockIntroCinematic from '../../components/TwinShockIntroCinematic/TwinShockIntroCinematic'
import { updateApproval } from '../../publicOpinion/publicOpinionSlice'
import type { PlayerPublicProfile } from '../../publicOpinion/types'
import { selectSettings } from '../../store/settingsSlice'
import type { RootState } from '../../store/store'
import { selectAdsState, clearLastCompLastPlace, recordAdShown } from '../../store/adsSlice'
import { selectRemoteMainTvHeadline } from '../../remoteConfig/remoteConfigSlice'
import AdPrompt from '../../components/AdPrompt/AdPrompt'
import type { Announcement } from '../../components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'
import {
  getBlockedSocialModuleAnnouncementMessage,
  type SocialModuleAvailability,
} from '../../social/socialModuleAvailability'
import { isPublicModeEnabled, isSocialModeEnabled } from '../../modes/gameModes'
import {
  showInterstitial,
  showRewarded,
  canShowAd,
  type AdPlacement,
} from '../../services/ads/adsService'
import {
  DISLIKED_BOOST_PROMPT_DESCRIPTION,
  DISLIKED_MAX_APPROVAL,
  shouldShowDislikedBoostPrompt,
} from './dislikedBoostPrompt'
import { usePersistedPromptDate } from './gameScreenPersistence'
import { requestFavoriteAudienceSurge } from './favoriteAudienceSurgeRequest'
import { useResponsiveGameLayout } from './useResponsiveGameLayout'
import { getCeremonyTileRect } from './ceremonyTileMeasurement'
import { useRefinedGameChrome } from '../../hooks/useRefinedGameChrome'

import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useCompetitionFlow } from './flows/useCompetitionFlow'
import { coordinateGameFlows } from './flows/gameFlowCoordinator'
import { useEndgameFlow } from './flows/useEndgameFlow'
import { useEvictionFlow } from './flows/useEvictionFlow'
import { useLohFlow } from './flows/useLohFlow'
import { useSafetyFlow } from './flows/useSafetyFlow'
import { BATTLE_BACK_RETRY_LIMIT, useTwistFlow } from './flows/useTwistFlow'
export {
  POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS,
  POST_VOTE_ANNOUNCEMENT_MS,
} from './flows/useEvictionFlow'
import './GameScreen.css'

const LOH_BADGE_SRC = statusBadgeImageSrc('loh')
const NOMINATION_BADGE_SRC = statusBadgeImageSrc('nominated')
const EMPTY_PUBLIC_PROFILES: Record<string, PlayerPublicProfile> = {}
const CONFESSIONAL_TV_PROMPT_MESSAGE =
  'The Big Eye requires your decision. Head to the Confessional to complete your action before the game can continue.'
const SOCIAL_MODULE_UNAVAILABLE_ANNOUNCEMENT_MS = 3000

// Exported only as a pure regression-test seam; it does not participate in Fast Refresh state.
// eslint-disable-next-line react-refresh/only-export-components
export function buildTieBreakPitch(relationship: number, playerId: string, week: number): string {
  const alternate =
    Math.abs(`${playerId}:${week}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) %
      2 ===
    0
  if (relationship >= 45)
    return alternate
      ? 'We have protected each other before. Keep me, and I will return it.'
      : 'Our relationship is real. Do not let one tied vote end it.'
  if (relationship >= 15)
    return alternate
      ? 'I can still be a number for you after tonight. Give me that chance.'
      : 'Keep me and you keep an option in this house?not another enemy.'
  if (relationship <= -20)
    return alternate
      ? 'We are not close, but eliminating me only finishes someone else?s move.'
      : 'You do not have to trust me to see I am useful as a shield.'
  return alternate
    ? 'Give me one more day and judge me by what I do with it.'
    : 'This decision is yours. I am asking you not to make me the easy answer.'
}

function buildAiOnlyChallengeRawResults(challenge: PendingChallenge) {
  return challenge.participants.map((id) => ({
    playerId: id,
    rawValue: challenge.aiScores[id] ?? 0,
    ...(challenge.aiTiebreakers?.[id] != null ? { tiebreaker: challenge.aiTiebreakers[id] } : {}),
  }))
}

/**
 * GameScreen — main gameplay view.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │  TvZone (TV action area) │
 *   ├─────────────────────────┤
 *   │  HouseguestGrid          │
 *   │  (alive + evicted tiles) │
 *   └─────────────────────────┘
 *
 * Interactions:
 *   - Tap avatar → logs diary event for the human player
 *   - Evicted houseguests remain in grid with grayscale + red cross overlay
 *
 * To extend: add new sections between TvZone and the roster,
 * or add action buttons by dispatching events via useAppDispatch().
 */
export default function GameScreen() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()
  const gameScreenRef = useRef<HTMLDivElement | null>(null)
  const refinedGameChrome = useRefinedGameChrome()
  const storeRef = useRef(store)
  const isMountedRef = useRef(true)
  useEffect(() => {
    storeRef.current = store
  }, [store])
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const game = useAppSelector((s) => s.game)
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const isGuest = useAppSelector(selectIsGuest)
  const settings = useAppSelector(selectSettings)
  // ── Confessional ceremony decision routing ─────────────────────────────────
  // When non-null, a required player ceremony decision is pending that must be
  // resolved inside the Confessional.  The in-game decision modals are hidden
  // and a main-TV guidance banner is shown instead.
  const activeConfessionalDecision = useAppSelector(selectActiveConfessionalDecision)
  const publicOpinionProfiles = useAppSelector(
    (s: RootState): Record<string, PlayerPublicProfile> =>
      s.publicOpinion?.profiles ?? EMPTY_PUBLIC_PROFILES
  )
  const lastSocialReport = useAppSelector(selectLastSocialReport)
  const socialSummaryOpen = useAppSelector(selectSocialSummaryOpen)
  const f3Part3PredictedWinnerId = useAppSelector(selectF3Part3PredictedWinnerId)
  const f3Part2PredictedWinnerId = useAppSelector(selectF3Part2PredictedWinnerId)
  const adsState = useAppSelector(selectAdsState)
  const remoteMainTvHeadline = useAppSelector(selectRemoteMainTvHeadline)
  const [previewPlayer, setPreviewPlayer] = useState<Player | null>(null)

  // ── Ad prompt visibility state ─────────────────────────────────────────
  const [showEnergyRechargePrompt, setShowEnergyRechargePrompt] = useState(false)
  const [showDislikedBoostPrompt, setShowDislikedBoostPrompt] = useState(false)
  // Tracks whether a rewarded ad request has been sent (prevents double-tap).
  const [adPending, setAdPending] = useState(false)
  const [preAdAnnouncement, setPreAdAnnouncement] = useState<Announcement | null>(null)
  const [publicMeterUnavailableAnnouncement, setPublicMeterUnavailableAnnouncement] =
    useState<Announcement | null>(null)
  const [socialModuleUnavailableAnnouncement, setSocialModuleUnavailableAnnouncement] =
    useState<Announcement | null>(null)
  const pendingPreAdPlacementRef = useRef<AdPlacement | null>(null)
  const activeConfessionalDecisionKey = activeConfessionalDecision
    ? `${activeConfessionalDecision.type}:${activeConfessionalDecision.week}:${activeConfessionalDecision.phase}`
    : null
  const [storedConfessionalPrompt, setStoredConfessionalPrompt] = useState<{
    decisionKey: string | null
    triggered: boolean
    visible: boolean
  }>(() => ({ decisionKey: activeConfessionalDecisionKey, triggered: false, visible: false }))
  const confessionalPrompt =
    storedConfessionalPrompt.decisionKey === activeConfessionalDecisionKey
      ? storedConfessionalPrompt
      : { decisionKey: activeConfessionalDecisionKey, triggered: false, visible: false }
  const dismissConfessionalTvPrompt = useCallback(() => {
    setStoredConfessionalPrompt((current) => ({
      decisionKey: activeConfessionalDecisionKey,
      triggered: current.decisionKey === activeConfessionalDecisionKey ? current.triggered : false,
      visible: false,
    }))
  }, [activeConfessionalDecisionKey])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!activeConfessionalDecisionKey) return

    const handlePlayPressed = () => {
      setStoredConfessionalPrompt({
        decisionKey: activeConfessionalDecisionKey,
        triggered: true,
        visible: true,
      })
    }

    window.addEventListener('ui:playPressed', handlePlayPressed)
    return () => window.removeEventListener('ui:playPressed', handlePlayPressed)
  }, [activeConfessionalDecisionKey])

  const humanPlayer = game.players.find((p) => p.isUser)
  const humanPlayerEliminated = humanPlayer?.status === 'evicted' || humanPlayer?.status === 'jury'
  const preJuryGameOver = game.mode !== 'survival' && humanPlayer?.status === 'evicted'
  const clearEliminatedRun = useCallback(() => {
    if (isGuest || !activeProfileId) return
    clearSavedRun(activeProfileId, game.mode ?? 'classic')
    clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId))
  }, [activeProfileId, game.mode, isGuest])
  const handleStartNewSeason = useCallback(() => {
    clearEliminatedRun()
    dispatch(resetGame())
    dispatch({ type: 'challenge/setPendingChallenge', payload: null })
    navigate('/', { replace: true, state: { autoStartGame: true } })
  }, [clearEliminatedRun, dispatch, navigate])
  const handlePreJuryReturnHome = useCallback(() => {
    clearEliminatedRun()
    dispatch({ type: 'challenge/setPendingChallenge', payload: null })
    navigate('/', { replace: true })
  }, [clearEliminatedRun, dispatch, navigate])
  const confessionalTvAnnouncement =
    confessionalPrompt.triggered && confessionalPrompt.visible
      ? {
          key: 'confessional_required',
          title: 'Confessional Required',
          subtitle: CONFESSIONAL_TV_PROMPT_MESSAGE,
          isLive: false,
          autoDismissMs: 3500,
        }
      : null
  const juryPlayers = useMemo(() => game.players.filter((p) => p.status === 'jury'), [game.players])

  // Combine compile-time flag with runtime cfg override.
  // game.cfg?.enableSpectatorReact defaults to true when omitted.
  const spectatorReactEnabled = FEATURE_SPECTATOR_REACT && game.cfg?.enableSpectatorReact !== false

  // ── Tile position lookup for CeremonyOverlay ──────────────────────────────
  // Queries the houseguest grid's data-player-id items and centers only scroll
  // roster targets before measurement, keeping normal/compact rosters fixed.
  const getTileRect = useCallback((playerId: string): DOMRect | null => {
    return getCeremonyTileRect(playerId)
  }, [])
  const {
    humanIsHoH,
    aliveIds,
    hohCompParticipants,
    humanIsOutgoingHoh,
    showOutgoingHohWarning,
    setOutgoingHohWarningDismissedWeek,
    advanceHohCeremonyEligible,
    handleAdvanceHohCeremonyDone,
    showHumanNomAnim,
    showNomAnim,
    showNominationDangerSignals,
    nominationDangerLockedId,
    nomAnimPlayers,
    lohCeremonyTileId,
    shouldShowNominationCeremony,
    showNominationsModal,
    nomineeOptions,
    autoNomineeLabel,
    handleCommitNominees,
    handleNomAnimDone,
    handleAiNomAnimDone,
    nominationLabels,
    canUsePublicNomineeRule,
    isDebugMode,
    isQaMode,
    handleDevPlayNomAnim,
    humanCoLohId,
    showCoLohNominationModal,
    coLohNomOptions,
  } = useLohFlow({
    game,
    alivePlayers,
    humanPlayer,
    activeConfessionalDecision,
    searchParams,
    dispatch,
  })

  const {
    pendingChallenge,
    pendingWinnerCeremony,
    handleWinnerCeremonyDone,
    handleChallengeDone,
    spectatorLegacyPayload,
    spectatorLegacyActive,
    handleSpectatorLegacyDone,
  } = useCompetitionFlow({
    game,
    humanPlayer,
    aliveIds,
    hohCompParticipants,
    humanIsOutgoingHoh,
    spectatorReactEnabled,
    spectatorMode: settings.gameUX.spectatorMode,
    getTileRect,
    dispatch,
  })
  const showAdvanceHohCeremony = advanceHohCeremonyEligible && pendingWinnerCeremony == null

  // ── Track last report ID so re-renders don't trigger duplicate effects ────
  // Social summaries are posted exclusively to the Diary Room via
  // SocialSummaryBridge.dispatchSocialSummary → game/addSocialSummary (type 'diary').
  // We do NOT post a TV feed event here; social summaries remain DR-only.
  const prevReportIdRef = useRef<string | null>(lastSocialReport?.id ?? null)
  useEffect(() => {
    if (lastSocialReport && lastSocialReport.id !== prevReportIdRef.current) {
      prevReportIdRef.current = lastSocialReport.id
    }
  }, [lastSocialReport])

  function handleAvatarSelect(player: Player) {
    setPreviewPlayer(null)
    // Demo: log selection to TV feed when you tap your own avatar
    if (player.isUser) {
      dispatch(
        addTvEvent({ text: `${player.name} checks their alliance status 🤫`, type: 'diary' })
      )
    }
  }

  function playerToHouseguest(p: Player) {
    const isEvicted = p.status === 'evicted' || p.status === 'jury'
    const parts: string[] = []
    const povProtectedIds = new Set(game.povProtectedIds ?? [])
    if (game.lohId === p.id) parts.push('loh')
    if (game.posWinnerId === p.id) parts.push('pos')
    if (povProtectedIds.has(p.id)) parts.push('veto_safe')
    // Suppress permanent nomination badge while the nomination animation is
    // playing — otherwise AI-LOH nominees (already in game.nomineeIds) would
    // show the permanent ❓ badge before the animated badge lands.
    const isAnimatingNominee = showNomAnim && nomAnimPlayers.some((n) => n.id === p.id)
    const isAnimatingSaveTarget = pendingSaveCeremony?.savedId === p.id
    const isPublicSaveWinner = pendingPublicSaveResult?.savedId === p.id
    const isAnimatingReplacementNominee = activeReplacementAnimationTargetId === p.id
    const isAnimatingAwardWinner =
      pendingWinnerCeremony?.winnerId === p.id || (showAdvanceHohCeremony && game.lohId === p.id)
    if (
      Array.isArray(game.nomineeIds) &&
      game.nomineeIds.includes(p.id) &&
      !isAnimatingNominee &&
      !isAnimatingSaveTarget &&
      !isPublicSaveWinner &&
      !isAnimatingReplacementNominee
    ) {
      parts.push('nominated')
    }
    if (p.status === 'jury') parts.push('jury')
    // When suppressing the nominated badge, also guard the p.status fallback so
    // that players whose p.status is already 'nominated' (AI-committed nominees)
    // don't have that status leak through when parts is empty.
    const suppressFallbackStatus =
      isAnimatingNominee ||
      isAnimatingSaveTarget ||
      isPublicSaveWinner ||
      isAnimatingReplacementNominee
    const statuses =
      parts.length > 0
        ? parts.join('+')
        : suppressFallbackStatus
          ? 'active'
          : (p.status ?? 'active')
    const isReturning = battleBackReturnId === p.id
    const nominationCeremonyState: 'loh' | 'danger' | 'locked' | undefined =
      !isEvicted && showNominationDangerSignals
        ? game.lohId === p.id
          ? 'loh'
          : nominationDangerLockedId === p.id
            ? 'locked'
            : 'danger'
        : undefined
    return {
      id: p.id,
      name: p.name,
      avatarUrl: getProfilePhotoAvatarId(p.avatar) ? p.avatar : resolveAvatar(p),
      statuses,
      finalRank: (p.finalRank ?? null) as 1 | 2 | 3 | null,
      isEvicted,
      isYou: p.isUser,
      // The landing badge is the only award badge visible during a winner
      // ceremony. This also covers the outgoing-LOH path, where the reducer has
      // already committed the winner before the overlay starts.
      showPermanentBadge: !isAnimatingNominee && !isAnimatingAwardWinner,
      nominationCeremonyState,
      layoutId: `avatar-tile-${p.id}`,
      isEvicting:
        (showEvictionSplash && pendingEvictionPlayer?.id === p.id) ||
        game.evictionOverlayPlayerId === p.id ||
        isReturning,
      onClick: () => handleAvatarSelect(p),
      onHoldPreviewStart: () => setPreviewPlayer(p),
      onHoldPreviewEnd: () =>
        setPreviewPlayer((current) => (current?.id === p.id ? null : current)),
    }
  }

  const {
    replacementOptions,
    humanIsPosHolder,
    activeSpecialVeto,
    specialVetoName,
    showPovDecisionModal,
    pendingSaveCeremony,
    handleSaveCeremonyDone,
    handlePovSaveTarget,
    showPovSaveModal,
    povSaveOptions,
    showVipSecondUseModal,
    showDiamondReplacementModal,
    showCoupReplacementModal,
    pendingReplacementCeremony,
    handleReplacementCeremonyDone,
    handleReplacementNominee,
    handleDiamondReplacementNominee,
    showReplacementModal,
    holderReplacementOptions,
    coupReplacementOptions,
    showAiReplacementAnim,
    activeReplacementAnimationTargetId,
    handleAiReplacementDone,
  } = useSafetyFlow({
    game,
    alivePlayers,
    humanPlayer,
    humanIsHoH,
    activeConfessionalDecision,
    getTileRect,
    dispatch,
  })
  const {
    spectatorF3Active,
    spectatorF3CompetitorIds,
    handleSpectatorF3Done,
    spectatorF3Part2Active,
    spectatorF3Part2CompetitorIds,
    handleSpectatorF3Part2Done,
    final4Stage,
    setFinal4Stage,
    final4PleaLines,
    final4AnnounceLines,
    showFinal4Chat,
    showFinal4Modal,
    showFinal4AnnounceChat,
    final4Options,
    handleFinal4PleaComplete,
    handleFinal4AnnounceComplete,
    showFinal3Modal,
    final3Options,
    handleEnterJuryVote,
    handleSpyJury,
  } = useEndgameFlow({
    game,
    alivePlayers,
    humanPlayer,
    humanIsPosHolder,
    isDebugMode,
    spectatorReactEnabled,
    spectatorMode: settings.gameUX.spectatorMode,
    dispatch,
  })

  const {
    twinShockReveal,
    twinShockSequenceKey,
    completedTwinShockIntroKey,
    handleTwinShockIntroDone,
    handleTwinShockRevealDone,
    pendingPublicSaveResult,
    showPublicSaveReveal,
    publicSaveApprovals,
    publicSaveWinnerId,
    publicSaveResultAnnouncement,
    showPublicSaveCeremony,
    handlePublicSaveDone,
    handlePublicSaveResultDismiss,
    handlePublicSaveCeremonyDone,
    publicSaveNominees,
    showDemocraciaVoteModal,
    democraciaVoteOptions,
    democraciaResultDisplay,
    showDemocraciaResults,
    democraciaResultsParticipants,
    handleDemocraciaResultsDone,
    dayStartShock,
    dayStartShockPlayer,
    handleDayStartShockConfirm,
    battleBackReturnId,
    battleBackAttemptIndex,
    battleBackAttemptSeed,
    battleBackCandidateIds,
    battleBackCapitalizationParticipants,
    showBattleBack,
    showBattleBackOverlay,
    battleBackWinnerId,
    battleBackVariant,
    useBattleBackMinigame,
    battleBackRetryCount,
    battleBackRetryOfferWinnerId,
    battleBackRetryOfferWinner,
    showBattleBackReturn,
    handleBattleBackComplete,
    handleBattleBackRetryGranted,
    handleBattleBackRetryDeclined,
    handleBattleBackReturnDone,
    favoritePlayer,
    showFavoriteVoting,
    handleFavoriteComplete,
  } = useTwistFlow({
    game,
    alivePlayers,
    humanPlayer,
    publicOpinionProfiles,
    dispatch,
  })

  const {
    showVoteBreakdownPrompt,
    voteBreakdownPromptIsPostEviction,
    handleVoteBreakdownSkip,
    postEvictionVoteBreakdown,
    setPostEvictionVoteBreakdown,
    postVoteAnnouncement,
    aiTiebreakStage,
    showVoteResults,
    handleVoteResultsDone,
    voteResultsTallies,
    voteResultsEvicteeIds,
    showVoteDeductionOffer,
    handleVoteDeductionAccept,
    handleVoteDeductionDecline,
    unlockVoteBreakdown,
    postEvictionVoteBreakdownRows,
    voteResultsEvictee,
    aiTiebreakAnnouncement,
    handleTiebreakerRequired,
    handleAiTiebreakAnnouncementDismiss,
    publicEvictionTiebreak,
    handlePublicEvictionTiebreakResolved,
    showAiSecondTieBreakOverlay,
    pendingEvictionPlayer,
    showEvictionSplash,
    handleEvictionSplashDone,
    handlePostVoteAnnouncementDismiss,
  } = useEvictionFlow({
    game,
    humanPlayerEliminated,
    humanIsHoH,
    final4Stage,
    setFinal4Stage,
    publicOpinionProfiles,
    isMountedRef,
    setAdPending,
    dispatch,
  })

  // Flow-specific orchestration is owned by the dedicated controllers above.

  const handleFavoriteAudienceSurgeRequest = useCallback(
    (playerId: string) => {
      return requestFavoriteAudienceSurge({
        playerId,
        adPending,
        dispatch,
        getState: () => storeRef.current.getState(),
        isMounted: () => isMountedRef.current,
        setAdPending,
      })
    },
    [adPending, dispatch]
  )
  // Shown when a LOH or POS competition is in progress and the human player
  // is a participant. The Continue button is hidden while the overlay is active.
  const pendingMinigame = game.pendingMinigame
  const humanIsParticipant =
    !!pendingMinigame && !!humanPlayer && pendingMinigame.participants.includes(humanPlayer.id)
  // MinigameHost takes priority over native LOH minigame overlays when a challenge
  // is pending and the human player is a participant in that challenge.
  const humanIsChallengeParticipant =
    !!pendingChallenge && !!humanPlayer && pendingChallenge.participants.includes(humanPlayer.id)
  const showMinigameHost = humanIsChallengeParticipant
  const aiOnlyChallengeResolvedRef = useRef<string | null>(null)
  useEffect(() => {
    const isClassicCompetitionPhase =
      game.mode !== 'survival' && (game.phase === 'loh_comp' || game.phase === 'pos_comp')
    if (
      !isClassicCompetitionPhase ||
      !pendingChallenge ||
      humanIsChallengeParticipant ||
      pendingChallenge.participants.length === 0 ||
      aiOnlyChallengeResolvedRef.current === pendingChallenge.id
    ) {
      return
    }

    aiOnlyChallengeResolvedRef.current = pendingChallenge.id
    const rawResults = buildAiOnlyChallengeRawResults(pendingChallenge)
    const scoreWinnerId = dispatch(completeChallenge(rawResults)) as string | null
    const finalWinnerId = scoreWinnerId ?? pendingChallenge.participants[0]
    const ranked = computeScores(
      pendingChallenge.game.scoringAdapter,
      rawResults,
      pendingChallenge.game.scoringParams ?? {}
    )
    const lastNonWinner = [...ranked].reverse().find((result) => result.playerId !== finalWinnerId)

    dispatch(
      applyMinigameWinner({
        winnerId: finalWinnerId,
        lastPlaceId: lastNonWinner?.playerId ?? null,
        skipSeasonUpdate: true,
      })
    )
  }, [dispatch, game.mode, game.phase, humanIsChallengeParticipant, pendingChallenge])
  /** True whenever a native React LOH/POS minigame overlay should be displayed. */
  const showLohMinigame = !showMinigameHost && humanIsParticipant
  const showPressurePlank = showLohMinigame && pendingMinigame?.key === 'pressurePlank'
  const showBullseyeBlitz = showLohMinigame && pendingMinigame?.key === 'targetPractice'
  // TravelingDots is key-gated to its specific overlay component.
  const showTravelingDots = showLohMinigame && pendingMinigame?.key === 'travelingDots'
  const showLaneRacers = showLohMinigame && pendingMinigame?.key === 'laneRacers'
  // QuickTapRace handles the 'quickTap' key AND acts as a safe fallback for any
  // unrecognised pendingMinigame key so the human is never left with no UI.
  const showQuickTapRace =
    showLohMinigame &&
    !showPressurePlank &&
    !showBullseyeBlitz &&
    !showTravelingDots &&
    !showLaneRacers

  // ── Ad hook: competition_retry ─────────────────────────────────────────────
  // Retry now lives in the MinigameHost results UI itself, so GameScreen only
  // consumes the legacy last-place marker and never shows a separate popup.
  const isFinal3Week = alivePlayers.length <= 3
  const competitionRetryInResultsEnabled = useMemo(() => {
    if (!pendingChallenge) return false
    const prizeType = pendingChallenge.prizeType ?? (game.phase === 'pos_comp' ? 'POS' : 'LOH')
    if (prizeType !== 'LOH' && prizeType !== 'POS') return false
    const state = store.getState()
    return canShowAd('competition_retry', state, { isFinal3Week })
  }, [pendingChallenge, game.phase, isFinal3Week, store])
  const [lastDislikedPromptDate, setLastDislikedPromptDate] = usePersistedPromptDate(
    'public_meter_disliked_boost'
  )
  useEffect(() => {
    if (!adsState?.lastCompLastPlaceType) return
    if (import.meta.env.DEV) {
      console.log(
        '[ads] competition_retry standalone prompt removed; relying on minigame results UI',
        { lastCompLastPlaceType: adsState.lastCompLastPlaceType, phase: game.phase, isFinal3Week }
      )
    }
    dispatch(clearLastCompLastPlace())
  }, [adsState?.lastCompLastPlaceType, game.phase, isFinal3Week, dispatch])

  // ── Ad hook: automatic interstitials (phase-based) ────────────────────────
  // Each useEffect fires once per phase transition to the relevant phase.
  const prevPhaseRef = useRef<string>('')
  const queuePreAdAnnouncement = useCallback((placement: AdPlacement, subtitle: string) => {
    pendingPreAdPlacementRef.current = placement
    setPreAdAnnouncement({
      key: `ad_break_${placement}`,
      title: 'SHORT BREAK',
      subtitle,
      isLive: true,
      autoDismissMs: 3200,
    })
  }, [])
  const handlePreAdAnnouncementDismiss = useCallback(() => {
    const placement = pendingPreAdPlacementRef.current
    pendingPreAdPlacementRef.current = null
    setPreAdAnnouncement(null)
    if (!placement) return
    const state = storeRef.current.getState()
    showInterstitial(placement, state, dispatch)
  }, [dispatch])

  /* eslint-disable react-hooks/set-state-in-effect -- Preserve established synchronous ad-prompt timing during the orchestration extraction. */
  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    const currentPhase = game.phase
    if (currentPhase === prevPhase) return
    prevPhaseRef.current = currentPhase

    const state = storeRef.current.getState()

    // pos_decision_auto — every other week just before POS holder announces
    // week is 1-indexed; even weeks = weeks 2, 4, 6, ...
    if (
      currentPhase === 'pos_ceremony_results' &&
      game.week % 2 === 0 &&
      canShowAd('pos_decision_auto', state) &&
      window.GameAds?.showInterstitial
    ) {
      const posHolderName =
        game.players.find((player) => player.id === game.posWinnerId)?.name ??
        'the Power of Safety holder'
      queuePreAdAnnouncement(
        'pos_decision_auto',
        `Is ${posHolderName} going to use the Power of safety to change the course of the game? Find out right after this short break!`
      )
      return
    }

    // final_safety_decision_auto — before the final safety (F4 POS) holder announces
    if (
      currentPhase === 'final4_eviction' &&
      canShowAd('final_safety_decision_auto', state) &&
      window.GameAds?.showInterstitial
    ) {
      queuePreAdAnnouncement(
        'final_safety_decision_auto',
        'The final safety winner now has the deciding vote to evict. Find out who is going to be eliminated just a step before the finale. Stay with us.'
      )
      return
    }

    // final_loh_decision_auto — before the final LOH (F3 Part 3 winner) announces
    if (
      currentPhase === 'final3_decision' &&
      canShowAd('final_loh_decision_auto', state) &&
      window.GameAds?.showInterstitial
    ) {
      queuePreAdAnnouncement(
        'final_loh_decision_auto',
        'The final leader of the house has to make a very important decision that might cost them the victory. Who will they choose? Find out right after the break.'
      )
      return
    }
  }, [game.phase, game.week, game.players, game.posWinnerId, dispatch, queuePreAdAnnouncement])

  // ── Ad hook: social_energy_recharge ──────────────────────────────────────
  // Show a rewarded prompt when the user's social energy hits 0 (once per day).
  // Guards: week is not 1, not final-3 week, phase is social_1 or social_2.
  const userEnergy = useAppSelector((s: RootState) =>
    humanPlayer ? (s.social?.energyBank?.[humanPlayer.id] ?? 0) : 0
  )
  useEffect(() => {
    if (!humanPlayer || game.mode === 'survival' || !isSocialModeEnabled(game.mode)) {
      setShowEnergyRechargePrompt(false)
      return
    }
    const energyIsZero = userEnergy === 0
    const inSocialPhase = game.phase === 'social_1' || game.phase === 'social_2'
    if (
      !humanPlayerEliminated &&
      energyIsZero &&
      game.week !== 1 &&
      !isFinal3Week &&
      inSocialPhase
    ) {
      const state = storeRef.current.getState()
      if (canShowAd('social_energy_recharge', state)) {
        if (import.meta.env.DEV) {
          console.log(
            '[ads] social_energy_recharge prompt shown — week:',
            game.week,
            '| phase:',
            game.phase
          )
        }
        setShowEnergyRechargePrompt(true)
      }
    } else {
      if (import.meta.env.DEV && energyIsZero) {
        console.log(
          '[ads] social_energy_recharge suppressed — week:',
          game.week,
          '| phase:',
          game.phase,
          '| isFinal3Week:',
          isFinal3Week,
          '| inSocialPhase:',
          inSocialPhase
        )
      }
      setShowEnergyRechargePrompt(false)
    }
  }, [
    userEnergy,
    humanPlayer,
    humanPlayerEliminated,
    game.mode,
    game.week,
    game.phase,
    isFinal3Week,
  ])

  // ── Ad hook: public_meter_disliked_boost ──────────────────────────────────
  // Show a rewarded prompt when the user's approval drops below 40%
  // (disliked or worse), at most once per day.
  const userApproval = useAppSelector((s: RootState) =>
    humanPlayer ? (s.publicOpinion?.profiles?.[humanPlayer.id]?.approval ?? 100) : 100
  )
  useEffect(() => {
    if (!humanPlayer || game.mode === 'survival' || game.publicModeEnabled !== true) {
      setShowDislikedBoostPrompt(false)
      return
    }
    const todayIsoDate = new Date().toISOString().slice(0, 10)
    if (
      !humanPlayerEliminated &&
      shouldShowDislikedBoostPrompt(userApproval, lastDislikedPromptDate, todayIsoDate)
    ) {
      const state = storeRef.current.getState()
      if (canShowAd('public_meter_disliked_boost', state)) {
        setLastDislikedPromptDate(todayIsoDate)
        setShowDislikedBoostPrompt(true)
      }
    }
    // Auto-dismiss if approval recovered above disliked threshold.
    // Keep the last shown date so the prompt does not reappear again the same day
    // if approval dips back into the disliked band.
    if (userApproval > DISLIKED_MAX_APPROVAL) {
      setShowDislikedBoostPrompt(false)
    }
  }, [
    adsState?.dailyUsage?.public_meter_disliked_boost,
    humanPlayer,
    humanPlayerEliminated,
    game.mode,
    game.publicModeEnabled,
    lastDislikedPromptDate,
    setLastDislikedPromptDate,
    userApproval,
  ])

  /* eslint-enable react-hooks/set-state-in-effect */
  // ── Social phase panel ────────────────────────────────────────────────────
  // Show the SocialPanel whenever the human player is alive and the game is in
  // a non-vote interaction window. Blocked during live_vote and eviction phases
  // where social interaction is not appropriate.
  const SOCIAL_INTERACTION_PHASES = new Set<string>([
    'week_start',
    'loh_comp_announcement',
    'loh_results',
    'social_1',
    'nominations',
    'nomination_results',
    'pre_veto_public_save',
    'pos_comp_announcement',
    'pos_results',
    'pos_ceremony',
    'pos_ceremony_results',
    'social_2',
  ])
  const isSocialPhase = SOCIAL_INTERACTION_PHASES.has(game.phase)
  const showSocialPanel = isSocialPhase && !!humanPlayer && isSocialModeEnabled(game.mode)

  // The individual controllers publish presentation signals; this coordinator
  // provides one canonical answer for dock visibility and active flow priority.
  const showWinnerCeremony = pendingWinnerCeremony !== null
  const showReplacementCeremony = pendingReplacementCeremony !== null || showAiReplacementAnim
  const showSaveCeremony = pendingSaveCeremony !== null
  const showFinal3Ceremony =
    game.awaitingFinal3Plea === true && game.phase === 'final3_decision' && !!game.lohId
  const survivorTerminalActive = game.mode === 'survival' && isSurvivorRunTerminal(game)
  const favoriteAnnouncementPending =
    game.favoritePlayer?.active === true && game.favoritePlayer?.votingStarted !== true

  const flowCoordination = coordinateGameFlows({
    hasStartedGame: game.status === 'active',
    allowControlsWhenInactive: survivorTerminalActive,
    flows: {
      loh: {
        awaitingDecision: [
          showOutgoingHohWarning,
          showNominationsModal,
          showNomAnim,
          showAdvanceHohCeremony,
        ],
      },
      safety: {
        awaitingDecision: [
          showReplacementModal,
          showReplacementCeremony,
          showSaveCeremony,
          showPovDecisionModal,
          showPovSaveModal,
        ],
      },
      competition: {
        awaitingDecision: [
          showMinigameHost,
          showWinnerCeremony,
          showQuickTapRace,
          showBullseyeBlitz,
          showTravelingDots,
          spectatorLegacyActive,
        ],
        blocksControls: [showPressurePlank, showLaneRacers],
      },
      twist: {
        awaitingDecision: [
          showPublicSaveReveal,
          showDemocraciaResults,
          showBattleBackReturn,
          showBattleBack,
          showFavoriteVoting,
          favoriteAnnouncementPending,
        ],
        blocksControls: [
          showPublicSaveCeremony,
          showBattleBackOverlay,
          battleBackRetryOfferWinnerId !== null,
        ],
      },
      eviction: {
        awaitingDecision: [
          showVoteResults,
          showVoteDeductionOffer,
          showEvictionSplash,
          aiTiebreakStage !== null,
        ],
        blocksControls: [showVoteBreakdownPrompt, postEvictionVoteBreakdown !== null],
      },
      endgame: {
        awaitingDecision: [
          showFinal4Chat,
          showFinal4Modal,
          showFinal4AnnounceChat,
          showFinal3Modal,
          showFinal3Ceremony,
          game.phase === 'jury_announcement',
          game.phase === 'jury_cinematic',
          spectatorF3Active,
        ],
        blocksControls: [spectatorF3Part2Active],
      },
      presentation: {
        blocksControls: [
          showEnergyRechargePrompt,
          showDislikedBoostPrompt,
          preAdAnnouncement !== null,
          socialModuleUnavailableAnnouncement !== null,
          publicMeterUnavailableAnnouncement !== null,
          socialSummaryOpen,
        ],
      },
    },
  })
  const { showGameControlDock, awaitingHumanDecision } = flowCoordination

  // ── Viewport fallback message for blank-TV states ────────────────────────
  // Provides a meaningful holding message while the live vote is waiting for
  // the human decision or for the remaining house votes to finish.
  const tvViewportFallbackMessage = useMemo(() => {
    if (game.phase === 'live_vote') {
      if (game.awaitingHumanVote) {
        return activeConfessionalDecision
          ? 'The Big Eye requires your vote in the Confessional.'
          : 'Waiting for your vote.'
      }
      return 'Players are casting their votes.'
    }
    // Fall back to the remote-config headline when no phase-specific message applies.
    return remoteMainTvHeadline ?? undefined
  }, [game.phase, game.awaitingHumanVote, activeConfessionalDecision, remoteMainTvHeadline])
  function handlePublicMeterBlocked() {
    setPublicMeterUnavailableAnnouncement({
      key: 'public_meter_unavailable',
      title:
        settings.sim.publicMode === true
          ? 'Public Mode is enabled in Settings. Start a new season to apply it.'
          : 'Public Mode is not active for this season. Enable it in Settings before starting a new season.',
      subtitle: '',
      isLive: false,
      autoDismissMs: 3500,
    })
  }

  function handleSocialModuleBlocked(availability: SocialModuleAvailability) {
    const message = getBlockedSocialModuleAnnouncementMessage(availability)
    if (!message) return

    setSocialModuleUnavailableAnnouncement({
      key: 'social_module_unavailable',
      title: message,
      subtitle: '',
      isLive: false,
      autoDismissMs: SOCIAL_MODULE_UNAVAILABLE_ANNOUNCEMENT_MS,
    })
  }

  const responsiveGameLayout = useResponsiveGameLayout(gameScreenRef, {
    hasDock: showGameControlDock,
    playerCount: game.players.length,
    userCompactRoster: settings.gameUX.compactRoster,
    inlineLogVisible: !refinedGameChrome || game.mode === 'survival' || settings.gameUX.houseFeed,
  })
  const gameTvLogRows = responsiveGameLayout.tvLogRows
  const housemateOccupancyLabel = `${alivePlayers.length}/${game.players.length}`
  const rosterOccupancyChip =
    responsiveGameLayout.rosterHeaderMode === 'tv-chip'
      ? {
          label: housemateOccupancyLabel,
          ariaLabel: `Housemates ${alivePlayers.length} of ${game.players.length}`,
        }
      : null

  return (
    <LayoutGroup id="game-layout">
      <div
        ref={gameScreenRef}
        className={`game-screen game-screen-shell${responsiveGameLayout.compactRoster ? ' game-screen--compact-roster-balance' : ''}`}
        style={responsiveGameLayout.cssVars}
        data-layout-size={responsiveGameLayout.layoutSize}
        data-roster-mode={responsiveGameLayout.rosterMode}
        data-roster-header={responsiveGameLayout.rosterHeaderMode}
        data-layout-revision={responsiveGameLayout.revision}
        data-active-flow={flowCoordination.activeFlow ?? undefined}
      >
        {showPublicSaveReveal && publicSaveWinnerId ? (
          <TvZone
            publicSaveReveal={{
              nominees: publicSaveNominees,
              approvals: publicSaveApprovals,
              savedId: publicSaveWinnerId,
            }}
            onPublicSaveDone={handlePublicSaveDone}
            priorityAnnouncement={confessionalTvAnnouncement}
            onPriorityAnnouncementDismiss={dismissConfessionalTvPrompt}
            externalAnnouncement={
              socialModuleUnavailableAnnouncement ??
              publicMeterUnavailableAnnouncement ??
              preAdAnnouncement
            }
            onExternalAnnouncementDismiss={
              socialModuleUnavailableAnnouncement
                ? () => setSocialModuleUnavailableAnnouncement(null)
                : publicMeterUnavailableAnnouncement
                  ? () => setPublicMeterUnavailableAnnouncement(null)
                  : handlePreAdAnnouncementDismiss
            }
            mainLogMaxVisible={gameTvLogRows}
            viewportFallbackMessage={tvViewportFallbackMessage}
            occupancyChip={rosterOccupancyChip}
          />
        ) : showDemocraciaResults && democraciaResultDisplay ? (
          <TvZone
            democraciaResultsReveal={{
              mode: democraciaResultDisplay.mode,
              title: democraciaResultDisplay.title,
              subtitle: democraciaResultDisplay.subtitle,
              participants: democraciaResultsParticipants,
              onDone: handleDemocraciaResultsDone,
            }}
            priorityAnnouncement={confessionalTvAnnouncement}
            onPriorityAnnouncementDismiss={dismissConfessionalTvPrompt}
            externalAnnouncement={
              socialModuleUnavailableAnnouncement ??
              publicMeterUnavailableAnnouncement ??
              preAdAnnouncement
            }
            onExternalAnnouncementDismiss={
              socialModuleUnavailableAnnouncement
                ? () => setSocialModuleUnavailableAnnouncement(null)
                : publicMeterUnavailableAnnouncement
                  ? () => setPublicMeterUnavailableAnnouncement(null)
                  : handlePreAdAnnouncementDismiss
            }
            mainLogMaxVisible={gameTvLogRows}
            viewportFallbackMessage={tvViewportFallbackMessage}
            occupancyChip={rosterOccupancyChip}
          />
        ) : showVoteResults ? (
          <TvZone
            voteResultsReveal={{
              nominees: voteResultsTallies,
              evictee: voteResultsEvictee,
              evicteeIds: voteResultsEvicteeIds,
              onTiebreakerRequired: handleTiebreakerRequired,
              publicTiebreak: publicEvictionTiebreak,
              onPublicTiebreakResolved: handlePublicEvictionTiebreakResolved,
              onDone: handleVoteResultsDone,
            }}
            priorityAnnouncement={confessionalTvAnnouncement}
            onPriorityAnnouncementDismiss={dismissConfessionalTvPrompt}
            externalAnnouncement={
              socialModuleUnavailableAnnouncement ??
              publicMeterUnavailableAnnouncement ??
              preAdAnnouncement
            }
            onExternalAnnouncementDismiss={
              socialModuleUnavailableAnnouncement
                ? () => setSocialModuleUnavailableAnnouncement(null)
                : publicMeterUnavailableAnnouncement
                  ? () => setPublicMeterUnavailableAnnouncement(null)
                  : handlePreAdAnnouncementDismiss
            }
            mainLogMaxVisible={gameTvLogRows}
            viewportFallbackMessage={tvViewportFallbackMessage}
            occupancyChip={rosterOccupancyChip}
          />
        ) : (
          <TvZone
            priorityAnnouncement={confessionalTvAnnouncement}
            onPriorityAnnouncementDismiss={dismissConfessionalTvPrompt}
            externalAnnouncement={
              socialModuleUnavailableAnnouncement ??
              publicMeterUnavailableAnnouncement ??
              aiTiebreakAnnouncement ??
              postVoteAnnouncement ??
              publicSaveResultAnnouncement ??
              preAdAnnouncement
            }
            onExternalAnnouncementDismiss={
              socialModuleUnavailableAnnouncement
                ? () => setSocialModuleUnavailableAnnouncement(null)
                : publicMeterUnavailableAnnouncement
                  ? () => setPublicMeterUnavailableAnnouncement(null)
                  : aiTiebreakAnnouncement
                    ? handleAiTiebreakAnnouncementDismiss
                    : postVoteAnnouncement
                      ? handlePostVoteAnnouncementDismiss
                      : publicSaveResultAnnouncement
                        ? handlePublicSaveResultDismiss
                        : handlePreAdAnnouncementDismiss
            }
            mainLogMaxVisible={gameTvLogRows}
            viewportFallbackMessage={tvViewportFallbackMessage}
            occupancyChip={rosterOccupancyChip}
          />
        )}

        {/* ── Outgoing LOH ineligibility warning ──────────────────────────── */}
        {responsiveGameLayout.debugEnabled && (
          <output className="game-screen__layout-debug" aria-live="polite">
            {responsiveGameLayout.debugLabel}
          </output>
        )}

        {showOutgoingHohWarning && (
          <div
            className="tv-binary-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="outgoing-hoh-title"
          >
            <div className="tv-binary-modal__card">
              <header className="tv-binary-modal__header">
                <h2 className="tv-binary-modal__title" id="outgoing-hoh-title">
                  👑 LOH Competition
                </h2>
                <p className="tv-binary-modal__subtitle">
                  As outgoing LOH, you are not eligible to compete.
                </p>
              </header>
              <div className="tv-binary-modal__body">
                <button
                  className="tv-binary-modal__option tv-binary-modal__option--yes"
                  onClick={() => setOutgoingHohWarningDismissedWeek(game.week)}
                  type="button"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Human LOH nomination modal (single multi-select step) ──────── */}
        {showNominationsModal && (
          <TvMultiSelectModal
            title="Nomination Ceremony"
            subtitle={
              game.doubleEviction?.weekActive
                ? `${humanPlayer?.name}, choose THREE players to nominate — Double Elimination tonight!`
                : `${humanPlayer?.name}, choose two players to nominate for elimination.`
            }
            options={nomineeOptions}
            maxSelect={game.doubleEviction?.weekActive ? 3 : 2}
            onConfirm={handleCommitNominees}
            autoNomineeId={
              canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? undefined) : undefined
            }
            autoNomineeLabel={autoNomineeLabel}
          />
        )}

        {/* ── Nomination ceremony — spotlight cutout with ❓ badges ─────────── */}
        {/* Shown for BOTH human LOH (deferred commit) and AI LOH (already committed). */}
        {shouldShowNominationCeremony && (
          <CeremonyOverlay
            tiles={[]}
            layoutSignal={responsiveGameLayout.revision}
            resolveTiles={() => {
              const lohId = lohCeremonyTileId
              if (!lohId) return []
              const lohRect = getTileRect(lohId)
              return [
                {
                  rect: lohRect,
                  glowTone: 'gold' as const,
                },
                ...nomAnimPlayers.map((p) => {
                  const isAutoNominee = nominationLabels[p.id] === 'Last in LOH Comp'
                  return {
                    rect: getTileRect(p.id),
                    badge: '❓',
                    badgeImageSrc: NOMINATION_BADGE_SRC,
                    label: nominationLabels[p.id],
                    glowTone: 'danger' as const,
                    badgeStart: isAutoNominee || !lohRect ? ('center' as const) : lohRect,
                    badgeLabel: `${p.name} nominated`,
                  }
                }),
              ]
            }}
            caption={
              nomAnimPlayers.length === 1
                ? `${nomAnimPlayers[0].name} has been nominated`
                : nomAnimPlayers.length >= 3
                  ? `${nomAnimPlayers.map((n) => n.name).join(', ')} have been nominated`
                  : `${nomAnimPlayers.map((n) => n.name).join(' & ')} have been nominated`
            }
            subtitle={
              nominationLabels[nomAnimPlayers[nomAnimPlayers.length - 1]?.id ?? ''] ===
              'Last in LOH Comp'
                ? '🎯 Nominations are set — including the LOH comp last-place finisher'
                : '🎯 Nominations are set'
            }
            onDone={showHumanNomAnim ? handleNomAnimDone : handleAiNomAnimDone}
            ariaLabel={`Nomination ceremony: ${nomAnimPlayers.map((n) => n.name).join(' and ')}`}
          />
        )}

        {/* ── Human POS holder Yes/No decision ────────────────────────────── */}
        {showPovDecisionModal && (
          <TvBinaryDecisionModal
            title={specialVetoName ?? 'Power of Safety Ceremony'}
            subtitle={
              activeSpecialVeto === 'vip'
                ? `${humanPlayer?.name}, will you use Double Trouble? You may use it twice this ceremony.`
                : activeSpecialVeto === 'diamond'
                  ? `${humanPlayer?.name}, will you use Halo Exchange and name the replacement yourself?`
                  : activeSpecialVeto === 'coup'
                    ? `${humanPlayer?.name}, will you use Detox and replace both nominees yourself?`
                    : `${humanPlayer?.name}, will you use the Power of Safety?`
            }
            yesLabel={
              activeSpecialVeto === 'vip'
                ? '👑 Yes — use Double Trouble'
                : activeSpecialVeto === 'diamond'
                  ? '😇 Yes — use Halo Exchange'
                  : activeSpecialVeto === 'coup'
                    ? '⚡ Yes — use Detox'
                    : '✅ Yes — use the Power'
            }
            noLabel={
              activeSpecialVeto === 'vip'
                ? '❌ No — leave the block as is'
                : activeSpecialVeto === 'diamond'
                  ? '❌ No — leave nominations the same'
                  : activeSpecialVeto === 'coup'
                    ? '❌ No — keep both nominees up'
                    : '❌ No — keep nominations the same'
            }
            onYes={() => dispatch(submitPovDecision(true))}
            onNo={() => dispatch(submitPovDecision(false))}
          />
        )}

        {showVipSecondUseModal && (
          <TvBinaryDecisionModal
            title="Double Trouble"
            subtitle={`${humanPlayer?.name}, would you like to use Double Trouble a second time?`}
            yesLabel="👑 Yes — save another nominee"
            noLabel="❌ No — keep nominations as they are"
            onYes={() => dispatch(submitVipSecondUseDecision(true))}
            onNo={() => dispatch(submitVipSecondUseDecision(false))}
          />
        )}

        {/* ── Human POS holder picks who to save ──────────────────────────── */}
        {showPovSaveModal && (
          <TvDecisionModal
            title={
              game.specialVeto?.awaitingVipSecondSaveTarget
                ? 'Double Trouble — Second Save'
                : specialVetoName
                  ? `${specialVetoName} — Save a Nominee`
                  : 'Power of Safety — Save a Nominee'
            }
            subtitle={
              activeSpecialVeto === 'diamond'
                ? `${humanPlayer?.name}, choose one nominee to save with Halo Exchange.`
                : activeSpecialVeto === 'spotlight'
                  ? `${humanPlayer?.name}, Force Majeure must be used. Choose a nominee to save.`
                  : game.specialVeto?.awaitingVipSecondSaveTarget
                    ? `${humanPlayer?.name}, choose the second nominee to save with Double Trouble.`
                    : `${humanPlayer?.name}, choose which nominee to save.`
            }
            options={povSaveOptions}
            onSelect={handlePovSaveTarget}
            stingerMessage={
              activeSpecialVeto === 'vip'
                ? 'DOUBLE TROUBLE'
                : activeSpecialVeto === 'diamond'
                  ? 'HALO EXCHANGE'
                  : activeSpecialVeto === 'coup'
                    ? 'DETOX'
                    : activeSpecialVeto === 'spotlight'
                      ? 'FORCE MAJEURE'
                      : 'VETO USED'
            }
          />
        )}

        {/* ── Human LOH replacement picker ────────────────────────────────── */}
        {showReplacementModal && (
          <TvDecisionModal
            title="Name a Backup Nominee"
            subtitle={`${humanPlayer?.name}, you must name a backup nominee.`}
            options={replacementOptions}
            onSelect={handleReplacementNominee}
            stingerMessage="NOMINATIONS SET"
          />
        )}

        {showDiamondReplacementModal && (
          <TvDecisionModal
            title="Halo Exchange — Name the Replacement"
            subtitle={`${humanPlayer?.name}, choose the backup nominee.`}
            options={holderReplacementOptions}
            onSelect={handleDiamondReplacementNominee}
            stingerMessage="HALO EXCHANGE"
          />
        )}

        {showCoupReplacementModal && (
          <TvDecisionModal
            title="Detox — Name Replacement Nominees"
            subtitle={
              game.specialVeto?.awaitingCoupReplacement1
                ? `${humanPlayer?.name}, choose the first backup nominee.`
                : `${humanPlayer?.name}, choose the second backup nominee.`
            }
            options={coupReplacementOptions}
            onSelect={(id) => dispatch(submitCoupReplacement(id))}
            stingerMessage="DETOX"
          />
        )}

        {/* ── Democracia vote modal ──────────────────────────────────────────── */}
        {showDemocraciaVoteModal && (
          <TvDecisionModal
            title="🗳️ Democracia — Cast Your Vote"
            subtitle={`${humanPlayer?.name}, vote for the houseguest you want to become Leader of the House. You cannot vote for yourself.`}
            options={democraciaVoteOptions}
            onSelect={(id) => dispatch(submitDemocraciaVote(id))}
            stingerMessage="VOTE CAST"
          />
        )}

        {/* ── Co-LOH nomination modal ────────────────────────────────────────── */}
        {showCoLohNominationModal && humanCoLohId && (
          <TvDecisionModal
            title="Co-LOH Nomination"
            subtitle={`${humanPlayer?.name}, as co-Leader of the House, nominate one houseguest for elimination. You cannot nominate yourself or the other co-LOH.`}
            options={coLohNomOptions}
            onSelect={(id) =>
              dispatch(submitCoLohNomination({ coLohId: humanCoLohId, nomineeId: id }))
            }
            danger
            stingerMessage="NOMINATION LOCKED IN"
          />
        )}

        {/* ── Final 4 plea chat overlay (all players) ─────────────────────── */}
        {showFinal4Chat && (
          <ChatOverlay
            lines={final4PleaLines}
            skippable
            header={{ title: 'Final 4 🏡', subtitle: 'Hear from the nominees before the vote.' }}
            onComplete={handleFinal4PleaComplete}
            ariaLabel="Final 4 plea chat"
          />
        )}

        {/* ── Final 4 eviction vote (human POS holder) ────────────────────── */}
        {showFinal4Modal && (
          <TvDecisionModal
            title="Final 4 — Cast Your Vote"
            subtitle={`${humanPlayer?.name}, you hold the sole vote to eliminate. Choose wisely.`}
            options={final4Options}
            onSelect={(id) => dispatch(finalizeFinal4Eviction(id))}
            danger
            stingerMessage="VOTE RECORDED"
          />
        )}

        {/* ── Final 4 eviction announcement overlay ────────────────────────── */}
        {showFinal4AnnounceChat && (
          <ChatOverlay
            lines={final4AnnounceLines}
            skippable
            header={{ title: 'Final 4 🚪', subtitle: 'The decision has been made.' }}
            onComplete={handleFinal4AnnounceComplete}
            ariaLabel="Final 4 elimination announcement"
          />
        )}

        {/* ── Final 3 eviction (human Final LOH evicts directly) ──────────── */}
        {showFinal3Modal && (
          <TvDecisionModal
            title="Final LOH — Eliminate a Player"
            subtitle={`${humanPlayer?.name}, as Final LOH you must directly eliminate one of the remaining players.`}
            options={final3Options}
            onSelect={(id) => dispatch(finalizeFinal3Eviction(id))}
            danger
            stingerMessage="VOTE RECORDED"
          />
        )}

        {/* ── Final 3 Ceremony (AI LOH: coronation → pleas → eviction) ────── */}
        {showFinal3Ceremony && <Final3Ceremony />}

        {/* ── Jury phase reveal: cinematic full-screen overlay ──────────────── */}
        <JuryPhaseRevealOverlay
          open={game.phase === 'jury_announcement'}
          jurors={juryPlayers}
          onEnterVote={handleEnterJuryVote}
          onSpyJury={handleSpyJury}
        />

        {/* ── MinigameHost (challenge flow) ────────────────────────────────── */}
        {showMinigameHost && pendingChallenge && (
          <MinigameHost
            key={pendingChallenge.id}
            game={pendingChallenge.game}
            gameOptions={{
              seed: pendingChallenge.seed,
              // Use the prize type stored on the pending challenge (set at creation time
              // from game.phase). This is stable even if game.phase changes later.
              // Fall back to deriving from current game.phase for backward compatibility.
              prizeType: pendingChallenge.prizeType ?? (game.phase === 'pos_comp' ? 'POS' : 'LOH'),
            }}
            competitionRetry={{
              enabled: competitionRetryInResultsEnabled,
              pending: adPending,
              onWatch: (onReward) => {
                if (adPending) return
                setAdPending(true)
                const state = storeRef.current.getState()
                const requested = showRewarded(
                  'competition_retry',
                  state,
                  dispatch,
                  () => {
                    if (import.meta.env.DEV) {
                      console.log('[ads] competition_retry reward granted in minigame results')
                    }
                    onReward()
                    setAdPending(false)
                  },
                  { isFinal3Week }
                )
                if (!requested) {
                  setAdPending(false)
                }
              },
            }}
            participants={pendingChallenge.participants.map((id): MinigameParticipant => {
              const player = game.players.find((p) => p.id === id)
              const aiScore = pendingChallenge.aiScores[id] ?? 0
              return {
                id,
                name: player?.name ?? id,
                isHuman: !!player?.isUser,
                avatar: player?.avatar,
                precomputedScore: aiScore,
                previousPR: player?.stats?.gamePRs?.[pendingChallenge.game.key] ?? null,
              }
            })}
            onDone={handleChallengeDone}
          />
        )}

        {/* ── Native LOH/POS minigame overlays (routed by session key) ────────── */}
        {showQuickTapRace && pendingMinigame && (
          <QuickTapRace session={pendingMinigame} players={game.players} />
        )}
        {showLaneRacers && pendingMinigame && (
          <LaneRacersCanvasGame session={pendingMinigame} players={game.players} />
        )}
        {showPressurePlank && pendingMinigame && (
          <PressurePlank session={pendingMinigame} players={game.players} />
        )}

        {/* ── BullseyeBlitz minigame overlay ───────────────────────────────── */}
        {showBullseyeBlitz && pendingMinigame && (
          <BullseyeBlitz session={pendingMinigame} players={game.players} />
        )}

        {/* ── TravelingDots minigame overlay ───────────────────────────────── */}
        {showTravelingDots && pendingMinigame && (
          <TravelingDots session={pendingMinigame} players={game.players} />
        )}

        {/* ── SpotlightAnimation — LOH / POS winner reveal (viewport-tracking) ── */}
        {showWinnerCeremony && pendingWinnerCeremony && (
          <SpotlightAnimation
            tiles={pendingWinnerCeremony.tiles}
            caption={pendingWinnerCeremony.caption}
            subtitle={pendingWinnerCeremony.subtitle}
            onDone={handleWinnerCeremonyDone}
            ariaLabel={pendingWinnerCeremony.ariaLabel}
            measureA={pendingWinnerCeremony.measureA}
          />
        )}

        {/* ── CeremonyOverlay — advance()-picked LOH winner (outgoing LOH) ──── */}
        {/* When the human was outgoing LOH and skipped the minigame, advance()    */}
        {/* picks the winner directly. This overlay shows the 👑 ceremony.         */}
        {showAdvanceHohCeremony && game.lohId && (
          <CeremonyOverlay
            tiles={[]}
            layoutSignal={responsiveGameLayout.revision}
            resolveTiles={() => {
              const winnerId = game.lohId!
              const winnerPlayer = game.players.find((p) => p.id === winnerId)
              return [
                {
                  rect: getTileRect(winnerId),
                  badge: '👑',
                  badgeImageSrc: LOH_BADGE_SRC,
                  badgeStart: 'center' as const,
                  badgeLabel: `${winnerPlayer?.name ?? winnerId} wins Leader of the House`,
                },
              ]
            }}
            caption={`${game.players.find((p) => p.id === game.lohId)?.name ?? 'A player'} wins Leader of the House!`}
            subtitle="👑"
            onDone={handleAdvanceHohCeremonyDone}
            ariaLabel={`${game.players.find((p) => p.id === game.lohId)?.name ?? 'A player'} wins Leader of the House`}
          />
        )}

        {/* ── CeremonyOverlay — Replacement nominee (human LOH deferred) ──── */}
        {pendingReplacementCeremony && (
          <CeremonyOverlay
            tiles={[]}
            layoutSignal={responsiveGameLayout.revision}
            resolveTiles={pendingReplacementCeremony.resolveTiles}
            caption={pendingReplacementCeremony.caption}
            subtitle={pendingReplacementCeremony.subtitle}
            onDone={handleReplacementCeremonyDone}
            ariaLabel={pendingReplacementCeremony.caption}
          />
        )}

        {/* ── CeremonyOverlay — AI replacement nominee animation ─────────── */}
        {/* Only the replacement nominee (last in nomineeIds, pushed by store) gets */}
        {/* a badge. The badge flies from the LOH tile → replacement tile.          */}
        {showAiReplacementAnim && game.nomineeIds.length > 0 && (
          <CeremonyOverlay
            tiles={[]}
            layoutSignal={responsiveGameLayout.revision}
            resolveTiles={() => {
              const replacementId = game.nomineeIds[game.nomineeIds.length - 1]
              const sourceId =
                game.specialVeto?.activeType === 'diamond' ? game.posWinnerId : game.lohId
              const sourceRect = sourceId ? getTileRect(sourceId) : null
              const replacementPlayer = game.players.find((p) => p.id === replacementId)
              const sourceIsDistinct =
                sourceRect != null && sourceId != null && sourceId !== replacementId
              return [
                ...(sourceIsDistinct
                  ? [
                      {
                        rect: sourceRect,
                        glowTone: 'gold' as const,
                      },
                    ]
                  : []),
                {
                  rect: getTileRect(replacementId),
                  badge: '❓',
                  badgeImageSrc: NOMINATION_BADGE_SRC,
                  badgeStart: sourceIsDistinct ? sourceRect : ('center' as const),
                  badgeLabel: `${replacementPlayer?.name ?? replacementId} named backup nominee`,
                  glowTone: 'danger' as const,
                },
              ]
            }}
            caption="Backup nominee named"
            subtitle={
              game.specialVeto?.activeType === 'diamond'
                ? '😇 Halo Exchange names the backup nominee'
                : '🎯 Nominations are set'
            }
            onDone={handleAiReplacementDone}
            ariaLabel="Backup nominee ceremony"
          />
        )}

        {showPublicSaveCeremony && pendingPublicSaveResult && (
          <CeremonyOverlay
            tiles={[]}
            layoutSignal={responsiveGameLayout.revision}
            resolveTiles={() => [
              {
                rect: getTileRect(pendingPublicSaveResult.savedId),
                badge: '❓',
                badgeImageSrc: NOMINATION_BADGE_SRC,
                badgeLabel: `${game.players.find((p) => p.id === pendingPublicSaveResult.savedId)?.name ?? 'A player'} public save extraction`,
                badgeMotion: 'extract' as const,
                glowTone: 'success' as const,
              },
            ]}
            caption={`${game.players.find((p) => p.id === pendingPublicSaveResult.savedId)?.name ?? 'A player'} is safe!`}
            onDone={handlePublicSaveCeremonyDone}
            ariaLabel={`Public save ceremony: ${game.players.find((p) => p.id === pendingPublicSaveResult.savedId)?.name ?? 'A player'} is safe`}
            showDim={false}
            showCaption={false}
          />
        )}

        {/* ── CeremonyOverlay — POS save ceremony (human POS holder) ────── */}
        {showSaveCeremony && pendingSaveCeremony && (
          <CeremonyOverlay
            tiles={[]}
            layoutSignal={responsiveGameLayout.revision}
            resolveTiles={pendingSaveCeremony.resolveTiles}
            caption={pendingSaveCeremony.caption}
            subtitle={pendingSaveCeremony.subtitle}
            onDone={handleSaveCeremonyDone}
            ariaLabel={pendingSaveCeremony.caption}
          />
        )}

        {/* ── PR 3: voteDeduction Big Eye offer (overlays results popup) ───── */}
        {showVoteDeductionOffer && (
          <TvBinaryDecisionModal
            title="📺 The Big Eye — Secret Power"
            subtitle={`${humanPlayer?.name}, you have a stored Vote Deduction power. Use it to remove 1 vote cast against you?`}
            yesLabel="🪄 Yes — remove 1 vote"
            noLabel="❌ No — keep results as they are"
            onYes={handleVoteDeductionAccept}
            onNo={handleVoteDeductionDecline}
          />
        )}

        {/* ── AI double-eviction tie-break choreography overlay ─────────────── */}
        {showAiSecondTieBreakOverlay && (
          <div
            className="tv-binary-modal"
            style={{ zIndex: 8600 }}
            role="status"
            aria-live="assertive"
            aria-label="LOH is breaking the tie"
          >
            <div className="tv-binary-modal__card">
              <header className="tv-binary-modal__header">
                <h2 className="tv-binary-modal__title">⚖️ It&rsquo;s a Tie!</h2>
                <p className="tv-binary-modal__subtitle">👑 LOH is breaking the tie&hellip;</p>
              </header>
            </div>
          </div>
        )}

        {/* ── Eviction cinematic (pendingEviction-driven, shared layout match-cut) ── */}
        <AnimatePresence>
          {showEvictionSplash && pendingEvictionPlayer && (
            <SpotlightEvictionOverlay
              key={pendingEvictionPlayer.id}
              evictee={pendingEvictionPlayer}
              contextLabel={`Season ${game.season} · Day ${game.week}`}
              onDone={handleEvictionSplashDone}
              layoutId={`avatar-tile-${pendingEvictionPlayer.id}`}
              devSkip={import.meta.env.DEV || import.meta.env.CI === 'true'}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {dayStartShock && dayStartShockPlayer && (
            <DayStartShockPopup
              key={`${dayStartShock.templateId}-${dayStartShock.triggeredWeek}-${dayStartShock.source}`}
              player={dayStartShockPlayer}
              reason={dayStartShock.reason}
              onConfirm={handleDayStartShockConfirm}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {twinShockReveal && completedTwinShockIntroKey !== twinShockSequenceKey && (
            <TwinShockIntroCinematic
              key={`intro-${twinShockSequenceKey}`}
              reveal={twinShockReveal}
              onComplete={handleTwinShockIntroDone}
            />
          )}
          {twinShockReveal && completedTwinShockIntroKey === twinShockSequenceKey && (
            <TwinShockRevealOverlay
              key={`avatar-${twinShockSequenceKey}`}
              reveal={twinShockReveal}
              getTileRect={getTileRect}
              onDone={handleTwinShockRevealDone}
            />
          )}
        </AnimatePresence>
        <SurvivorAchievementCelebration />

        {/* ── Back 2 the Game / Jury Return twist overlay ──────────────────── */}
        {showBattleBackOverlay && useBattleBackMinigame && (
          <div
            className="game-screen__battle-back-minigame"
            aria-label="Back 2 the Game competition"
          >
            <Capitalization
              key={`${battleBackCandidateIds.join('-')}-bb-cap-${battleBackAttemptIndex}`}
              context="battleBack"
              participantIds={battleBackCandidateIds}
              participants={battleBackCapitalizationParticipants}
              seed={battleBackAttemptSeed}
              onFinish={(_value, _tiebreakerMs, completion) => {
                handleBattleBackComplete(completion?.authoritativeWinnerId ?? null)
              }}
            />
          </div>
        )}
        {showBattleBackOverlay && !useBattleBackMinigame && (
          <SpectatorView
            key={`${battleBackCandidateIds.join('-')}-bb-${battleBackAttemptIndex}`}
            competitorIds={battleBackCandidateIds}
            variant={battleBackVariant}
            expectedWinnerId={battleBackWinnerId}
            roundLabel="Back 2 the Game"
            placement="fullscreen"
            onDone={() => handleBattleBackComplete()}
          />
        )}
        <ConfirmExitModal
          open={preJuryGameOver}
          title="Your season is over"
          description="You were eliminated before the Tribunal began, so you cannot return to the game or cast a finale vote."
          confirmLabel="Start New Season"
          cancelLabel="Return Home"
          onConfirm={handleStartNewSeason}
          onCancel={handlePreJuryReturnHome}
        />

        {/* ── Public's Favorite Player voting overlay ───────────────────────── */}
        {isPublicModeEnabled(game.mode) && showFavoriteVoting && favoritePlayer && (
          <PublicFavoriteOverlay
            candidates={game.players.filter((p) =>
              (favoritePlayer.candidates ?? []).includes(p.id)
            )}
            seed={game.seed}
            awardAmount={favoritePlayer.awardAmount}
            onComplete={handleFavoriteComplete}
            onAudienceSurgeRequest={handleFavoriteAudienceSurgeRequest}
          />
        )}

        {/* ── Social Phase Panel (human player actions) ────────────────────── */}
        {!FEATURE_SOCIAL_V2 && showSocialPanel && humanPlayer && (
          <SocialPanel actorId={humanPlayer.id} />
        )}

        {/* ── Social Phase Panel V2 (modal overlay skeleton) ───────────────── */}
        {isSocialModeEnabled(game.mode) && <SocialPanelV2 />}

        {/* ── Incoming interactions inbox ─────────────────────────────────── */}
        {isSocialModeEnabled(game.mode) && <IncomingInteractionsInbox />}

        {/* ── Social Summary Popup (shown after social phase ends) ─────────── */}
        {isSocialModeEnabled(game.mode) && socialSummaryOpen && <SocialSummaryPopup />}

        {/* ── Ad Prompts ───────────────────────────────────────────────────── */}
        {showVoteBreakdownPrompt && (
          <AdPrompt
            icon="🗳️"
            title="Peek Behind the Curtain?"
            description={
              voteBreakdownPromptIsPostEviction
                ? 'Watch a short ad to unlock the vote reveal showing who voted for whom after this live eviction.'
                : 'Watch a short ad to unlock the Confessional reveal showing who voted for whom after this live eviction.'
            }
            watchLabel="Watch Ad to Unlock Vote Reveal"
            skipLabel="Continue"
            onWatch={() => {
              if (adPending) return
              setAdPending(true)
              const state = storeRef.current.getState()
              if (!window.GameAds?.showRewarded) {
                dispatch(recordAdShown('eviction_vote_breakdown'))
                unlockVoteBreakdown()
                return
              }
              const requested = showRewarded('eviction_vote_breakdown', state, dispatch, () =>
                unlockVoteBreakdown()
              )
              if (!requested) {
                unlockVoteBreakdown()
              }
            }}
            onSkip={handleVoteBreakdownSkip}
            pending={adPending}
          />
        )}

        {postEvictionVoteBreakdown && (
          <div
            className="ad-prompt__backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Vote Breakdown"
          >
            <div className="ad-prompt__card game-screen__vote-breakdown-card">
              <div className="game-screen__vote-breakdown-header">
                <span className="game-screen__vote-breakdown-eyebrow">Vote Breakdown</span>
                <strong>Who voted for whom</strong>
              </div>
              <div
                className="game-screen__vote-breakdown-table"
                role="table"
                aria-label="Eviction vote breakdown"
              >
                {postEvictionVoteBreakdownRows.map((row) => (
                  <div key={row.voterKey} className="game-screen__vote-breakdown-row" role="row">
                    <span className="game-screen__vote-breakdown-cell" role="cell">
                      {row.voterName}
                    </span>
                    <span className="game-screen__vote-breakdown-arrow" aria-hidden="true">
                      →
                    </span>
                    <span
                      className="game-screen__vote-breakdown-cell game-screen__vote-breakdown-cell--target"
                      role="cell"
                    >
                      {row.targetName}
                    </span>
                  </div>
                ))}
              </div>
              <div className="game-screen__vote-breakdown-actions">
                <button
                  type="button"
                  className="ad-prompt__btn ad-prompt__btn--watch"
                  onClick={() => setPostEvictionVoteBreakdown(null)}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* social_energy_recharge: rewarded prompt when energy hits 0 */}
        {showEnergyRechargePrompt && humanPlayer && (
          <AdPrompt
            icon="⚡"
            title="Out of Energy!"
            description="Watch a short ad to recharge +3 social energy and keep playing."
            watchLabel="Watch Ad for +3 Energy"
            onWatch={() => {
              if (adPending) return
              setAdPending(true)
              const state = storeRef.current.getState()
              const requested = showRewarded('social_energy_recharge', state, dispatch, () => {
                // Reward: +3 social energy
                dispatch(setEnergyBankEntry({ playerId: humanPlayer.id, value: 3 }))
                setShowEnergyRechargePrompt(false)
                setAdPending(false)
              })
              if (!requested) {
                setAdPending(false)
              }
            }}
            onSkip={() => setShowEnergyRechargePrompt(false)}
            pending={adPending}
          />
        )}

        {/* public_meter_disliked_boost: rewarded prompt when approval drops to Disliked */}
        {showDislikedBoostPrompt && humanPlayer && (
          <AdPrompt
            icon="📊"
            title="Your Approval Is Slipping"
            description={DISLIKED_BOOST_PROMPT_DESCRIPTION}
            watchLabel="Watch Ad for Approval Boost"
            onWatch={() => {
              if (adPending) return
              setAdPending(true)
              const state = storeRef.current.getState()
              const requested = showRewarded(
                'public_meter_disliked_boost',
                state,
                dispatch,
                (payload) => {
                  // Reward: +4 to +10% approval (random, or native-provided)
                  const boostPct =
                    typeof payload?.percent === 'number'
                      ? Math.round(payload.percent)
                      : 4 + Math.floor(Math.random() * 7) // 4–10
                  dispatch(
                    updateApproval({
                      playerId: humanPlayer.id,
                      delta: boostPct,
                      reason: 'Ad boost — disliked recovery',
                      week: game.week,
                      eventType: 'ad_boost',
                    })
                  )
                  setShowDislikedBoostPrompt(false)
                  setAdPending(false)
                }
              )
              if (!requested) {
                setAdPending(false)
              }
            }}
            onSkip={() => setShowDislikedBoostPrompt(false)}
            pending={adPending}
          />
        )}

        {battleBackRetryOfferWinnerId && (
          <AdPrompt
            icon="⚡"
            title="Second Chance?"
            description={`Watch a short ad to rerun Back 2 the Game before ${battleBackRetryOfferWinner?.name ?? 'the winner'} returns. Retries left: ${BATTLE_BACK_RETRY_LIMIT - battleBackRetryCount}.`}
            watchLabel="Watch Ad to Replay Back 2 the Game"
            skipLabel="Continue"
            onWatch={() => {
              if (adPending) return
              setAdPending(true)
              const restartBattleBack = () => {
                handleBattleBackRetryGranted()
                setAdPending(false)
              }
              const state = storeRef.current.getState()
              if (!window.GameAds?.showRewarded) {
                dispatch(recordAdShown('competition_retry'))
                restartBattleBack()
                return
              }
              const requested = showRewarded(
                'competition_retry',
                state,
                dispatch,
                () => restartBattleBack(),
                { isFinal3Week }
              )
              if (!requested) {
                setAdPending(false)
              }
            }}
            onSkip={handleBattleBackRetryDeclined}
            pending={adPending}
          />
        )}

        {/* ── SpectatorView — Final 3 Part 2 (human won Part 1, sits out Part 2) ── */}
        {/* expectedWinnerId pre-computes the AI pick so the reveal matches advance(). */}
        {spectatorF3Part2Active && spectatorReactEnabled && (
          <SpectatorView
            key={spectatorF3Part2CompetitorIds.join('-') + '-p2'}
            competitorIds={spectatorF3Part2CompetitorIds}
            variant="holdwall"
            expectedWinnerId={f3Part2PredictedWinnerId ?? undefined}
            roundLabel="Final 3 · Part 2"
            onDone={handleSpectatorF3Part2Done}
          />
        )}

        {/* ── SpectatorView — Final 3 Part 3 (human is spectator) ─────────── */}
        {/* Pass expectedWinnerId so the overlay always reveals the correct winner. */}
        {spectatorF3Active && spectatorReactEnabled && (
          <SpectatorView
            key={spectatorF3CompetitorIds.join('-')}
            competitorIds={spectatorF3CompetitorIds}
            variant="holdwall"
            expectedWinnerId={f3Part3PredictedWinnerId ?? undefined}
            roundLabel="Final 3 · Part 3"
            onDone={handleSpectatorF3Done}
          />
        )}

        {/* ── SpectatorView — legacy spectator:show event ───────────────────── */}
        {/* key forces a full remount when the competitor list or minigame changes,
          because useSpectatorSimulation initialises once per mount (see progressEngine). */}
        {spectatorLegacyPayload && spectatorReactEnabled && (
          <SpectatorView
            key={`${spectatorLegacyPayload.competitorIds.join('-')}-${spectatorLegacyPayload.minigameId ?? ''}`}
            competitorIds={spectatorLegacyPayload.competitorIds}
            variant={spectatorLegacyPayload.variant}
            minigameId={spectatorLegacyPayload.minigameId}
            initialWinnerId={spectatorLegacyPayload.winnerId}
            onDone={handleSpectatorLegacyDone}
          />
        )}

        {/* ── QA: trigger nomination animation (enabled with qa=1) ─────────── */}
        {isQaMode && !awaitingHumanDecision && (
          <button
            className="dev-nom-anim-btn"
            onClick={handleDevPlayNomAnim}
            type="button"
            aria-label="QA: Play Nomination Animation"
          >
            🎬 QA: Play Nomination Animation
          </button>
        )}

        {/* ── Floating Action Bar ───────────────────────────────────────────── */}
        {showGameControlDock && (
          <FloatingActionBar
            onPublicMeterBlocked={handlePublicMeterBlocked}
            onSocialModuleBlocked={handleSocialModuleBlocked}
          />
        )}

        {/* ── Houseguest grid (alive + evicted in one grid) ────────────────── */}
        <HouseguestGrid
          houseguests={game.players.map(playerToHouseguest)}
          headerSelector=".tv-zone"
          footerSelector=".nav-bar"
          overlaySelector=".game-control-dock"
          compact={responsiveGameLayout.compactRoster}
          rosterMode={responsiveGameLayout.rosterMode}
          headerMode={responsiveGameLayout.rosterHeaderMode}
          layoutRevision={responsiveGameLayout.revision}
          occupancyLabel={housemateOccupancyLabel}
          returningPlayerId={battleBackReturnId}
          onReturnAnimationDone={handleBattleBackReturnDone}
        />
        {previewPlayer && (
          <HouseguestInfoDialog player={previewPlayer} onClose={() => setPreviewPlayer(null)} />
        )}
      </div>
    </LayoutGroup>
  )
}
