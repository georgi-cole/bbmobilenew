import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commitNominees } from '../../../store/gameSlice'
import type { AppDispatch, RootState } from '../../../store/store'
import type { ActiveConfessionalDecision } from '../../../store/confessionalDecisionSelectors'
import type { Player } from '../../../types'
import { detectDebugMode } from '../../../utils/debugMode'
import { usePersistedGameScreenKey } from '../gameScreenPersistence'
import {
  expandCupidIds,
  getCupidPair,
  getCupidPartnerId,
  isCupidArrowActive,
} from '../../../features/twists/cupidArrow'

interface UseLohFlowOptions {
  game: RootState['game']
  alivePlayers: Player[]
  humanPlayer: Player | undefined
  activeConfessionalDecision: ActiveConfessionalDecision | null
  searchParams: URLSearchParams
  dispatch: AppDispatch
}

/**
 * Owns Leader of House eligibility, winner presentation, nominations, and
 * co-LOH decision routing while leaving Redux reducers as the rules authority.
 */
export function useLohFlow({
  game,
  alivePlayers,
  humanPlayer,
  activeConfessionalDecision,
  searchParams,
  dispatch,
}: UseLohFlowOptions) {
  const isVoxPopuli = game.voxPopuli?.status === 'active'
  // ── Advance-picked LOH winner ceremony (outgoing LOH bypass) ──────────
  // When the human is the outgoing LOH, no MinigameHost challenge runs.
  // advance() picks the winner randomly → phase becomes loh_results with
  // lohId set, but no CeremonyOverlay was shown.  Detect this and fire
  // a spotlight ceremony so the winner reveal is still animated.
  const [advanceHohConsumedKey, setAdvanceHohConsumedKey] = usePersistedGameScreenKey(
    'advance-hoh-ceremony',
    game.season
  )

  const advanceHohKey = useMemo(() => {
    if (game.phase !== 'loh_results' || !game.lohId) return ''
    // Only trigger when the human or their Cupid partner was the outgoing LOH
    // and the winner ceremony was NOT already shown by MinigameHost.
    if (
      !game.prevHohId ||
      (game.prevHohId !== humanPlayer?.id &&
        getCupidPartnerId(game, game.prevHohId) !== humanPlayer?.id)
    ) {
      return ''
    }
    return `w${game.week}-hoh-${game.lohId}`
  }, [game, humanPlayer?.id])

  const advanceHohCeremonyEligible = advanceHohKey !== '' && advanceHohKey !== advanceHohConsumedKey

  const handleAdvanceHohCeremonyDone = useCallback(() => {
    setAdvanceHohConsumedKey(advanceHohKey)
  }, [advanceHohKey, setAdvanceHohConsumedKey])

  const aliveIds = useMemo(() => alivePlayers.map((p) => p.id), [alivePlayers])
  const hohCompParticipants = useMemo(() => {
    if (isVoxPopuli || game.phase !== 'loh_comp' || !game.prevHohId) return aliveIds
    const outgoingIds = new Set(expandCupidIds(game, [game.prevHohId]))
    return aliveIds.filter((id) => !outgoingIds.has(id))
  }, [game, aliveIds, isVoxPopuli])

  const humanIsHoH = Boolean(
    !isVoxPopuli &&
    humanPlayer &&
    (game.lohId === humanPlayer.id || getCupidPartnerId(game, game.lohId) === humanPlayer.id)
  )
  const humanIsOutgoingHoh =
    !isVoxPopuli &&
    game.phase === 'loh_comp' &&
    !!game.prevHohId &&
    Boolean(
      humanPlayer &&
      (game.prevHohId === humanPlayer.id ||
        getCupidPartnerId(game, game.prevHohId) === humanPlayer.id)
    )

  // Warning modal state: shown once per week when the human is the outgoing LOH.
  // Tracks which week the warning was dismissed so it resets automatically each week.
  const [outgoingHohWarningDismissedWeek, setOutgoingHohWarningDismissedWeek] = useState<
    number | null
  >(null)
  const showOutgoingHohWarning = humanIsOutgoingHoh && outgoingHohWarningDismissedWeek !== game.week

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
    aiNomAnimPersistenceScope
  )
  useEffect(() => {
    pendingNomineesRef.current = pendingNominees
  }, [pendingNominees])

  // AI LOH animation: computed directly from game state — no setState-in-effect.
  const aiNomKey =
    game.phase === 'nomination_results' && game.nomineeIds.length > 0 && !game.awaitingNominations
      ? `w${game.week}-${[...game.nomineeIds].sort().join(',')}`
      : ''

  const showHumanNomAnim = pendingNominees.length > 0
  const showAiNomAnim = aiNomKey !== '' && aiNomKey !== aiNomAnimConsumedKey && !showHumanNomAnim
  const showNomAnim = showHumanNomAnim || showAiNomAnim
  const showNominationDangerSignals =
    game.phase === 'nomination_results' && Boolean(game.awaitingNominations) && !showNomAnim
  const canUsePublicNomineeRule =
    !isVoxPopuli &&
    game.publicModeEnabled === true &&
    game.doubleEviction?.weekActive !== true
  const nominationDangerLockedIds =
    showNominationDangerSignals && canUsePublicNomineeRule
      ? expandCupidIds(game, game.lastHohCompFinisherId ? [game.lastHohCompFinisherId] : [])
      : []

  const nomAnimPlayers = useMemo(() => {
    if (showHumanNomAnim) {
      const base = expandCupidIds(game, pendingNominees)
        .map((id) => game.players.find((p) => p.id === id))
        .filter(Boolean) as Player[]
      // When Public mode is active and this is not a Double Eviction, include the auto-third nominee.
      const autoId = canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? null) : null
      if (autoId && !pendingNominees.includes(autoId)) {
        const autoPlayer = game.players.find((p) => p.id === autoId)
        if (autoPlayer) {
          const expandedAuto = expandCupidIds(game, [autoId])
            .map((id) => game.players.find((player) => player.id === id))
            .filter((player): player is Player => Boolean(player))
          return [
            ...base,
            ...expandedAuto.filter((player) => !base.some((p) => p.id === player.id)),
          ]
        }
      }
      return base
    }
    return game.nomineeIds
      .map((id) => game.players.find((p) => p.id === id))
      .filter(Boolean) as Player[]
  }, [game, showHumanNomAnim, pendingNominees, canUsePublicNomineeRule])

  // Build CeremonyOverlay tiles for nominations: ❓ badges fly to nominee tiles.
  // Tile rects are resolved lazily by the CeremonyOverlay via getTileRect
  // so we pass a resolver function rather than pre-computed rects (avoids
  // calling document.querySelector during the render phase before DOM is committed).
  const nomCeremonyTileIds = showNomAnim ? nomAnimPlayers.map((p) => p.id) : []
  const lohCeremonyTileId =
    showNomAnim && game.lohId && game.players.some((p) => p.id === game.lohId) ? game.lohId : null
  const shouldShowNominationCeremony =
    showNomAnim &&
    nomCeremonyTileIds.length > 0 &&
    (isVoxPopuli || lohCeremonyTileId != null)

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

  const nomineeOptions = (() => {
    const lohIds = new Set(expandCupidIds(game, game.lohId ? [game.lohId] : []))
    const candidates = alivePlayers.filter((player) => !lohIds.has(player.id))
    if (!isCupidArrowActive(game)) return candidates
    const seenPairs = new Set<string>()
    return candidates.filter((player) => {
      const key = getCupidPair(game, player.id)?.id ?? `solo:${player.id}`
      if (seenPairs.has(key)) return false
      seenPairs.add(key)
      return true
    })
  })()
  const autoNomineeOptionId =
    canUsePublicNomineeRule && game.lastHohCompFinisherId
      ? (nomineeOptions.find((player) =>
          expandCupidIds(game, [game.lastHohCompFinisherId!]).includes(player.id)
        )?.id ?? game.lastHohCompFinisherId)
      : undefined

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
      const fullIds = expandCupidIds(game, autoId && !ids.includes(autoId) ? [...ids, autoId] : ids)
      setAiNomAnimConsumedKey(`w${game.week}-${[...fullIds].sort().join(',')}`)
      setPendingNominees(ids)
    },
    [game, humanIsHoH, canUsePublicNomineeRule, setAiNomAnimConsumedKey]
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
    if (isVoxPopuli) {
      const automaticNomineeId =
        game.voxPopuli?.autoNomineeId ?? game.lastHohCompFinisherId ?? null
      game.nomineeIds.forEach((id) => {
        const votes = game.voxPopuli?.nominationVoteCounts[id] ?? 0
        labels[id] =
          id === automaticNomineeId
            ? 'Last Place'
            : `${votes} Vote${votes === 1 ? '' : 's'}`
      })
      return labels
    }

    // While the human LOH animation is playing, the reducer hasn't committed
    // nominationContext yet, so derive the pills from the pending picks.
    if (showHumanNomAnim && pendingNominees.length > 0) {
      expandCupidIds(game, pendingNominees).forEach((id) => {
        labels[id] = 'LOH Nominee'
      })
      if (
        canUsePublicNomineeRule &&
        game.lastHohCompFinisherId &&
        !pendingNominees.includes(game.lastHohCompFinisherId)
      ) {
        expandCupidIds(game, [game.lastHohCompFinisherId]).forEach((id) => {
          labels[id] = 'Last in LOH Comp'
        })
      }
      return labels
    }

    const ctx = game.nominationContext
    if (!ctx) return labels
    ctx.hohNomineeIds.forEach((id) => {
      labels[id] = 'LOH Nominee'
    })
    if (ctx.autoNomineeId && !ctx.hohNomineeIds.includes(ctx.autoNomineeId)) {
      expandCupidIds(game, [ctx.autoNomineeId]).forEach((id) => {
        labels[id] = 'Last in LOH Comp'
      })
    }
    return labels
  }, [game, showHumanNomAnim, pendingNominees, canUsePublicNomineeRule, isVoxPopuli])

  // ── Dev: manually trigger nomination animation ────────────────────────────
  // Only visible in development builds for easy QA verification.
  const isDebugMode = detectDebugMode()
  const isQaMode = searchParams.get('qa') === '1' && isDebugMode
  const handleDevPlayNomAnim = useCallback(() => {
    const eligible = alivePlayers.filter((p) => !p.isUser)
    const devNominees = eligible.slice(0, 2).map((p) => p.id)
    if (devNominees.length === 2) {
      console.log('DEV: Play Nomination Animation', devNominees)
      const autoId = canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? null) : null
      const fullIds =
        autoId && !devNominees.includes(autoId) ? [...devNominees, autoId] : devNominees
      setAiNomAnimConsumedKey(`w${game.week}-${[...fullIds].sort().join(',')}`)
      setPendingNominees(devNominees)
    }
  }, [
    alivePlayers,
    canUsePublicNomineeRule,
    game.lastHohCompFinisherId,
    game.week,
    setAiNomAnimConsumedKey,
    setPendingNominees,
  ])

  // ── Co-LOH nomination modal ───────────────────────────────────────────────
  // Shown when the human co-LOH must pick their nomination.
  const humanCoLohId =
    humanPlayer && (game.coLohIds ?? []).includes(humanPlayer.id) ? humanPlayer.id : null
  const showCoLohNominationModal =
    Boolean(game.awaitingCoLohNomination) && humanCoLohId != null && !activeConfessionalDecision
  const coLohNomOptions = alivePlayers.filter(
    (p) => !(game.coLohIds ?? []).includes(p.id) && !game.nomineeIds.includes(p.id)
  )

  return {
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
    nominationDangerLockedIds,
    nomAnimPlayers,
    nomCeremonyTileIds,
    lohCeremonyTileId,
    shouldShowNominationCeremony,
    showNominationsModal,
    nomineeOptions,
    autoNomineeOptionId,
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
  }
}
