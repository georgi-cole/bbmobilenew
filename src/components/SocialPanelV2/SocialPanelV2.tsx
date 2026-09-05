import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  clearSessionLogs,
  closeSocialPanel,
  selectDramaNetwork,
  selectEnergyBank,
  selectInfluenceBank,
  selectInfoBank,
  selectPersistentSocialHistory,
  selectSessionLogs,
  selectSocialPanelOpen,
  selectWeekStartRelSnapshot,
} from '../../social/socialSlice'
import { addTvEvent } from '../../store/gameSlice'
import { SocialManeuvers } from '../../social/SocialManeuvers'
import { getSocialNarrative } from './socialNarratives'
import { buildDrSessionSummary } from '../../services/activityService'
import {
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability'
import ActionGrid from './ActionGrid'
import PlayerList from './PlayerList'
import RecentActivity from './RecentActivity'
import HousePulse from '../HousePulse/HousePulse'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import type { Player } from '../../types'
import { resolveActionTargetMode } from '../../social/socialActions'
import type { SubjectPool } from '../../social/socialActions'
import { buildEffectiveSocialActions } from '../../social/socialActionManager'
import { getEffectiveSocialMode } from '../../social/socialMode'
import { validateSocialExecution } from '../../social/socialExecutionGuard'
import { getSocialActionPresentation } from '../../social/socialRuntimeConfig'
import { executeHumanRealityAction } from '../../social/reality/humanFlow'
import { getCupidPartnerId, isCupidArrowActive } from '../../features/twists/cupidArrow'
import type { PublicDirection } from '../../publicOpinion/types'
import IntelLeads from './IntelLeads'
import './SocialPanelV2.css'

const EXECUTE_REENTRY_GUARD_MS = 250
const EMPTY_PUBLIC_DIRECTIONS: PublicDirection[] = []

function isNomineeStatus(status: Player['status']): boolean {
  return status.includes('nominated')
}

function formatPlayerNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'the house'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function getSubjectCandidates(
  pool: SubjectPool,
  primaryTargetId: string,
  players: Player[],
  actorId: string,
  relationships: Record<string, Record<string, { affinity: number; tags?: string[] }>> | undefined,
  allowActorAsSubject = false
): Player[] {
  const eligible = players.filter(
    (player) =>
      player.id !== primaryTargetId &&
      (allowActorAsSubject || player.id !== actorId) &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  switch (pool) {
    case 'nominees':
      return eligible.filter((player) => isNomineeStatus(player.status))
    case 'non_nominees':
      return eligible.filter((player) => !isNomineeStatus(player.status))
    case 'allies':
      return eligible.filter((player) => {
        const outward = relationships?.[actorId]?.[player.id]
        const inward = relationships?.[player.id]?.[actorId]
        const tags = new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])])
        return (
          tags.has('alliance') ||
          tags.has('romance') ||
          tags.has('bromance') ||
          (outward?.affinity ?? 0) > 0
        )
      })
    case 'voters':
      return eligible.filter(
        (player) =>
          !isNomineeStatus(player.status) && player.status !== 'loh' && player.status !== 'loh+pos'
      )
    case 'houseguests':
    default:
      return eligible
  }
}

export default function SocialPanelV2() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const game = useAppSelector((state) => state.game)
  const settings = useAppSelector((state) => state.settings)
  const vip = useAppSelector((state) => state.vip)
  const socialState = useAppSelector((state) => state.social)
  const energyBank = useAppSelector(selectEnergyBank)
  const influenceBank = useAppSelector(selectInfluenceBank)
  const infoBank = useAppSelector(selectInfoBank)
  const socialPanelOpen = useAppSelector(selectSocialPanelOpen)
  const sessionLogs = useAppSelector(selectSessionLogs)
  const actionHistory = useAppSelector(selectPersistentSocialHistory)
  const relationships = socialState?.relationships
  const weekStartRelSnapshot = useAppSelector(selectWeekStartRelSnapshot)
  const dramaNetwork = useAppSelector(selectDramaNetwork)
  // Public Mode is intentionally optional for lightweight social/test stores.
  const publicDirections = useAppSelector(
    (state) => state.publicOpinion?.directions ?? EMPTY_PUBLIC_DIRECTIONS
  )
  const dramaMode = getEffectiveSocialMode({ game, settings, vip }) === 'drama'
  const socialActions = useMemo(
    () => buildEffectiveSocialActions(settings?.social?.actionOverrides ?? {}),
    [settings?.social?.actionOverrides]
  )

  const humanPlayer = game.players.find((player) => player.isUser)
  const activePublicDirection = useMemo(
    () =>
      game.publicModeEnabled && humanPlayer
        ? publicDirections.find(
            (direction) => direction.playerId === humanPlayer.id && direction.status === 'active'
          )
        : undefined,
    [game.publicModeEnabled, humanPlayer, publicDirections]
  )
  const cupidPartners = useMemo(() => {
    if (!isCupidArrowActive(game) || !humanPlayer) return {}
    return Object.fromEntries(
      game.players.flatMap((player) => {
        const partnerId = getCupidPartnerId(game, player.id)
        const partner = game.players.find((candidate) => candidate.id === partnerId)
        const pair = game.cupidArrow?.pairs.find((candidate) =>
          candidate.memberIds.includes(player.id)
        )
        if (!partner || !pair) return []
        return [
          [
            player.id,
            {
              name: partner.name,
              color: pair.color,
              isYourPartner: partner.id === humanPlayer.id,
            },
          ],
        ]
      })
    ) as Record<string, { name: string; color: string; isYourPartner: boolean }>
  }, [game, humanPlayer])
  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game])
  const open = socialModuleAvailability.canOpen && socialPanelOpen

  useEffect(() => {
    if (!socialPanelOpen || socialModuleAvailability.canOpen) return
    logBlockedSocialModuleOpen(
      'Outgoing social module',
      socialModuleAvailability,
      'SocialPanelV2 visibility guard'
    )
    dispatch(closeSocialPanel())
  }, [dispatch, socialPanelOpen, socialModuleAvailability])

  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set())
  const [primaryTargetId, setPrimaryTargetId] = useState<string | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [multiSelectActive, setMultiSelectActive] = useState(false)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [successPulse, setSuccessPulse] = useState(false)
  const [executing, setExecuting] = useState(false)
  const handleRealityUpgrade = useCallback(() => {
    dispatch(closeSocialPanel())
    navigate('/store')
  }, [dispatch, navigate])
  const successPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const executeGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isExecutingRef = useRef(false)
  const focusPublicRequest = useCallback(() => {
    const targetId = activePublicDirection?.relatedPlayerId
    if (!targetId || !activePublicDirection) return
    const actionByType: Partial<Record<typeof activePublicDirection.type, string>> = {
      align_with: 'proposeAlliance',
      break_alliance: dramaMode ? 'break_alliance' : 'betray',
      reinforce_alliance: 'ally',
      repair_relationship: 'apologize',
      apologize: 'apologize',
      get_closer: 'compliment',
      confront_player: 'confront',
    }
    setPrimaryTargetId(targetId)
    setSelectedTargets(new Set([targetId]))
    setSelectedActionId(actionByType[activePublicDirection.type] ?? null)
    setSelectedSubjectId(null)
  }, [activePublicDirection, dramaMode])
  const safetyConsultationOpen =
    game.voxPopuli?.status !== 'active' &&
    ['pos_results', 'pos_ceremony'].includes(game.phase) &&
    game.posWinnerId === humanPlayer?.id &&
    Boolean(game.lohId) &&
    !game.povSavedId
  useEffect(
    () => () => {
      if (successPulseTimerRef.current !== null) {
        clearTimeout(successPulseTimerRef.current)
      }
      if (executeGuardTimerRef.current !== null) {
        clearTimeout(executeGuardTimerRef.current)
      }
    },
    []
  )

  function resetPanelSelection() {
    setSelectedTargets(new Set())
    setPrimaryTargetId(null)
    setSelectedActionId(null)
    setSelectedSubjectId(null)
    setFeedbackMsg(null)
    setMultiSelectActive(false)
  }

  function handleClose() {
    if (!humanPlayer) {
      dispatch(closeSocialPanel())
      return
    }
    const userLogs = sessionLogs.filter((log) => log.actorId === humanPlayer.id)
    if (userLogs.length > 0) {
      const successCount = userLogs.filter((log) => log.outcome === 'success').length
      const failCount = userLogs.length - successCount
      dispatch(
        addTvEvent({
          text: buildDrSessionSummary(game.week, userLogs.length, successCount, failCount),
          type: 'diary',
          source: 'manual',
          channels: ['dr'],
        })
      )
    }
    // actionHistory remains intact in the social slice; only this panel session
    // is cleared after its Diary Room summary is transferred.
    if (sessionLogs.length > 0) dispatch(clearSessionLogs())
    resetPanelSelection()
    dispatch(closeSocialPanel())
  }

  const selectedAction = selectedActionId ? SocialManeuvers.getActionById(selectedActionId) : null
  const targetMode = selectedAction ? resolveActionTargetMode(selectedAction, dramaMode) : 'primary'
  const isBatchCompatible =
    targetMode === 'primary' &&
    !selectedAction?.requiredTargetStatus &&
    selectedActionId !== 'proposeAlliance'
  const usesMultipleTargets = targetMode === 'multi' || (multiSelectActive && isBatchCompatible)
  // A POS holder begins with the LOH selected for an individual consultation
  // without mutating local state from an effect. Group selections always use
  // the player's explicit picks, so this default cannot replace a multi-select.
  const suggestedSafetyTargetId =
    safetyConsultationOpen &&
    targetMode === 'primary' &&
    primaryTargetId === null &&
    selectedTargets.size === 0
      ? game.lohId
      : null
  const effectivePrimaryTargetId =
    targetMode === 'none' ? null : (primaryTargetId ?? suggestedSafetyTargetId)
  const selectedPlayerIds = useMemo(
    () =>
      selectedTargets.size > 0
        ? selectedTargets
        : effectivePrimaryTargetId
          ? new Set([effectivePrimaryTargetId])
          : selectedTargets,
    [effectivePrimaryTargetId, selectedTargets]
  )
  const selectedTargetCount = selectedTargets.size
  const needsTarget = targetMode !== 'none'
  const needsSubject = targetMode === 'primaryPlusSubject'
  const hasRequiredTargets =
    targetMode === 'multi'
      ? selectedTargetCount >= Math.max(2, selectedAction?.minTargets ?? 2)
      : usesMultipleTargets
        ? selectedTargetCount >= 1
        : !needsTarget || effectivePrimaryTargetId !== null
  const targetCount = usesMultipleTargets ? selectedTargetCount : 1

  const totalCosts = useMemo(() => {
    const baseCosts = selectedAction
      ? SocialManeuvers.computeActionCosts(
          humanPlayer?.id ?? '',
          selectedAction,
          effectivePrimaryTargetId ?? humanPlayer?.id ?? '',
          undefined,
          selectedTargetCount,
          dramaMode
        )
      : null
    if (!baseCosts) return null
    if (selectedActionId === 'group_chat') {
      return { ...baseCosts, energy: Math.max(2, selectedTargetCount) }
    }
    if (usesMultipleTargets) {
      return {
        energy: baseCosts.energy * targetCount,
        influence: baseCosts.influence * targetCount,
        info: baseCosts.info * targetCount,
      }
    }
    return baseCosts
  }, [
    dramaMode,
    effectivePrimaryTargetId,
    humanPlayer?.id,
    selectedAction,
    selectedActionId,
    selectedTargetCount,
    targetCount,
    usesMultipleTargets,
  ])

  const energy = energyBank?.[humanPlayer?.id ?? ''] ?? 0
  const influence = influenceBank?.[humanPlayer?.id ?? ''] ?? 0
  const info = infoBank?.[humanPlayer?.id ?? ''] ?? 0
  const hasExecutableSelection =
    Boolean(selectedActionId) && hasRequiredTargets && (!needsSubject || selectedSubjectId !== null)

  const executionEligibility = useMemo(() => {
    if (!selectedAction || !humanPlayer || !hasExecutableSelection) {
      return { eligible: false, reason: '' }
    }
    const targetIds =
      targetMode === 'none'
        ? []
        : usesMultipleTargets
          ? Array.from(selectedTargets)
          : effectivePrimaryTargetId
            ? [effectivePrimaryTargetId]
            : []

    if (usesMultipleTargets && targetMode !== 'multi') {
      for (const targetId of targetIds) {
        const result = validateSocialExecution(
          { game, settings, vip, social: socialState },
          {
            action: selectedAction,
            actorId: humanPlayer.id,
            targetIds: [targetId],
            subjectId: selectedSubjectId ?? undefined,
            requireCompleteSelection: true,
          }
        )
        if (!result.eligible) return result
      }
      return { eligible: true, reason: '' }
    }

    return validateSocialExecution(
      { game, settings, vip, social: socialState },
      {
        action: selectedAction,
        actorId: humanPlayer.id,
        targetIds,
        subjectId: selectedSubjectId ?? undefined,
        requireCompleteSelection: true,
      }
    )
  }, [
    effectivePrimaryTargetId,
    game,
    hasExecutableSelection,
    humanPlayer,
    selectedAction,
    selectedSubjectId,
    selectedTargets,
    settings,
    socialState,
    targetMode,
    usesMultipleTargets,
    vip,
  ])

  const canExecute =
    hasExecutableSelection && (executionEligibility.eligible || !executionEligibility.reason)

  const hiddenContextualActionIds = useMemo(() => {
    const hidden = new Set<string>()
    const isVoxPopuli = game.voxPopuli?.status === 'active'
    const beforeNominations = game.phase === 'social_1' && game.nomineeIds.length === 0
    const safetyDecisionOpen =
      ['pos_results', 'pos_ceremony'].includes(game.phase) &&
      Boolean(game.posWinnerId) &&
      !game.povSavedId
    const humanIsLoh = game.lohId === humanPlayer?.id
    const humanIsNominated = Boolean(humanPlayer?.status.includes('nominated'))
    const disclosedDangerTargetId =
      game.lohSocialPlan?.week === game.week && game.lohSocialPlan.lohId === game.lohId
        ? game.lohSocialPlan.disclosedTargetByPlayerId?.[humanPlayer?.id ?? '']
        : undefined
    const alreadyWarnedDangerTarget = actionHistory.some(
      (entry) =>
        entry.actorId === humanPlayer?.id &&
        entry.targetId === disclosedDangerTargetId &&
        entry.actionId === 'warn_about_danger' &&
        entry.week === game.week
    )
    const lohPlanOpen = [
      'loh_results',
      'social_1',
      'nominations',
      'nomination_results',
      'pre_veto_public_save',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
      'pos_ceremony_results',
      'social_2',
    ].includes(game.phase)
    if (isVoxPopuli) {
      socialActions
        .filter((action) => action.unavailableInVox)
        .forEach((action) => hidden.add(action.id))
    } else {
      socialActions.filter((action) => action.voxOnly).forEach((action) => hidden.add(action.id))
    }
    if (!beforeNominations) hidden.add('pitch_target')
    if (!lohPlanOpen || !game.lohId) hidden.add('ask_loh_target')
    if (!humanIsNominated || !game.lohId) hidden.add('ask_why_nominated')
    if (
      !disclosedDangerTargetId ||
      primaryTargetId !== disclosedDangerTargetId ||
      alreadyWarnedDangerTarget
    ) {
      hidden.add('warn_about_danger')
    }
    if (!safetyDecisionOpen) {
      hidden.add('ask_use_safety')
      hidden.add('ask_safety_plan')
      hidden.add('ask_hold_safety')
      hidden.add('suggest_replacement')
    } else if (!humanIsLoh) {
      hidden.add('ask_hold_safety')
    }
    return hidden
  }, [
    game.lohId,
    game.nomineeIds.length,
    game.phase,
    game.posWinnerId,
    game.povSavedId,
    game.lohSocialPlan,
    game.week,
    game.voxPopuli?.status,
    humanPlayer?.id,
    humanPlayer?.status,
    primaryTargetId,
    actionHistory,
    socialActions,
  ])

  const handleActionClick = useCallback(
    (actionId: string) => {
      const nextAction = SocialManeuvers.getActionById(actionId)
      const nextMode = nextAction ? resolveActionTargetMode(nextAction, dramaMode) : 'primary'
      const nextBatchCompatible =
        nextMode === 'primary' &&
        !nextAction?.requiredTargetStatus &&
        actionId !== 'proposeAlliance'
      if (nextMode === 'multi') {
        setMultiSelectActive(true)
      } else if (!nextBatchCompatible && primaryTargetId) {
        setSelectedTargets(new Set([primaryTargetId]))
        setMultiSelectActive(false)
      }
      setSelectedActionId(actionId)
      setSelectedSubjectId(null)
      setFeedbackMsg(null)
    },
    [dramaMode, primaryTargetId]
  )

  const handleSelectionChange = useCallback(
    (ids: Set<string>, details: { primaryTargetId: string | null }) => {
      if (usesMultipleTargets) {
        setSelectedTargets(new Set(ids))
        setPrimaryTargetId(details.primaryTargetId)
      } else {
        const nextPrimaryTargetId = details.primaryTargetId
        setSelectedTargets(nextPrimaryTargetId ? new Set([nextPrimaryTargetId]) : new Set())
        setPrimaryTargetId(nextPrimaryTargetId)
      }
      setSelectedSubjectId(null)
      setFeedbackMsg(null)

      if (selectedAction?.requiredTargetStatus) {
        const nextTargetStatus = details.primaryTargetId
          ? game.players.find((player) => player.id === details.primaryTargetId)?.status
          : null
        if (!nextTargetStatus || !selectedAction.requiredTargetStatus.includes(nextTargetStatus)) {
          setSelectedActionId(null)
        }
      }
    },
    [game.players, selectedAction, usesMultipleTargets]
  )

  const handleExecute = useCallback(() => {
    if (
      !hasExecutableSelection ||
      !humanPlayer ||
      !selectedAction ||
      !selectedActionId ||
      isExecutingRef.current
    ) {
      return
    }
    isExecutingRef.current = true
    setExecuting(true)
    setFeedbackMsg(null)

    const targetIds =
      targetMode === 'none'
        ? [humanPlayer.id]
        : usesMultipleTargets
          ? Array.from(selectedTargets)
          : effectivePrimaryTargetId
            ? [effectivePrimaryTargetId]
            : []

    const releaseGuard = () => {
      isExecutingRef.current = false
      setExecuting(false)
    }

    if (targetIds.length === 0) {
      setFeedbackMsg('Select a player to continue.')
      releaseGuard()
      return
    }
    if (targetMode === 'multi' && targetIds.length < 2) {
      setFeedbackMsg('Select at least two players for a group action.')
      releaseGuard()
      return
    }
    if (!executionEligibility.eligible) {
      setFeedbackMsg(executionEligibility.reason || 'This action is not available now.')
      releaseGuard()
      return
    }
    if (!totalCosts || !SocialManeuvers.canAfford(humanPlayer.id, totalCosts)) {
      const needs = [
        totalCosts && totalCosts.energy > energy ? `⚡${totalCosts.energy}` : null,
        totalCosts && totalCosts.influence > influence ? `🤝${totalCosts.influence}` : null,
        totalCosts && totalCosts.info > info ? `💡${totalCosts.info}` : null,
      ]
        .filter(Boolean)
        .join(', ')
      const onlyEnergyShort =
        Boolean(totalCosts) &&
        totalCosts!.energy > energy &&
        totalCosts!.influence <= influence &&
        totalCosts!.info <= info
      setFeedbackMsg(
        `Insufficient resources${
          onlyEnergyShort ? ': insufficient energy' : ''
        }${needs ? ` — need ${needs}` : ''}. Nothing was spent.`
      )
      releaseGuard()
      return
    }
    if (
      targetIds.some((targetId) => {
        const target = game.players.find((player) => player.id === targetId)
        return !target || target.status === 'evicted' || target.status === 'jury'
      })
    ) {
      setFeedbackMsg('Cannot target an eliminated or Tribunal player.')
      releaseGuard()
      return
    }

    const results =
      targetMode === 'multi'
        ? [
            dispatch(
              executeHumanRealityAction({
                actorId: humanPlayer.id,
                targetId: targetIds[0],
                targetIds,
                actionId: selectedActionId,
                subjectId: selectedSubjectId ?? undefined,
                costOverride: totalCosts,
              })
            ),
          ]
        : targetMode !== 'none' && targetIds.length === 1 && !usesMultipleTargets
          ? [
              dispatch(
                executeHumanRealityAction({
                  actorId: humanPlayer.id,
                  targetId: targetIds[0],
                  actionId: selectedActionId,
                  subjectId: selectedSubjectId ?? undefined,
                  costOverride: totalCosts,
                })
              ),
            ]
          : targetMode === 'none'
            ? [
                dispatch(
                  executeHumanRealityAction({
                    actorId: humanPlayer.id,
                    targetId: humanPlayer.id,
                    targetIds: [],
                    actionId: selectedActionId,
                    costOverride: totalCosts,
                  })
                ),
              ]
            : [
                dispatch(
                  executeHumanRealityAction({
                    actorId: humanPlayer.id,
                    targetId: targetIds[0],
                    targetIds,
                    actionId: selectedActionId,
                    subjectId: selectedSubjectId ?? undefined,
                    costOverride: totalCosts,
                  })
                ),
              ]

    const successfulResults = results.filter((result) => result.success)
    const firstResult = results[0]
    const reachedTargetCount =
      Object.keys(firstResult.targetDeltas ?? {}).length || successfulResults.length
    setFeedbackMsg(
      targetMode === 'multi'
        ? firstResult.summary
        : usesMultipleTargets
          ? reachedTargetCount === targetIds.length
            ? `${getSocialActionPresentation(selectedAction).title} reached all ${
                targetIds.length
              } selected housemates.`
            : `${getSocialActionPresentation(selectedAction).title} reached ${
                reachedTargetCount
              } of ${targetIds.length} selected housemates.`
          : firstResult.summary
    )

    if (successfulResults.length > 0) {
      const targetNames = targetIds.map(
        (targetId) => game.players.find((player) => player.id === targetId)?.name ?? targetId
      )
      const subjectName = selectedSubjectId
        ? (game.players.find((player) => player.id === selectedSubjectId)?.name ??
          selectedSubjectId)
        : null
      const actionTitle = getSocialActionPresentation(selectedAction).title
      const persistentText =
        selectedActionId === 'group_chat'
          ? `You hosted a group chat with ${formatPlayerNames(targetNames)}.`
          : selectedActionId === 'ask_loh_target'
            ? firstResult.summary
            : subjectName
              ? `You used ${actionTitle} with ${targetNames[0]} about ${subjectName}.`
              : getSocialNarrative(selectedActionId, formatPlayerNames(targetNames), Date.now())
      dispatch(
        addTvEvent({
          text: persistentText,
          type: 'social',
          source: 'manual',
          channels: ['mainLog'],
          // Player-action receipts belong in the activity strip, not on the
          // broadcast.  The Faux TV is reserved for house-wide consequences.
          meta: { suppressTv: true },
        })
      )
      setSuccessPulse(true)
      if (successPulseTimerRef.current !== null) {
        clearTimeout(successPulseTimerRef.current)
      }
      successPulseTimerRef.current = setTimeout(() => {
        setSuccessPulse(false)
        successPulseTimerRef.current = null
      }, 850)
    }

    if (executeGuardTimerRef.current !== null) {
      clearTimeout(executeGuardTimerRef.current)
    }
    executeGuardTimerRef.current = setTimeout(() => {
      releaseGuard()
      executeGuardTimerRef.current = null
    }, EXECUTE_REENTRY_GUARD_MS)
  }, [
    dispatch,
    effectivePrimaryTargetId,
    energy,
    executionEligibility,
    game.players,
    hasExecutableSelection,
    humanPlayer,
    info,
    influence,
    selectedAction,
    selectedActionId,
    selectedSubjectId,
    selectedTargets,
    targetMode,
    totalCosts,
    usesMultipleTargets,
  ])

  if (!open || !humanPlayer) return null

  const allNonUser = game.players.filter((player) => !player.isUser && player.status !== 'evicted')
  const activePlayers = allNonUser.filter((player) => player.status !== 'jury')
  const juryPlayers = allNonUser.filter((player) => player.status === 'jury')
  // Daily immunity in Vox Populi is not a leadership office. Adapt only the
  // Social panel's display copy; the stored role remains untouched for rules.
  const orderedPlayers = (
    game.voxPopuli?.status === 'active'
      ? [...activePlayers, ...juryPlayers].map((player) => {
          if (player.id !== game.lohId) return player
          if (player.status === 'loh') return { ...player, status: 'active' as const }
          if (player.status === 'loh+pos') return { ...player, status: 'pos' as const }
          return player
        })
      : [...activePlayers, ...juryPlayers]
  ) as Player[]
  const disabledPlayerIds = juryPlayers.map((player) => player.id)

  const deltasByTargetId = new Map<string, number>()
  const currentRels = relationships?.[humanPlayer.id] ?? {}
  const snapshotRels = weekStartRelSnapshot[humanPlayer.id] ?? {}
  for (const [targetId, relationship] of Object.entries(currentRels)) {
    const weeklyDelta = relationship.affinity - (snapshotRels[targetId] ?? 0)
    if (weeklyDelta !== 0) deltasByTargetId.set(targetId, weeklyDelta)
  }

  const subjectCandidates =
    needsSubject && effectivePrimaryTargetId && selectedAction?.subjectPool
      ? getSubjectCandidates(
          selectedAction.subjectPool,
          effectivePrimaryTargetId,
          selectedAction.allowActorAsSubject ? [...orderedPlayers, humanPlayer] : orderedPlayers,
          humanPlayer.id,
          relationships,
          selectedAction.allowActorAsSubject
        )
      : []

  const executeCopy = 'Execute'

  return (
    <div className="sp2-backdrop" role="dialog" aria-modal="true" aria-label="Social Phase">
      <a className="sp2-skip-link" href="#sp2-body">
        Skip to actions
      </a>
      <div className={`sp2-modal${dramaMode ? ' sp2-modal--drama' : ' sp2-modal--normal'}`}>
        <header className="sp2-header">
          <span className="sp2-header__title">
            {dramaMode ? '🔥 Reality Mode' : '💬 Social Phase'}
          </span>
          <div
            className={`sp2-header__resources${dramaMode ? '' : ' sp2-header__resources--normal'}`}
          >
            <span className="sp2-energy-chip" aria-live="polite" aria-label={`Energy: ${energy}`}>
              ⚡ {energy}
            </span>
            <button
              type="button"
              className="sp2-resource-chip sp2-resource-chip--influence"
              aria-live="polite"
              aria-label={`Influence: ${influence}`}
              title="Influence"
            >
              🤝 {influence}
            </button>
            <button
              type="button"
              className="sp2-resource-chip sp2-resource-chip--info"
              aria-live="polite"
              aria-label={`Info: ${info}`}
              title="Information"
            >
              💡 {info}
            </button>
          </div>
          <button
            className="sp2-header__close"
            onClick={handleClose}
            type="button"
            aria-label="Close social panel"
          >
            ↩
          </button>
        </header>

        <IntelLeads
          reality={socialState.reality}
          humanId={humanPlayer.id}
          players={game.players}
          currentDay={game.week}
        />

        {activePublicDirection && (
          <section className="sp2-public-request" aria-label="Active public request">
            <div className="sp2-public-request__eyebrow">Audience directive</div>
            <strong>{activePublicDirection.description}</strong>
            {activePublicDirection.rationale && <span>{activePublicDirection.rationale}</span>}
            <div className="sp2-public-request__footer">
              <span>
                {activePublicDirection.completionLabel ?? 'Complete the requested move'} · +
                {activePublicDirection.approvalDelta} approval
              </span>
              {activePublicDirection.relatedPlayerId && (
                <button type="button" onClick={focusPublicRequest}>
                  Show me how
                </button>
              )}
            </div>
          </section>
        )}

        {dramaMode && (
          <HousePulse
            network={dramaNetwork}
            players={game.players}
            humanId={humanPlayer.id}
            actionHistory={actionHistory}
            relationships={relationships ?? {}}
            weekStartRelSnapshot={weekStartRelSnapshot}
            currentWeek={game.week}
            reality={socialState.reality}
          />
        )}

        <div id="sp2-body" className="sp2-body">
          <div className="sp2-column sp2-column--players" aria-label="Player roster">
            <div className="sp2-column__heading">
              {!usesMultipleTargets && (
                <span
                  className="sp2-relationship-legend"
                  aria-label="Avatar rings: green means close, yellow means mixed, red means strained"
                >
                  <span>
                    <i className="is-close" />
                    Close
                  </span>
                  <span>
                    <i className="is-mixed" />
                    Mixed
                  </span>
                  <span>
                    <i className="is-strained" />
                    Strained
                  </span>
                </span>
              )}
              {usesMultipleTargets && (
                <span className="sp2-multi-hint" role="status">
                  Group: {selectedTargets.size} selected ·{' '}
                  {targetMode === 'multi' ? 'tap 2+ players' : 'applies to everyone selected'}
                </span>
              )}
            </div>
            <PlayerList
              players={orderedPlayers}
              humanPlayerId={humanPlayer.id}
              relationships={relationships}
              disabledIds={disabledPlayerIds}
              selectedIds={selectedPlayerIds}
              onSelectionChange={handleSelectionChange}
              multiSelectEnabled={targetMode === 'multi'}
              deltasByTargetId={deltasByTargetId}
              multiSelect={usesMultipleTargets}
              cupidPartners={cupidPartners}
            />
          </div>

          <div className="sp2-column sp2-column--actions" aria-label="Action grid">
            <span className="sp2-column__label">Actions</span>
            <ActionGrid
              selectedId={selectedActionId}
              onActionClick={handleActionClick}
              onPremiumLockedClick={handleRealityUpgrade}
              selectedTargetIds={targetMode === 'none' ? undefined : selectedPlayerIds}
              players={orderedPlayers}
              actorId={humanPlayer.id}
              actorEnergy={energy}
              actorInfluence={influence}
              actorInfo={info}
              relationships={relationships}
              primaryTargetStatus={
                effectivePrimaryTargetId
                  ? (game.players.find((player) => player.id === effectivePrimaryTargetId)
                      ?.status ?? null)
                  : null
              }
              dramaMode={dramaMode}
              currentPhase={game.phase}
              dramaNetwork={dramaNetwork}
              hiddenActionIds={hiddenContextualActionIds}
              energyCostOverrides={
                selectedActionId && totalCosts
                  ? { [selectedActionId]: totalCosts.energy }
                  : undefined
              }
            />
          </div>
        </div>

        {needsSubject && effectivePrimaryTargetId && (
          <div className="sp2-subject-picker" aria-label="Choose subject">
            <span className="sp2-subject-picker__label">Talking about:</span>
            {subjectCandidates.length === 0 ? (
              <span className="sp2-subject-picker__empty">No eligible targets</span>
            ) : (
              <div
                className="sp2-subject-picker__chips"
                role="group"
                aria-label="Subject candidates"
              >
                {subjectCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={`sp2-subject-chip${
                      selectedSubjectId === candidate.id ? ' sp2-subject-chip--selected' : ''
                    }`}
                    aria-pressed={selectedSubjectId === candidate.id}
                    onClick={() => {
                      setSelectedSubjectId((previous) =>
                        previous === candidate.id ? null : candidate.id
                      )
                      setFeedbackMsg(null)
                    }}
                  >
                    <PlayerAvatar player={candidate} size="sm" showRelationshipOutline={false} />
                    <span className="sp2-subject-chip__name">{candidate.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sp2-recent" aria-label="Recent Activity log">
          <RecentActivity
            players={game.players.filter((player) => !player.isUser)}
            dramaMode={dramaMode}
            humanId={humanPlayer.id}
            relationships={relationships}
          />
        </div>

        <footer className="sp2-footer">
          {feedbackMsg ? (
            <span className="sp2-footer__feedback" role="status" aria-live="polite">
              {feedbackMsg}
            </span>
          ) : executionEligibility.reason && selectedActionId ? (
            <span className="sp2-footer__feedback sp2-footer__feedback--hint">
              {executionEligibility.reason}
            </span>
          ) : (
            <span className="sp2-footer__cost">
              {totalCosts
                ? `Cost: ⚡${totalCosts.energy}${
                    totalCosts.influence ? ` · 🤝${totalCosts.influence}` : ''
                  }${totalCosts.info ? ` · 💡${totalCosts.info}` : ''}`
                : 'Cost: —'}
            </span>
          )}
          <button
            className={`sp2-footer__execute${successPulse ? ' sp2-footer__execute--pulse' : ''}`}
            type="button"
            disabled={!canExecute}
            aria-label="Execute"
            aria-busy={executing}
            onClick={handleExecute}
          >
            {executeCopy}
          </button>
        </footer>
      </div>
    </div>
  )
}
