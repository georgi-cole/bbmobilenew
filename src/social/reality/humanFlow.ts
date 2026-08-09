import type { AppDispatch, RootState } from '../../store/store'
import type { ExecuteActionResult } from '../SocialManeuvers'
import { executeAction, executeGroupAction, getActionById } from '../SocialManeuvers'
import { replaceRealityDomain, replaceRealitySimulation, updateRelationship } from '../socialSlice'
import { ALLIANCE_TAG } from '../socialAlliance'
import { getEffectiveSocialMode } from '../socialMode'
import { resolveActionTargetMode } from '../socialActions'
import {
  createInitialRealitySimulationState,
  deriveRealitySimulationSeed,
} from '../realitySimulation'
import { getRealityActionContract, type RealityActorSnapshot } from './actionContract'
import { runRealityOpportunity } from './orchestrator'
import { getRealityModeAdapter } from './modeAdapters'
import { applyRealityRelationshipChange } from './relationships'
import type { RealityContext } from './types'
import { getCupidPartnerId } from '../../features/twists/cupidArrow'

export interface HumanRealityActionInput {
  actorId: string
  targetId: string
  targetIds?: string[]
  actionId: string
  subjectId?: string
  costOverride?: { energy: number; influence: number; info: number }
}

const PHASE_REPETITION_SUCCESS_CHANCES = [0.8, 0.5, 0.25] as const
const INFORMATION_REPETITION_SUCCESS_CHANCES = [1, 0.75, 0.3] as const

function getHumanRepetitionSuccessChances(actionId: string): readonly number[] | null {
  const legacyAction = getActionById(actionId)
  if (legacyAction?.kind === 'intel_gain' && legacyAction.targetMode !== 'none') {
    return INFORMATION_REPETITION_SUCCESS_CHANCES
  }
  const contract = getRealityActionContract(actionId)
  if (
    contract?.purposes.includes('BOND') &&
    !contract.purposes.includes('COMMITMENT') &&
    !contract.purposes.includes('ROMANCE')
  ) {
    return PHASE_REPETITION_SUCCESS_CHANCES
  }
  return null
}

function getPhaseRepetitionChance(
  state: RootState,
  input: HumanRealityActionInput
): number | undefined {
  const successChances = getHumanRepetitionSuccessChances(input.actionId)
  if (!successChances) return undefined
  const priorAttempts = (state.social.actionHistory ?? []).filter(
    (entry) =>
      entry.actorId === input.actorId &&
      entry.targetId === input.targetId &&
      entry.actionId === input.actionId &&
      entry.week === state.game.week &&
      entry.phase === state.game.phase
  ).length
  return successChances[priorAttempts] ?? 0.02
}

function isDangerWarningDiscovered(state: RootState, input: HumanRealityActionInput): boolean {
  const source = [
    state.game.seed,
    state.game.week,
    state.game.lohId,
    input.actorId,
    input.targetId,
    input.actionId,
  ].join('|')
  let hash = 0x811c9dc5
  for (const character of source) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000 < 0.35
}

function buildActors(state: RootState): Record<string, RealityActorSnapshot> {
  return Object.fromEntries(
    state.game.players.map((player) => {
      const roles = [player.status]
      if (state.game.lohId === player.id && !roles.includes('loh')) roles.push('loh')
      if (state.game.posWinnerId === player.id && !roles.includes('pos')) roles.push('pos')
      return [
        player.id,
        {
          id: player.id,
          isHuman: player.isUser === true,
          active: player.status !== 'evicted' && player.status !== 'jury',
          roles,
          resources: {
            energy: state.social.energyBank[player.id] ?? 0,
            influence: state.social.influenceBank[player.id] ?? 0,
            info: state.social.infoBank[player.id] ?? 0,
          },
        },
      ]
    })
  )
}

function buildContext(state: RootState): RealityContext {
  const actors = buildActors(state)
  const mode = getRealityModeAdapter(state.game.mode, state.game.publicModeEnabled === true)
  return {
    day: state.game.week ?? 1,
    phase: state.game.phase,
    gameMode: mode.gameMode,
    socialIntensity: getEffectiveSocialMode(state) === 'drama' ? 'REALITY' : 'NORMAL',
    audienceMode: mode.audienceMode,
    feedPerspective: 'PLAYER_LIMITED',
    activeActorIds: Object.values(actors)
      .filter((actor) => actor.active)
      .map((actor) => actor.id),
    rolesByActor: Object.fromEntries(Object.values(actors).map((actor) => [actor.id, actor.roles])),
    atRiskActorIds: [...(state.game.nomineeIds ?? [])],
    powerHolderIds: [state.game.lohId, state.game.posWinnerId].filter((id): id is string =>
      Boolean(id)
    ),
    romanceEnabled: state.settings.gameUX.romanceStorylines,
  }
}

function result(
  success: boolean,
  summary: string,
  newEnergy: number,
  delta = 0,
  label = success ? 'Resolved' : 'Unavailable',
  score = 0
): ExecuteActionResult {
  return { success, summary, newEnergy, delta, label, score }
}

function playerName(state: RootState, playerId: string | null | undefined): string {
  if (!playerId) return 'that nominee'
  return state.game.players.find((player) => player.id === playerId)?.name ?? 'that nominee'
}

/**
 * The generic narrative used to keep describing a hypothetical Safety change
 * after the ceremony had already locked. Build the reply from the authoritative
 * block and persisted LOH plan instead.
 */
function buildLohConsultationSummary(
  state: RootState,
  input: HumanRealityActionInput,
  fallback: string
): string {
  if (input.actionId !== 'ask_loh_target' || state.game.lohId !== input.targetId) return fallback

  const plan =
    state.game.lohSocialPlan?.week === state.game.week &&
    state.game.lohSocialPlan.lohId === state.game.lohId
      ? state.game.lohSocialPlan
      : null
  const nominees = state.game.nomineeIds.filter((id) =>
    state.game.players.some(
      (player) => player.id === id && player.status !== 'evicted' && player.status !== 'jury'
    )
  )
  const finalBlockLocked = ['pos_ceremony_results', 'social_2', 'live_vote'].includes(
    state.game.phase
  )
  const actorHoldsSafety =
    state.game.posWinnerId === input.actorId ||
    getCupidPartnerId(state.game, state.game.posWinnerId) === input.actorId
  const safetyDecisionOpen =
    actorHoldsSafety && ['pos_results', 'pos_ceremony'].includes(state.game.phase)

  if (finalBlockLocked && nominees.length > 0) {
    const lockedTargetId =
      (plan?.currentTargetId && nominees.includes(plan.currentTargetId)
        ? plan.currentTargetId
        : null) ?? nominees[0]
    const lockedTarget = playerName(state, lockedTargetId)
    return `The block is locked. ${lockedTarget} is my main target, and that is who I want eliminated.`
  }

  if (safetyDecisionOpen && nominees.length > 0) {
    const currentTargetId =
      (plan?.currentTargetId && nominees.includes(plan.currentTargetId)
        ? plan.currentTargetId
        : null) ?? nominees[0]
    const backupId =
      plan?.backupTargetId && !nominees.includes(plan.backupTargetId) ? plan.backupTargetId : null

    if (backupId) {
      const saveId = nominees.find((id) => id !== currentTargetId) ?? nominees[0]
      return `Use it on ${playerName(state, saveId)}. Let's open the seat and backdoor ${playerName(
        state,
        backupId
      )}.`
    }
    return `No—do not use it. I want the nominations to stay the same, with ${playerName(
      state,
      currentTargetId
    )} as the target.`
  }

  return fallback
}

export function executeHumanRealityAction(input: HumanRealityActionInput) {
  return (dispatch: AppDispatch, getState: () => RootState): ExecuteActionResult => {
    const state = getState()
    const action = getActionById(input.actionId)
    const energy = state.social.energyBank[input.actorId] ?? 0
    const targetIds = input.targetIds ?? [input.targetId]
    if (!action) return result(false, 'Unknown action', energy)

    // Classic is a complete, independent social ruleset. It must never create
    // premium Reality events, causal memories, or simulation traces.
    if (getEffectiveSocialMode(state) !== 'drama') {
      const mode = resolveActionTargetMode(action, false)
      if (mode === 'multi') {
        return executeGroupAction(input.actorId, targetIds, input.actionId, {
          source: 'manual',
          costOverride: input.costOverride,
        })
      }
      if (targetIds.length > 1) {
        return targetIds
          .map((targetId, index) =>
            executeAction(input.actorId, targetId, input.actionId, {
              source: 'manual',
              subjectId: input.subjectId,
              waiveCosts: index > 0,
              costOverride: index === 0 ? input.costOverride : { energy: 0, influence: 0, info: 0 },
            })
          )
          .reduce<ExecuteActionResult>(
            (combined, entry, index) => ({
              success: combined.success || entry.success,
              summary:
                index === targetIds.length - 1
                  ? `Reached ${targetIds.length} housemates.`
                  : combined.summary,
              newEnergy: entry.newEnergy,
              delta: (combined.delta * index + entry.delta) / Math.max(1, index + 1),
              label: entry.label,
              score: (combined.score * index + entry.score) / Math.max(1, index + 1),
              targetDeltas: {
                ...(combined.targetDeltas ?? {}),
                [targetIds[index]]: entry.delta,
              },
            }),
            result(false, '', energy)
          )
      }
      return executeAction(
        input.actorId,
        mode === 'none' ? input.actorId : input.targetId,
        input.actionId,
        {
          source: 'manual',
          subjectId: input.subjectId,
          costOverride: input.costOverride,
        }
      )
    }

    const contract = getRealityActionContract(input.actionId)
    if (!contract) return result(false, 'Unknown action', energy)
    const direction =
      targetIds.length === 0 ? 'SELF' : targetIds.length > 1 ? 'GROUP' : 'HUMAN_TO_AI'
    let simulation = state.social.realitySimulation
    if (!simulation.rng) {
      simulation = createInitialRealitySimulationState(
        deriveRealitySimulationSeed(state.game.seed ?? 0, state.game.gameId ?? '')
      )
    }
    const context = buildContext(state)
    const orchestration = runRealityOpportunity({
      domain: state.social.reality,
      simulation,
      opportunity: {
        actorId: input.actorId,
        direction,
        context,
        actors: buildActors(state),
        candidates: [
          {
            action: contract,
            targetIds,
            subjectId: input.subjectId,
            acceptanceChanceOverride: getPhaseRepetitionChance(state, input),
          },
        ],
      },
    })
    if (!orchestration.event) {
      dispatch(replaceRealityDomain(orchestration.domain))
      dispatch(replaceRealitySimulation(orchestration.simulation))
      const reason =
        orchestration.response?.kind === 'COUNTER'
          ? 'They made a counteroffer.'
          : orchestration.selectedActionId
            ? 'They were not ready to resolve that conversation.'
            : orchestration.simulation.trace.at(-1)?.reason === 'no_eligible_candidate'
              ? 'That action is not valid in this situation.'
              : 'No action was selected.'
      return result(false, reason, energy, 0, orchestration.response?.kind ?? 'Unavailable')
    }
    const succeeded = orchestration.event.outcome !== 'FAILURE'
    const dangerWarningDiscovered =
      succeeded &&
      input.actionId === 'warn_about_danger' &&
      Boolean(state.game.lohId) &&
      state.game.lohId !== input.actorId &&
      isDangerWarningDiscovered(state, input)
    if (dangerWarningDiscovered && state.game.lohId) {
      applyRealityRelationshipChange(orchestration.domain, {
        sourceId: state.game.lohId,
        targetId: input.actorId,
        deltas: { trust: -7, warmth: -4, suspicion: 9, resentment: 4, familiarity: 2 },
        day: state.game.week,
        phase: state.game.phase,
        eventId: `warning-discovered:${state.game.week}:${input.actorId}:${input.targetId}`,
        anchor: 'negative',
      })
    }
    const actionTargetMode = resolveActionTargetMode(action, context.socialIntensity === 'REALITY')
    const compatibility =
      direction === 'GROUP' && actionTargetMode === 'multi'
        ? executeGroupAction(input.actorId, targetIds, input.actionId, {
            source: 'manual',
            outcome: succeeded ? 'success' : 'failure',
            costOverride: input.costOverride ?? contract.costs[context.socialIntensity],
          })
        : direction === 'GROUP'
          ? targetIds
              .map((targetId, index) =>
                executeAction(input.actorId, targetId, input.actionId, {
                  source: 'manual',
                  subjectId: input.subjectId,
                  outcome: succeeded ? 'success' : 'failure',
                  repetitionAlreadyResolved: true,
                  waiveCosts: index > 0,
                  costOverride:
                    index === 0
                      ? (input.costOverride ?? contract.costs[context.socialIntensity])
                      : { energy: 0, influence: 0, info: 0 },
                })
              )
              .reduce<ExecuteActionResult>(
                (combined, entry, index) => ({
                  success: combined.success || entry.success,
                  summary:
                    index === targetIds.length - 1
                      ? `Reached ${targetIds.length} housemates.`
                      : combined.summary,
                  newEnergy: entry.newEnergy,
                  delta: (combined.delta * index + entry.delta) / Math.max(1, index + 1),
                  label: orchestration.response?.kind ?? entry.label,
                  score: (combined.score * index + entry.score) / Math.max(1, index + 1),
                  targetDeltas: {
                    ...(combined.targetDeltas ?? {}),
                    [targetIds[index]]: entry.delta,
                  },
                }),
                result(false, '', energy)
              )
          : executeAction(
              input.actorId,
              direction === 'SELF' ? input.actorId : input.targetId,
              input.actionId,
              {
                source: 'manual',
                subjectId: input.subjectId,
                outcome: succeeded ? 'success' : 'failure',
                repetitionAlreadyResolved: true,
                costOverride: input.costOverride ?? contract.costs[context.socialIntensity],
              }
            )
    // Legacy execution preserves specialized ceremony copy and existing game
    // adapters. Restore the causal v3 world afterward so its directed result
    // is not counted a second time by the compatibility relationship write.
    dispatch(replaceRealityDomain(orchestration.domain))
    dispatch(replaceRealitySimulation(orchestration.simulation))
    // An accepted human alliance is authoritative in both relationship models.
    // Projecting the Reality domain can otherwise leave one legacy direction
    // just below the threshold used by badges and action eligibility.
    if (succeeded && input.actionId === 'proposeAlliance' && targetIds.length === 1) {
      dispatch(
        updateRelationship({
          source: input.actorId,
          target: input.targetId,
          delta: 0,
          tags: [ALLIANCE_TAG],
          actionSource: 'manual',
        })
      )
      dispatch(
        updateRelationship({
          source: input.targetId,
          target: input.actorId,
          delta: 0,
          tags: [ALLIANCE_TAG],
          actionSource: 'manual',
        })
      )
    }
    const baseSummary =
      input.actionId === 'warn_about_danger' && succeeded
        ? dangerWarningDiscovered
          ? `${
              state.game.players.find((player) => player.id === input.targetId)?.name ?? 'They'
            } appreciated the warning, but the LOH found out you leaked the plan.`
          : `${
              state.game.players.find((player) => player.id === input.targetId)?.name ?? 'They'
            } appreciated the warning and kept your source private.`
        : compatibility.summary
    return {
      ...compatibility,
      summary: buildLohConsultationSummary(state, input, baseSummary),
      label: orchestration.response?.kind ?? compatibility.label,
      score: orchestration.score?.total ?? compatibility.score,
    }
  }
}
