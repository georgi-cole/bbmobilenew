/**
 * socialAIDriver — budget-aware social decision loop for AI housemates.
 *
 * Normal Mode uses the compact utility policy. Drama Mode first asks the
 * persistent story engine for a candidate, then falls back to the same legal,
 * contextual policy. Every candidate is validated through the shared execution
 * contract before resources or relationships can change.
 */

import { chooseActionFor, chooseTargetsFor } from './SocialPolicy'
import { canAfford, executeAction, executeGroupAction, getActionById } from './SocialManeuvers'
import { resolveActionTargetMode } from './socialActions'
import { isAISocialActionVisible } from './socialActionCatalog'
import { normalizeActionCosts } from './smExecNormalize'
import { socialConfig } from './socialConfig'
import {
  applyEnergyDelta,
  applyInfoDelta,
  applyInfluenceDelta,
  recordSocialAction,
  replaceRealityDomain,
  replaceRealitySimulation,
  scheduleIncomingInteraction,
  updateRelationship,
} from './socialSlice'
import {
  assignDeliverySlot,
  buildDeliverySlotCounts,
  buildPendingIncomingInteractions,
  getInteractionDedupeReason,
  getIncomingInteractionPriority,
} from './incomingInteractionScheduler'
import { createIncomingInteraction } from './incomingInteractionFactory'
import { createDeterministicSocialRandom, validateSocialExecution } from './socialExecutionGuard'
import { getPersistentSocialHistory, type SocialStateWithHistory } from './socialHistory'
import { getEffectiveSocialMode } from './socialMode'
import { isIncomingInteractionActionable } from './socialRuntimeConfig'
import type {
  DramaSocialNetwork,
  IncomingInteraction,
  IncomingInteractionDeliveryState,
  IncomingInteractionType,
  RelationshipsMap,
  ScheduledIncomingInteraction,
  SocialActionLogEntry,
  SocialMemoryMap,
} from './types'
import type { RealityDomainState } from './reality'
import {
  REALITY_ACTION_BY_ID,
  projectRealityAffinity,
  runRealityOpportunity,
  type RealityActorSnapshot,
  type RealityContext,
} from './reality'
import { getRealityModeAdapter } from './reality'
import {
  createInitialRealitySimulationState,
  deriveRealitySimulationSeed,
  type RealitySimulationState,
} from './realitySimulation'
import { normalizeDramaSocialNetwork } from './dramaModeEngine'
import { chooseUtilityDramaAIMove } from './dramaAIPolicy'

interface StoreAPI {
  dispatch: (action: unknown) => unknown
  getState: () => unknown
}

interface DriverPlayer {
  id: string
  name: string
  status: string
  isUser?: boolean
}

interface DriverState {
  game: {
    players: DriverPlayer[]
    seed: number
    week: number
    phase: string
    mode?: 'classic' | 'survival'
    publicModeEnabled?: boolean
    dramaSocialMode?: boolean
    lohId?: string | null
    posWinnerId?: string | null
    nomineeIds?: string[]
    povProtectedIds?: string[]
  }
  social: {
    energyBank: Record<string, number>
    influenceBank: Record<string, number>
    infoBank: Record<string, number>
    relationships: RelationshipsMap
    socialMemory: SocialMemoryMap
    dramaNetwork: DramaSocialNetwork
    sessionLogs: SocialActionLogEntry[]
    actionHistory?: SocialActionLogEntry[]
    incomingInteractions?: IncomingInteraction[]
    scheduledIncomingInteractions?: ScheduledIncomingInteraction[]
    incomingInteractionDelivery?: IncomingInteractionDeliveryState
    reality: RealityDomainState
    realitySimulation: RealitySimulationState
  }
  settings?: { gameUX?: { dramaMode?: boolean; romanceStorylines?: boolean } }
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
}

function buildRealityActors(state: DriverState): Record<string, RealityActorSnapshot> {
  return Object.fromEntries(
    state.game.players.map((actor) => {
      const roles = [actor.status]
      if (state.game.lohId === actor.id && !roles.includes('loh')) roles.push('loh')
      if (state.game.posWinnerId === actor.id && !roles.includes('pos')) roles.push('pos')
      return [
        actor.id,
        {
          id: actor.id,
          isHuman: actor.isUser === true,
          active: actor.status !== 'evicted' && actor.status !== 'jury',
          roles,
          resources: {
            energy: state.social.energyBank[actor.id] ?? 0,
            influence: state.social.influenceBank[actor.id] ?? 0,
            info: state.social.infoBank[actor.id] ?? 0,
          },
        },
      ]
    })
  )
}

function buildRealityContext(state: DriverState): RealityContext {
  const actors = buildRealityActors(state)
  const mode = getRealityModeAdapter(state.game.mode, state.game.publicModeEnabled === true)
  return {
    day: state.game.week ?? 1,
    phase: state.game.phase ?? 'social_1',
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
    romanceEnabled: state.settings?.gameUX?.romanceStorylines !== false,
  }
}

function executeRealityCandidate(
  state: DriverState,
  player: DriverPlayer,
  candidate: CandidateMove
): boolean {
  if (!_store) return false
  const contract = REALITY_ACTION_BY_ID.get(candidate.actionId)
  if (!contract || !state.social.realitySimulation.rng) return false
  const action = getActionById(candidate.actionId)
  if (!action) return false
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const mode = resolveActionTargetMode(action, dramaMode)
  const direction = mode === 'none' ? 'SELF' : mode === 'multi' ? 'GROUP' : 'AI_TO_AI'
  const beforeAffinities = Object.fromEntries(
    candidate.targetIds.map((targetId) => [
      targetId,
      projectRealityAffinity(state.social.reality.relationships[player.id]?.[targetId]),
    ])
  )
  const result = runRealityOpportunity({
    domain: state.social.reality,
    simulation: state.social.realitySimulation,
    opportunity: {
      actorId: player.id,
      direction,
      context: buildRealityContext(state),
      actors: buildRealityActors(state),
      candidates: [
        {
          action: contract,
          targetIds: candidate.targetIds,
          subjectId: candidate.subjectId,
        },
      ],
    },
  })
  if (!result.event) {
    _store.dispatch(replaceRealityDomain(result.domain))
    _store.dispatch(replaceRealitySimulation(result.simulation))
    return false
  }
  const costs = normalizeActionCosts(action, candidate.targetIds.length, dramaMode)
  _store.dispatch(applyEnergyDelta({ playerId: player.id, delta: -costs.energy }))
  if (costs.influence > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: player.id, delta: -costs.influence }))
  }
  if (costs.info > 0) {
    _store.dispatch(applyInfoDelta({ playerId: player.id, delta: -costs.info }))
  }
  const compatibilityDeltas = Object.fromEntries(
    candidate.targetIds.map((targetId) => [
      targetId,
      projectRealityAffinity(result.domain.relationships[player.id]?.[targetId]) -
        (beforeAffinities[targetId] ?? 0),
    ])
  )
  for (const [targetId, compatibilityDelta] of Object.entries(compatibilityDeltas)) {
    _store.dispatch(
      updateRelationship({
        source: player.id,
        target: targetId,
        delta: compatibilityDelta,
        actionSource: 'system',
      })
    )
  }
  const deltas = Object.values(compatibilityDeltas)
  const compatibilityDelta =
    deltas.reduce((sum, delta) => sum + delta, 0) / Math.max(1, deltas.length)
  const primaryTargetId = candidate.targetIds[0] ?? player.id
  const latestState = _store.getState() as DriverState
  _store.dispatch(
    recordSocialAction({
      entry: {
        actionId: candidate.actionId,
        actorId: player.id,
        targetId: primaryTargetId,
        targetIds: candidate.targetIds,
        ...(candidate.subjectId ? { subjectId: candidate.subjectId } : {}),
        cost: costs.energy,
        costs,
        delta: compatibilityDelta,
        outcome: result.event.outcome === 'FAILURE' ? 'failure' : 'success',
        newEnergy: latestState.social.energyBank[player.id] ?? 0,
        balancesAfter: {
          energy: latestState.social.energyBank[player.id] ?? 0,
          influence: latestState.social.influenceBank[player.id] ?? 0,
          info: latestState.social.infoBank[player.id] ?? 0,
        },
        timestamp: (state.game.week ?? 1) * 1_000_000 + result.event.sequence,
        week: state.game.week,
        source: 'system',
        score: result.score?.total,
        label: result.response?.kind ?? 'Resolved',
      },
    })
  )
  // Replace after compatibility dispatches so the v3 causal outcome remains
  // authoritative instead of receiving a second legacy projection.
  _store.dispatch(replaceRealityDomain(result.domain))
  _store.dispatch(replaceRealitySimulation(result.simulation))
  return true
}

type HumanRouteResult = 'scheduled' | 'deferred' | 'blocked'

interface CandidateMove {
  actionId: string
  targetIds: string[]
  subjectId?: string
  reason: string
}

const MAX_TICKS = () => socialConfig.maxTicksPerPhase

let _store: StoreAPI | null = null
let _timer: ReturnType<typeof setInterval> | null = null
let _running = false
let _tickCount = 0
let _actionsExecuted = 0

export function setStore(store: StoreAPI): void {
  _store = store
}

export function start(): void {
  if (!_store || _running) return

  const state = _store.getState() as DriverState
  const aiPlayers = getAIPlayers(state)
  const budgets = state.social?.energyBank ?? {}
  if (!aiPlayers.some((player) => (budgets[player.id] ?? 0) > 0)) return

  _running = true
  _tickCount = 0
  _actionsExecuted = 0

  if (socialConfig.verbose) {
    console.debug(
      '[socialAIDriver] started – AI players:',
      aiPlayers.map((player) => player.id)
    )
  }

  _timer = setInterval(tick, socialConfig.tickIntervalMs)
}

export function stop(): void {
  _running = false
  clearTimer()

  if (socialConfig.verbose) {
    console.debug(`[socialAIDriver] stopped – ticks: ${_tickCount}, actions: ${_actionsExecuted}`)
  }
}

export function getStatus(): {
  running: boolean
  tickCount: number
  actionsExecuted: number
} {
  return { running: _running, tickCount: _tickCount, actionsExecuted: _actionsExecuted }
}

export const socialAIDriver = { setStore, start, stop, getStatus }

function getAIPlayers(state: DriverState): DriverPlayer[] {
  return (state.game?.players ?? []).filter(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
}

function clearTimer(): void {
  if (_timer !== null) {
    clearInterval(_timer)
    _timer = null
  }
}

const HUMAN_FACING_ACTION_TYPES: Partial<Record<string, IncomingInteractionType>> = {
  ally: 'alliance_proposal',
  proposeAlliance: 'alliance_proposal',
  compliment: 'compliment',
  protect: 'deal_offer',
  whisper: 'gossip',
  share_intel: 'gossip',
  rumor: 'warning',
  confront: 'snide_remark',
  startFight: 'snide_remark',
  ask_use_safety: 'deal_offer',
  nominate: 'warning',
  group_chat: 'other',
}

const HUMAN_FACING_ACTION_TEXT: Partial<Record<string, string[]>> = {
  ally: [
    'I think our games fit together. I want to make this official—are you in?',
    'The house is splitting, and I would rather have you beside me. Want to work together?',
  ],
  proposeAlliance: [
    'I trust what we have been building. Are you ready to call it an alliance?',
    'I see a real path for us if we commit now. Are you in?',
  ],
  compliment: [
    'You handled the pressure well today. I wanted you to hear that directly from me.',
    'The way you carried yourself today stood out—in a good way.',
  ],
  protect: [
    'I may be able to keep heat off you this week, but I need to know we are working together.',
    'Your name is vulnerable. I can help, if we can trust each other.',
  ],
  whisper: [
    'I heard something privately that could change how you read this week.',
    'There is a quiet conversation happening that you should know about.',
  ],
  share_intel: [
    'I have information that could matter to your next move.',
    'I learned something useful, but I need to know what you will do with it.',
  ],
  rumor: [
    'Your name is coming up more than you may realize. I thought you deserved a warning.',
    'The tone changes when you leave the room. Be careful who you trust.',
  ],
  confront: [
    'We need to clear the air about how you have been moving.',
    'Something between us is not adding up, and I want a direct answer.',
  ],
  startFight: [
    'I am done pretending everything between us is fine.',
    'You crossed a line with me, and I am not letting it slide.',
  ],
  ask_use_safety: [
    'Before the Safety decision, I need to know whether you would use it to help me.',
    'You hold Safety, and that makes this conversation urgent: would you save me?',
  ],
  nominate: [
    'I am considering putting your name in danger this week. Give me a reason not to.',
    'Your name is part of my plan right now, and I wanted to hear what you would say.',
  ],
  group_chat: [
    'A few of us are comparing notes. You can join in, observe, challenge the plan, or keep your distance.',
    'There is a group conversation forming right now. How visible do you want to be in it?',
  ],
}

function pickHumanFacingText(
  actionId: string,
  actorId: string,
  week: number,
  phase: string
): string {
  const variants = HUMAN_FACING_ACTION_TEXT[actionId] ?? ['I wanted to talk to you directly.']
  const random = createDeterministicSocialRandom([actorId, actionId, week, phase])
  return variants[Math.floor(random() * variants.length)] ?? variants[0]
}

function routeHumanFacingAction(
  actorId: string,
  actionId: string,
  subjectId: string | undefined,
  costs: { energy: number; influence: number; info: number },
  sceneTargetIds?: string[]
): HumanRouteResult {
  if (!_store) return 'blocked'
  const type = HUMAN_FACING_ACTION_TYPES[actionId] ?? 'other'

  const current = _store.getState() as DriverState
  const human = current.game.players.find((player) => player.isUser)
  if (!human) return 'blocked'

  if (actionId === 'nominate') {
    const isProtected =
      current.game.posWinnerId === human.id ||
      current.game.povProtectedIds?.includes(human.id) ||
      human.status.includes('pos')
    const relationship = current.social.relationships[actorId]?.[human.id]
    const isTrustedAlly =
      (relationship?.affinity ?? 0) >= 30 || relationship?.tags.includes('alliance') === true
    if (isProtected || current.game.lohId !== actorId || isTrustedAlly) return 'blocked'
  }

  const week = current.game.week ?? 1
  const phase = current.game.phase
  const deterministicSequence = current.social.reality.nextSequence
  const now = week * 1_000_000 + deterministicSequence
  const scheduled = current.social.scheduledIncomingInteractions ?? []
  const pending = buildPendingIncomingInteractions(
    current.social.incomingInteractions ?? [],
    scheduled
  )
  const directContactsThisWeek = pending.filter(
    (entry) => entry.createdWeek === week && entry.payload?.source === 'background_social'
  ).length
  if (
    directContactsThisWeek >= 2 ||
    pending.filter((entry) => entry.createdWeek === week).length >=
      socialConfig.incomingInteractionConfig.maxPerWeek
  ) {
    return 'deferred'
  }

  const mode = getEffectiveSocialMode(current)
  const interaction = createIncomingInteraction({
    id: `ai-action-${actionId}-${actorId}-${deterministicSequence}`,
    fromId: actorId,
    type,
    text: pickHumanFacingText(actionId, actorId, week, phase),
    week,
    phase,
    mode,
    payload: {
      originActionId: actionId,
      scenarioKey: `background_${actionId}`,
      variantFamilyId: `background_${actionId}`,
      source: 'background_social',
      ...(actionId === 'group_chat' ? { groupScene: true } : {}),
      ...(subjectId ? { subjectId } : {}),
    },
  })
  const priority = getIncomingInteractionPriority(type)
  if (
    getInteractionDedupeReason({
      interaction,
      priority,
      pendingInteractions: pending,
      week,
    })
  ) {
    return 'deferred'
  }

  const deliveredThisPhase =
    current.social.incomingInteractionDelivery?.lastDeliveryPhase === phase &&
    current.social.incomingInteractionDelivery?.lastDeliveryWeek === week
      ? current.social.incomingInteractionDelivery.deliveredThisPhase
      : 0
  const slot = assignDeliverySlot({
    phase,
    week,
    priority,
    slotCounts: buildDeliverySlotCounts(scheduled, phase, week, deliveredThisPhase),
    visibleActiveCount: (current.social.incomingInteractions ?? []).filter(
      (entry) => !entry.resolved && isIncomingInteractionActionable(entry)
    ).length,
  })
  if (!slot) return 'deferred'

  let simulation = current.social.realitySimulation
  if (!simulation.rng) {
    simulation = createInitialRealitySimulationState(
      deriveRealitySimulationSeed(current.game.seed ?? 0, `social:${current.game.week}`)
    )
  }
  const contract = REALITY_ACTION_BY_ID.get(actionId)
  if (!contract) return 'blocked'
  const targetIds = sceneTargetIds?.length ? sceneTargetIds : [human.id]
  const realityResult = runRealityOpportunity({
    domain: current.social.reality,
    simulation,
    opportunity: {
      actorId,
      direction: targetIds.length > 1 ? 'GROUP' : 'AI_TO_HUMAN',
      context: buildRealityContext(current),
      actors: buildRealityActors(current),
      candidates: [{ action: contract, targetIds, subjectId }],
    },
  })
  if (!realityResult.interaction || realityResult.event) return 'blocked'
  interaction.payload ??= {}
  interaction.payload.realityInteractionId = realityResult.interaction.id
  _store.dispatch(replaceRealityDomain(realityResult.domain))
  _store.dispatch(replaceRealitySimulation(realityResult.simulation))

  _store.dispatch(applyEnergyDelta({ playerId: actorId, delta: -costs.energy }))
  if (costs.influence > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -costs.influence }))
  }
  if (costs.info > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -costs.info }))
  }
  _store.dispatch(
    scheduleIncomingInteraction({
      interaction,
      priority,
      scheduledAt: now,
      scheduledForWeek: slot.scheduledForWeek,
      scheduledForPhase: slot.scheduledForPhase,
      deliveryReason: slot.deliveryReason,
    })
  )
  return 'scheduled'
}

function groupTargets(state: DriverState, actorId: string, maximum = 3): string[] {
  return state.game.players
    .filter(
      (player) => player.id !== actorId && player.status !== 'evicted' && player.status !== 'jury'
    )
    .sort(
      (left, right) =>
        (state.social.relationships[actorId]?.[right.id]?.affinity ?? 0) -
          (state.social.relationships[actorId]?.[left.id]?.affinity ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, maximum)
    .map((player) => player.id)
}

function candidateForPlayer(
  state: DriverState,
  player: DriverPlayer,
  attempt: number
): CandidateMove | null {
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const history = getPersistentSocialHistory(state.social as SocialStateWithHistory)
  const dramaMove =
    dramaMode && attempt === 0
      ? chooseUtilityDramaAIMove({
          actorId: player.id,
          players: state.game.players,
          relationships: state.social.relationships,
          memory: state.social.socialMemory,
          network: normalizeDramaSocialNetwork(state.social.dramaNetwork),
          recentActions: history,
          week: state.game.week ?? 0,
          phase: state.game.phase ?? '',
          seed: state.game.seed ?? 0,
          tick: _tickCount,
          lohId: state.game.lohId,
          posWinnerId: state.game.posWinnerId,
          nomineeIds: state.game.nomineeIds,
        })
      : null

  const actionId =
    dramaMove?.actionId ??
    chooseActionFor(player.id, {
      players: state.game.players,
      relationships: state.social.relationships,
      week: state.game.week,
      seed: state.game.seed,
      phase: state.game.phase,
      decisionIndex: _tickCount * 5 + attempt,
      recentActions: history,
      availableActionIds: Object.keys(socialConfig.actionWeights).filter((candidateId) =>
        isAISocialActionVisible(candidateId, dramaMode ? 'drama' : 'normal')
      ),
    } as Parameters<typeof chooseActionFor>[1])
  if (actionId === 'idle') return null

  const action = getActionById(actionId)
  if (!action) return null
  const mode = resolveActionTargetMode(action, dramaMode)
  let targetIds: string[] = []
  let subjectId: string | undefined

  if (mode === 'none') {
    targetIds = []
  } else if (mode === 'multi') {
    targetIds = groupTargets(state, player.id, action.maxTargets ?? 3)
  } else if (dramaMove) {
    targetIds = [dramaMove.targetId]
    subjectId = dramaMove.subjectId
  } else {
    const selected = chooseTargetsFor(player.id, actionId, {
      players: state.game.players,
      relationships: state.social.relationships,
      week: state.game.week,
      seed: state.game.seed,
      phase: state.game.phase,
      decisionIndex: _tickCount * 5 + attempt,
      recentActions: history,
    } as Parameters<typeof chooseTargetsFor>[2])
    targetIds = selected.length > 0 ? [selected[0]] : []
    subjectId = selected[1]
  }

  const eligibility = validateSocialExecution(state, {
    action,
    actorId: player.id,
    targetIds,
    subjectId,
    requireCompleteSelection: true,
    allowAIOnly: true,
  })
  if (!eligibility.eligible) return null

  const costs = normalizeActionCosts(action, targetIds.length, dramaMode)
  if (!canAfford(player.id, costs)) return null

  return {
    actionId,
    targetIds,
    subjectId,
    reason: dramaMove?.reason ?? `contextual policy attempt ${attempt + 1}`,
  }
}

function executeCandidate(
  state: DriverState,
  player: DriverPlayer,
  candidate: CandidateMove
): boolean {
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const action = getActionById(candidate.actionId)
  if (!action) return false
  const mode = resolveActionTargetMode(action, dramaMode)
  const costs = normalizeActionCosts(action, candidate.targetIds.length, dramaMode)
  const primaryTargetId = candidate.targetIds[0]
  const primaryTarget = state.game.players.find((target) => target.id === primaryTargetId)

  if (primaryTarget?.isUser && mode !== 'multi') {
    const route = routeHumanFacingAction(
      player.id,
      candidate.actionId,
      candidate.subjectId,
      costs,
      [primaryTarget.id]
    )
    if (route === 'scheduled') return true
    if (route === 'blocked' || route === 'deferred') return false
  }

  if (
    mode === 'multi' &&
    candidate.targetIds.some(
      (targetId) => state.game.players.find((target) => target.id === targetId)?.isUser
    )
  ) {
    const route = routeHumanFacingAction(
      player.id,
      candidate.actionId,
      candidate.subjectId,
      costs,
      candidate.targetIds
    )
    if (route === 'scheduled') return true
    if (route === 'blocked' || route === 'deferred') return false
  }

  if (dramaMode) return executeRealityCandidate(state, player, candidate)

  if (mode === 'multi') {
    return executeGroupAction(player.id, candidate.targetIds, candidate.actionId, {
      source: 'system',
    }).success
  }
  return executeAction(
    player.id,
    mode === 'none' ? player.id : primaryTargetId,
    candidate.actionId,
    {
      source: 'system',
      subjectId: candidate.subjectId,
    }
  ).success
}

function tick(): void {
  if (!_store || !_running) {
    clearTimer()
    return
  }

  _tickCount += 1
  const state = _store.getState() as DriverState
  const aiPlayers = getAIPlayers(state)
  const budgets = state.social?.energyBank ?? {}

  if (_tickCount >= MAX_TICKS()) {
    stop()
    return
  }
  if (!socialConfig.allowOverspend && !aiPlayers.some((player) => (budgets[player.id] ?? 0) > 0)) {
    stop()
    return
  }

  for (const player of aiPlayers) {
    if ((budgets[player.id] ?? 0) <= 0) continue

    let executed = false
    for (let attempt = 0; attempt < 4 && !executed; attempt += 1) {
      const freshState = _store.getState() as DriverState
      const candidate = candidateForPlayer(freshState, player, attempt)
      if (!candidate) continue
      executed = executeCandidate(freshState, player, candidate)
    }
    if (executed) _actionsExecuted += 1
  }

  if (!socialConfig.allowOverspend) {
    const updatedBudgets = (_store.getState() as DriverState).social?.energyBank ?? {}
    if (!aiPlayers.some((player) => (updatedBudgets[player.id] ?? 0) > 0)) stop()
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>)['__smAutoDriver'] = {
    start,
    stop,
    getStatus,
  }
}
