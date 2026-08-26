import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'react-redux'
import {
  advance,
  awardFavoritePrize,
  commitPublicSave,
  completeBattleBack,
  completeTwinShockRevealAnimation,
  confirmDayStartShock,
  dismissBattleBack,
  dismissDemocraciaResultDisplay,
  expireMissionReward,
  openBattleBackCompetition,
  openFavoritePlayerVoting,
  resolveDemocraciaPublicBreaker,
  resolveFavoritePlayerWinner,
  resumeAfterPublicFavorite,
  tryActivateDayStartShock,
  tryActivateDemocracia,
  tryActivateDoubleEviction,
  tryActivatePendingForcedDayStartShock,
  tryActivatePendingForcedDemocracia,
  tryActivatePendingForcedDoubleEviction,
  tryActivatePendingForcedSpecialVeto,
  tryActivateSecretMission,
  tryActivateSpecialVeto,
} from '../../../store/gameSlice'
import type { AppDispatch, RootState } from '../../../store/store'
import type { Announcement } from '../../../components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'
import type { SpectatorVariant } from '../../../components/ui/SpectatorView'
import type { Player } from '../../../types'
import type { PlayerPublicProfile } from '../../../publicOpinion/types'
import { resolvePublicSaveNominee } from '../../../publicOpinion/PublicSaveService'
import { isPublicModeEnabled } from '../../../modes/gameModes'
import { simulateBattleBackCompetition } from '../../../features/twists/battleBackCompetition'
import {
  getCompetitionSeasonState,
  getDefaultCompetitionProfile,
  getMinigameAiModel,
  simulateMinigameAiScore,
} from '../../../ai/competition'
import { mulberry32 } from '../../../store/rng'
import {
  expandCupidIds,
  getCupidPartnerId,
  isCupidArrowActive,
} from '../../../features/twists/cupidArrow'
import { isBattleBackReplayEligible, shouldUseBattleBackMinigame } from '../battleBackFlow'
import { usePersistedGameScreenKey } from '../gameScreenPersistence'

const PUBLIC_SAVE_RESULT_DELAY_MS = 5000
const EMPTY_PLAYER_IDS: string[] = []
export const BATTLE_BACK_RETRY_LIMIT = 3

function formatPlayerNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

export interface PendingPublicSaveResult {
  savedId: string
  supportPercent?: number
}

interface UseTwistFlowOptions {
  game: RootState['game']
  alivePlayers: Player[]
  humanPlayer: Player | undefined
  publicOpinionProfiles: Record<string, PlayerPublicProfile>
  dispatch: AppDispatch
}

/**
 * Owns cross-week twist activation and presentation state. The reducers remain
 * authoritative; this hook coordinates phase-entry triggers, public-save and
 * Democracia presentation, Back 2 the Game, Twin Shock, and Public Favorite.
 */
export function useTwistFlow({
  game,
  alivePlayers,
  humanPlayer,
  publicOpinionProfiles,
  dispatch,
}: UseTwistFlowOptions) {
  const store = useStore<RootState>()

  // ── Twin Shock reveal choreography ───────────────────────────────────────
  const twinShockReveal = game.twinShock?.pendingRevealAnimation ?? null
  const twinShockSequenceKey = twinShockReveal
    ? `${game.season}-${game.week}-${twinShockReveal.type}-${twinShockReveal.type === 'combined' ? twinShockReveal.playerId : twinShockReveal.incomingPlayerId}`
    : null
  const [completedTwinShockIntroKey, setCompletedTwinShockIntroKey] = useState<string | null>(null)
  const handleTwinShockIntroDone = useCallback(() => {
    if (twinShockSequenceKey) setCompletedTwinShockIntroKey(twinShockSequenceKey)
  }, [twinShockSequenceKey])
  const handleTwinShockRevealDone = useCallback(() => {
    dispatch(completeTwinShockRevealAnimation())
  }, [dispatch])

  // ── Twist activation on canonical phase boundaries ──────────────────────
  const doubleEvictionActivationKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (game.phase !== 'nominations') return
    const activationKey = `${game.week}:${game.pendingForcedShock?.type ?? 'none'}:${game.pendingForcedShock?.earliestWeek ?? 'none'}`
    if (doubleEvictionActivationKeyRef.current === activationKey) return
    doubleEvictionActivationKeyRef.current = activationKey
    if (dispatch(tryActivatePendingForcedDoubleEviction())) return
    dispatch(tryActivateDoubleEviction())
  }, [
    game.phase,
    game.week,
    game.pendingForcedShock?.type,
    game.pendingForcedShock?.earliestWeek,
    dispatch,
  ])

  const specialVetoActivationKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (game.phase !== 'pos_results') return
    const activationKey = `${game.week}:${game.pendingForcedShock?.type ?? 'none'}:${game.pendingForcedShock?.earliestWeek ?? 'none'}`
    if (specialVetoActivationKeyRef.current === activationKey) return
    specialVetoActivationKeyRef.current = activationKey
    if (dispatch(tryActivatePendingForcedSpecialVeto())) return
    dispatch(tryActivateSpecialVeto())
  }, [
    game.phase,
    game.week,
    game.pendingForcedShock?.type,
    game.pendingForcedShock?.earliestWeek,
    dispatch,
  ])

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

  const democraciaActivationKeyRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (game.phase !== 'loh_comp_announcement') return
    const activationKey = `${game.week}:${game.pendingForcedShock?.type ?? 'none'}:${game.pendingForcedShock?.earliestWeek ?? 'none'}`
    if (democraciaActivationKeyRef.current === activationKey) return
    democraciaActivationKeyRef.current = activationKey
    if (dispatch(tryActivatePendingForcedDemocracia())) return
    dispatch(tryActivateDemocracia())
  }, [
    game.phase,
    game.week,
    game.pendingForcedShock?.type,
    game.pendingForcedShock?.earliestWeek,
    dispatch,
  ])

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
        console.warn('[democracia] public tie-break resolver returned no winner', { candidateIds })
      }
      return
    }
    dispatch(resolveDemocraciaPublicBreaker({ winnerId }))
  }, [
    game.democracia?.awaitingPublicBreaker,
    game.democracia?.candidateIds,
    publicOpinionProfiles,
    dispatch,
  ])

  const democraciaAwaitingVoteRef = useRef(Boolean(game.democracia?.awaitingHumanVote))
  useEffect(() => {
    const wasAwaitingVote = democraciaAwaitingVoteRef.current
    const isAwaitingVote = Boolean(game.democracia?.awaitingHumanVote)
    democraciaAwaitingVoteRef.current = isAwaitingVote
    if (game.phase !== 'democracia_vote') return
    if (!wasAwaitingVote || isAwaitingVote) return
    dispatch(advance())
  }, [dispatch, game.democracia?.awaitingHumanVote, game.phase])

  const final4ExpiryFiredRef = useRef<number | null>(null)
  useEffect(() => {
    if (game.phase !== 'final4_eviction') return
    if (final4ExpiryFiredRef.current === game.seed) return
    final4ExpiryFiredRef.current = game.seed
    dispatch(expireMissionReward())
  }, [game.phase, game.seed, dispatch])

  // ── Pre-veto public save ─────────────────────────────────────────────────
  const [pendingPublicSaveResult, setPendingPublicSaveResult] =
    useState<PendingPublicSaveResult | null>(null)
  const [publicSaveCeremonyConsumedKey, setPublicSaveCeremonyConsumedKey] =
    usePersistedGameScreenKey('public-save-ceremony', `${game.gameId}:${game.season}`)

  const showPublicSaveReveal =
    isPublicModeEnabled(game.mode) &&
    game.phase === 'pre_veto_public_save' &&
    Boolean(game.awaitingPublicSave) &&
    game.nomineeIds.length === (isCupidArrowActive(game) ? 6 : 3) &&
    !pendingPublicSaveResult

  const publicSaveApprovals = useMemo(() => {
    const out: Record<string, number> = {}
    game.nomineeIds.forEach((id) => {
      const partnerId = getCupidPartnerId(game, id)
      const ownApproval = publicOpinionProfiles[id]?.approval ?? 50
      const partnerApproval = partnerId
        ? (publicOpinionProfiles[partnerId]?.approval ?? 50)
        : ownApproval
      out[id] = Math.round((ownApproval + partnerApproval) / 2)
    })
    return out
  }, [game, publicOpinionProfiles])

  const pairAdjustedPublicProfiles = useMemo(() => {
    if (!isCupidArrowActive(game)) return publicOpinionProfiles
    const adjusted = { ...publicOpinionProfiles }
    game.nomineeIds.forEach((id) => {
      const base = publicOpinionProfiles[id]
      adjusted[id] = {
        playerId: id,
        approval: publicSaveApprovals[id] ?? 50,
        previousApproval: base?.previousApproval ?? publicSaveApprovals[id] ?? 50,
        seasonApprovals: base?.seasonApprovals ?? [],
        completedDirectionCount: base?.completedDirectionCount ?? 0,
        cumulativePositiveDelta: base?.cumulativePositiveDelta ?? 0,
      }
    })
    return adjusted
  }, [game, publicOpinionProfiles, publicSaveApprovals])

  const publicSaveResolution = useMemo(() => {
    if (!showPublicSaveReveal) return null
    return resolvePublicSaveNominee({
      nomineeIds: game.nomineeIds,
      profiles: pairAdjustedPublicProfiles,
    })
  }, [showPublicSaveReveal, game.nomineeIds, pairAdjustedPublicProfiles])
  const publicSaveWinnerId = publicSaveResolution?.savedId || null

  const publicSaveResultAnnouncement = useMemo<Announcement | null>(() => {
    if (!pendingPublicSaveResult) return null
    const savedPlayer = game.players.find((player) => player.id === pendingPublicSaveResult.savedId)
    if (!savedPlayer) return null
    const savedIds = new Set(expandCupidIds(game, [pendingPublicSaveResult.savedId]))
    const savedNames = [...savedIds]
      .map((id) => game.players.find((player) => player.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    const remainingNomineeNames = game.nomineeIds
      .filter((id) => !savedIds.has(id))
      .map((id) => game.players.find((player) => player.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    const savedLabel = savedNames.join(' and ') || savedPlayer.name
    const subtitle = `${savedLabel} ${savedNames.length > 1 ? 'were' : 'was'} saved${
      pendingPublicSaveResult.supportPercent != null
        ? ` with ${Math.round(pendingPublicSaveResult.supportPercent)}% of the public support`
        : ' by the public'
    }. ${formatPlayerNames(remainingNomineeNames)} are still in danger.`
    return {
      key: 'public_save_result',
      title: 'Public Save Result',
      subtitle,
      isLive: true,
      autoDismissMs: PUBLIC_SAVE_RESULT_DELAY_MS,
    }
  }, [game, pendingPublicSaveResult])

  const publicSaveCeremonyKey = pendingPublicSaveResult
    ? `w${game.week}-public-save-${pendingPublicSaveResult.savedId}`
    : ''
  const showPublicSaveCeremony =
    isPublicModeEnabled(game.mode) &&
    publicSaveCeremonyKey !== '' &&
    publicSaveCeremonyKey !== publicSaveCeremonyConsumedKey

  const handlePublicSaveDone = useCallback(() => {
    if (!publicSaveWinnerId) return
    const savedUnitIds = expandCupidIds(game, [publicSaveWinnerId])
    const supportPercent = savedUnitIds.reduce(
      (sum, id) => sum + (publicSaveResolution?.voteShareByPlayerId[id] ?? 0),
      0
    )
    setPendingPublicSaveResult({
      savedId: publicSaveWinnerId,
      supportPercent,
    })
  }, [game, publicSaveResolution, publicSaveWinnerId])

  const handlePublicSaveResultDismiss = useCallback(() => {
    if (!pendingPublicSaveResult) return
    dispatch(commitPublicSave({ savedId: pendingPublicSaveResult.savedId }))
    setPendingPublicSaveResult(null)
  }, [dispatch, pendingPublicSaveResult])

  const handlePublicSaveCeremonyDone = useCallback(() => {
    if (!publicSaveCeremonyKey) return
    setPublicSaveCeremonyConsumedKey(publicSaveCeremonyKey)
  }, [publicSaveCeremonyKey, setPublicSaveCeremonyConsumedKey])

  const publicSaveNominees = useMemo(
    () =>
      game.nomineeIds
        .map((id) => game.players.find((player) => player.id === id))
        .filter((player): player is Player => player != null),
    [game.nomineeIds, game.players]
  )

  // ── Democracia presentation ─────────────────────────────────────────────
  const showDemocraciaVoteModal =
    game.phase === 'democracia_vote' &&
    Boolean(game.democracia?.awaitingHumanVote) &&
    !game.democracia?.resultDisplay &&
    humanPlayer != null &&
    Boolean(game.democracia?.eligibleVoterIds?.includes(humanPlayer.id))
  const democraciaVoteOptions = alivePlayers.filter(
    (player) =>
      (game.democracia?.candidateIds ?? []).includes(player.id) && player.id !== humanPlayer?.id
  )

  const democraciaResultDisplay = game.democracia?.resultDisplay ?? null
  const showDemocraciaResults = democraciaResultDisplay !== null
  const democraciaResultsParticipants = useMemo(
    () =>
      (democraciaResultDisplay?.participantIds ?? [])
        .map((id) => {
          const player = game.players.find((entry) => entry.id === id)
          if (!player) return null
          return {
            player,
            voteCount: democraciaResultDisplay?.voteCountsByCandidateId[id] ?? 0,
          }
        })
        .filter((entry): entry is { player: Player; voteCount: number } => entry !== null),
    [democraciaResultDisplay, game.players]
  )
  const handleDemocraciaResultsDone = useCallback(() => {
    dispatch(dismissDemocraciaResultDisplay())
    if (game.phase === 'democracia_results') dispatch(advance())
  }, [dispatch, game.phase])

  // ── Day-start shock ──────────────────────────────────────────────────────
  const handleDayStartShockConfirm = useCallback(() => {
    dispatch(confirmDayStartShock())
  }, [dispatch])
  const dayStartShock = game.dayStartShock
  const dayStartShockPlayer = useMemo(() => {
    if (!dayStartShock) return null
    return game.players.find((player) => player.id === dayStartShock.targetId) ?? null
  }, [dayStartShock, game.players])

  // ── Back 2 the Game ──────────────────────────────────────────────────────
  const battleBack = game.battleBack
  const battleBackActive = battleBack?.active === true
  const battleBackCompetitionActive = battleBack?.competitionActive === true
  const battleBackConfiguredCandidateIds = battleBack?.candidates ?? EMPTY_PLAYER_IDS
  const battleBackSessionKey = battleBackActive
    ? `${game.gameId}:${battleBack?.weekDecided ?? game.week}:${battleBackConfiguredCandidateIds.join(',')}`
    : 'inactive'
  const [battleBackReturnId, setBattleBackReturnId] = useState<string | null>(null)
  const [storedBattleBackUi, setStoredBattleBackUi] = useState<{
    sessionKey: string
    attemptIndex: number
    retryCount: number
    retryOfferWinnerId: string | null
  }>(() => ({
    sessionKey: battleBackSessionKey,
    attemptIndex: 0,
    retryCount: 0,
    retryOfferWinnerId: null,
  }))
  const defaultBattleBackUi = useMemo(
    () => ({
      sessionKey: battleBackSessionKey,
      attemptIndex: 0,
      retryCount: 0,
      retryOfferWinnerId: null as string | null,
    }),
    [battleBackSessionKey]
  )
  const battleBackUi =
    storedBattleBackUi.sessionKey === battleBackSessionKey
      ? storedBattleBackUi
      : defaultBattleBackUi
  const updateBattleBackUi = useCallback(
    (
      update: (current: {
        attemptIndex: number
        retryCount: number
        retryOfferWinnerId: string | null
      }) => {
        attemptIndex: number
        retryCount: number
        retryOfferWinnerId: string | null
      }
    ) => {
      setStoredBattleBackUi((stored) => {
        const current = stored.sessionKey === battleBackSessionKey ? stored : defaultBattleBackUi
        return { sessionKey: battleBackSessionKey, ...update(current) }
      })
    },
    [battleBackSessionKey, defaultBattleBackUi]
  )
  const battleBackAttemptIndex = battleBackUi.attemptIndex
  const battleBackRetryCount = battleBackUi.retryCount
  const battleBackRetryOfferWinnerId = battleBackUi.retryOfferWinnerId

  const showBattleBack = battleBackActive && battleBackCompetitionActive
  const battleBackAttemptSeed = useMemo(
    () => (game.seed + Math.imul(battleBackAttemptIndex, 0x9e3779b1)) >>> 0,
    [battleBackAttemptIndex, game.seed]
  )
  const battleBackCandidates = useMemo(
    () =>
      battleBack?.active
        ? game.players.filter(
            (player) =>
              (battleBack?.candidates ?? []).includes(player.id) &&
              (player.status === 'jury' || player.status === 'evicted')
          )
        : [],
    [battleBack?.active, battleBack?.candidates, game.players]
  )
  const battleBackCandidateIds = useMemo(
    () => battleBackCandidates.map((player) => player.id),
    [battleBackCandidates]
  )
  const humanBattleBackCandidateId = useMemo(() => {
    if (!humanPlayer?.id) return null
    return battleBackCandidateIds.includes(humanPlayer.id) ? humanPlayer.id : null
  }, [battleBackCandidateIds, humanPlayer])
  const useBattleBackMinigame = useMemo(
    () => shouldUseBattleBackMinigame(humanBattleBackCandidateId, battleBackCandidateIds),
    [battleBackCandidateIds, humanBattleBackCandidateId]
  )
  const capitalizationAiModel = useMemo(() => getMinigameAiModel('capitalization'), [])
  const battleBackCapitalizationParticipants = useMemo(
    () =>
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
              seasonState: getCompetitionSeasonState(
                game.competitionSeasonStateByPlayerId,
                player.id
              ),
            }),
        previousPR: player.stats?.gamePRs?.capitalization ?? null,
      })),
    [
      battleBackAttemptSeed,
      battleBackCandidates,
      capitalizationAiModel,
      game.competitionSeasonStateByPlayerId,
    ]
  )
  const showBattleBackOverlay =
    showBattleBack && battleBackCandidates.length > 0 && !battleBackRetryOfferWinnerId

  const battleBackWinnerId = useMemo(() => {
    if (!showBattleBackOverlay || useBattleBackMinigame || battleBackCandidates.length === 0) {
      return undefined
    }
    return simulateBattleBackCompetition(battleBackCandidateIds, battleBackAttemptSeed).winnerId
  }, [
    battleBackAttemptSeed,
    battleBackCandidateIds,
    battleBackCandidates.length,
    showBattleBackOverlay,
    useBattleBackMinigame,
  ])

  const battleBackRetryOfferWinner = useMemo(
    () =>
      battleBackRetryOfferWinnerId
        ? (game.players.find((player) => player.id === battleBackRetryOfferWinnerId) ?? null)
        : null,
    [battleBackRetryOfferWinnerId, game.players]
  )
  const showBattleBackReturn = battleBackReturnId !== null
  const battleBackVariant = useMemo((): SpectatorVariant => {
    const variants: SpectatorVariant[] = ['holdwall', 'trivia', 'maze']
    const rng = mulberry32((battleBackAttemptSeed ^ 0xdeadbeef) >>> 0)
    return variants[Math.floor(rng() * variants.length)]
  }, [battleBackAttemptSeed])

  const handleBattleBackAnnouncementPlay = useCallback(() => {
    if (!battleBackActive || battleBackCompetitionActive) return
    // The fullscreen shock already explains the return and its rules. Do not
    // stack a second, third, and fourth announcement before the showdown.
    dispatch(openBattleBackCompetition())
  }, [battleBackActive, battleBackCompetitionActive, dispatch])

  useEffect(() => {
    if (!battleBackActive || battleBackCompetitionActive) return
    window.addEventListener('ui:playPressed', handleBattleBackAnnouncementPlay)
    return () => window.removeEventListener('ui:playPressed', handleBattleBackAnnouncementPlay)
  }, [battleBackActive, battleBackCompetitionActive, handleBattleBackAnnouncementPlay])

  useEffect(() => {
    if (!battleBackActive) return
    if (battleBackCandidates.length > 0) return
    dispatch(dismissBattleBack())
    dispatch(advance())
  }, [battleBackActive, battleBackCandidates.length, dispatch])

  const finalizeBattleBackOutcome = useCallback(
    (winnerId?: string | null) => {
      if (!winnerId) {
        dispatch(dismissBattleBack())
        dispatch(advance())
        return
      }
      dispatch(completeBattleBack(winnerId))
      const updatedBattleBack = store.getState().game.battleBack
      if (updatedBattleBack?.active === false && updatedBattleBack.winnerId === winnerId) {
        setBattleBackReturnId(winnerId)
        return
      }
      dispatch(dismissBattleBack())
      dispatch(advance())
    },
    [dispatch, store]
  )

  const handleBattleBackComplete = useCallback(
    (winnerId?: string | null) => {
      const resolvedWinnerId = winnerId ?? battleBackWinnerId
      if (!resolvedWinnerId) {
        finalizeBattleBackOutcome()
        return
      }
      const canReplayBattleBack = isBattleBackReplayEligible(
        resolvedWinnerId,
        humanPlayer?.id ?? null,
        battleBackConfiguredCandidateIds,
        battleBackRetryCount,
        BATTLE_BACK_RETRY_LIMIT
      )
      if (canReplayBattleBack) {
        updateBattleBackUi((current) => ({ ...current, retryOfferWinnerId: resolvedWinnerId }))
        return
      }
      finalizeBattleBackOutcome(resolvedWinnerId)
    },
    [
      battleBackConfiguredCandidateIds,
      battleBackRetryCount,
      battleBackWinnerId,
      finalizeBattleBackOutcome,
      humanPlayer,
      updateBattleBackUi,
    ]
  )

  const handleBattleBackRetryGranted = useCallback(() => {
    updateBattleBackUi((current) => ({
      attemptIndex: current.attemptIndex + 1,
      retryCount: current.retryCount + 1,
      retryOfferWinnerId: null,
    }))
  }, [updateBattleBackUi])

  const handleBattleBackRetryDeclined = useCallback(() => {
    const winnerId = battleBackRetryOfferWinnerId
    updateBattleBackUi((current) => ({ ...current, retryOfferWinnerId: null }))
    finalizeBattleBackOutcome(winnerId)
  }, [battleBackRetryOfferWinnerId, finalizeBattleBackOutcome, updateBattleBackUi])

  const handleBattleBackReturnDone = useCallback(() => {
    setBattleBackReturnId(null)
    dispatch(advance())
  }, [dispatch])

  // ── Public Favorite ──────────────────────────────────────────────────────
  const favoritePlayer = game.favoritePlayer
  const showFavoriteVoting =
    favoritePlayer?.active === true && favoritePlayer.votingStarted === true
  useEffect(() => {
    if (!favoritePlayer?.active || favoritePlayer.votingStarted) return
    const id = window.setTimeout(() => dispatch(openFavoritePlayerVoting()), 5000)
    return () => window.clearTimeout(id)
  }, [dispatch, favoritePlayer?.active, favoritePlayer?.votingStarted])

  const handleFavoriteComplete = useCallback(
    (winnerId: string) => {
      dispatch(resolveFavoritePlayerWinner(winnerId))
      dispatch(awardFavoritePrize())
      dispatch(resumeAfterPublicFavorite({ winnerId }))
    },
    [dispatch]
  )

  return {
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
  }
}
