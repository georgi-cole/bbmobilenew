import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { LayoutGroup, AnimatePresence } from 'framer-motion'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  addTvEvent,
  applyMinigameWinner,
  applyF3MinigameWinner,
  updateGamePRs,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  finalizePendingEviction,
  confirmDayStartShock,
  setEvictionOverlay,
  selectAlivePlayers,
  selectF3Part3PredictedWinnerId,
  selectF3Part2PredictedWinnerId,
  commitNominees,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
  submitHumanVote,
  submitTieBreak,
  submitDoubleEvictionTieBreak,
  dismissDemocraciaResultDisplay,
  dismissVoteResults,
  aiReplacementRendered,
  advance,
  completeBattleBack,
  dismissBattleBack,
  tryActivateBattleBack,
  tryActivatePendingForcedBattleBack,
  tryActivateDayStartShock,
  tryActivatePendingForcedDayStartShock,
  tryActivateSecretMission,
  openBattleBackCompetition,
  tryActivateDoubleEviction,
  tryActivatePendingForcedDoubleEviction,
  tryActivateSpecialVeto,
  tryActivatePendingForcedSpecialVeto,
  submitDiamondReplacement,
  submitCoupReplacement,
  submitVipSecondUseDecision,
  submitVipSecondSaveTarget,
  resolveFavoritePlayerWinner,
  awardFavoritePrize,
  openFavoritePlayerVoting,
  resumeAfterPublicFavorite,
  commitPublicSave,
  expireMissionReward,
  activateDoubleVoteReward,
  declineDoubleVoteReward,
  submitHumanDoubleVote,
  activateVoteDeductionReward,
  declineVoteDeduction,
  tryActivateDemocracia,
  tryActivatePendingForcedDemocracia,
  submitDemocraciaVote,
  resolveDemocraciaPublicBreaker,
  submitCoLohNomination,
  submitPosTieBreak,
  completeTwinShockRevealAnimation,
} from '../../store/gameSlice'
import { startChallenge, selectPendingChallenge, completeChallenge, type PendingChallenge } from '../../store/challengeSlice'
import { selectLastSocialReport } from '../../social/socialSlice'
import { setEnergyBankEntry } from '../../social/socialSlice'
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
import { isPlacementRankingGame } from '../../minigames/registry'
import { computeScores } from '../../minigames/scoring'
import FloatingActionBar from '../../components/FloatingActionBar/FloatingActionBar'
import SpotlightEvictionOverlay from '../../components/Eviction/SpotlightEvictionOverlay'
import DayStartShockPopup from '../../components/DayStartShockPopup/DayStartShockPopup'
import CeremonyOverlay from '../../components/CeremonyOverlay/CeremonyOverlay'
import type { CeremonyTile } from '../../components/CeremonyOverlay/CeremonyOverlay'
import SpotlightAnimation from '../../components/SpotlightAnimation/spotlight-animation'
import ChatOverlay from '../../components/ChatOverlay/ChatOverlay'
import type { ChatLine } from '../../components/ChatOverlay/ChatOverlay'
import SocialPanel from '../../components/SocialPanel/SocialPanel'
import SocialPanelV2 from '../../components/SocialPanelV2/SocialPanelV2'
import IncomingInteractionsInbox from '../../components/IncomingInteractionsInbox/IncomingInteractionsInbox'
import SurvivorAchievementCelebration from '../../components/SurvivorAchievementCelebration'
import { FEATURE_SOCIAL_V2, FEATURE_SPECTATOR_REACT } from '../../config/featureFlags'
import SocialSummaryPopup from '../../components/SocialSummary/SocialSummaryPopup'
import SpectatorView from '../../components/ui/SpectatorView'
import type { SpectatorVariant } from '../../components/ui/SpectatorView'
import Capitalization from '../../components/Capitalization/Capitalization'
import Final3Ceremony from '../../components/Final3Ceremony/Final3Ceremony'
import { getProfilePhotoAvatarId, resolveAvatar } from '../../utils/avatar'
import { pickPhrase, NOMINEE_PLEA_TEMPLATES } from '../../utils/juryUtils'
import { detectDebugMode } from '../../utils/debugMode'
import { statusBadgeImageSrc } from '../../utils/statusBadges'
import type { Player, Phase } from '../../types'
import { simulateBattleBackCompetition } from '../../features/twists/battleBackCompetition'
import {
  getCompetitionSeasonState,
  getDefaultCompetitionProfile,
  getMinigameAiModel,
  simulateMinigameAiScore,
} from '../../ai/competition'
import {
  buildDoubleEvictionTieResolutionMessage,
  calculateRequiredDoubleEvictionSlots,
  formatDoubleEvictionNameList,
} from '../../features/twists/doubleEvictionTieUtils'
import { mulberry32 } from '../../store/rng'
import { isSurvivorRunTerminal } from '../../modes/survivorRun'
import PublicFavoriteOverlay from '../../components/PublicFavoriteOverlay/PublicFavoriteOverlay'
import JuryPhaseRevealOverlay from '../../components/JuryPhaseRevealOverlay/JuryPhaseRevealOverlay'
import TwinShockRevealOverlay from '../../components/TwinShockRevealOverlay/TwinShockRevealOverlay'
import { rankPublicEvictionTieNominees } from '../../publicOpinion/PublicEvictionTieService'
import { resolvePublicSaveNominee } from '../../publicOpinion/PublicSaveService'
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
import {
  usePersistedGameScreenKey,
  usePersistedPromptDate,
} from './gameScreenPersistence'
import { requestFavoriteAudienceSurge } from './favoriteAudienceSurgeRequest'
import { useResponsiveGameLayout } from './useResponsiveGameLayout'
import { getCeremonyTileRect } from './ceremonyTileMeasurement'
import {
  BATTLE_BACK_ANNOUNCEMENT_SEQUENCE,
  advanceBattleBackAnnouncementStep,
  buildBattleBackFeedMessage,
  isBattleBackReplayEligible,
  shouldUseBattleBackMinigame,
} from './battleBackFlow'
import {
  buildEvictionVoteBreakdownPlayerNamesById,
  buildEvictionVoteBreakdownRows,
  isEvictionVoteBreakdownActive,
  loadEvictionVoteBreakdownUnlock,
  saveEvictionVoteBreakdownUnlock,
} from '../../features/evictionVoteBreakdownStorage'
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { shouldShowGameControlDock } from './gameScreenUiGuards'
import './GameScreen.css'

const LOH_BADGE_SRC = statusBadgeImageSrc('loh')
const NOMINATION_BADGE_SRC = statusBadgeImageSrc('nominated')
const EXITED_PLAYER_SORT_VALUE = Number.NEGATIVE_INFINITY
const EMPTY_PUBLIC_PROFILES: Record<string, PlayerPublicProfile> = {}
export const POST_VOTE_ANNOUNCEMENT_DELAY_MS = 5000
export const POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS = 400
const PUBLIC_SAVE_RESULT_DELAY_MS = 5000
const AI_TIE_STAGE_DELAY_MS = 3000
const AI_TIE_DECIDING_DELAY_MS = 3000
const AI_TIE_DECISION_DELAY_MS = 3000
const AI_TIE_RESULT_DELAY_MS = 3000
const CONFESSIONAL_TV_PROMPT_MESSAGE =
  'The Big Eye requires your decision. Head to the Confessional to complete your action before the game can continue.'
const PUBLIC_MODE_STORE_PROMPT =
  'If you want to activate public mode, go to the store in the home hub.'
const SOCIAL_MODULE_UNAVAILABLE_ANNOUNCEMENT_MS = 3000

function buildAiOnlyChallengeRawResults(challenge: PendingChallenge) {
  return challenge.participants.map((id) => ({
    playerId: id,
    rawValue: challenge.aiScores[id] ?? 0,
    ...(challenge.aiTiebreakers?.[id] != null ? { tiebreaker: challenge.aiTiebreakers[id] } : {}),
  }))
}

type PendingPublicSaveResult = {
  savedId: string
  supportPercent?: number
}

type AiTiebreakStage = 'tie' | 'deciding' | 'decision' | 'result'

type VoteBreakdownSnapshot = {
  votes: Record<string, string>
  nomineeIds: string[]
  evicteeId: string | null
  week: number
  phase: Phase
}

type AiTiebreakContext = {
  lohName: string
  evictee: Player
  resultTitle: string
}

const BATTLE_BACK_RETRY_LIMIT = 3

function buildDoubleEvictionPostVoteAnnouncement(options: {
  voteResults: Record<string, number>
  pendingEvictionId: string
  pendingSecondEvictionId: string | null
  lohName: string
  players: Player[]
  publicModeEnabled: boolean
}): { title: string; subtitle: string } {
  const {
    voteResults,
    pendingEvictionId,
    pendingSecondEvictionId,
    lohName,
    players,
    publicModeEnabled,
  } = options
  const firstEvictee = players.find((player) => player.id === pendingEvictionId) ?? null
  const secondEvictee = pendingSecondEvictionId
    ? players.find((player) => player.id === pendingSecondEvictionId) ?? null
    : null

  if (!firstEvictee || !secondEvictee) {
    return {
      title: 'Double Elimination Results',
      subtitle: `${firstEvictee?.name ?? 'The evictee'}, please say your goodbyes and leave through the Confessional's special exit.`,
    }
  }

  const boundaryVoteCount = voteResults[secondEvictee.id] ?? 0
  const nomineeIds = Object.keys(voteResults)
  const guaranteedIds = nomineeIds.filter((id) => (voteResults[id] ?? 0) > boundaryVoteCount)
  const tiedBoundaryIds = nomineeIds.filter((id) => (voteResults[id] ?? 0) === boundaryVoteCount)
  const remainingBoundarySlots = Math.max(0, 2 - guaranteedIds.length)
  const ambiguousBoundaryTie =
    tiedBoundaryIds.length > remainingBoundarySlots && remainingBoundarySlots > 0
  const eliminatedNames = formatDoubleEvictionNameList([firstEvictee.name, secondEvictee.name])
  const goodbyes = `${eliminatedNames}, please say your goodbyes and leave through the Confessional's special exit.`

  if (!ambiguousBoundaryTie) {
    return {
      title: 'Double Elimination Results',
      subtitle: goodbyes,
    }
  }

  const tiedNames = tiedBoundaryIds
    .map((id) => players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))

  if (guaranteedIds.length > 0) {
    return {
      title: 'Double Elimination Results',
      subtitle: `${firstEvictee.name} is the first player eliminated tonight. ${buildDoubleEvictionTieResolutionMessage({
        deciderName: lohName,
        tiedNames,
        selectedNames: [secondEvictee.name],
        publicModeEnabled,
        secondEvictionOnly: true,
      })} ${goodbyes}`,
    }
  }

  return {
    title: 'Double Elimination Results',
    subtitle: `${buildDoubleEvictionTieResolutionMessage({
      deciderName: lohName,
      tiedNames,
      selectedNames: [firstEvictee.name, secondEvictee.name],
      publicModeEnabled,
    })} ${goodbyes}`,
  }
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
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()
  const gameScreenRef = useRef<HTMLDivElement | null>(null)
  const storeRef = useRef(store)
  useEffect(() => {
    storeRef.current = store
  }, [store])
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const game = useAppSelector((s) => s.game)
  const settings = useAppSelector(selectSettings)
  // ── Confessional ceremony decision routing ─────────────────────────────────
  // When non-null, a required player ceremony decision is pending that must be
  // resolved inside the Confessional.  The in-game decision modals are hidden
  // and a main-TV guidance banner is shown instead.
  const activeConfessionalDecision = useAppSelector(selectActiveConfessionalDecision)
  const publicOpinionProfiles = useAppSelector(
    (s: RootState): Record<string, PlayerPublicProfile> => s.publicOpinion?.profiles ?? EMPTY_PUBLIC_PROFILES,
  )
  const pendingChallenge = useAppSelector(selectPendingChallenge)
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
  const [showVoteBreakdownPrompt, setShowVoteBreakdownPrompt] = useState(false)
  const [postEvictionVoteBreakdown, setPostEvictionVoteBreakdown] = useState<VoteBreakdownSnapshot | null>(null)
  // Tracks whether a rewarded ad request has been sent (prevents double-tap).
  const [adPending, setAdPending] = useState(false)
  const [preAdAnnouncement, setPreAdAnnouncement] = useState<Announcement | null>(null)
  const [publicMeterUnavailableAnnouncement, setPublicMeterUnavailableAnnouncement] = useState<Announcement | null>(null)
  const [socialModuleUnavailableAnnouncement, setSocialModuleUnavailableAnnouncement] = useState<Announcement | null>(null)
  const pendingPreAdPlacementRef = useRef<AdPlacement | null>(null)
  // Post-vote eviction message shown on the main TV
  // for 3 s after vote results dismiss and before the eviction animation plays.
  const [postVoteAnnouncement, setPostVoteAnnouncement] = useState<Announcement | null>(null)
  const [showConfessionalTvPrompt, setShowConfessionalTvPrompt] = useState(false)
  const [confessionalPromptTriggered, setConfessionalPromptTriggered] = useState(false)
  const [postVoteAnnouncementDelayActive, setPostVoteAnnouncementDelayActive] = useState(false)
  const [pendingPublicSaveResult, setPendingPublicSaveResult] = useState<PendingPublicSaveResult | null>(null)
  const [publicSaveCeremonyConsumedKey, setPublicSaveCeremonyConsumedKey] = usePersistedGameScreenKey(
    'public-save-ceremony',
    `${game.gameId}:${game.season}`,
  )
  const [aiTiebreakStage, setAiTiebreakStage] = useState<AiTiebreakStage | null>(null)
  const [activeAiTiebreakContext, setActiveAiTiebreakContext] = useState<AiTiebreakContext | null>(null)
  // When true, the confessional prompt is shown after the eviction animation
  // instead of inline with the vote results (post-eviction mode).
  const isPostEvictionConfessionalModeRef = useRef(false)
  // Snapshot of vote data captured at handleVoteResultsDone time for use in
  // unlockVoteBreakdown when game state may have already advanced.
  const postEvictionVoteSnapshotRef = useRef<VoteBreakdownSnapshot | null>(null)
  const isMountedRef = useRef(true)
  const postEvictionVoteBreakdownPromptTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const activeConfessionalDecisionKey = activeConfessionalDecision
    ? `${activeConfessionalDecision.type}:${activeConfessionalDecision.week}:${activeConfessionalDecision.phase}`
    : null

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (postEvictionVoteBreakdownPromptTimerRef.current != null) {
        window.clearTimeout(postEvictionVoteBreakdownPromptTimerRef.current)
        postEvictionVoteBreakdownPromptTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!activeConfessionalDecisionKey) {
      setConfessionalPromptTriggered(false)
      setShowConfessionalTvPrompt(false)
      return
    }

    const handlePlayPressed = () => {
      setConfessionalPromptTriggered(true)
      setShowConfessionalTvPrompt(true)
    }

    window.addEventListener('ui:playPressed', handlePlayPressed)
    return () => window.removeEventListener('ui:playPressed', handlePlayPressed)
  }, [activeConfessionalDecisionKey])

  const humanPlayer = game.players.find((p) => p.isUser)
  const humanPlayerEliminated = humanPlayer?.status === 'evicted' || humanPlayer?.status === 'jury'
  const confessionalTvAnnouncement = confessionalPromptTriggered && showConfessionalTvPrompt
    ? {
      key: 'confessional_required',
      title: 'Confessional Required',
      subtitle: CONFESSIONAL_TV_PROMPT_MESSAGE,
      isLive: false,
      autoDismissMs: 3500,
    }
    : null
  const juryPlayers = useMemo(
    () => game.players.filter((p) => p.status === 'jury'),
    [game.players],
  )

  // Combine compile-time flag with runtime cfg override.
  // game.cfg?.enableSpectatorReact defaults to true when omitted.
  const spectatorReactEnabled =
    FEATURE_SPECTATOR_REACT && game.cfg?.enableSpectatorReact !== false

  // ── Tile position lookup for CeremonyOverlay ──────────────────────────────
  // Queries the houseguest grid's data-player-id items and centers only scroll
  // roster targets before measurement, keeping normal/compact rosters fixed.
  const getTileRect = useCallback((playerId: string): DOMRect | null => {
    return getCeremonyTileRect(playerId)
  }, [])
  const twinShockReveal = game.twinShock?.pendingRevealAnimation ?? null
  const handleTwinShockRevealDone = useCallback(() => {
    dispatch(completeTwinShockRevealAnimation())
  }, [dispatch])

  // ── CeremonyOverlay — deferred LOH / POS winner commit ─────────────────
  // When MinigameHost reports a winner, we show the CeremonyOverlay with a
  // spotlight cutout over the winner's tile and a badge (👑/🛡️) that
  // flies from screen centre to the tile.  Only after the animation completes
  // do we dispatch applyMinigameWinner.  When DOMRects are unavailable
  // (tests / headless) the overlay fires onDone immediately so the store
  // mutation still happens — just without the visual.
  //
  // pendingWinnerDispatchRef stores the deferred thunk so handleCeremonyDone
  // can call it without stale-closure issues.
  const [pendingWinnerCeremony, setPendingWinnerCeremony] = useState<{
    tiles: CeremonyTile[]
    caption: string
    subtitle?: string
    ariaLabel: string
    /** Optional live-measure callback for viewport-tracking during zoom/scroll. */
    measureA?: () => DOMRect | null
  } | null>(null)
  const pendingWinnerDispatchRef = useRef<(() => void) | null>(null)

  const handleWinnerCeremonyDone = useCallback(() => {
    pendingWinnerDispatchRef.current?.()
    pendingWinnerDispatchRef.current = null
    setPendingWinnerCeremony(null)
  }, [])

  // ── Advance-picked LOH winner ceremony (outgoing LOH bypass) ──────────
  // When the human is the outgoing LOH, no MinigameHost challenge runs.
  // advance() picks the winner randomly → phase becomes loh_results with
  // lohId set, but no CeremonyOverlay was shown.  Detect this and fire
  // a spotlight ceremony so the winner reveal is still animated.
  const [advanceHohConsumedKey, setAdvanceHohConsumedKey] = usePersistedGameScreenKey(
    'advance-hoh-ceremony',
    game.season,
  )

  const advanceHohKey = useMemo(() => {
    if (game.phase !== 'loh_results' || !game.lohId) return ''
    // Only trigger when the human was the outgoing LOH (prevHohId === human id)
    // and the winner ceremony was NOT already shown by MinigameHost.
    if (!game.prevHohId || game.prevHohId !== humanPlayer?.id) return ''
    return `w${game.week}-hoh-${game.lohId}`
  }, [game.phase, game.lohId, game.week, game.prevHohId, humanPlayer?.id])

  const showAdvanceHohCeremony = advanceHohKey !== '' && advanceHohKey !== advanceHohConsumedKey && !pendingWinnerCeremony

  const handleAdvanceHohCeremonyDone = useCallback(() => {
    setAdvanceHohConsumedKey(advanceHohKey)
  }, [advanceHohKey, setAdvanceHohConsumedKey])

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

  // ── Auto-start challenge on competition phase transitions ─────────────────
  // The challenge system (startChallenge / MinigameHost) is the sole owner of
  // game selection for LOH and POS competitions. It picks a random game from
  // the registry, pre-computes AI scores appropriate for that game's metric kind,
  // and handles the rules modal → countdown → game → results flow.
  //
  // LOH eligibility rule: the outgoing LOH (prevHohId) cannot compete in the
  // next week's LOH competition. They are excluded from the participant list.
  // When the human player is the outgoing LOH, no challenge is started at all
  // (the winner is determined randomly via advance() instead).
  const aliveIds = useMemo(() => alivePlayers.map((p) => p.id), [alivePlayers]);
  const hohCompParticipants = useMemo(() => {
    if (game.phase !== 'loh_comp' || !game.prevHohId) return aliveIds;
    return aliveIds.filter((id) => id !== game.prevHohId);
  }, [game.phase, game.prevHohId, aliveIds]);

  const humanIsOutgoingHoh = game.phase === 'loh_comp' && !!game.prevHohId && game.prevHohId === humanPlayer?.id;

  // Warning modal state: shown once per week when the human is the outgoing LOH.
  // Tracks which week the warning was dismissed so it resets automatically each week.
  const [outgoingHohWarningDismissedWeek, setOutgoingHohWarningDismissedWeek] = useState<number | null>(null);
  const showOutgoingHohWarning = humanIsOutgoingHoh && outgoingHohWarningDismissedWeek !== game.week;

  useEffect(() => {
    const isCompPhase = game.phase === 'loh_comp' || game.phase === 'pos_comp'
    // Do not start a challenge when the human player is the outgoing LOH —
    // they are ineligible to compete; advance() will pick a winner randomly.
    // Also skip when a CeremonyOverlay is pending (challenge result already
    // captured; avoid launching a second challenge while the old one is animating).
    if (isCompPhase && !pendingChallenge && !humanIsOutgoingHoh && !pendingWinnerCeremony) {
      // Use the LOH-eligibility-filtered list only for LOH comps; POS is unrestricted.
      const participants = game.phase === 'loh_comp' ? hohCompParticipants : aliveIds;
      const derivedPrizeType = game.phase === 'pos_comp' ? 'POS' : 'LOH';
      dispatch(startChallenge(game.seed, participants, { prizeType: derivedPrizeType }))
    }
  }, [game.phase, pendingChallenge, hohCompParticipants, aliveIds, game.seed, dispatch, humanIsOutgoingHoh, pendingWinnerCeremony])

  // ── Auto-start challenge for Final 3 minigame phases ─────────────────────
  // When advance() sets phase to final3_comp*_minigame (because a human is
  // participating), start the challenge system so MinigameHost renders.
  const isF3MinigamePhase =
    game.phase === 'final3_comp1_minigame' ||
    game.phase === 'final3_comp2_minigame' ||
    game.phase === 'final3_comp3_minigame'

  useEffect(() => {
    const inF3Minigame =
      game.phase === 'final3_comp1_minigame' ||
      game.phase === 'final3_comp2_minigame' ||
      game.phase === 'final3_comp3_minigame'
    if (inF3Minigame && !pendingChallenge && game.minigameContext) {
      dispatch(startChallenge(game.minigameContext.seed, game.minigameContext.participants))
    }
  }, [game.phase, pendingChallenge, game.minigameContext, dispatch])

  // ── Final 3 Part 3 Spectator Mode ─────────────────────────────────────────
  // When the human is NOT the Part-1 or Part-2 finalist, they watch the final
  // battle as a spectator. SpectatorView mounts and plays through the cinematic
  // sequence; advance() is dispatched only after onDone fires so the game engine
  // computes the winner (sets game.lohId) after the spectacle completes.
  const [spectatorF3Active, setSpectatorF3Active] = useState(false)
  const [spectatorF3CompetitorIds, setSpectatorF3CompetitorIds] = useState<string[]>([])
  const spectatorF3AdvancedRef = useRef(false)

  const isF3Part3SpectatorPhase =
    game.phase === 'final3_comp3' &&
    !!humanPlayer &&
    humanPlayer.id !== game.f3Part1WinnerId &&
    humanPlayer.id !== game.f3Part2WinnerId

  // Enter spectator mode on phase arrival. The ref is checked FIRST to prevent
  // a race where a rapid re-render could activate the overlay a second time.
  // advance() is NOT dispatched here; SpectatorView.onDone drives it instead.
  useEffect(() => {
    if (isF3Part3SpectatorPhase && !spectatorF3AdvancedRef.current && spectatorReactEnabled && settings.gameUX.spectatorMode) {
      spectatorF3AdvancedRef.current = true
      const finalists = [game.f3Part1WinnerId, game.f3Part2WinnerId].filter(Boolean) as string[]
      setSpectatorF3CompetitorIds(finalists)
      setSpectatorF3Active(true)
      // DO NOT call advance() here; SpectatorView will call onDone which dispatches advance()
    }
  // `spectatorF3AdvancedRef` is a ref (not reactive) used for deduplication.
  // `dispatch` and `advance` are stable. `spectatorReactEnabled` and
  // `settings.gameUX.spectatorMode` are included so that if either flag flips
  // while already at final3_comp3 the effect can re-evaluate and activate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isF3Part3SpectatorPhase, spectatorReactEnabled, settings.gameUX.spectatorMode])

  const handleSpectatorF3Done = useCallback(() => {
    setSpectatorF3Active(false)
    spectatorF3AdvancedRef.current = false
    dispatch(advance())
  }, [dispatch])

  // ── Final 3 Part 2 Spectator Mode ─────────────────────────────────────────
  // When the human WON Part 1 they sit out Part 2 (the two Part-1 losers
  // compete). SpectatorView plays through the cinematic; advance() is deferred
  // to onDone so the engine picks the Part-2 winner after the overlay finishes.
  const [spectatorF3Part2Active, setSpectatorF3Part2Active] = useState(false)
  const [spectatorF3Part2CompetitorIds, setSpectatorF3Part2CompetitorIds] = useState<string[]>([])
  const spectatorF3Part2AdvancedRef = useRef(false)

  const isF3Part2SpectatorPhase =
    game.phase === 'final3_comp2' &&
    !!humanPlayer &&
    humanPlayer.id === game.f3Part1WinnerId

  useEffect(() => {
    if (isF3Part2SpectatorPhase && !spectatorF3Part2AdvancedRef.current && spectatorReactEnabled && settings.gameUX.spectatorMode) {
      spectatorF3Part2AdvancedRef.current = true
      const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      const losers = alive.filter((p) => p.id !== game.f3Part1WinnerId).map((p) => p.id)
      setSpectatorF3Part2CompetitorIds(losers)
      setSpectatorF3Part2Active(true)
    }
  // `spectatorF3Part2AdvancedRef` is a ref used for deduplication — not reactive.
  // `game.players` and `game.f3Part1WinnerId` are guaranteed stable at the moment
  // `isF3Part2SpectatorPhase` becomes true (they're the values that caused it to
  // flip). The dedup ref ensures the body only runs once per phase entry, so
  // there is no staleness risk. `spectatorReactEnabled` and
  // `settings.gameUX.spectatorMode` are included so re-evaluation happens if
  // either flag is toggled while the phase is already active.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isF3Part2SpectatorPhase, spectatorReactEnabled, settings.gameUX.spectatorMode])

  const handleSpectatorF3Part2Done = useCallback(() => {
    setSpectatorF3Part2Active(false)
    spectatorF3Part2AdvancedRef.current = false
    dispatch(advance())
  }, [dispatch])

  // ── Legacy 'spectator:show' event listener ─────────────────────────────────
  // The legacySpectatorAdapter dispatches this event when window.Spectator.show()
  // is called by legacy minigame code. The full event payload (variant, minigameId,
  // winnerId) is stored in state so repeated events update the mounted overlay.
  const [spectatorLegacyPayload, setSpectatorLegacyPayload] = useState<{
    competitorIds: string[]
    variant?: SpectatorVariant
    minigameId?: string
    winnerId?: string
  } | null>(null)
  const spectatorLegacyActive = spectatorLegacyPayload !== null

  // Keep a ref to the current players list so the event handler always validates
  // against up-to-date player IDs without needing to re-register on every change.
  const playersRef = useRef(game.players)
  useEffect(() => {
    playersRef.current = game.players
  }, [game.players])

  // Keep a ref to spectatorMode so the event handler reads the current value
  // without needing to re-register on every settings change.
  const spectatorModeRef = useRef(settings.gameUX.spectatorMode)
  useEffect(() => {
    spectatorModeRef.current = settings.gameUX.spectatorMode
  }, [settings.gameUX.spectatorMode])

  useEffect(() => {
    if (!spectatorReactEnabled) return
    function handleSpectatorShow(e: Event) {
      if (!spectatorModeRef.current) return
      const detail = (e as CustomEvent<{
        competitorIds?: string[]
        variant?: string
        minigameId?: string
        winnerId?: string
      }>).detail
      const rawIds = detail?.competitorIds ?? []
      // Validate IDs against the current players list (via ref to avoid stale closure).
      const validIds = rawIds.filter((id) => playersRef.current.some((p) => p.id === id))
      if (!validIds.length) return
      const variant = (['holdwall', 'trivia', 'maze'] as SpectatorVariant[]).includes(
        detail?.variant as SpectatorVariant,
      )
        ? (detail.variant as SpectatorVariant)
        : undefined
      setSpectatorLegacyPayload({
        competitorIds: validIds,
        variant,
        minigameId: detail?.minigameId ?? undefined,
        winnerId: detail?.winnerId ?? undefined,
      })
    }
    window.addEventListener('spectator:show', handleSpectatorShow)
    return () => window.removeEventListener('spectator:show', handleSpectatorShow)
  }, [spectatorReactEnabled]) // re-registers if the feature flag is toggled; players accessed via ref above

  const handleSpectatorLegacyDone = useCallback(() => {
    setSpectatorLegacyPayload(null)
  }, [])

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
    const statuses = parts.length > 0 ? parts.join('+') : (suppressFallbackStatus ? 'active' : (p.status ?? 'active'))
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
      showPermanentBadge: !isAnimatingNominee,
      nominationCeremonyState,
      layoutId: `avatar-tile-${p.id}`,
      isEvicting: (showEvictionSplash && pendingEvictionPlayer?.id === p.id) || game.evictionOverlayPlayerId === p.id || isReturning,
      onClick: () => handleAvatarSelect(p),
      onHoldPreviewStart: () => setPreviewPlayer(p),
      onHoldPreviewEnd: () => setPreviewPlayer((current) => (current?.id === p.id ? null : current)),
    }
  }

  // ── Human LOH replacement picker ─────────────────────────────────────────
  // Shown when a nominee auto-saved themselves and the human LOH must pick a
  // replacement. The Continue button is hidden while this modal is open.
  // (showReplacementModal is defined below after pendingReplacementCeremony.)
  const replacementNeeded = game.replacementNeeded === true
  const humanIsHoH = humanPlayer && game.lohId === humanPlayer.id

  const replacementBaseOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.lohId &&
      p.id !== game.posWinnerId &&
      !game.nomineeIds.includes(p.id)
  )
  const replacementOptions = (() => {
    const protectedIds = new Set(game.povProtectedIds ?? [])
    const nonProtected = replacementBaseOptions.filter((player) => !protectedIds.has(player.id))
    return nonProtected.length > 0 ? nonProtected : replacementBaseOptions
  })()

  // ── Nomination animation state ────────────────────────────────────────────
  // pendingNominees holds the player IDs while the animation plays.
  //
  // This state is driven by TWO sources:
  //   1. Human LOH: handleCommitNominees() is called from TvMultiSelectModal's
  //      onConfirm after the stinger finishes.  commitNominees is dispatched in
  //      handleNomAnimDone — AFTER the animation completes.
  //   2. AI LOH: a useEffect detects when nomination_results commits nominees to
  //      the store without awaitingNominations (AI flow) and triggers the same
  //      animation.  commitNominees is a no-op in this path (already committed).
  //
  // A ref mirrors the state so handleNomAnimDone always reads the current IDs
  // regardless of stale closures after several seconds of animation.
  //
  // Two animation sources are unified here:
  //   • Human LOH  — pendingNominees is set by handleCommitNominees; store
  //     mutation is deferred to handleNomAnimDone.
  //   • AI LOH     — nominees are already in game.nomineeIds; the animation
  //     is gated by showAiNomAnim (computed, no setState-in-effect).
  //     handleAiNomAnimDone just marks the key as consumed (no store dispatch).
  //
  // aiNomAnimConsumedKey tracks which "week-nominee-key" was most recently
  // consumed by the AI animation path so it doesn't replay.  It is also
  // pre-set by handleCommitNominees to prevent double-animation when the
  // human LOH's commitNominees call lands and nomineeIds becomes non-empty.

  // ── Double Eviction activation on nominations phase entry ────────────────
  // Fire tryActivateDoubleEviction when the game enters nominations, and also
  // when a queued debug shock changes while already on that phase. The thunk
  // checks eligibility and probability, then dispatches activateDoubleEviction()
  // which pushes the TV overlay event.
  const doubleEvictionActivationKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (game.phase !== 'nominations') return
    const activationKey = `${game.week}:${game.pendingForcedShock?.type ?? 'none'}:${game.pendingForcedShock?.earliestWeek ?? 'none'}`
    if (doubleEvictionActivationKeyRef.current === activationKey) return
    doubleEvictionActivationKeyRef.current = activationKey
    if (dispatch(tryActivatePendingForcedDoubleEviction())) return
    dispatch(tryActivateDoubleEviction())
  }, [game.phase, game.week, game.pendingForcedShock?.type, game.pendingForcedShock?.earliestWeek, dispatch])

  // ── Special Veto activation on POS-results entry ─────────────────────────
  // Fire tryActivateSpecialVeto when the game enters pos_results, and also when
  // a queued debug shock changes while already on that phase. The thunk checks
  // eligibility and probability, then dispatches activateSpecialVeto() which
  // pushes the TV overlay event.
  const specialVetoActivationKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (game.phase !== 'pos_results') return
    const activationKey = `${game.week}:${game.pendingForcedShock?.type ?? 'none'}:${game.pendingForcedShock?.earliestWeek ?? 'none'}`
    if (specialVetoActivationKeyRef.current === activationKey) return
    specialVetoActivationKeyRef.current = activationKey
    if (dispatch(tryActivatePendingForcedSpecialVeto())) return
    dispatch(tryActivateSpecialVeto())
  }, [game.phase, game.week, game.pendingForcedShock?.type, game.pendingForcedShock?.earliestWeek, dispatch])

  // ── Secret Mission activation on week-start entry ───────────────────────
  // Fire tryActivateSecretMission once per day when the game enters week_start.
  // The thunk centralizes the daily chance table, testing override, and
  // one-per-season guard.
  const weekStartActivationWeekRef = useRef<number | null>(null)
  const weekStartActivationResolvedRef = useRef(false)
  useEffect(() => {
    if (game.phase !== 'week_start') return
    if (game.pendingEviction || game.dayStartShock) return
    if (weekStartActivationWeekRef.current !== game.week) {
      weekStartActivationWeekRef.current = game.week
      weekStartActivationResolvedRef.current = false
    }
    if (weekStartActivationResolvedRef.current) return

    if (dispatch(tryActivatePendingForcedDayStartShock())) {
      weekStartActivationResolvedRef.current = true
      return
    }
    if (dispatch(tryActivateDayStartShock())) {
      weekStartActivationResolvedRef.current = true
      return
    }
    if (dispatch(tryActivateSecretMission())) {
      weekStartActivationResolvedRef.current = true
    }
  }, [
    game.dayStartShock,
    game.pendingEviction,
    game.pendingForcedShock?.earliestWeek,
    game.pendingForcedShock?.type,
    game.phase,
    game.week,
    dispatch,
  ])

  // ── Democracia activation on loh_comp_announcement entry ─────────────────
  // Fire tryActivatePendingForcedDemocracia (debug) or tryActivateDemocracia
  // (auto-rule) when the game enters loh_comp_announcement. The thunk checks
  // day/alive-count eligibility, preventing double-activation within a day.
  const democraciaActivationKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (game.phase !== 'loh_comp_announcement') return
    const activationKey = `${game.week}:${game.pendingForcedShock?.type ?? 'none'}:${game.pendingForcedShock?.earliestWeek ?? 'none'}`
    if (democraciaActivationKeyRef.current === activationKey) return
    democraciaActivationKeyRef.current = activationKey
    if (dispatch(tryActivatePendingForcedDemocracia())) return
    dispatch(tryActivateDemocracia())
  }, [game.phase, game.week, game.pendingForcedShock?.type, game.pendingForcedShock?.earliestWeek, dispatch])

  // ── Democracia public-breaker resolution ─────────────────────────────────
  // When a final ballotage tie occurs in public mode, awaitingPublicBreaker is
  // set. Reuse the shared public-pick resolver so approval ties are broken
  // deterministically the same way as other public-opinion flows.
  useEffect(() => {
    if (!game.democracia?.awaitingPublicBreaker) return
    const candidateIds = game.democracia.candidateIds
    if (candidateIds.length === 0) return
    const { savedId: winnerId } = resolvePublicSaveNominee({
      nomineeIds: candidateIds,
      profiles: publicOpinionProfiles,
    })
    if (!winnerId) {
      if (import.meta.env.DEV) {
        console.warn('[democracia] public tie-break resolver returned no winner', {
          candidateIds,
        })
      }
      return
    }
    dispatch(resolveDemocraciaPublicBreaker({ winnerId }))
  }, [game.democracia?.awaitingPublicBreaker, game.democracia?.candidateIds, publicOpinionProfiles, dispatch])

  const democraciaAwaitingVoteRef = useRef(Boolean(game.democracia?.awaitingHumanVote))
  useEffect(() => {
    const wasAwaitingVote = democraciaAwaitingVoteRef.current
    const isAwaitingVote = Boolean(game.democracia?.awaitingHumanVote)
    democraciaAwaitingVoteRef.current = isAwaitingVote
    if (game.phase !== 'democracia_vote') return
    if (!wasAwaitingVote || isAwaitingVote) return
    dispatch(advance())
  }, [dispatch, game.democracia?.awaitingHumanVote, game.phase])

  // ── Secret Mission Final 4 expiry (PR 2) ──────────────────────────────────
  // When the game reaches final4_eviction, expire any stored eligible reward
  // because powers can only be used BEFORE Final 4 week.
  // Track the season seed so the ref resets correctly if a new game starts
  // without unmounting GameScreen.
  const final4ExpiryFiredRef = useRef<number | null>(null)
  useEffect(() => {
    if (game.phase !== 'final4_eviction') return
    if (final4ExpiryFiredRef.current === game.seed) return
    final4ExpiryFiredRef.current = game.seed
    dispatch(expireMissionReward())
  }, [game.phase, game.seed, dispatch])

  const [pendingNominees, setPendingNominees] = useState<string[]>([])
  const pendingNomineesRef = useRef<string[]>([])
  const aiNomAnimPersistenceScope =
    'gameId' in game && game.gameId != null
      ? String(game.gameId)
      : 'season' in game && game.season != null
        ? String(game.season)
        : String(game.seed)
  const [aiNomAnimConsumedKey, setAiNomAnimConsumedKey] = usePersistedGameScreenKey(
    'ai-nomination-ceremony',
    aiNomAnimPersistenceScope,
  )
  useEffect(() => {
    pendingNomineesRef.current = pendingNominees
  }, [pendingNominees])

  // AI LOH animation: computed directly from game state — no setState-in-effect.
  const aiNomKey =
    game.phase === 'nomination_results' &&
    game.nomineeIds.length > 0 &&
    !game.awaitingNominations
      ? `w${game.week}-${[...game.nomineeIds].sort().join(',')}`
      : ''

  const showHumanNomAnim = pendingNominees.length > 0
  const showAiNomAnim = aiNomKey !== '' && aiNomKey !== aiNomAnimConsumedKey && !showHumanNomAnim
  const showNomAnim = showHumanNomAnim || showAiNomAnim
  const showNominationDangerSignals =
    game.phase === 'nomination_results' &&
    Boolean(game.awaitingNominations) &&
    !showNomAnim
  const canUsePublicNomineeRule =
    game.publicModeEnabled === true &&
    game.doubleEviction?.weekActive !== true
  const nominationDangerLockedId =
    showNominationDangerSignals && canUsePublicNomineeRule
      ? (game.lastHohCompFinisherId ?? null)
      : null

  const nomAnimPlayers = useMemo(() => {
    if (showHumanNomAnim) {
      const base = pendingNominees
        .map((id) => game.players.find((p) => p.id === id))
        .filter(Boolean) as Player[]
      // When Public mode is active and this is not a Double Eviction, include the auto-third nominee.
      const autoId = canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? null) : null
      if (autoId && !pendingNominees.includes(autoId)) {
        const autoPlayer = game.players.find((p) => p.id === autoId)
        if (autoPlayer) return [...base, autoPlayer]
      }
      return base
    }
    return game.nomineeIds
      .map((id) => game.players.find((p) => p.id === id))
      .filter(Boolean) as Player[]
  }, [showHumanNomAnim, pendingNominees, game.players, canUsePublicNomineeRule, game.lastHohCompFinisherId, game.nomineeIds])

  // Build CeremonyOverlay tiles for nominations: ❓ badges fly to nominee tiles.
  // Tile rects are resolved lazily by the CeremonyOverlay via getTileRect
  // so we pass a resolver function rather than pre-computed rects (avoids
  // calling document.querySelector during the render phase before DOM is committed).
  const nomCeremonyTileIds = showNomAnim ? nomAnimPlayers.map((p) => p.id) : []
  const lohCeremonyTileId =
    showNomAnim && game.lohId && game.players.some((p) => p.id === game.lohId)
      ? game.lohId
      : null
  const shouldShowNominationCeremony =
    showNomAnim &&
    nomCeremonyTileIds.length > 0 &&
    lohCeremonyTileId != null

  // ── Human LOH nomination flow (single multi-select modal) ────────────────
  // Shown when the human LOH must pick their two nominees simultaneously.
  // Hidden while the nomination animation is playing to prevent stacking.
  // Also hidden when confessional routing is active (decision is in the DR).
  const showNominationsModal =
    game.phase === 'nomination_results' &&
    Boolean(game.awaitingNominations) &&
    humanIsHoH &&
    !showNomAnim &&
    !activeConfessionalDecision

  const nomineeOptions = alivePlayers.filter((p) => p.id !== game.lohId)

  // Compact label for the forced auto-nominee option in the nomination picker.
  // 'survival' comps show "First out"; scored/unknown comps show "Lowest Score".
  const autoNomineeLabel =
    canUsePublicNomineeRule && game.lastHohCompFinisherType === 'survival'
      ? 'First out'
      : 'Lowest Score'

  // Human LOH confirmed nominees: pre-consume the AI key so the AI animation
  // path does not fire a second animation once commitNominees lands.
  const handleCommitNominees = useCallback(
    (ids: string[]) => {
      const currentUserIsHoh = !!humanIsHoH
      console.log('NOMINATION_TRIGGERED', ids, { currentUserIsHoh, screen: 'GameScreen' })
      // Pre-consume the exact key that commitNominees will produce.
      const autoId = canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? null) : null
      const fullIds = autoId && !ids.includes(autoId) ? [...ids, autoId] : ids
      setAiNomAnimConsumedKey(`w${game.week}-${[...fullIds].sort().join(',')}`)
      setPendingNominees(ids)
    },
    [humanIsHoH, game.week, canUsePublicNomineeRule, game.lastHohCompFinisherId, setAiNomAnimConsumedKey]
  )

  const handleNomAnimDone = useCallback(() => {
    const ids = pendingNomineesRef.current
    setPendingNominees([])
    // commitNominees is a no-op when awaitingNominations is false (AI LOH path).
    dispatch(commitNominees(ids))
  }, [dispatch])

  // AI LOH onDone: mark this key consumed so the animation doesn't replay.
  const handleAiNomAnimDone = useCallback(() => {
    setAiNomAnimConsumedKey(aiNomKey)
  }, [aiNomKey, setAiNomAnimConsumedKey])

  // ── Nomination labels (LOH Nominee / Last in LOH Comp) ───────────────────
  // Used by the nomination ceremony overlay to show role pills on each nominee tile.
  const nominationLabels: Record<string, string> = useMemo(() => {
    const labels: Record<string, string> = {}

    // While the human LOH animation is playing, the reducer hasn't committed
    // nominationContext yet, so derive the pills from the pending picks.
    if (showHumanNomAnim && pendingNominees.length > 0) {
      pendingNominees.forEach((id) => {
        labels[id] = 'LOH Nominee'
      })
      if (
        canUsePublicNomineeRule &&
        game.lastHohCompFinisherId &&
        !pendingNominees.includes(game.lastHohCompFinisherId)
      ) {
        labels[game.lastHohCompFinisherId] = 'Last in LOH Comp'
      }
      return labels
    }

    const ctx = game.nominationContext
    if (!ctx) return labels
    ctx.hohNomineeIds.forEach((id) => { labels[id] = 'LOH Nominee' })
    if (ctx.autoNomineeId && !ctx.hohNomineeIds.includes(ctx.autoNomineeId)) {
      labels[ctx.autoNomineeId] = 'Last in LOH Comp'
    }
    return labels
  }, [
    showHumanNomAnim,
    pendingNominees,
    canUsePublicNomineeRule,
    game.lastHohCompFinisherId,
    game.nominationContext,
  ])

  // ── Pre-veto public save phase ───────────────────────────────────────────
  const showPublicSaveReveal =
    isPublicModeEnabled(game.mode) &&
    game.phase === 'pre_veto_public_save' &&
    Boolean(game.awaitingPublicSave) &&
    game.nomineeIds.length === 3 &&
    !pendingPublicSaveResult

  // Approval values for display in PublicSaveReveal
  const publicSaveApprovals = useMemo(() => {
    const out: Record<string, number> = {}
    game.nomineeIds.forEach((id) => {
      out[id] = publicOpinionProfiles[id]?.approval ?? 50
    })
    return out
  }, [game.nomineeIds, publicOpinionProfiles])

  // Compute who would be saved; memoised to avoid recalculating on every render.
  const publicSaveWinnerId = useMemo(() => {
    if (!showPublicSaveReveal) return null
    const result = resolvePublicSaveNominee({
      nomineeIds: game.nomineeIds,
      profiles: publicOpinionProfiles,
    })
    return result.savedId || null
  }, [showPublicSaveReveal, game.nomineeIds, publicOpinionProfiles])

  const publicSaveResultAnnouncement = useMemo<Announcement | null>(() => {
    if (!pendingPublicSaveResult) return null
    const savedPlayer = game.players.find((player) => player.id === pendingPublicSaveResult.savedId)
    if (!savedPlayer) return null
    const remainingNomineeNames = game.nomineeIds
      .filter((id) => id !== pendingPublicSaveResult.savedId)
      .map((id) => game.players.find((player) => player.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    const subtitle =
      pendingPublicSaveResult.supportPercent != null && remainingNomineeNames.length === 2
        ? `${savedPlayer.name} was saved with ${Math.round(pendingPublicSaveResult.supportPercent)}% of the public support. ${remainingNomineeNames.join(' and ')} are still in danger.`
        : remainingNomineeNames.length === 2
          ? `${savedPlayer.name} was saved by the public. ${remainingNomineeNames.join(' and ')} are still in danger.`
          : `${savedPlayer.name} was saved by the public.`
    return {
      key: 'public_save_result',
      title: 'Public Save Result',
      subtitle,
      isLive: true,
      autoDismissMs: PUBLIC_SAVE_RESULT_DELAY_MS,
    }
  }, [game.nomineeIds, game.players, pendingPublicSaveResult])
  const publicSaveCeremonyKey = pendingPublicSaveResult
    ? `w${game.week}-public-save-${pendingPublicSaveResult.savedId}`
    : ''
  const showPublicSaveCeremony =
    isPublicModeEnabled(game.mode) &&
    publicSaveCeremonyKey !== '' &&
    publicSaveCeremonyKey !== publicSaveCeremonyConsumedKey

  const handlePublicSaveDone = useCallback(() => {
    if (!publicSaveWinnerId) return
    setPendingPublicSaveResult({
      savedId: publicSaveWinnerId,
      supportPercent: publicSaveApprovals[publicSaveWinnerId],
    })
  }, [publicSaveApprovals, publicSaveWinnerId])

  const handlePublicSaveResultDismiss = useCallback(() => {
    if (!pendingPublicSaveResult) return
    dispatch(commitPublicSave(pendingPublicSaveResult))
    setPendingPublicSaveResult(null)
  }, [dispatch, pendingPublicSaveResult])
  const handlePublicSaveCeremonyDone = useCallback(() => {
    if (!publicSaveCeremonyKey) return
    setPublicSaveCeremonyConsumedKey(publicSaveCeremonyKey)
  }, [publicSaveCeremonyKey, setPublicSaveCeremonyConsumedKey])

  const publicSaveNominees = useMemo(
    () =>
      game.nomineeIds
        .map((id) => game.players.find((p) => p.id === id))
        .filter((p): p is Player => p != null),
    [game.nomineeIds, game.players],
  )

  // ── Dev: manually trigger nomination animation ────────────────────────────
  // Kept visible in-game for QA/mobile testing.
  const isDebugMode = detectDebugMode()
  const handleDevPlayNomAnim = useCallback(() => {
    const eligible = alivePlayers.filter((p) => !p.isUser)
    const devNominees = eligible.slice(0, 2).map((p) => p.id)
    if (devNominees.length === 2) {
      console.log('DEV: Play Nomination Animation', devNominees)
      const autoId = canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? null) : null
      const fullIds = autoId && !devNominees.includes(autoId) ? [...devNominees, autoId] : devNominees
      setAiNomAnimConsumedKey(`w${game.week}-${[...fullIds].sort().join(',')}`)
      setPendingNominees(devNominees)
    }
  }, [alivePlayers, canUsePublicNomineeRule, game.lastHohCompFinisherId, game.week, setAiNomAnimConsumedKey, setPendingNominees])

  // ── Human POS holder decision (use veto or not) ──────────────────────────
  const humanIsPosHolder = humanPlayer && game.posWinnerId === humanPlayer.id
  const activeSpecialVeto = game.specialVeto?.activeType ?? null
  const specialVetoName =
    activeSpecialVeto === 'vip'
      ? 'Double Trouble'
      : activeSpecialVeto === 'diamond'
        ? 'Halo Exchange'
        : activeSpecialVeto === 'coup'
          ? 'Detox'
          : activeSpecialVeto === 'spotlight'
            ? 'Force Majeure'
            : null
  const showPovDecisionModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(game.awaitingPovDecision) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  // ── Human POS holder picks who to save ───────────────────────────────────
  // Defers submitPovSaveTarget dispatch until the save ceremony animation
  // plays, showing the 🛡️ badge landing on the saved nominee's tile.
  const [pendingSaveCeremony, setPendingSaveCeremony] = useState<{
    tiles: CeremonyTile[]
    resolveTiles: () => CeremonyTile[]
    caption: string
    subtitle?: string
    savedId: string
  } | null>(null)
  const pendingSaveDispatchRef = useRef<(() => void) | null>(null)

  const handleSaveCeremonyDone = useCallback(() => {
    pendingSaveDispatchRef.current?.()
    pendingSaveDispatchRef.current = null
    setPendingSaveCeremony(null)
  }, [])

  const handlePovSaveTarget = useCallback((id: string) => {
    const savedPlayer = game.players.find((p) => p.id === id)
    const savedRect = getTileRect(id)
    const holderRect = game.posWinnerId ? getTileRect(game.posWinnerId) : null
    const isVipSecondSave = Boolean(game.specialVeto?.awaitingVipSecondSaveTarget)
    const submitSaveAction = isVipSecondSave ? submitVipSecondSaveTarget(id) : submitPovSaveTarget(id)
    const saveSubtitle = isVipSecondSave
      ? '👑 Double Trouble used again'
      : activeSpecialVeto === 'diamond'
        ? '😇 Halo Exchange used'
        : activeSpecialVeto === 'spotlight'
          ? '✨ Force Majeure used'
          : activeSpecialVeto === 'vip'
            ? '👑 Double Trouble used'
            : '🛡️ Power used'

    if (!savedPlayer || !savedRect) {
      // Headless fallback: commit immediately.
      dispatch(submitSaveAction)
      return
    }

    console.log('POV_SAVE_ANIM_STARTED', { savedId: id, screen: 'GameScreen' })
    const sourceIsDistinctHolder = holderRect != null && game.posWinnerId != null && game.posWinnerId !== id
    const tiles: CeremonyTile[] = [
      ...(sourceIsDistinctHolder
        ? [{
            rect: holderRect,
            glowTone: 'gold' as const,
          }]
        : []),
      {
        rect: savedRect,
        badge: '🛡️',
        badgeStart: sourceIsDistinctHolder ? holderRect : 'center',
        badgeLabel: `${savedPlayer.name} saved by veto`,
        glowTone: 'success' as const,
      },
    ]
    const resolveTiles = (): CeremonyTile[] => {
      const currentSavedRect = getTileRect(id)
      const currentHolderRect = game.posWinnerId ? getTileRect(game.posWinnerId) : null
      const currentSourceIsDistinctHolder =
        currentHolderRect != null && game.posWinnerId != null && game.posWinnerId !== id

      return [
        ...(currentSourceIsDistinctHolder
          ? [{
              rect: currentHolderRect,
              glowTone: 'gold' as const,
            }]
          : []),
        {
          rect: currentSavedRect,
          badge: 'ðŸ›¡ï¸',
          badgeStart: currentSourceIsDistinctHolder && currentHolderRect ? currentHolderRect : 'center',
          badgeLabel: `${savedPlayer.name} saved by veto`,
          glowTone: 'success' as const,
        },
      ]
    }

    pendingSaveDispatchRef.current = () => dispatch(submitSaveAction)
    setPendingSaveCeremony({
      tiles,
      resolveTiles,
      caption: `${savedPlayer.name} has been saved!`,
      subtitle: saveSubtitle,
      savedId: id,
    })
  }, [dispatch, game.players, game.specialVeto?.awaitingVipSecondSaveTarget, activeSpecialVeto, getTileRect, game.posWinnerId])

  // Hide the save modal while the save ceremony is playing.
  const isAwaitingAnySave =
    Boolean(game.awaitingPovSaveTarget) ||
    Boolean(game.specialVeto?.awaitingVipSecondSaveTarget)
  const showPovSaveModal =
    game.phase === 'pos_ceremony_results' &&
    isAwaitingAnySave &&
    humanIsPosHolder &&
    !pendingSaveCeremony &&
    !activeConfessionalDecision
  const povSaveOptions = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  const showVipSecondUseModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(game.specialVeto?.awaitingVipSecondUseDecision) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  const showDiamondReplacementModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(game.specialVeto?.awaitingHolderReplacement) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  const showCoupReplacementModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(game.specialVeto?.awaitingCoupReplacement1 || game.specialVeto?.awaitingCoupReplacement2) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  // ── Replacement nominee ceremony animation ─────────────────────────────
  // When the human LOH picks a replacement nominee via TvDecisionModal,
  // we defer the setReplacementNominee dispatch until the CeremonyOverlay
  // animation completes.  The badge (❓) flies from the saved nominee's
  // tile to the replacement nominee's tile.
  const [pendingReplacementCeremony, setPendingReplacementCeremony] = useState<{
    tiles: CeremonyTile[]
    resolveTiles: () => CeremonyTile[]
    caption: string
    subtitle?: string
    replacementId: string
  } | null>(null)
  const pendingReplacementDispatchRef = useRef<(() => void) | null>(null)

  const handleReplacementCeremonyDone = useCallback(() => {
    pendingReplacementDispatchRef.current?.()
    pendingReplacementDispatchRef.current = null
    setPendingReplacementCeremony(null)
  }, [])

  const startReplacementCeremony = useCallback((
    id: string,
    onCommit: () => void,
  ) => {
    const replacementPlayer = game.players.find((p) => p.id === id)
    const replacementRect = getTileRect(id)
    const sourceId = game.specialVeto?.activeType === 'diamond' ? game.posWinnerId : game.lohId
    const sourceRect = sourceId ? getTileRect(sourceId) : null
    const sourceIsDistinct = sourceRect != null && sourceId != null && sourceId !== id
    const replacementSubtitle =
      game.specialVeto?.activeType === 'diamond'
        ? '😇 Halo Exchange names the backup nominee'
        : activeSpecialVeto === 'spotlight'
          ? '✨ Force Majeure names the backup nominee'
          : activeSpecialVeto === 'vip'
            ? '👑 Double Trouble changes the block'
            : '🎯 Nominations are set'

    if (!replacementPlayer || !replacementRect) {
      onCommit()
      return
    }

    console.log('REPLACEMENT_NOM_ANIM_STARTED', { replacementId: id, sourceId, screen: 'GameScreen' })

    const tiles: CeremonyTile[] = [
      ...(sourceIsDistinct
        ? [{
            rect: sourceRect,
            glowTone: 'gold' as const,
          }]
        : []),
      {
        rect: replacementRect,
        badge: '❓',
        badgeImageSrc: NOMINATION_BADGE_SRC,
        badgeStart: sourceIsDistinct ? sourceRect : 'center',
        badgeLabel: `${replacementPlayer.name} named backup nominee`,
        glowTone: 'danger' as const,
      },
    ]
    const resolveTiles = (): CeremonyTile[] => {
      const currentReplacementRect = getTileRect(id)
      const currentSourceRect = sourceId ? getTileRect(sourceId) : null
      const currentSourceIsDistinct = currentSourceRect != null && sourceId != null && sourceId !== id

      return [
        ...(currentSourceIsDistinct
          ? [{
              rect: currentSourceRect,
              glowTone: 'gold' as const,
            }]
          : []),
        {
          rect: currentReplacementRect,
          badge: 'â“',
          badgeImageSrc: NOMINATION_BADGE_SRC,
          badgeStart: currentSourceIsDistinct && currentSourceRect ? currentSourceRect : 'center',
          badgeLabel: `${replacementPlayer.name} named backup nominee`,
          glowTone: 'danger' as const,
        },
      ]
    }

    pendingReplacementDispatchRef.current = onCommit
    setPendingReplacementCeremony({
      tiles,
      resolveTiles,
      caption: `${replacementPlayer.name} is the backup nominee!`,
      subtitle: replacementSubtitle,
      replacementId: id,
    })
  }, [game.players, getTileRect, game.specialVeto?.activeType, game.posWinnerId, game.lohId, activeSpecialVeto])

  const handleReplacementNominee = useCallback((id: string) => {
    // Only animate when the veto was actually used (povSavedId is set).
    // If not, commit immediately without animation.
    if (!game.povSavedId) {
      // Headless/no-veto fallback: commit immediately.
      dispatch(setReplacementNominee(id))
      return
    }
    startReplacementCeremony(id, () => dispatch(setReplacementNominee(id)))
  }, [dispatch, game.povSavedId, startReplacementCeremony])
  const handleDiamondReplacementNominee = useCallback((id: string) => {
    startReplacementCeremony(id, () => dispatch(submitDiamondReplacement(id)))
  }, [dispatch, startReplacementCeremony])

  // Hide the replacement modal while the replacement animation is playing.
  // Also hidden when confessional routing is active.
  const showReplacementModal = replacementNeeded && humanIsHoH && !pendingReplacementCeremony && !activeConfessionalDecision
  const holderReplacementOptions = replacementOptions
  const coupBaseOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.lohId &&
      p.id !== game.posWinnerId &&
      !game.nomineeIds.includes(p.id) &&
      p.id !== game.specialVeto?.coupReplacement1Id
  )
  const coupReplacementOptions = (() => {
    const protectedIds = new Set(game.povProtectedIds ?? [])
    const nonProtected = coupBaseOptions.filter((player) => !protectedIds.has(player.id))
    const neededCount = game.specialVeto?.awaitingCoupReplacement1 ? 2 : 1
    return nonProtected.length >= neededCount ? nonProtected : coupBaseOptions
  })()

  // ── AI replacement nominee animation ───────────────────────────────────
  // When an AI LOH picks a replacement nominee, the store already has the
  // replacement committed. We detect this and show an animation.
  const [aiReplacementConsumedKey, setAiReplacementConsumedKey] = usePersistedGameScreenKey(
    'ai-replacement-ceremony',
    game.gameId ?? `season-${game.season}`,
  )

  const aiReplacementKey = useMemo(() => {
    // Only trigger on pos_ceremony_results phase when nominees just changed (replacement happened)
    // and no human decision is pending.
    if (game.phase !== 'pos_ceremony_results') return ''
    if (game.replacementNeeded) return '' // human LOH hasn't picked yet
    if (game.awaitingPovDecision || game.awaitingPovSaveTarget) return ''
    // Gate on the veto actually being used: if no player was saved, skip animation.
    if (!game.povSavedId) return ''
    // Wait until the staged replacement flow is complete (step 0 = replacement committed).
    if (game.aiReplacementStep) return ''
    // If the AI LOH handled it, nomineeIds was updated in the same advance() call
    // and no awaiting flags are set. Use a key based on week + nomineeIds.
    const lohPlayer = game.players.find((p) => p.id === game.lohId)
    if (lohPlayer?.isUser) return '' // human LOH handles this differently
    return `w${game.week}-repl-${[...game.nomineeIds].sort().join(',')}`
  }, [game.phase, game.week, game.nomineeIds, game.replacementNeeded, game.awaitingPovDecision, game.awaitingPovSaveTarget, game.lohId, game.players, game.povSavedId, game.aiReplacementStep])

  const showAiReplacementAnim = aiReplacementKey !== '' && aiReplacementKey !== aiReplacementConsumedKey
  const activeReplacementAnimationTargetId =
    showAiReplacementAnim && game.nomineeIds.length > 0
      ? game.nomineeIds[game.nomineeIds.length - 1]
      : null

  // Acknowledge the step-1 "LOH must name a replacement" announcement so advance() can
  // proceed to step 2. Fires when the step-1 handler has run (aiReplacementStep reaches 2).
  useEffect(() => {
    if (game.aiReplacementStep === 2) {
      dispatch(aiReplacementRendered())
    }
  }, [game.aiReplacementStep, dispatch])

  const handleAiReplacementDone = useCallback(() => {
    setAiReplacementConsumedKey(aiReplacementKey)
  }, [aiReplacementKey, setAiReplacementConsumedKey])

  // ── Final 4 cinematic flow ───────────────────────────────────────────────────
  // Stage machine drives the full Final 4 eviction sequence:
  //   idle         → not yet started (or reset after leaving final4/final3)
  //   pleas        → plea ChatOverlay (all players; blocks FAB)
  //   decision     → TvDecisionModal (human POS only; blocks FAB)
  //   announcement → eviction announcement ChatOverlay (blocks FAB)
  //   splash       → EvictionSplash animation (blocks FAB)
  //   done         → complete; FAB visible so user can advance to final3 comps
  type Final4Stage = 'idle' | 'pleas' | 'decision' | 'announcement' | 'splash' | 'done'
  const [final4Stage, setFinal4Stage] = useState<Final4Stage>('idle')
  const [final4PleaLines, setFinal4PleaLines] = useState<ChatLine[]>([])
  const [final4AnnounceLines, setFinal4AnnounceLines] = useState<ChatLine[]>([])
  const [final4DecisionReady, setFinal4DecisionReady] = useState(false)
  const final4DecisionTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  // Reset all Final 4 state when the game leaves the final4/final3 region
  // (e.g. game reset, debug jump to a different phase).
  useEffect(() => {
    if (game.phase === 'final4_eviction' || game.phase === 'final3') return
    if (final4Stage === 'idle') return
    const id = window.setTimeout(() => {
      setFinal4Stage('idle')
      setFinal4PleaLines([])
      setFinal4AnnounceLines([])
    }, 0)
    return () => window.clearTimeout(id)
  }, [game.phase, final4Stage])

  // Enter final4_eviction → build enriched plea lines and start the overlay.
  // For human POS: also dispatch advance() now so plea events are emitted to
  // tvFeed and awaitingPovDecision is set before the decision modal appears.
  // In debug mode the plea cinematic is skipped; advance() is called by the FAB.
  useEffect(() => {
    if (isDebugMode) return
    if (game.phase !== 'final4_eviction' || final4Stage !== 'idle') return
    const povHolder = alivePlayers.find((p) => p.id === game.posWinnerId)
    const nominees = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))
    if (!povHolder || nominees.length === 0) return
    const lines: ChatLine[] = [
      {
        id: 'f4-intro',
        role: 'host',
        text: `${povHolder.name} holds the sole vote to eliminate. Nominees, it's time to make your pleas. 🎤`,
      },
      ...nominees.flatMap((nominee, idx): ChatLine[] => [
        {
          id: `f4-prompt-${nominee.id}`,
          role: 'pos',
          player: povHolder,
          text: `${nominee.name}, the floor is yours. Make your case.`,
        },
        {
          id: `f4-plea-${nominee.id}`,
          role: 'nominee',
          player: nominee,
          text: pickPhrase(NOMINEE_PLEA_TEMPLATES, game.seed, idx),
        },
        {
          id: `f4-thanks-${nominee.id}`,
          role: 'pos',
          player: povHolder,
          text:
            idx < nominees.length - 1
              ? `Thank you, ${nominee.name}.`
              : `Thank you both. I'll take a moment to think. 🤔`,
        },
      ]),
      {
        id: 'f4-thinking',
        role: 'pov-thinking',
        player: povHolder,
        text: '• • •',
      },
    ]
    setFinal4PleaLines(lines)
    setFinal4Stage('pleas')
    if (humanIsPosHolder) {
      dispatch(advance())
    }
  }, [isDebugMode, game.phase, final4Stage, alivePlayers, game.posWinnerId, game.nomineeIds, game.seed, humanIsPosHolder, dispatch])

  // Plea overlay complete:
  //   human POS → show decision modal
  //   AI POS    → dispatch advance() (AI evicts; phase transitions to final3)
  const handleFinal4PleaComplete = useCallback(() => {
    if (humanIsPosHolder) {
      setFinal4Stage('decision')
    } else {
      dispatch(advance())
      // Stage transitions to 'announcement' via effect below once phase === 'final3'
    }
  }, [humanIsPosHolder, dispatch])

  // Debug mode: auto-commit pendingEviction when in final4_eviction phase and
  // final4Stage is still 'idle' (plea cinematic was skipped). This replaces the
  // eviction-splash flow and transitions the game directly to final3.
  useEffect(() => {
    if (!isDebugMode) return
    if (game.phase !== 'final4_eviction') return
    if (final4Stage !== 'idle') return
    if (!game.pendingEviction?.evicteeId) return
    dispatch(finalizePendingEviction(game.pendingEviction.evicteeId))
  }, [isDebugMode, game.phase, game.pendingEviction?.evicteeId, final4Stage, dispatch])

  // Detect eviction: pendingEviction was set while in pleas/decision stage.
  // With the deferred-commit approach, the phase stays at final4_eviction until
  // finalizePendingEviction runs (after the overlay). Build eviction announcement
  // lines from pendingEviction and move to the announcement stage.
  useEffect(() => {
    if (!game.pendingEviction) return
    if (game.phase !== 'final4_eviction') return
    if (final4Stage !== 'pleas' && final4Stage !== 'decision') return
    const evicted = game.players.find((p) => p.id === game.pendingEviction?.evicteeId)
    if (!evicted) {
      setFinal4Stage('done')
      return
    }
    const povHolder = game.players.find((p) => p.id === game.posWinnerId)
    setFinal4AnnounceLines([
      {
        id: 'f4-evict-decision',
        role: 'pos',
        player: povHolder,
        text: `I vote to evict… ${evicted.name}. 🗳️`,
      },
      {
        id: 'f4-evict-bb',
        role: 'host',
        text: `${evicted.name}, by a vote of 1 to 0, you have been eliminated from The Big Eye house. Please take a moment to say your goodbyes. 👋`,
      },
    ])
    setFinal4Stage('announcement')
  }, [game.pendingEviction, game.phase, final4Stage, game.players, game.posWinnerId])

  const handleFinal4AnnounceComplete = useCallback(() => {
    setFinal4Stage('splash')
  }, [])

  // Orchestrate 3-second delay before the Final-4 decision modal appears for
  // the human POS holder after the plea ChatOverlay completes. Clears and resets
  // when the phase or stage conditions are no longer met.
  useEffect(() => {
    const conditionsMet =
      game.phase === 'final4_eviction' &&
      Boolean(humanIsPosHolder) &&
      Boolean(game.awaitingPovDecision) &&
      final4Stage === 'decision'

    if (!conditionsMet) {
      if (final4DecisionTimerRef.current !== null) {
        window.clearTimeout(final4DecisionTimerRef.current)
        final4DecisionTimerRef.current = null
      }
      setFinal4DecisionReady(false)
      return
    }

    if (final4DecisionTimerRef.current !== null) return

    final4DecisionTimerRef.current = window.setTimeout(() => {
      setFinal4DecisionReady(true)
    }, 3000)
  }, [game.phase, humanIsPosHolder, game.awaitingPovDecision, final4Stage])

  // If the FAB center button is pressed while the 3-second delay is running,
  // cancel the timer and open the decision modal immediately.
  useEffect(() => {
    const handlePlayPressed = () => {
      if (final4DecisionTimerRef.current !== null) {
        window.clearTimeout(final4DecisionTimerRef.current)
        final4DecisionTimerRef.current = null
        setFinal4DecisionReady(true)
      }
    }
    window.addEventListener('ui:playPressed', handlePlayPressed)
    return () => window.removeEventListener('ui:playPressed', handlePlayPressed)
  }, [])

  const showFinal4Chat = game.phase === 'final4_eviction' && final4Stage === 'pleas'
  const showFinal4Modal =
    game.phase === 'final4_eviction' &&
    Boolean(game.awaitingPovDecision) &&
    Boolean(humanIsPosHolder) &&
    ((final4Stage === 'decision' && final4DecisionReady) || (isDebugMode && final4Stage === 'idle'))
  // Announcement: show during final4_eviction (pending commit) OR after final3 transition.
  const showFinal4AnnounceChat =
    (game.phase === 'final4_eviction' || game.phase === 'final3') && final4Stage === 'announcement'
  // Splash is driven by showEvictionSplash (pendingEviction + final4Stage === 'splash')
  // defined in the Eviction Splash section below.

  const final4Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))


  // ── Human live eviction vote ──────────────────────────────────────────────
  // Shown when the human player is an eligible voter during live_vote.
  // Hidden when confessional routing is active (decision is in the DR).
  const showLiveVoteModal =
    game.phase === 'live_vote' &&
    Boolean(game.awaitingHumanVote) &&
    !game.humanDoubleVoteActive &&
    !game.awaitingDoubleVoteOffer &&
    humanPlayer !== undefined &&
    !activeConfessionalDecision
  const liveVoteOptions = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── PR 3: doubleVote Big Eye offer ────────────────────────────────────────
  // Shown BEFORE the vote modal when the player has an eligible doubleVote
  // reward. The player accepts (gets 2 vote slots) or declines (normal vote).
  const showDoubleVoteOffer =
    game.phase === 'live_vote' &&
    Boolean(game.awaitingDoubleVoteOffer) &&
    humanPlayer !== undefined &&
    !activeConfessionalDecision

  // ── PR 3: double vote 2-slot selection ───────────────────────────────────
  // Shown when humanDoubleVoteActive — player must pick 2 nominees.
  const showDoubleVoteModal =
    game.phase === 'live_vote' &&
    Boolean(game.awaitingHumanVote) &&
    Boolean(game.humanDoubleVoteActive) &&
    humanPlayer !== undefined &&
    !game.awaitingDoubleVoteOffer && // offer resolved first
    !activeConfessionalDecision

  // Local state to track the first double-vote selection
  const [doubleVoteFirst, setDoubleVoteFirst] = useState<string | null>(null)

  // ── Human LOH tie-break ───────────────────────────────────────────────────
  // Shown when the live vote ended in a tie and the human is LOH.
  // Only shown after the vote results modal has been dismissed (voteResults cleared),
  // so the house votes are always seen before the LOH is asked to break the tie.
  // Not shown on co-LOH Democracia days (awaitingPosTieBreak) — that uses a separate modal.
  const showTieBreakModal =
    game.phase === 'eviction_results' &&
    Boolean(game.awaitingTieBreak) &&
    !game.awaitingPosTieBreak &&
    humanIsHoH &&
    !game.voteResults &&
    !activeConfessionalDecision
  const tieBreakOptions = alivePlayers.filter((p) =>
    (game.tiedNomineeIds ?? game.nomineeIds).includes(p.id)
  )
  const doubleEvictionTieBreakSelectCount =
    game.doubleEviction?.weekActive && game.awaitingTieBreak
      ? calculateRequiredDoubleEvictionSlots(
          (game.tiedNomineeIds ?? []).length,
          Boolean(game.pendingEviction),
        )
      : 1
  const showTieBreakMultiSelectModal =
    showTieBreakModal &&
    game.doubleEviction?.weekActive === true &&
    doubleEvictionTieBreakSelectCount > 1

  // ── Co-LOH Democracia POS-holder tie-break ────────────────────────────────
  // On co-LOH Democracia days, the POS holder breaks the eviction tie.
  const showPosTieBreakModal =
    game.phase === 'eviction_results' &&
    Boolean(game.awaitingTieBreak) &&
    Boolean(game.awaitingPosTieBreak) &&
    Boolean(humanIsPosHolder) &&
    !game.voteResults &&
    !activeConfessionalDecision

  // ── Democracia vote modal ─────────────────────────────────────────────────
  // Shown when the human player must cast a Democracia vote.
  const showDemocraciaVoteModal =
    game.phase === 'democracia_vote' &&
    Boolean(game.democracia?.awaitingHumanVote) &&
    !game.democracia?.resultDisplay &&
    humanPlayer != null &&
    Boolean(game.democracia?.eligibleVoterIds?.includes(humanPlayer.id))
  const democraciaVoteOptions = alivePlayers.filter(
    (p) => (game.democracia?.candidateIds ?? []).includes(p.id) && p.id !== humanPlayer?.id,
  )

  // ── Co-LOH nomination modal ───────────────────────────────────────────────
  // Shown when the human co-LOH must pick their nomination.
  const humanCoLohId =
    humanPlayer && (game.coLohIds ?? []).includes(humanPlayer.id) ? humanPlayer.id : null
  const showCoLohNominationModal =
    Boolean(game.awaitingCoLohNomination) &&
    humanCoLohId != null &&
    !activeConfessionalDecision
  const coLohNomOptions = alivePlayers.filter(
    (p) =>
      !(game.coLohIds ?? []).includes(p.id) &&
      !game.nomineeIds.includes(p.id),
  )

  // ── Final 3 human Final LOH eviction ─────────────────────────────────────
  // Shown when phase is final3_decision and the human player is the Final LOH.
  const humanIsFinalHoh = humanPlayer && game.lohId === humanPlayer.id
  const showFinal3Modal =
    game.awaitingFinal3Eviction === true && game.phase === 'final3_decision' && humanIsFinalHoh

  const final3Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  const democraciaResultDisplay = game.democracia?.resultDisplay ?? null
  const showDemocraciaResults = democraciaResultDisplay !== null
  const democraciaResultsParticipants = useMemo(() => (
    (democraciaResultDisplay?.participantIds ?? [])
      .map((id) => {
        const player = game.players.find((entry) => entry.id === id)
        if (!player) return null
        return {
          player,
          voteCount: democraciaResultDisplay?.voteCountsByCandidateId[id] ?? 0,
        }
      })
      .filter((entry): entry is { player: Player; voteCount: number } => entry !== null)
  ), [democraciaResultDisplay, game.players])
  const handleDemocraciaResultsDone = useCallback(() => {
    dispatch(dismissDemocraciaResultDisplay())
    if (game.phase === 'democracia_results') {
      dispatch(advance())
    }
  }, [dispatch, game.phase])

  // ── Vote Results Popup ────────────────────────────────────────────────────
  // Show vote results whenever they are available, including during a tie-break
  // wait so the house votes are always revealed before the LOH is prompted.
  const showVoteResults = Boolean(game.voteResults)
  const voteResultsTallies = showVoteResults
    ? game.players
        .filter((p) => game.voteResults && p.id in game.voteResults)
        .map((p) => ({ nominee: p, voteCount: game.voteResults![p.id] ?? 0 }))
    : []
  const voteResultsEvicteeIds = useMemo(() => {
    const ids = new Set<string>()
    if (game.pendingEviction?.evicteeId) ids.add(game.pendingEviction.evicteeId)
    if (game.doubleEviction?.pendingSecondEviction?.evicteeId) {
      ids.add(game.doubleEviction.pendingSecondEviction.evicteeId)
    }
    return [...ids]
  }, [game.doubleEviction?.pendingSecondEviction?.evicteeId, game.pendingEviction?.evicteeId])
  // After dismissing vote results: show the eviction splash if one is pending,
  // otherwise advance the game phase directly.
  // When a tie-break is still pending (awaitingTieBreak), do not advance — the
  // tie-break modal will appear once voteResults has been cleared.
  // PR 3: when a voteDeduction prompt is pending, show the offer first and
  // only dismiss results after the player decides.
  const [showVoteDeductionOffer, setShowVoteDeductionOffer] = useState(false)
  const canOfferVoteBreakdown = useMemo(() => (
    game.phase === 'eviction_results' &&
    Boolean(game.pendingEviction?.evicteeId) &&
    Object.keys(game.votes ?? {}).length > 0
  ), [game.pendingEviction?.evicteeId, game.phase, game.votes])

  const hasActiveVoteBreakdownUnlock = useCallback(() => {
    const unlock = loadEvictionVoteBreakdownUnlock()
    return isEvictionVoteBreakdownActive(unlock, game.week, game.phase)
  }, [game.phase, game.week])

  const queueVoteBreakdownPrompt = useCallback(() => {
    if (!canOfferVoteBreakdown || hasActiveVoteBreakdownUnlock()) return false
    setShowVoteBreakdownPrompt(true)
    return true
  }, [canOfferVoteBreakdown, hasActiveVoteBreakdownUnlock])

  const proceedAfterVoteResults = useCallback(() => {
    dispatch(dismissVoteResults())
    if (!game.pendingEviction && !game.awaitingTieBreak) {
      dispatch(advance())
    }
  }, [dispatch, game.pendingEviction, game.awaitingTieBreak])

  const handleVoteResultsDone = useCallback(() => {
    if (game.awaitingVoteDeductionPrompt) {
      // Show voteDeduction offer before dismissing results (results popup stays
      // visible beneath the offer overlay so the player can see their situation).
      setShowVoteDeductionOffer(true)
      return
    }

    // When there is a clear evictee, use the new post-eviction sequence:
    //   1. Dismiss vote results (eviction animation blocked by postVoteAnnouncement)
    //   2. Show the post-vote TV announcement for 3 s
    //   3. Wait an additional 3 s beat after it clears
    //   4. Eviction animation plays
    //   5. Confessional prompt shows after the animation (if eligible)
    const evicteeId = game.pendingEviction?.evicteeId
    const evictee = evicteeId
      ? game.players.find((p) => p.id === evicteeId) ?? null
      : null
    if (evictee && game.pendingEviction) {
      // Decide whether to offer the confessional breakdown after the animation.
      if (canOfferVoteBreakdown && !hasActiveVoteBreakdownUnlock()) {
        isPostEvictionConfessionalModeRef.current = true
        // Snapshot vote data now before any state changes.
        postEvictionVoteSnapshotRef.current = {
          votes: { ...(game.votes ?? {}) },
          nomineeIds: [...game.nomineeIds],
          evicteeId: game.pendingEviction.evicteeId,
          week: game.week,
          phase: game.phase,
        }
      }

      const secondPendingEvictionId = game.doubleEviction?.pendingSecondEviction?.evicteeId ?? null
      const lohName = game.players.find((player) => player.id === game.lohId)?.name ?? 'The LOH'
      const defaultAnnouncement = (() => {
        const evicteeVotes = game.voteResults?.[evictee.id] ?? 0
        const hasTwoNominees = Object.keys(game.voteResults ?? {}).length === 2
        const otherVotes = Object.entries(game.voteResults ?? {}).reduce(
          (s, [id, count]) => (id !== evictee.id ? s + count : s),
          0,
        )
        return {
          title: hasTwoNominees
            ? `By a vote of ${evicteeVotes} to ${otherVotes}`
            : `With ${evicteeVotes} vote${evicteeVotes === 1 ? '' : 's'}`,
          subtitle: `${evictee.name}, please say your goodbyes and leave through the Confessional's special exit.`,
        }
      })()
      const voteAnnouncement =
        game.doubleEviction?.weekActive &&
        game.voteResults &&
        secondPendingEvictionId
          ? buildDoubleEvictionPostVoteAnnouncement({
            voteResults: game.voteResults,
            pendingEvictionId: game.pendingEviction.evicteeId,
            pendingSecondEvictionId: secondPendingEvictionId,
            lohName,
            players: game.players,
            publicModeEnabled: Boolean(game.publicModeEnabled),
          })
          : defaultAnnouncement
      setPostVoteAnnouncementDelayActive(false)
      setPostVoteAnnouncement({
        key: 'eviction_vote_result',
        title: voteAnnouncement.title,
        subtitle: voteAnnouncement.subtitle,
        isLive: true,
        autoDismissMs: POST_VOTE_ANNOUNCEMENT_DELAY_MS,
      })
      // Dismiss vote results only — eviction splash is gated on postVoteAnnouncement
      proceedAfterVoteResults()
      return
    }

    // No clear evictee (tie or edge case): fall back to the original inline flow.
    if (queueVoteBreakdownPrompt()) return
    proceedAfterVoteResults()
  }, [
    canOfferVoteBreakdown,
    game.doubleEviction?.pendingSecondEviction?.evicteeId,
    game.doubleEviction?.weekActive,
    game.awaitingVoteDeductionPrompt,
    game.lohId,
    game.nomineeIds,
    game.pendingEviction,
    game.phase,
    game.players,
    game.publicModeEnabled,
    game.votes,
    game.voteResults,
    game.week,
    hasActiveVoteBreakdownUnlock,
    proceedAfterVoteResults,
    queueVoteBreakdownPrompt,
  ])

  const handlePostVoteAnnouncementDismiss = useCallback(() => {
    setPostVoteAnnouncement(null)
    setPostVoteAnnouncementDelayActive(true)
  }, [])

  useEffect(() => {
    if (!postVoteAnnouncementDelayActive) return
    const id = window.setTimeout(() => {
      setPostVoteAnnouncementDelayActive(false)
    }, POST_VOTE_ANNOUNCEMENT_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [postVoteAnnouncementDelayActive])

  const handleVoteDeductionAccept = useCallback(() => {
    setShowVoteDeductionOffer(false)
    dispatch(activateVoteDeductionReward())
    if (queueVoteBreakdownPrompt()) return
    // Explicitly dismiss vote results so the eviction cinematic can take over.
    // We do NOT use proceedAfterVoteResults() here because pendingEviction is
    // always set at this point (the deduction flow only fires when there is a
    // clear evictee), and calling advance() through that shared branch could
    // skip the eviction animation entirely.
    dispatch(dismissVoteResults())
  }, [dispatch, queueVoteBreakdownPrompt])

  const handleVoteDeductionDecline = useCallback(() => {
    setShowVoteDeductionOffer(false)
    dispatch(declineVoteDeduction())
    if (queueVoteBreakdownPrompt()) return
    proceedAfterVoteResults()
  }, [dispatch, proceedAfterVoteResults, queueVoteBreakdownPrompt])

  const unlockVoteBreakdown = useCallback(() => {
    const wasPostEviction = isPostEvictionConfessionalModeRef.current
    // In post-eviction mode the game has already advanced (pendingEviction is null,
    // phase may be week_end). Use the snapshot captured at vote-results dismiss time
    // to save the correct week/phase and per-voter vote data.
    const snapshot = postEvictionVoteSnapshotRef.current ?? {
      week: game.week,
      phase: game.phase,
      votes: { ...(game.votes ?? {}) },
      nomineeIds: [...game.nomineeIds],
      evicteeId: game.pendingEviction?.evicteeId ?? null,
    }
    if (wasPostEviction && humanPlayerEliminated) {
      setPostEvictionVoteBreakdown(snapshot)
    } else {
      saveEvictionVoteBreakdownUnlock({
        week: snapshot.week,
        phase: snapshot.phase,
        votes: snapshot.votes,
        nomineeIds: snapshot.nomineeIds,
        evicteeId: snapshot.evicteeId,
        status: 'available',
      })
      dispatch(addTvEvent({
        text: 'Go to the Confessional before the day is over.',
        type: 'game',
      }))
    }
    postEvictionVoteSnapshotRef.current = null
    isPostEvictionConfessionalModeRef.current = false
    setShowVoteBreakdownPrompt(false)
    setAdPending(false)
    if (!wasPostEviction) {
      // Only advance in the classic inline flow; in post-eviction mode the game
      // has already moved past eviction_results.
      proceedAfterVoteResults()
    }
  }, [
    dispatch,
    game.nomineeIds,
    game.pendingEviction?.evicteeId,
    game.phase,
    game.votes,
    game.week,
    humanPlayerEliminated,
    proceedAfterVoteResults,
  ])

  const postEvictionVoteBreakdownPlayerNamesById = useMemo(
    () => buildEvictionVoteBreakdownPlayerNamesById(game.players),
    [game.players],
  )
  const postEvictionVoteBreakdownRows = useMemo(
    () => (
      postEvictionVoteBreakdown
        ? buildEvictionVoteBreakdownRows(postEvictionVoteBreakdown.votes, postEvictionVoteBreakdownPlayerNamesById)
        : []
    ),
    [postEvictionVoteBreakdown, postEvictionVoteBreakdownPlayerNamesById],
  )

  useEffect(() => {
    if (!showVoteResults) {
      setShowVoteBreakdownPrompt(false)
      setAdPending(false)
    }
  }, [showVoteResults])

  // For AI tiebreak: pass evictee=null to the modal so it surfaces the tie banner
  // and calls onTiebreakerRequired, giving us the hook to run choreography.
  // Condition: vote tallies have equal max counts AND AI already picked (pendingEviction set)
  // AND the human is NOT the LOH.
  const voteResultsEvictee = useMemo(() => {
    if (!game.voteResults) return null

    // If we have an explicit eviction decision, use that as the source of truth
    // — UNLESS this is an AI tiebreak where we want the modal to show the tie
    // banner first and call onTiebreakerRequired.
    if (game.pendingEviction) {
      if (!humanIsHoH) {
        // Check whether the tallies are actually tied (AI tiebreak case).
        let maxVotes = -1
        let topCount = 0
        for (const count of Object.values(game.voteResults)) {
          if (count > maxVotes) { maxVotes = count; topCount = 1 }
          else if (count === maxVotes) topCount++
        }
        if (topCount > 1) {
          // AI tiebreak — pass null so the modal shows the tie banner.
          return null
        }
      }
      return game.players.find((p) => p.id === game.pendingEviction?.evicteeId) ?? null
    }

    let maxVotes = -1
    let evicteeIds: string[] = []
    for (const [id, count] of Object.entries(game.voteResults)) {
      if (count > maxVotes) {
        maxVotes = count
        evicteeIds = [id]
      } else if (count === maxVotes) {
        evicteeIds.push(id)
      }
    }

    // If there's a tie for max votes, we can't determine a single evictee from tallies alone.
    if (evicteeIds.length !== 1) return null

    return game.players.find((p) => p.id === evicteeIds[0]) ?? null
  }, [game.voteResults, game.pendingEviction, game.players, humanIsHoH])

  const aiTiebreakContext = useMemo<AiTiebreakContext | null>(() => {
    if (humanIsHoH || !game.voteResults || !game.pendingEviction?.evicteeId) return null
    let maxVotes = -1
    let topCount = 0
    for (const count of Object.values(game.voteResults)) {
      if (count > maxVotes) {
        maxVotes = count
        topCount = 1
      } else if (count === maxVotes) {
        topCount += 1
      }
    }
    if (topCount < 2) return null

    const lohName = game.players.find((player) => player.id === game.lohId)?.name ?? 'The LOH'
    const evictee = game.players.find((player) => player.id === game.pendingEviction?.evicteeId) ?? null
    if (!evictee) return null

    const evicteeVotes = game.voteResults[evictee.id] ?? 0
    const hasTwoNominees = Object.keys(game.voteResults).length === 2
    const otherVotes = Object.entries(game.voteResults).reduce(
      (sum, [id, count]) => (id !== evictee.id ? sum + count : sum),
      0,
    )
    // The LOH's tie-break choice acts like the deciding extra vote for the evictee.
    return {
      lohName,
      evictee,
      resultTitle: hasTwoNominees
        ? `By a vote of ${evicteeVotes + 1} to ${otherVotes}`
        : `With ${evicteeVotes + 1} vote${evicteeVotes + 1 === 1 ? '' : 's'}`,
    }
  }, [game.lohId, game.pendingEviction?.evicteeId, game.players, game.voteResults, humanIsHoH])

  const aiTiebreakAnnouncement = useMemo<Announcement | null>(() => {
    if (!aiTiebreakStage || !activeAiTiebreakContext) return null
    if (aiTiebreakStage === 'tie') {
      return {
        key: 'loh_tiebreak_tie',
        title: 'It’s a Tie!',
        subtitle: `${activeAiTiebreakContext.lohName} must break the tie.`,
        isLive: true,
        autoDismissMs: AI_TIE_STAGE_DELAY_MS,
      }
    }
    if (aiTiebreakStage === 'deciding') {
      return {
        key: 'loh_tiebreak_deciding',
        title: `${activeAiTiebreakContext.lohName} is making a decision…`,
        subtitle: 'Please wait while the LOH decides who to evict.',
        isLive: true,
        autoDismissMs: AI_TIE_DECIDING_DELAY_MS,
      }
    }
    if (aiTiebreakStage === 'decision') {
      return {
        key: 'loh_tiebreak_decision',
        title: `The LOH chose to evict ${activeAiTiebreakContext.evictee.name}.`,
        subtitle: '',
        isLive: true,
        autoDismissMs: AI_TIE_DECISION_DELAY_MS,
      }
    }
    return {
      key: 'loh_tiebreak_result',
      title: activeAiTiebreakContext.resultTitle,
      subtitle: `${activeAiTiebreakContext.evictee.name}, you have been eliminated from The Big Eye house.`,
      isLive: true,
      autoDismissMs: AI_TIE_RESULT_DELAY_MS,
    }
  }, [activeAiTiebreakContext, aiTiebreakStage])

  const handleTiebreakerRequired = useCallback((tiedIds: string[]) => {
    console.log('TIE_BREAK_STARTED', { tiedIds, hohIsHuman: !!humanIsHoH, screen: 'GameScreen' })
    if (!humanIsHoH) {
      if (!aiTiebreakContext) {
        // If we cannot build the AI tie-break context, still dismiss the vote
        // results flow so the UI does not remain stuck in the tied state.
        handleVoteResultsDone()
        return
      }
      setActiveAiTiebreakContext(aiTiebreakContext)
      dispatch(dismissVoteResults())
      setAiTiebreakStage('tie')
    } else {
      // Human LOH: dismiss the vote results modal — showTieBreakModal will appear.
      handleVoteResultsDone()
    }
  }, [aiTiebreakContext, dispatch, humanIsHoH, handleVoteResultsDone])

  const handleAiTiebreakAnnouncementDismiss = useCallback(() => {
    if (aiTiebreakStage === 'tie') {
      setAiTiebreakStage('deciding')
      return
    }
    if (aiTiebreakStage === 'deciding') {
      setAiTiebreakStage('decision')
      return
    }
    if (aiTiebreakStage === 'decision') {
      setAiTiebreakStage('result')
      return
    }
    setAiTiebreakStage(null)
    setActiveAiTiebreakContext(null)
  }, [aiTiebreakStage])

  const publicEvictionTiebreak = useMemo(() => {
    if (
      !showVoteResults ||
      !game.publicModeEnabled ||
      !game.doubleEviction?.weekActive ||
      !game.awaitingTieBreak
    ) {
      return null
    }

    const tiedIds = game.tiedNomineeIds ?? []
    if (tiedIds.length < 2) return null

    const tiedNominees = tiedIds
      .map((id) => {
        const nominee = game.players.find((player) => player.id === id)
        if (!nominee) return null
        return {
          nominee,
          approval: publicOpinionProfiles[id]?.approval ?? 50,
        }
      })
      .filter((entry): entry is { nominee: Player; approval: number } => entry !== null)

    if (tiedNominees.length < 2) return null

    const rankedIds = rankPublicEvictionTieNominees({
      nomineeIds: tiedNominees.map((entry) => entry.nominee.id),
      profiles: publicOpinionProfiles,
    })
    const evicteeCount = calculateRequiredDoubleEvictionSlots(
      tiedNominees.length,
      Boolean(game.pendingEviction),
    )
    const evicteeIds = rankedIds.slice(0, evicteeCount)

    if (evicteeIds.length !== evicteeCount) return null

    return {
      tiedNominees,
      evicteeIds,
    }
  }, [
    game.awaitingTieBreak,
    game.doubleEviction?.weekActive,
    game.pendingEviction,
    game.players,
    game.publicModeEnabled,
    game.tiedNomineeIds,
    publicOpinionProfiles,
    showVoteResults,
  ])

  const handlePublicEvictionTiebreakResolved = useCallback((evicteeIds: string[]) => {
    if (evicteeIds.length === 0) return
    dispatch(submitDoubleEvictionTieBreak(evicteeIds))
  }, [dispatch])

  const aiDoubleEvictionTieBreakChoiceIds = useMemo(() => {
    if (
      !game.awaitingTieBreak ||
      !game.doubleEviction?.weekActive ||
      humanIsHoH ||
      game.publicModeEnabled
    ) {
      return []
    }
    const tiedIds = game.tiedNomineeIds ?? []
    if (tiedIds.length === 0) return []
    const aiRng = mulberry32((game.seed ^ 0xdeadbeef) >>> 0)
    const tieBreakRanks = Object.fromEntries(tiedIds.map((id) => [id, aiRng()]))
    const rankedIds = [...tiedIds].sort((a, b) => (tieBreakRanks[b] ?? 0) - (tieBreakRanks[a] ?? 0))
    const selectionCount = calculateRequiredDoubleEvictionSlots(
      tiedIds.length,
      Boolean(game.pendingEviction),
    )
    return rankedIds.slice(0, selectionCount)
  }, [
    game.awaitingTieBreak,
    game.doubleEviction?.weekActive,
    game.pendingEviction,
    game.publicModeEnabled,
    game.seed,
    game.tiedNomineeIds,
    humanIsHoH,
  ])

  const showAiSecondTieBreakOverlay =
    game.phase === 'eviction_results' &&
    Boolean(game.awaitingTieBreak) &&
    !humanIsHoH &&
    !game.publicModeEnabled &&
    !game.voteResults

  useEffect(() => {
    if (!showAiSecondTieBreakOverlay || aiDoubleEvictionTieBreakChoiceIds.length === 0) return
    const id = window.setTimeout(() => {
      dispatch(submitDoubleEvictionTieBreak(aiDoubleEvictionTieBreakChoiceIds))
    }, 3000)
    return () => window.clearTimeout(id)
  }, [aiDoubleEvictionTieBreakChoiceIds, dispatch, showAiSecondTieBreakOverlay])

  // ── Eviction cinematic (pendingEviction-driven) ───────────────────────────
  // Normal evictions: triggered by pendingEviction being set in advance().
  // Final-4 evictions: also driven by pendingEviction (set by finalizeFinal4Eviction
  // or the AI path in advance()), but only shown after the announcement ChatOverlay.
  const pendingEvictionPlayer = game.pendingEviction
    ? game.players.find((p) => p.id === game.pendingEviction?.evicteeId) ?? null
    : null
  // For normal evictions (not Final-4), show whenever pendingEviction is set.
  // For Final-4, show only during the 'splash' stage (after the announcement).
  // Also blocked while the post-vote announcement or its follow-up pause is active.
  const showEvictionSplash =
    !showVoteResults &&
    !aiTiebreakStage &&
    !postVoteAnnouncement &&
    !postVoteAnnouncementDelayActive &&
    !!game.pendingEviction &&
    !game.awaitingTieBreak &&
    (game.phase !== 'final4_eviction' || final4Stage === 'splash')

  // After the eviction cinematic completes, commit the pending eviction then
  // attempt Back 2 the Game activation (normal evictions only) or advance the Final-4
  // local state machine. Also show the confessional prompt if it was queued.
  const handleEvictionSplashDone = useCallback(() => {
    const evicteeId = game.pendingEviction?.evicteeId
    if (!evicteeId) return
    const hasQueuedSecondEviction = Boolean(game.doubleEviction?.pendingSecondEviction)
    // Clear the overlay flag so AvatarTile returns to normal after the cinematic.
    dispatch(setEvictionOverlay(null))
    // Capture the phase before dispatch since finalizePendingEviction may change it.
    const isFinal4 = game.phase === 'final4_eviction'
    dispatch(finalizePendingEviction(evicteeId))
    if (isFinal4) {
      // Final-4: advance the local stage machine; no battle back check needed.
      setFinal4Stage('done')
    } else if (hasQueuedSecondEviction) {
      // Keep the second double-eviction cinematic in the same flow so it gets
      // its own overlay mount and eviction stinger before the week advances.
    } else {
      const activated =
        dispatch(tryActivatePendingForcedBattleBack()) ||
        dispatch(tryActivateBattleBack())
      if (!activated) {
        dispatch(advance())
      }
    }
    // Show the confessional breakdown prompt if it was flagged during vote-results
    // dismissal (post-eviction confessional mode).
    if (isPostEvictionConfessionalModeRef.current) {
      if (postEvictionVoteBreakdownPromptTimerRef.current != null) {
        window.clearTimeout(postEvictionVoteBreakdownPromptTimerRef.current)
        postEvictionVoteBreakdownPromptTimerRef.current = null
      }
      postEvictionVoteBreakdownPromptTimerRef.current = window.setTimeout(() => {
        postEvictionVoteBreakdownPromptTimerRef.current = null
        if (!isMountedRef.current) return
        setShowVoteBreakdownPrompt(true)
      }, POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS)
    }
  }, [dispatch, game.doubleEviction?.pendingSecondEviction, game.pendingEviction, game.phase, setFinal4Stage])

  const handleDayStartShockConfirm = useCallback(() => {
    dispatch(confirmDayStartShock())
  }, [dispatch])

  const dayStartShock = game.dayStartShock
  const dayStartShockPlayer = useMemo(() => {
    if (!dayStartShock) return null
    return game.players.find((player) => player.id === dayStartShock.targetId) ?? null
  }, [dayStartShock, game.players])


  const battleBack = game.battleBack
  const [battleBackReturnId, setBattleBackReturnId] = useState<string | null>(null)
  const [battleBackAttemptIndex, setBattleBackAttemptIndex] = useState(0)
  const [battleBackAnnouncementStep, setBattleBackAnnouncementStep] = useState<number | null>(null)
  const [battleBackRetryCount, setBattleBackRetryCount] = useState(0)
  const [battleBackRetryOfferWinnerId, setBattleBackRetryOfferWinnerId] = useState<string | null>(null)
  const battleBackAnnouncementStepRef = useRef<number | null>(null)
  // Only show the full-screen overlay once competitionActive is true.
  // When battleBack.active && !competitionActive, the TV filler shows the
  // twist announcement; the overlay opens ~5 s later via the effect below.
  const showBattleBack = battleBack?.active === true && battleBack?.competitionActive === true
  const battleBackAttemptSeed = useMemo(
    // Step each retry through a large odd offset so the seeded Back 2 the Game
    // simulation produces a fresh bracket/minigame sequence per replay.
    () => ((game.seed + Math.imul(battleBackAttemptIndex, 0x9e3779b1)) >>> 0),
    [battleBackAttemptIndex, game.seed],
  )
  const battleBackCandidates = useMemo(
    () => (battleBack?.active
      ? game.players.filter((p) => (battleBack?.candidates ?? []).includes(p.id) && (p.status === 'jury' || p.status === 'evicted'))
      : []),
    [battleBack?.active, battleBack?.candidates, game.players],
  )
  const battleBackCandidateIds = useMemo(
    () => battleBackCandidates.map((player) => player.id),
    [battleBackCandidates],
  )
  const humanBattleBackCandidateId = useMemo(() => {
    if (!humanPlayer?.id) return null
    return battleBackCandidateIds.includes(humanPlayer.id) ? humanPlayer.id : null
  }, [battleBackCandidateIds, humanPlayer?.id])
  const useBattleBackMinigame = useMemo(
    () => shouldUseBattleBackMinigame(humanBattleBackCandidateId, battleBackCandidateIds),
    [battleBackCandidateIds, humanBattleBackCandidateId],
  )
  const capitalizationAiModel = useMemo(
    () => getMinigameAiModel('capitalization'),
    [],
  )
  const battleBackCapitalizationParticipants = useMemo(() => (
    battleBackCandidates.map((player, index) => ({
      id: player.id,
      name: player.name,
      isHuman: !!player.isUser,
      avatar: player.avatar,
      precomputedScore: player.isUser
        ? 0
        : simulateMinigameAiScore({
          gameKey: 'capitalization',
          minigameModel: capitalizationAiModel,
          seed: battleBackAttemptSeed,
          playerId: player.id,
          participantIndex: index,
          profile: player.competitionProfile ?? getDefaultCompetitionProfile(),
          seasonState: getCompetitionSeasonState(game.competitionSeasonStateByPlayerId, player.id),
        }),
      previousPR: player.stats?.gamePRs?.capitalization ?? null,
    }))
  ), [battleBackAttemptSeed, battleBackCandidates, capitalizationAiModel, game.competitionSeasonStateByPlayerId])
  const showBattleBackOverlay =
    showBattleBack &&
    battleBackCandidates.length > 0 &&
    !battleBackRetryOfferWinnerId

  // Pre-compute the deterministic Back 2 the Game winner and spectator variant so
  // the SpectatorView reveal always matches the store write.
  const battleBackWinnerId = useMemo(() => {
    if (!showBattleBackOverlay || useBattleBackMinigame || battleBackCandidates.length === 0) return undefined;
    return simulateBattleBackCompetition(battleBackCandidateIds, battleBackAttemptSeed).winnerId;
  }, [
    battleBackAttemptSeed,
    battleBackCandidateIds,
    battleBackCandidates.length,
    showBattleBackOverlay,
    useBattleBackMinigame,
  ]);

  const battleBackReturnPlayer = useMemo(
    () => (battleBackReturnId ? game.players.find((p) => p.id === battleBackReturnId) ?? null : null),
    [battleBackReturnId, game.players],
  )
  const battleBackRetryOfferWinner = useMemo(
    () => (battleBackRetryOfferWinnerId ? game.players.find((player) => player.id === battleBackRetryOfferWinnerId) ?? null : null),
    [battleBackRetryOfferWinnerId, game.players],
  )
  const showBattleBackReturn = !!battleBackReturnPlayer

  const battleBackVariant = useMemo((): SpectatorVariant => {
    const variants: SpectatorVariant[] = ['holdwall', 'trivia', 'maze'];
    const rng = mulberry32(((battleBackAttemptSeed ^ 0xdeadbeef) >>> 0));
    return variants[Math.floor(rng() * variants.length)];
  }, [battleBackAttemptSeed]);

  useEffect(() => {
    if (battleBack?.active) {
      setBattleBackAttemptIndex(0)
      setBattleBackRetryCount(0)
      setBattleBackRetryOfferWinnerId(null)
      return
    }
    setBattleBackRetryOfferWinnerId(null)
  }, [battleBack?.active, battleBack?.weekDecided])

  useEffect(() => {
    if (battleBack?.active && !battleBack.competitionActive) {
      setBattleBackAnnouncementStep(0)
      return
    }
    setBattleBackAnnouncementStep(null)
  }, [battleBack?.active, battleBack?.competitionActive, battleBack?.weekDecided])

  useEffect(() => {
    battleBackAnnouncementStepRef.current = battleBackAnnouncementStep
  }, [battleBackAnnouncementStep])

  const handleBattleBackAnnouncementPlay = useCallback(() => {
    if (!battleBack?.active || battleBack.competitionActive) return

    const currentStep = battleBackAnnouncementStepRef.current
    if (currentStep == null) return
    const announcement = BATTLE_BACK_ANNOUNCEMENT_SEQUENCE[currentStep]

    const { nextStep, shouldOpenCompetition } =
      advanceBattleBackAnnouncementStep(currentStep)

    if (announcement) {
      dispatch(addTvEvent({
        text: buildBattleBackFeedMessage(announcement),
        type: 'game',
      }))
    }
    setBattleBackAnnouncementStep(nextStep)
    if (shouldOpenCompetition) {
      dispatch(openBattleBackCompetition())
    }
  }, [battleBack?.active, battleBack?.competitionActive, dispatch])

  useEffect(() => {
    if (!battleBack?.active || battleBack.competitionActive) return

    window.addEventListener('ui:playPressed', handleBattleBackAnnouncementPlay)
    return () => window.removeEventListener('ui:playPressed', handleBattleBackAnnouncementPlay)
  }, [battleBack?.active, battleBack?.competitionActive, handleBattleBackAnnouncementPlay])

  // Safety net: if battleBack is active but there are no valid tribunal (jury) candidates
  // — e.g. state was loaded with stale/corrupted candidates — auto-dismiss so the game
  // does not get permanently stuck with advance() blocked and no overlay rendered.
  useEffect(() => {
    if (!battleBack?.active) return
    if (battleBackCandidates.length > 0) return
    dispatch(dismissBattleBack())
    dispatch(advance())
  }, [battleBack?.active, battleBackCandidates.length, dispatch])

  // storeRef is synced via useEffect; we read the latest state after dispatch to confirm the
  // Back 2 the Game completion before showing the return overlay. storeRef is intentionally
  // omitted from deps because refs are stable and shouldn't re-create this callback.
  const finalizeBattleBackOutcome = useCallback((winnerId?: string | null) => {
    if (!winnerId) {
      dispatch(dismissBattleBack())
      dispatch(advance())
      return
    }

    dispatch(completeBattleBack(winnerId))
    const updatedBattleBack = storeRef.current.getState().game.battleBack

    if (updatedBattleBack?.active === false && updatedBattleBack.winnerId === winnerId) {
      setBattleBackReturnId(winnerId)
      return
    }

    dispatch(dismissBattleBack())
    dispatch(advance())
  }, [dispatch])

  const handleBattleBackComplete = useCallback((winnerId?: string | null) => {
    const resolvedWinnerId = winnerId ?? battleBackWinnerId

    if (!resolvedWinnerId) {
      finalizeBattleBackOutcome()
      return
    }

    const canReplayBattleBack = isBattleBackReplayEligible(
      resolvedWinnerId,
      humanPlayer?.id ?? null,
      battleBack?.candidates ?? [],
      battleBackRetryCount,
      BATTLE_BACK_RETRY_LIMIT,
    )

    if (canReplayBattleBack) {
      setBattleBackRetryOfferWinnerId(resolvedWinnerId)
      return
    }

    finalizeBattleBackOutcome(resolvedWinnerId)
  }, [
    battleBack?.candidates,
    battleBackRetryCount,
    battleBackWinnerId,
    finalizeBattleBackOutcome,
    humanPlayer?.id,
  ])

  const handleBattleBackReturnDone = useCallback(() => {
    setBattleBackReturnId(null)
    dispatch(advance())
  }, [dispatch])

  // ── Public's Favorite Player twist ───────────────────────────────────────
  // Shown during the explicit season finale flow: the finale controller
  // yields to the existing TV announcement + voting overlay, then resumes the
  // finale sequence once the winner reveal is dismissed.
  const favoritePlayer = game.favoritePlayer;
  const showFavoriteVoting =
    favoritePlayer?.active === true && favoritePlayer.votingStarted === true;

  // Auto-open the voting overlay after the TV announcement has had time
  // to display (~5 s, matching the 4.5 s auto-dismiss + a small buffer).
  useEffect(() => {
    if (!favoritePlayer?.active || favoritePlayer.votingStarted) return;
    const id = setTimeout(() => dispatch(openFavoritePlayerVoting()), 5000);
    return () => clearTimeout(id);
  }, [dispatch, favoritePlayer?.active, favoritePlayer?.votingStarted]);

  const handleFavoriteComplete = useCallback((winnerId: string) => {
    dispatch(resolveFavoritePlayerWinner(winnerId));
    dispatch(awardFavoritePrize());
    dispatch(resumeAfterPublicFavorite({ winnerId }));
  }, [dispatch]);

  const handleFavoriteAudienceSurgeRequest = useCallback((playerId: string) => {
    return requestFavoriteAudienceSurge({
      playerId,
      adPending,
      dispatch,
      getState: () => storeRef.current.getState(),
      isMounted: () => isMountedRef.current,
      setAdPending,
    })
  }, [adPending, dispatch]);
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
      game.mode !== 'survival' &&
      (game.phase === 'loh_comp' || game.phase === 'pos_comp')
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
      pendingChallenge.game.scoringParams ?? {},
    )
    const lastNonWinner = [...ranked].reverse().find((result) => result.playerId !== finalWinnerId)

    dispatch(applyMinigameWinner({
      winnerId: finalWinnerId,
      lastPlaceId: lastNonWinner?.playerId ?? null,
      skipSeasonUpdate: true,
    }))
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
  const showQuickTapRace = showLohMinigame && !showPressurePlank && !showBullseyeBlitz && !showTravelingDots && !showLaneRacers

  // ── Ad hook: competition_retry ─────────────────────────────────────────────
  // Retry now lives in the MinigameHost results UI itself, so GameScreen only
  // consumes the legacy last-place marker and never shows a separate popup.
  const isFinal3Week = alivePlayers.length <= 3
  const competitionRetryInResultsEnabled = useMemo(() => {
    if (!pendingChallenge) return false
    const prizeType = pendingChallenge.prizeType ?? (game.phase === 'pos_comp' ? 'POS' : 'LOH')
    if (prizeType !== 'LOH' && prizeType !== 'POS') return false
    const state = storeRef.current.getState()
    return canShowAd('competition_retry', state, { isFinal3Week })
  }, [pendingChallenge, game.phase, isFinal3Week])
  const [lastDislikedPromptDate, setLastDislikedPromptDate] = usePersistedPromptDate(
    'public_meter_disliked_boost',
  )
  useEffect(() => {
    if (!adsState?.lastCompLastPlaceType) return
    if (import.meta.env.DEV) {
      console.log(
        '[ads] competition_retry standalone prompt removed; relying on minigame results UI',
        { lastCompLastPlaceType: adsState.lastCompLastPlaceType, phase: game.phase, isFinal3Week },
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

  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    const currentPhase = game.phase
    if (currentPhase === prevPhase) return
    prevPhaseRef.current = currentPhase

    const state = storeRef.current.getState()

    // eviction_auto — after each eviction
    if (
      currentPhase === 'eviction_results' &&
      canShowAd('eviction_auto', state) &&
      window.GameAds?.showInterstitial
    ) {
      queuePreAdAnnouncement(
        'eviction_auto',
        "Don't change the channel, a new Day is about to begin right after a short break.",
      )
      return
    }

    // pos_decision_auto — every other week just before POS holder announces
    // week is 1-indexed; even weeks = weeks 2, 4, 6, ...
    if (
      currentPhase === 'pos_ceremony_results' &&
      game.week % 2 === 0 &&
      canShowAd('pos_decision_auto', state) &&
      window.GameAds?.showInterstitial
    ) {
      const posHolderName =
        game.players.find((player) => player.id === game.posWinnerId)?.name ?? 'the Power of Safety holder'
      queuePreAdAnnouncement(
        'pos_decision_auto',
        `Is ${posHolderName} going to use the Power of safety to change the course of the game? Find out right after this short break!`,
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
        'The final safety winner now has the deciding vote to evict. Find out who is going to be eliminated just a step before the finale. Stay with us.',
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
        'The final leader of the house has to make a very important decision that might cost them the victory. Who will they choose? Find out right after the break.',
      )
      return
    }
  }, [game.phase, game.week, game.players, game.posWinnerId, dispatch, queuePreAdAnnouncement])

  // ── Ad hook: social_energy_recharge ──────────────────────────────────────
  // Show a rewarded prompt when the user's social energy hits 0 (once per day).
  // Guards: week is not 1, not final-3 week, phase is social_1 or social_2.
  const userEnergy = useAppSelector(
    (s: RootState) => (humanPlayer ? (s.social?.energyBank?.[humanPlayer.id] ?? 0) : 0),
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
          console.log('[ads] social_energy_recharge prompt shown — week:', game.week, '| phase:', game.phase)
        }
        setShowEnergyRechargePrompt(true)
      }
    } else {
      if (import.meta.env.DEV && energyIsZero) {
        console.log(
          '[ads] social_energy_recharge suppressed — week:', game.week,
          '| phase:', game.phase,
          '| isFinal3Week:', isFinal3Week,
          '| inSocialPhase:', inSocialPhase,
        )
      }
      setShowEnergyRechargePrompt(false)
    }
  }, [userEnergy, humanPlayer, humanPlayerEliminated, game.mode, game.week, game.phase, isFinal3Week])

  // ── Ad hook: public_meter_disliked_boost ──────────────────────────────────
  // Show a rewarded prompt when the user's approval drops below 40%
  // (disliked or worse), at most once per day.
  const userApproval = useAppSelector(
    (s: RootState) =>
      humanPlayer
        ? (s.publicOpinion?.profiles?.[humanPlayer.id]?.approval ?? 100)
        : 100,
  )
  useEffect(() => {
    if (!humanPlayer || game.mode === 'survival' || game.publicModeEnabled !== true) {
      setShowDislikedBoostPrompt(false)
      return
    }
    const todayIsoDate = new Date().toISOString().slice(0, 10)
    if (
      !humanPlayerEliminated &&
      shouldShowDislikedBoostPrompt(
        userApproval,
        lastDislikedPromptDate,
        todayIsoDate,
      )
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

  // Hide Continue button while waiting for any human-only decision modal.
  // Also hide during VoteResultsPopup / EvictionSplash so the phase cannot
  // be advanced under those full-screen overlays.
  // Keep this in sync with the conditions that control human decision modals above.
  const showWinnerCeremony = pendingWinnerCeremony !== null
  const showReplacementCeremony = pendingReplacementCeremony !== null || showAiReplacementAnim
  const showSaveCeremony = pendingSaveCeremony !== null
  // Final-3 ceremony: shown when awaitingFinal3Plea is set (AI LOH won Part 3 via spectator).
  const showFinal3Ceremony =
    game.awaitingFinal3Plea === true &&
    game.phase === 'final3_decision' &&
    !!game.lohId
  const survivorTerminalActive = game.mode === 'survival' && isSurvivorRunTerminal(game)
  const showGameControlDock = shouldShowGameControlDock(game.status === 'active', [
    Boolean(
      showOutgoingHohWarning ||
      showReplacementModal ||
      showNominationsModal ||
      showNomAnim ||
      showPublicSaveReveal ||
      showReplacementCeremony ||
      showSaveCeremony ||
      showPovDecisionModal ||
      showPovSaveModal ||
      showFinal4Chat ||
      showFinal4Modal ||
      showFinal4AnnounceChat ||
      showDoubleVoteOffer ||
      showDoubleVoteModal ||
      showLiveVoteModal ||
      showTieBreakModal ||
      showDemocraciaResults ||
      showFinal3Modal ||
      showFinal3Ceremony ||
      (game.phase === 'jury_announcement' || game.phase === 'jury_cinematic') ||
      showVoteResults ||
      showVoteDeductionOffer ||
      showEvictionSplash ||
      showBattleBackReturn ||
      showBattleBack ||
      showFavoriteVoting ||
      (game.favoritePlayer?.active === true && game.favoritePlayer?.votingStarted !== true) ||
      showMinigameHost ||
      showWinnerCeremony ||
      showAdvanceHohCeremony ||
      showQuickTapRace ||
      showBullseyeBlitz ||
      showTravelingDots ||
      aiTiebreakStage !== null ||
      spectatorF3Active ||
      spectatorLegacyActive
    ),
    Boolean(postEvictionVoteBreakdown !== null),
    Boolean(showEnergyRechargePrompt),
    Boolean(showDislikedBoostPrompt),
    Boolean(showBattleBackOverlay),
    Boolean(showBattleBackReturn),
    Boolean(showFavoriteVoting),
    Boolean(showMinigameHost),
    Boolean(showPressurePlank),
    Boolean(showBullseyeBlitz),
    Boolean(showTravelingDots),
    Boolean(showLaneRacers),
    Boolean(showQuickTapRace),
    Boolean(showWinnerCeremony),
    Boolean(showAdvanceHohCeremony),
    Boolean(showPublicSaveReveal),
    Boolean(showPublicSaveCeremony),
    Boolean(showDemocraciaResults),
    Boolean(showFinal4Modal),
    Boolean(showFinal4AnnounceChat),
    Boolean(showFinal3Modal),
    Boolean(showFinal3Ceremony),
    Boolean(showVoteBreakdownPrompt),
    Boolean(battleBackRetryOfferWinnerId),
    Boolean(preAdAnnouncement),
    Boolean(socialModuleUnavailableAnnouncement),
    Boolean(publicMeterUnavailableAnnouncement),
    Boolean(spectatorF3Active),
    Boolean(spectatorF3Part2Active),
    Boolean(spectatorLegacyActive),
    Boolean(socialSummaryOpen),
  ], survivorTerminalActive)

  // ── Jury reveal overlay ───────────────────────────────────────────────────
  // JuryPhaseRevealOverlay handles its own animation sequence (no-animations
  // and prefers-reduced-motion fast-paths are handled inside the component).
  // The no-animations fast-path below advances both jury_announcement and
  // jury_cinematic directly — bypassing the overlay — when body.no-animations
  // is set, and also guards jury_cinematic if it is entered directly (e.g.
  // after a store rehydration).
  useEffect(() => {
    const noAnimations =
      typeof document !== 'undefined' &&
      !!document.body &&
      document.body.classList.contains('no-animations')
    if (!noAnimations) return
    if (game.phase === 'jury_announcement' || game.phase === 'jury_cinematic') {
      dispatch(advance())
    }
  }, [game.phase, dispatch])

  /** Advance jury_announcement → jury_cinematic → jury in one step. No-op in any other phase. */
  const handleEnterJuryVote = useCallback(() => {
    if (game.phase !== 'jury_announcement' && game.phase !== 'jury_cinematic') return
    if (game.phase === 'jury_announcement') {
      dispatch(advance()) // jury_announcement → jury_cinematic
    }
    dispatch(advance())   // jury_cinematic → jury
  }, [dispatch, game.phase])

  const handleSpyJury = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[jury-phase] Spy Jury tapped — Jury House module coming soon')
    }
  }, [])

  const awaitingHumanDecision =
    showOutgoingHohWarning ||
    showReplacementModal ||
    showNominationsModal ||
    showNomAnim ||
    showPublicSaveReveal ||
    showReplacementCeremony ||
    showSaveCeremony ||
    showPovDecisionModal ||
    showPovSaveModal ||
    showFinal4Chat ||
    showFinal4Modal ||
    showFinal4AnnounceChat ||
    showDoubleVoteOffer ||
    showDoubleVoteModal ||
    showLiveVoteModal ||
    showTieBreakModal ||
    showDemocraciaResults ||
    showFinal3Modal ||
    showFinal3Ceremony ||
    (game.phase === 'jury_announcement' || game.phase === 'jury_cinematic') ||
    showVoteResults ||
    showVoteDeductionOffer ||
    showEvictionSplash ||
    showBattleBackReturn ||
    showBattleBack ||
    showFavoriteVoting ||
    (game.favoritePlayer?.active === true && game.favoritePlayer?.votingStarted !== true) ||
    showMinigameHost ||
    showWinnerCeremony ||
    showAdvanceHohCeremony ||
    showQuickTapRace ||
    showBullseyeBlitz ||
    showTravelingDots ||
    aiTiebreakStage !== null ||
    spectatorF3Active ||
    spectatorLegacyActive

  // ── Viewport fallback message for blank-TV states ────────────────────────
  // Provides a meaningful holding message during states where no fresh TV event
  // is available: after dismissing the live_eviction announcement during
  // live_vote, and during the postVoteAnnouncementDelayActive grace period.
  const tvViewportFallbackMessage = useMemo(() => {
    if (game.phase === 'live_vote') {
      if (game.awaitingHumanVote) {
        return activeConfessionalDecision
          ? 'The Big Eye requires your vote in the Confessional.'
          : 'Waiting for your vote.'
      }
      return 'Players are casting their votes.'
    }
    if (postVoteAnnouncementDelayActive && game.pendingEviction) {
      return 'Please wait while the player says their goodbyes.'
    }
    // Fall back to the remote-config headline when no phase-specific message applies.
    return remoteMainTvHeadline ?? undefined
  }, [game.phase, game.awaitingHumanVote, activeConfessionalDecision, postVoteAnnouncementDelayActive, game.pendingEviction, remoteMainTvHeadline])
  function handlePublicMeterBlocked() {
    setPublicMeterUnavailableAnnouncement({
      key: 'public_meter_unavailable',
      title: PUBLIC_MODE_STORE_PROMPT,
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
  })
  const gameTvLogRows = responsiveGameLayout.tvLogRows
  const housemateOccupancyLabel = `${alivePlayers.length}/${game.players.length}`
  const rosterOccupancyChip = responsiveGameLayout.rosterHeaderMode === 'tv-chip'
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
          onPriorityAnnouncementDismiss={() => setShowConfessionalTvPrompt(false)}
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
          onPriorityAnnouncementDismiss={() => setShowConfessionalTvPrompt(false)}
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
          onPriorityAnnouncementDismiss={() => setShowConfessionalTvPrompt(false)}
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
          onPriorityAnnouncementDismiss={() => setShowConfessionalTvPrompt(false)}
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
          autoNomineeId={canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? undefined) : undefined}
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
                  badgeStart: (isAutoNominee || !lohRect) ? ('center' as const) : lohRect,
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
            nominationLabels[nomAnimPlayers[nomAnimPlayers.length - 1]?.id ?? ''] === 'Last in LOH Comp'
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

      {/* ── PR 3: doubleVote Big Eye offer (before vote modal) ──────────── */}
      {showDoubleVoteOffer && (
        <TvBinaryDecisionModal
          title="📺 The Big Eye — Secret Power"
          subtitle={`${humanPlayer?.name}, you have a stored Double Vote power. Activate it now to cast two votes in this live elimination?`}
          yesLabel="🗳️🗳️ Yes — use Double Vote"
          noLabel="❌ No — cast a single vote"
          onYes={() => dispatch(activateDoubleVoteReward())}
          onNo={() => dispatch(declineDoubleVoteReward())}
        />
      )}

      {/* ── PR 3: double vote first selection ───────────────────────────── */}
      {showDoubleVoteModal && doubleVoteFirst === null && (
        <TvDecisionModal
          title="Double Vote — First Vote"
          subtitle={`${humanPlayer?.name}, cast your FIRST vote to eliminate.`}
          options={liveVoteOptions}
          onSelect={(id) => setDoubleVoteFirst(id)}
          danger
          stingerMessage="FIRST VOTE CAST"
        />
      )}

      {/* ── PR 3: double vote second selection ──────────────────────────── */}
      {showDoubleVoteModal && doubleVoteFirst !== null && (
        <TvDecisionModal
          title="Double Vote — Second Vote"
          subtitle={`${humanPlayer?.name}, cast your SECOND vote to eliminate. You may vote for the same person again.`}
          options={liveVoteOptions}
          onSelect={(id) => {
            dispatch(submitHumanDoubleVote([doubleVoteFirst, id]))
            setDoubleVoteFirst(null)
          }}
          danger
          stingerMessage="DOUBLE VOTE RECORDED"
        />
      )}

      {/* ── Human live eviction vote ─────────────────────────────────────── */}
      {showLiveVoteModal && (
        <TvDecisionModal
          title="Live Elimination Vote"
          subtitle={`${humanPlayer?.name}, cast your vote to eliminate one of the nominees.`}
          options={liveVoteOptions}
          onSelect={(id) => dispatch(submitHumanVote(id))}
          danger
          stingerMessage="VOTE RECORDED"
        />
      )}

      {/* ── Human LOH tie-break ──────────────────────────────────────────── */}
      {showTieBreakModal && !showTieBreakMultiSelectModal && (
        <TvDecisionModal
          title="Tie-Break — LOH Casts the Deciding Vote"
          subtitle={`${humanPlayer?.name}, the vote is tied! As LOH, you must break the tie.`}
          options={tieBreakOptions}
          onSelect={(id) => dispatch(submitTieBreak(id))}
          danger
          stingerMessage="TIE BREAKER CAST"
        />
      )}

      {/* ── Co-LOH POS holder tie-break ──────────────────────────────────── */}
      {showPosTieBreakModal && (
        <TvDecisionModal
          title="Tie-Break — POS Holder Casts the Deciding Vote"
          subtitle={`${humanPlayer?.name}, the vote is tied! As POS holder, you break the tie as a special exception.`}
          options={tieBreakOptions}
          onSelect={(id) => dispatch(submitPosTieBreak(id))}
          danger
          stingerMessage="TIE BREAKER CAST"
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
          onSelect={(id) => dispatch(submitCoLohNomination({ coLohId: humanCoLohId, nomineeId: id }))}
          danger
          stingerMessage="NOMINATION LOCKED IN"
        />
      )}

      {showTieBreakMultiSelectModal && (
        <TvMultiSelectModal
          title="Double Elimination Tie-Break"
          subtitle={`${humanPlayer?.name}, choose the ${doubleEvictionTieBreakSelectCount} players to eliminate.`}
          options={tieBreakOptions}
          maxSelect={doubleEvictionTieBreakSelectCount}
          onConfirm={(ids) => dispatch(submitDoubleEvictionTieBreak(ids))}
          confirmLabel="Confirm Evictions"
          stingerMessage="DOUBLE EVICTION DECIDED"
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
                { isFinal3Week },
              )
              if (!requested) {
                setAdPending(false)
              }
            },
          }}
          participants={pendingChallenge.participants.map((id): MinigameParticipant => {
            const player = game.players.find((p) => p.id === id);
            const aiScore = pendingChallenge.aiScores[id] ?? 0;
            return {
              id,
              name: player?.name ?? id,
              isHuman: !!player?.isUser,
              avatar: player?.avatar,
              precomputedScore: aiScore,
              previousPR: player?.stats?.gamePRs?.[pendingChallenge.game.key] ?? null,
            };
          })}
          onDone={(rawValue, partial, reactCompletion) => {
            // Capture challenge fields now — completeChallenge() will clear
            // pendingChallenge from Redux, but this closure still holds it.
            const capturedParticipants = pendingChallenge.participants;
            const capturedGameKey = pendingChallenge.game.key;
            // prizeType was recorded at challenge-start and is reliable even
            // after the phase advances (feature thunks can transition
            // loh_comp → loh_results before this callback fires).
            // For backward compatibility with older saves where prizeType may be
            // missing, fall back to deriving from the current game.phase using
            // the same logic as MinigameHost gameOptions.
            const capturedPrizeType =
              pendingChallenge.prizeType ?? (game.phase === 'pos_comp' ? 'POS' : 'LOH');

            // Build raw results for all challenge participants using pre-computed
            // AI scores (appropriate for the selected game's metric kind).
            const rankingOnlyGame = isPlacementRankingGame(pendingChallenge.game)
            const rawResults = partial && rankingOnlyGame
              ? capturedParticipants
                .map((id) => ({
                  playerId: id,
                  sortValue: id === humanPlayer?.id
                    ? EXITED_PLAYER_SORT_VALUE
                    : (pendingChallenge.aiScores[id] ?? 0),
                }))
                .sort((a, b) => b.sortValue - a.sortValue)
                .map((entry, index, ordered) => ({
                  playerId: entry.playerId,
                  rawValue: ordered.length - index,
                }))
              : capturedParticipants.map((id) => ({
                  playerId: id,
                  rawValue:
                    reactCompletion?.rawResults?.[id] ??
                    (id === humanPlayer?.id
                      ? rawValue
                      : (pendingChallenge.aiScores[id] ?? rawValue)),
                  // Forward time-based tiebreaker: human's comes from the minigame
                // (via reactCompletion.tiebreakerMs); AI tiebreakers are pre-simulated
                // in startChallenge and stored alongside aiScores.
                ...(id === humanPlayer?.id
                  ? (reactCompletion?.tiebreakerMs != null ? { tiebreaker: reactCompletion.tiebreakerMs } : {})
                  : (pendingChallenge.aiTiebreakers?.[id] != null ? { tiebreaker: pendingChallenge.aiTiebreakers[id] } : {})),
              }))
            const explicitWinnerId =
              reactCompletion?.authoritativeWinnerId != null &&
              capturedParticipants.includes(reactCompletion.authoritativeWinnerId)
                ? reactCompletion.authoritativeWinnerId
                : null;

            if (import.meta.env.DEV) {
              console.log('[LOH_CROWN] MinigameHost onDone — challenge completion', {
                capturedGameKey,
                capturedParticipants,
                rawValue: rawResults.find((r) => r.playerId === humanPlayer?.id)?.rawValue,
                rawResults,
                reactCompletion,
                explicitWinnerId,
                partial,
                pendingChallengeAiScores: pendingChallenge.aiScores,
              });
            }

            const scoreWinnerId = dispatch(completeChallenge(rawResults, {
              authoritativeWinnerId: explicitWinnerId,
            })) as string | null;

            if (import.meta.env.DEV) {
              console.log('[LOH_CROWN] completeChallenge returned scoreWinnerId', {
                scoreWinnerId,
                capturedGameKey,
              });
            }
            // Only record personal records for valid (non-early-exit) completions.
            // A partial=true exit uses rawValue=0 for the human and would
            // incorrectly set a "best" 0-score for lowerBetter games.
            if (!partial) {
              dispatch(updateGamePRs({
                gameKey: capturedGameKey,
                scores: Object.fromEntries(
                  rawResults.map((r) => [r.playerId, Math.round(r.rawValue)]),
                ),
                lowerIsBetter: pendingChallenge.game.scoringAdapter === 'lowerBetter',
              }));
            }

            // ── Final 3 minigame completion ──────────────────────────────────
            // Apply the winner to the Final 3 part (no ceremony overlay for F3 parts).
            if (isF3MinigamePhase) {
              dispatch(applyF3MinigameWinner(scoreWinnerId ?? capturedParticipants[0]));
              return;
            }

            // ── LOH / POS completion (ceremony overlay) ──────────────────────
            // Use prize type captured at challenge-start; game.phase may have
            // already advanced if a feature thunk (e.g. resolveHoldTheWallOutcome,
            // resolveGlassBridgeOutcome) applied the winner synchronously before
            // this callback fires.
            const isHohComp = capturedPrizeType === 'LOH';
            const winSymbol = isHohComp ? '👑' : '🛡️';
            const winLabel = isHohComp ? 'Leader of the House' : 'Power of Safety';

            // Prefer the canonical winner already committed to the store by the
            // game's feature thunk.  storeRef gives the live Redux state — not
            // the React-render closure — so same-event dispatches (e.g. the
            // "Claim Prize" button that calls resolveCompetitionOutcome() and
            // onComplete() in the same handler) are also captured correctly.
            const liveState = storeRef.current.getState();
            const featureAppliedWinner = isHohComp
              ? liveState.game.lohId
              : liveState.game.posWinnerId;
            const finalWinnerId = explicitWinnerId
              ?? ((featureAppliedWinner && capturedParticipants.includes(featureAppliedWinner))
                ? featureAppliedWinner
                : (scoreWinnerId ?? capturedParticipants[0]));

            if (import.meta.env.DEV) {
              console.log('[LOH_CROWN] winner resolution in GameScreen', {
                capturedGameKey,
                capturedPrizeType,
                capturedParticipants,
                rawResults,
                explicitWinnerId,
                featureAppliedWinner,
                scoreWinnerId,
                finalWinnerId,
                fallbackWasCapturedParticipants0: !explicitWinnerId && !featureAppliedWinner && !scoreWinnerId,
                liveHohId: liveState.game.lohId,
                livePhase: liveState.game.phase,
              });
            }

            // Compute the last-place finisher for this competition.
            // For LOH: also used by applyMinigameWinner for the third-nominee rule
            // (the worst LOH finisher becomes an eligible third nominee).
            // For POS: needed by adsMiddleware to detect competition_retry eligibility.
            // Note: for feature-managed games (holdTheWall, glassBridge, etc.)
            // the feature thunk has already called applyMinigameWinner with its own lastPlaceId,
            // so the idempotency guard will skip this call.
            const compLastPlaceId = (() => {
              if (partial && humanPlayer?.id && capturedParticipants.includes(humanPlayer.id)) {
                if (import.meta.env.DEV) {
                  console.log('[ads] competition_retry last place forced to human due to early exit', {
                    humanId: humanPlayer.id,
                    capturedGameKey,
                    capturedPrizeType,
                  })
                }
                return humanPlayer.id
              }
              const ranked = computeScores(
                pendingChallenge.game.scoringAdapter,
                rawResults,
                pendingChallenge.game.scoringParams ?? {},
              );
              // ranked is sorted best → worst (highest canonical score first).
              // Reverse to find the last non-winner (worst finisher).
              const lastNonWinner = [...ranked].reverse().find((r) => r.playerId !== finalWinnerId);
              return lastNonWinner?.playerId ?? null;
            })();

            if (partial) {
              dispatch(applyMinigameWinner({ winnerId: finalWinnerId, lastPlaceId: compLastPlaceId, skipSeasonUpdate: true }));
              return;
            }

            const winnerPlayer = game.players.find((p) => p.id === finalWinnerId) ?? null;
            const sourceDomRect = getTileRect(finalWinnerId);

            if (!winnerPlayer || !sourceDomRect) {
              // Defensive fallback: no DOMRect available (headless / test) — commit immediately.
              dispatch(applyMinigameWinner({ winnerId: finalWinnerId, lastPlaceId: compLastPlaceId, skipSeasonUpdate: true }));
              return;
            }
            // Defer the store mutation until after the CeremonyOverlay completes.
            if (import.meta.env.DEV) {
              console.log('[LOH_CROWN] LOH_CROWN_ANIM_STARTED', {
                winnerId: finalWinnerId,
                label: winLabel,
                screen: 'GameScreen',
                storeHohId: liveState.game.lohId,
                phase: liveState.game.phase,
                capturedGameKey,
              });
            } else {
              console.log('LOH_CROWN_ANIM_STARTED', { winnerId: finalWinnerId, label: winLabel, screen: 'GameScreen' })
            }
            const tiles: CeremonyTile[] = [{
              rect: sourceDomRect,
              badge: winSymbol,
              badgeImageSrc: isHohComp ? LOH_BADGE_SRC : undefined,
              badgeStart: 'center',
              badgeLabel: `${winnerPlayer.name} wins ${winLabel}`,
            }];
            pendingWinnerDispatchRef.current = () =>
              dispatch(applyMinigameWinner({ winnerId: finalWinnerId, lastPlaceId: compLastPlaceId, skipSeasonUpdate: true }));
            setPendingWinnerCeremony({
              tiles,
              caption: `${winnerPlayer.name} wins ${winLabel}!`,
              subtitle: winSymbol,
              ariaLabel: `${winnerPlayer.name} wins ${winLabel}`,
              measureA: () => getTileRect(finalWinnerId),
            });
          }}
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
            return [{
              rect: getTileRect(winnerId),
              badge: '👑',
              badgeImageSrc: LOH_BADGE_SRC,
              badgeStart: 'center' as const,
              badgeLabel: `${winnerPlayer?.name ?? winnerId} wins Leader of the House`,
            }]
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
            const sourceId = game.specialVeto?.activeType === 'diamond' ? game.posWinnerId : game.lohId
            const sourceRect = sourceId ? getTileRect(sourceId) : null
            const replacementPlayer = game.players.find((p) => p.id === replacementId)
            const sourceIsDistinct = sourceRect != null && sourceId != null && sourceId !== replacementId
            return [
              ...(sourceIsDistinct
                ? [{
                    rect: sourceRect,
                    glowTone: 'gold' as const,
                  }]
                : []),
              {
                rect: getTileRect(replacementId),
                badge: '❓',
                badgeImageSrc: NOMINATION_BADGE_SRC,
                badgeStart: sourceIsDistinct ? sourceRect : 'center' as const,
                badgeLabel: `${replacementPlayer?.name ?? replacementId} named backup nominee`,
                glowTone: 'danger' as const,
              },
            ]
          }}
          caption="Backup nominee named"
          subtitle={game.specialVeto?.activeType === 'diamond' ? '😇 Halo Exchange names the backup nominee' : '🎯 Nominations are set'}
          onDone={handleAiReplacementDone}
          ariaLabel="Backup nominee ceremony"
        />
      )}

      {showPublicSaveCeremony && pendingPublicSaveResult && (
        <CeremonyOverlay
          tiles={[]}
          layoutSignal={responsiveGameLayout.revision}
          resolveTiles={() => [{
            rect: getTileRect(pendingPublicSaveResult.savedId),
            badge: '❓',
            badgeImageSrc: NOMINATION_BADGE_SRC,
            badgeLabel: `${game.players.find((p) => p.id === pendingPublicSaveResult.savedId)?.name ?? 'A player'} public save extraction`,
            badgeMotion: 'extract' as const,
            glowTone: 'success' as const,
          }]}
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
              <p className="tv-binary-modal__subtitle">
                👑 LOH is breaking the tie&hellip;
              </p>
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
        {twinShockReveal && (
          <TwinShockRevealOverlay
            key={`${twinShockReveal.type}-${twinShockReveal.type === 'combined' ? twinShockReveal.playerId : twinShockReveal.incomingPlayerId}`}
            reveal={twinShockReveal}
            getTileRect={getTileRect}
            onDone={handleTwinShockRevealDone}
          />
        )}
      </AnimatePresence>
      <SurvivorAchievementCelebration />

      {/* ── Back 2 the Game return animation (reverse eviction) ─────────────── */}
      <AnimatePresence>
        {showBattleBackReturn && battleBackReturnPlayer && (
          <SpotlightEvictionOverlay
            key={`${battleBackReturnPlayer.id}-return`}
            evictee={battleBackReturnPlayer}
            contextLabel={`Season ${game.season} · Day ${game.week}`}
            onDone={handleBattleBackReturnDone}
            layoutId={`avatar-tile-${battleBackReturnPlayer.id}`}
            devSkip={import.meta.env.DEV || import.meta.env.CI === 'true'}
            variant="return"
          />
        )}
      </AnimatePresence>

      {/* ── Back 2 the Game / Jury Return twist overlay ──────────────────── */}
      {showBattleBackOverlay && useBattleBackMinigame && (
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

      {/* ── Public's Favorite Player voting overlay ───────────────────────── */}
      {isPublicModeEnabled(game.mode) && showFavoriteVoting && favoritePlayer && (
        <PublicFavoriteOverlay
          candidates={game.players.filter((p) => (favoritePlayer.candidates ?? []).includes(p.id))}
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
            isPostEvictionConfessionalModeRef.current
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
            const requested = showRewarded(
              'eviction_vote_breakdown',
              state,
              dispatch,
              () => unlockVoteBreakdown(),
            )
            if (!requested) {
              unlockVoteBreakdown()
            }
          }}
          onSkip={() => {
            const wasPostEviction = isPostEvictionConfessionalModeRef.current
            postEvictionVoteSnapshotRef.current = null
            isPostEvictionConfessionalModeRef.current = false
            setShowVoteBreakdownPrompt(false)
            setAdPending(false)
            if (!wasPostEviction) {
              proceedAfterVoteResults()
            }
          }}
          pending={adPending}
        />
      )}

      {postEvictionVoteBreakdown && (
        <div className="ad-prompt__backdrop" role="dialog" aria-modal="true" aria-label="Vote Breakdown">
          <div className="ad-prompt__card game-screen__vote-breakdown-card">
            <div className="game-screen__vote-breakdown-header">
              <span className="game-screen__vote-breakdown-eyebrow">Vote Breakdown</span>
              <strong>Who voted for whom</strong>
            </div>
            <div className="game-screen__vote-breakdown-table" role="table" aria-label="Eviction vote breakdown">
              {postEvictionVoteBreakdownRows.map((row) => (
                <div key={row.voterKey} className="game-screen__vote-breakdown-row" role="row">
                  <span className="game-screen__vote-breakdown-cell" role="cell">
                    {row.voterName}
                  </span>
                  <span className="game-screen__vote-breakdown-arrow" aria-hidden="true">→</span>
                  <span className="game-screen__vote-breakdown-cell game-screen__vote-breakdown-cell--target" role="cell">
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
            const requested = showRewarded(
              'social_energy_recharge',
              state,
              dispatch,
              () => {
                // Reward: +3 social energy
                dispatch(setEnergyBankEntry({ playerId: humanPlayer.id, value: 3 }))
                setShowEnergyRechargePrompt(false)
                setAdPending(false)
              },
            )
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
                  }),
                )
                setShowDislikedBoostPrompt(false)
                setAdPending(false)
              },
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
          description={`Watch a short ad to rerun Back 2 the Game before ${(battleBackRetryOfferWinner?.name ?? 'the winner')} returns. Retries left: ${BATTLE_BACK_RETRY_LIMIT - battleBackRetryCount}.`}
          watchLabel="Watch Ad to Replay Back 2 the Game"
          skipLabel="Continue"
          onWatch={() => {
            if (adPending) return
            setAdPending(true)
            const restartBattleBack = () => {
              setBattleBackRetryOfferWinnerId(null)
              setBattleBackRetryCount((current) => current + 1)
              setBattleBackAttemptIndex((current) => current + 1)
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
              { isFinal3Week },
            )
            if (!requested) {
              setAdPending(false)
            }
          }}
          onSkip={() => {
            const winnerId = battleBackRetryOfferWinnerId
            setBattleBackRetryOfferWinnerId(null)
            finalizeBattleBackOutcome(winnerId)
          }}
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

      {/* ── Debug: trigger nomination animation ───────────────────────────── */}
      {!awaitingHumanDecision && (
        <button
          className="dev-nom-anim-btn"
          onClick={handleDevPlayNomAnim}
          type="button"
          aria-label="Debug: Play Nomination Animation"
        >
          🎬 Debug: Play Nomination Animation
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
      />
      {previewPlayer && <HouseguestInfoDialog player={previewPlayer} onClose={() => setPreviewPlayer(null)} />}
    </div>
    </LayoutGroup>
  )
}
