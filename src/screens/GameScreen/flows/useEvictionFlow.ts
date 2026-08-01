import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  activateVoteDeductionReward,
  addTvEvent,
  advance,
  declineVoteDeduction,
  dismissVoteResults,
  finalizePendingEviction,
  setEvictionOverlay,
  submitDoubleEvictionTieBreak,
  tryActivateBattleBack,
  tryActivatePendingForcedBattleBack,
} from '../../../store/gameSlice'
import type { AppDispatch, RootState } from '../../../store/store'
import type { Announcement } from '../../../components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'
import type { Phase, Player } from '../../../types'
import type { PlayerPublicProfile } from '../../../publicOpinion/types'
import type { Final4Stage } from './useEndgameFlow'
import {
  buildDoubleEvictionTieResolutionMessage,
  calculateRequiredDoubleEvictionSlots,
  formatDoubleEvictionNameList,
} from '../../../features/twists/doubleEvictionTieUtils'
import { rankPublicEvictionTieNominees } from '../../../publicOpinion/PublicEvictionTieService'
import { mulberry32 } from '../../../store/rng'
import { getOutcomeVisibleEvicteeIds, hasUnresolvedTopVoteTie } from '../evictionTieVisuals'
import {
  buildEvictionVoteBreakdownPlayerNamesById,
  buildEvictionVoteBreakdownRows,
  isEvictionVoteBreakdownActive,
  loadEvictionVoteBreakdownUnlock,
  saveEvictionVoteBreakdownUnlock,
} from '../../../features/evictionVoteBreakdownStorage'
import {
  expandCupidIds,
  getCupidPair,
  getCupidPartnerId,
  isCupidArrowActive,
} from '../../../features/twists/cupidArrow'

export const POST_VOTE_ANNOUNCEMENT_MS = 3600
export const POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS = 400
const AI_TIE_STAGE_DELAY_MS = 3000
const AI_TIE_DECIDING_DELAY_MS = 3000
const AI_TIE_DECISION_DELAY_MS = 3000
const AI_TIE_RESULT_DELAY_MS = 3000

type AiTiebreakStage = 'tie' | 'deciding' | 'decision' | 'result'

export type VoteBreakdownSnapshot = {
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
    ? (players.find((player) => player.id === pendingSecondEvictionId) ?? null)
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
    return { title: 'Double Elimination Results', subtitle: goodbyes }
  }

  const tiedNames = tiedBoundaryIds
    .map((id) => players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))

  if (guaranteedIds.length > 0) {
    return {
      title: 'Double Elimination Results',
      subtitle: `${firstEvictee.name} is the first player eliminated tonight. ${buildDoubleEvictionTieResolutionMessage(
        {
          deciderName: lohName,
          tiedNames,
          selectedNames: [secondEvictee.name],
          publicModeEnabled,
          secondEvictionOnly: true,
        }
      )} ${goodbyes}`,
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

interface UseEvictionFlowOptions {
  game: RootState['game']
  humanPlayerEliminated: boolean
  humanIsHoH: boolean
  final4Stage: Final4Stage
  setFinal4Stage: Dispatch<SetStateAction<Final4Stage>>
  publicOpinionProfiles: Record<string, PlayerPublicProfile>
  isMountedRef: MutableRefObject<boolean>
  setAdPending: Dispatch<SetStateAction<boolean>>
  dispatch: AppDispatch
}

/**
 * Owns eviction results, vote-breakdown offers, tie choreography, and the
 * pending-eviction cinematic hand-off. Game reducers remain authoritative.
 */
export function useEvictionFlow({
  game,
  humanPlayerEliminated,
  humanIsHoH,
  final4Stage,
  setFinal4Stage,
  publicOpinionProfiles,
  isMountedRef,
  setAdPending,
  dispatch,
}: UseEvictionFlowOptions) {
  const [showVoteBreakdownPrompt, setShowVoteBreakdownPrompt] = useState(false)
  const [voteBreakdownPromptIsPostEviction, setVoteBreakdownPromptIsPostEviction] = useState(false)
  const [postEvictionVoteBreakdown, setPostEvictionVoteBreakdown] =
    useState<VoteBreakdownSnapshot | null>(null)
  const [postVoteAnnouncement, setPostVoteAnnouncement] = useState<Announcement | null>(null)
  const [aiTiebreakStage, setAiTiebreakStage] = useState<AiTiebreakStage | null>(null)
  const [activeAiTiebreakContext, setActiveAiTiebreakContext] = useState<AiTiebreakContext | null>(
    null
  )
  const isPostEvictionConfessionalModeRef = useRef(false)
  const postEvictionVoteSnapshotRef = useRef<VoteBreakdownSnapshot | null>(null)
  const autoRevealOwnEvictionVotesRef = useRef(false)
  const postEvictionVoteBreakdownPromptTimerRef = useRef<ReturnType<
    typeof window.setTimeout
  > | null>(null)

  useEffect(() => {
    return () => {
      if (postEvictionVoteBreakdownPromptTimerRef.current != null) {
        window.clearTimeout(postEvictionVoteBreakdownPromptTimerRef.current)
        postEvictionVoteBreakdownPromptTimerRef.current = null
      }
    }
  }, [])

  // ── Vote Results Popup ────────────────────────────────────────────────────
  // Show vote results whenever they are available, including during a tie-break
  // wait so the house votes are always revealed before the LOH is prompted.
  const showVoteResults = Boolean(game.voteResults)
  const voteResultsTallies = (() => {
    if (!showVoteResults || !game.voteResults) return []
    const resultIds = Object.keys(game.voteResults)
    const seenUnits = new Set<string>()
    return resultIds.flatMap((id) => {
      const nominee = game.players.find((player) => player.id === id)
      if (!nominee) return []
      const pair = getCupidPair(game, id)
      const unitId = isCupidArrowActive(game) && pair ? pair.id : `solo:${id}`
      if (seenUnits.has(unitId)) return []
      seenUnits.add(unitId)
      const partnerId = isCupidArrowActive(game)
        ? pair?.memberIds.find((memberId) => memberId !== id)
        : null
      return [
        {
          nominee,
          partner: partnerId ? game.players.find((player) => player.id === partnerId) : undefined,
          pairColor: pair?.color,
          voteCount: game.voteResults![id] ?? 0,
        },
      ]
    })
  })()
  const voteResultsEvicteeIds = useMemo(
    () =>
      getOutcomeVisibleEvicteeIds({
        voteResults: game.voteResults,
        pendingEvictionId: game.pendingEviction?.evicteeId,
        pendingSecondEvictionId: game.doubleEviction?.pendingSecondEviction?.evicteeId,
      }),
    [
      game.doubleEviction?.pendingSecondEviction?.evicteeId,
      game.pendingEviction?.evicteeId,
      game.voteResults,
    ]
  )
  // After dismissing vote results: show the eviction splash if one is pending,
  // otherwise advance the game phase directly.
  // When a tie-break is still pending (awaitingTieBreak), do not advance — the
  // tie-break modal will appear once voteResults has been cleared.
  // PR 3: when a voteDeduction prompt is pending, show the offer first and
  // only dismiss results after the player decides.
  const [showVoteDeductionOffer, setShowVoteDeductionOffer] = useState(false)
  const [resumeVoteResultsAfterDeduction, setResumeVoteResultsAfterDeduction] = useState(false)
  const canOfferVoteBreakdown = useMemo(
    () =>
      game.phase === 'eviction_results' &&
      Boolean(game.pendingEviction?.evicteeId) &&
      Object.keys(game.votes ?? {}).length > 0,
    [game.pendingEviction?.evicteeId, game.phase, game.votes]
  )

  const hasActiveVoteBreakdownUnlock = useCallback(() => {
    const unlock = loadEvictionVoteBreakdownUnlock()
    return isEvictionVoteBreakdownActive(unlock, game.week, game.phase)
  }, [game.phase, game.week])

  const queueVoteBreakdownPrompt = useCallback(() => {
    if (!canOfferVoteBreakdown || hasActiveVoteBreakdownUnlock()) return false
    setVoteBreakdownPromptIsPostEviction(false)
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

    // When there is a clear evictee, use one continuous broadcast sequence:
    //   1. Dismiss the tally reveal while the verdict announcement takes over.
    //   2. Hold the verdict briefly so the names and vote count can be read.
    //   3. Hand directly to the eviction cinematic with no second empty pause.
    //   4. Offer the Confessional vote breakdown after the cinematic when eligible.
    const evicteeId = game.pendingEviction?.evicteeId
    const evictee = evicteeId ? (game.players.find((p) => p.id === evicteeId) ?? null) : null
    if (evictee && game.pendingEviction) {
      // Decide whether to offer the confessional breakdown after the animation.
      if (canOfferVoteBreakdown && !hasActiveVoteBreakdownUnlock()) {
        isPostEvictionConfessionalModeRef.current = true
        autoRevealOwnEvictionVotesRef.current = evictee.isUser === true
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
        if (game.voteResultsMode === 'public') {
          const secondEvictee = secondPendingEvictionId
            ? game.players.find((player) => player.id === secondPendingEvictionId)
            : null
          if (game.doubleEviction?.weekActive && secondEvictee) {
            const secondPercent = game.voteResults?.[secondEvictee.id] ?? 0
            return {
              title: 'DOUBLE ELIMINATION RESULT',
              subtitle: `${evictee.name} (${evicteeVotes.toFixed(1)}%) and ${secondEvictee.name} (${secondPercent.toFixed(1)}%) received the two highest audience totals and are eliminated tonight.`,
            }
          }
          const isFinalThree = game.voxPopuli?.publicVoteContext === 'final3'
          return {
            title: isFinalThree
              ? 'THE PUBLIC HAS CHOSEN THE FINAL 2'
              : `${evicteeVotes.toFixed(1)}% OF THE PUBLIC VOTE`,
            subtitle: isFinalThree
              ? `With ${evicteeVotes.toFixed(1)}% of the vote to eliminate, ${evictee.name} finishes in third place. The house lights now belong to the Final 2.`
              : `${evictee.name}, the audience has decided that you must leave The Big Eye house.`,
          }
        }
        const evicteeUnitIds = expandCupidIds(game, [evictee.id])
        const evicteeNames = evicteeUnitIds
          .map((id) => game.players.find((player) => player.id === id)?.name)
          .filter(Boolean)
          .join(' and ')
        const hasTwoNominees = Object.keys(game.voteResults ?? {}).length === 2
        const otherVotes = Object.entries(game.voteResults ?? {}).reduce(
          (s, [id, count]) => (id !== evictee.id ? s + count : s),
          0
        )
        return {
          title: hasTwoNominees
            ? `By a vote of ${evicteeVotes} to ${otherVotes}`
            : `With ${evicteeVotes} vote${evicteeVotes === 1 ? '' : 's'}`,
          subtitle: isCupidArrowActive(game)
            ? `${evicteeNames || evictee.name}, Cupid's Arrow means you leave the house together.`
            : `${evictee.name}, please say your goodbyes and leave through the Confessional's special exit.`,
        }
      })()
      const voteAnnouncement =
        game.voteResultsMode !== 'public' &&
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
      setPostVoteAnnouncement({
        key:
          game.voteResultsMode === 'public' &&
          game.voxPopuli?.publicVoteContext === 'final3'
            ? 'vox_final_three_verdict'
            : 'eviction_vote_result',
        title: voteAnnouncement.title,
        subtitle: voteAnnouncement.subtitle,
        isLive: true,
        autoDismissMs:
          game.voteResultsMode === 'public' &&
          game.voxPopuli?.publicVoteContext === 'final3'
            ? null
            : POST_VOTE_ANNOUNCEMENT_MS,
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
    game,
    hasActiveVoteBreakdownUnlock,
    proceedAfterVoteResults,
    queueVoteBreakdownPrompt,
  ])

  const handlePostVoteAnnouncementDismiss = useCallback(() => {
    setPostVoteAnnouncement(null)
  }, [])

  const handleVoteDeductionAccept = useCallback(() => {
    setShowVoteDeductionOffer(false)
    dispatch(activateVoteDeductionReward())
    setResumeVoteResultsAfterDeduction(true)
  }, [dispatch])

  const handleVoteDeductionDecline = useCallback(() => {
    setShowVoteDeductionOffer(false)
    dispatch(declineVoteDeduction())
    setResumeVoteResultsAfterDeduction(true)
  }, [dispatch])

  useEffect(() => {
    if (!resumeVoteResultsAfterDeduction || game.awaitingVoteDeductionPrompt) return
    const timeoutId = window.setTimeout(() => {
      setResumeVoteResultsAfterDeduction(false)
      handleVoteResultsDone()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [game.awaitingVoteDeductionPrompt, handleVoteResultsDone, resumeVoteResultsAfterDeduction])

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
    Object.entries(snapshot.votes).forEach(([voterId, targetId]) => {
      const voterName = game.players.find((player) => player.id === voterId)?.name ?? voterId
      const targetName = game.players.find((player) => player.id === targetId)?.name ?? targetId
      dispatch(
        addTvEvent({
          text: `${voterName} voted to eliminate ${targetName}.`,
          type: 'vote',
          source: 'system',
          channels: ['mainLog'],
        })
      )
    })
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
      dispatch(
        addTvEvent({
          text: 'Go to the Confessional before the day is over.',
          type: 'game',
        })
      )
    }
    postEvictionVoteSnapshotRef.current = null
    isPostEvictionConfessionalModeRef.current = false
    setVoteBreakdownPromptIsPostEviction(false)
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
    game.players,
    game.votes,
    game.week,
    humanPlayerEliminated,
    proceedAfterVoteResults,
    setAdPending,
  ])

  const handleVoteBreakdownSkip = useCallback(() => {
    const wasPostEviction = isPostEvictionConfessionalModeRef.current
    postEvictionVoteSnapshotRef.current = null
    isPostEvictionConfessionalModeRef.current = false
    setVoteBreakdownPromptIsPostEviction(false)
    setShowVoteBreakdownPrompt(false)
    setAdPending(false)
    if (!wasPostEviction) proceedAfterVoteResults()
  }, [proceedAfterVoteResults, setAdPending])

  const postEvictionVoteBreakdownPlayerNamesById = useMemo(
    () => buildEvictionVoteBreakdownPlayerNamesById(game.players),
    [game.players]
  )
  const postEvictionVoteBreakdownRows = useMemo(
    () =>
      postEvictionVoteBreakdown
        ? buildEvictionVoteBreakdownRows(
            postEvictionVoteBreakdown.votes,
            postEvictionVoteBreakdownPlayerNamesById
          )
        : [],
    [postEvictionVoteBreakdown, postEvictionVoteBreakdownPlayerNamesById]
  )

  useEffect(() => {
    if (showVoteResults) return
    const timeoutId = window.setTimeout(() => {
      setVoteBreakdownPromptIsPostEviction(false)
      setShowVoteBreakdownPrompt(false)
      setAdPending(false)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [setAdPending, showVoteResults])

  // For AI tiebreak: pass evictee=null to the modal so it surfaces the tie banner
  // and calls onTiebreakerRequired, giving us the hook to run choreography.
  // Condition: vote tallies have equal max counts AND AI already picked (pendingEviction set)
  // AND the human is NOT the LOH.
  const voteResultsEvictee = useMemo(() => {
    if (!game.voteResults || hasUnresolvedTopVoteTie(game.voteResults)) return null

    // If we have an explicit eviction decision, use that as the source of truth
    // — UNLESS this is an AI tiebreak where we want the modal to show the tie
    // banner first and call onTiebreakerRequired.
    if (game.pendingEviction) {
      if (!humanIsHoH && game.awaitingTieBreak) {
        // Check whether the tallies are actually tied (AI tiebreak case).
        let maxVotes = -1
        let topCount = 0
        for (const count of Object.values(game.voteResults)) {
          if (count > maxVotes) {
            maxVotes = count
            topCount = 1
          } else if (count === maxVotes) topCount++
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
  }, [game.voteResults, game.pendingEviction, game.players, game.awaitingTieBreak, humanIsHoH])

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
    const evictee =
      game.players.find((player) => player.id === game.pendingEviction?.evicteeId) ?? null
    if (!evictee) return null

    const evicteeVotes = game.voteResults[evictee.id] ?? 0
    const hasTwoNominees = Object.keys(game.voteResults).length === 2
    const otherVotes = Object.entries(game.voteResults).reduce(
      (sum, [id, count]) => (id !== evictee.id ? sum + count : sum),
      0
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

  const handleTiebreakerRequired = useCallback(
    (tiedIds: string[]) => {
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
    },
    [aiTiebreakContext, dispatch, humanIsHoH, handleVoteResultsDone]
  )

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
      Boolean(game.pendingEviction)
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

  const handlePublicEvictionTiebreakResolved = useCallback(
    (evicteeIds: string[]) => {
      if (evicteeIds.length === 0) return
      dispatch(submitDoubleEvictionTieBreak(evicteeIds))
    },
    [dispatch]
  )

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
      Boolean(game.pendingEviction)
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
    ? (game.players.find((p) => p.id === game.pendingEviction?.evicteeId) ?? null)
    : null
  // For normal evictions (not Final-4), show whenever pendingEviction is set.
  // For Final-4, show only during the 'splash' stage (after the announcement).
  // Blocked only while the post-vote verdict announcement is active.
  const showEvictionSplash =
    !showVoteResults &&
    !aiTiebreakStage &&
    !postVoteAnnouncement &&
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
    const cupidPartnerId = isCupidArrowActive(game) ? getCupidPartnerId(game, evicteeId) : null
    const hasQueuedPartnerEviction = Boolean(
      cupidPartnerId &&
      game.players.some(
        (player) =>
          player.id === cupidPartnerId && player.status !== 'evicted' && player.status !== 'jury'
      )
    )
    // Clear the overlay flag so AvatarTile returns to normal after the cinematic.
    dispatch(setEvictionOverlay(null))
    // Capture the phase before dispatch since finalizePendingEviction may change it.
    const isFinal4 = game.phase === 'final4_eviction'
    dispatch(finalizePendingEviction(evicteeId))
    if (isFinal4) {
      // Final-4: advance the local stage machine; no battle back check needed.
      setFinal4Stage('done')
    } else if (hasQueuedSecondEviction || hasQueuedPartnerEviction) {
      // Keep the second double-eviction cinematic in the same flow so it gets
      // its own overlay mount and eviction stinger before the week advances.
    } else {
      const activated =
        dispatch(tryActivatePendingForcedBattleBack()) || dispatch(tryActivateBattleBack())
      if (!activated) {
        dispatch(advance())
      }
    }
    // Show the confessional breakdown prompt if it was flagged during vote-results
    // dismissal (post-eviction confessional mode).
    if (isPostEvictionConfessionalModeRef.current && !hasQueuedPartnerEviction) {
      if (autoRevealOwnEvictionVotesRef.current && postEvictionVoteSnapshotRef.current) {
        setPostEvictionVoteBreakdown(postEvictionVoteSnapshotRef.current)
        postEvictionVoteSnapshotRef.current = null
        autoRevealOwnEvictionVotesRef.current = false
        isPostEvictionConfessionalModeRef.current = false
        return
      }
      if (postEvictionVoteBreakdownPromptTimerRef.current != null) {
        window.clearTimeout(postEvictionVoteBreakdownPromptTimerRef.current)
        postEvictionVoteBreakdownPromptTimerRef.current = null
      }
      postEvictionVoteBreakdownPromptTimerRef.current = window.setTimeout(() => {
        postEvictionVoteBreakdownPromptTimerRef.current = null
        if (!isMountedRef.current) return
        setVoteBreakdownPromptIsPostEviction(true)
        setShowVoteBreakdownPrompt(true)
      }, POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS)
    }
  }, [dispatch, game, setFinal4Stage, isMountedRef])

  return {
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
    postEvictionVoteBreakdownPlayerNamesById,
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
  }
}
