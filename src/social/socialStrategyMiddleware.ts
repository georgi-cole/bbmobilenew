import type { Middleware } from '@reduxjs/toolkit'
import type { GameState, Player } from '../types'
import { addTvEvent } from '../store/gameSlice'
import {
  applyRealityRelationshipDelta,
  learnRealityKnowledge,
  pushIncomingInteraction,
  recordIntelligenceDelivery,
} from './socialSlice'
import { makeIntelMemory, selectIntelFactForActor } from './intelligenceSystem'
import type { SocialActionLogEntry, SocialState } from './types'

const MIN_STRATEGY_DAY = 3
const COMPETITION_EXIT_THRESHOLD = 3
const QUIET_STREAK_THRESHOLD = 2
const STRATEGY_WARNING_COOLDOWN_DAYS = 2
const MISINFORMATION_COOLDOWN_DAYS = 2
const MAX_OBSERVERS = 3

const REPAIR_ACTIONS = new Set([
  'compliment',
  'reassure',
  'whisper',
  'build_quiet_bond',
  'share_personal_story',
  'group_chat',
])

const STRATEGIC_NUDGES: Record<
  string,
  { suspicion: number; perceivedThreat: number; trust: number; warmth?: number }
> = {
  pitch_target: { suspicion: 8, perceivedThreat: 12, trust: -4, warmth: -2 },
  suggest_replacement: { suspicion: 6, perceivedThreat: 10, trust: -3, warmth: -1 },
  rally_votes_against: { suspicion: 7, perceivedThreat: 11, trust: -4, warmth: -2 },
  warn_about_player: { suspicion: 10, perceivedThreat: 7, trust: -3, warmth: -1 },
}

type ChallengeHistoryEntry = {
  partial?: boolean
  participants?: string[]
}

type StrategyRootState = {
  game: GameState
  social: SocialState
  challenge?: { history?: ChallengeHistoryEntry[] }
}

export interface BehaviorPressure {
  partialExitCount: number
  quietStreak: number
  exitPressure: number
  quietPressure: number
  total: number
}

interface DayEndPlan {
  pressure: BehaviorPressure
  observerIds: string[]
  misinformationListenerIds: string[]
}

function hashString(source: string): number {
  let value = 2166136261
  for (const character of source) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function seededUnit(seed: number, salt: string): number {
  let value = (seed ^ hashString(salt)) >>> 0
  value += 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function activePlayers(state: StrategyRootState): Player[] {
  return state.game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
}

function humanPlayer(state: StrategyRootState): Player | null {
  return activePlayers(state).find((player) => player.isUser) ?? null
}

function socialHistory(state: StrategyRootState): SocialActionLogEntry[] {
  return state.social.actionHistory ?? state.social.sessionLogs ?? []
}

function manualActionCountForDay(
  state: StrategyRootState,
  humanId: string,
  day: number
): number {
  return socialHistory(state).filter(
    (entry) =>
      entry.actorId === humanId &&
      entry.source !== 'system' &&
      (entry.week ?? state.game.week) === day
  ).length
}

function getQuietStreak(state: StrategyRootState, humanId: string): number {
  let streak = 0
  for (let day = state.game.week; day >= 1 && streak < 5; day -= 1) {
    if (manualActionCountForDay(state, humanId, day) > 0) break
    streak += 1
  }
  return streak
}

function getPartialExitCount(state: StrategyRootState, humanId: string): number {
  return (state.challenge?.history ?? []).filter(
    (run) => run.partial === true && (run.participants ?? []).includes(humanId)
  ).length
}

export function deriveBehaviorPressure(input: {
  partialExitCount: number
  quietStreak: number
}): BehaviorPressure {
  const exitPressure =
    input.partialExitCount >= COMPETITION_EXIT_THRESHOLD
      ? Math.min(3, input.partialExitCount - COMPETITION_EXIT_THRESHOLD + 1)
      : 0
  const quietPressure =
    input.quietStreak >= QUIET_STREAK_THRESHOLD
      ? Math.min(3, input.quietStreak - QUIET_STREAK_THRESHOLD + 1)
      : 0
  return {
    partialExitCount: input.partialExitCount,
    quietStreak: input.quietStreak,
    exitPressure,
    quietPressure,
    total: exitPressure + quietPressure,
  }
}

function relationshipAffinity(state: StrategyRootState, sourceId: string, targetId: string): number {
  return state.social.relationships[sourceId]?.[targetId]?.affinity ?? 0
}

function relationshipTags(state: StrategyRootState, sourceId: string, targetId: string): Set<string> {
  return new Set(state.social.relationships[sourceId]?.[targetId]?.tags ?? [])
}

function isActiveNemesis(state: StrategyRootState, ownerId: string, targetId: string): boolean {
  return Object.values(state.social.reality?.relationshipAutonomy?.nemeses ?? {}).some(
    (nemesis) =>
      nemesis.status === 'ACTIVE' && nemesis.ownerId === ownerId && nemesis.targetId === targetId
  )
}

function rankSuspicionObservers(
  state: StrategyRootState,
  humanId: string,
  day: number,
  count: number
): Player[] {
  return activePlayers(state)
    .filter((player) => player.id !== humanId && !player.isUser)
    .map((player) => {
      const tags = relationshipTags(state, player.id, humanId)
      const affinity = relationshipAffinity(state, player.id, humanId)
      let score = -affinity
      if (isActiveNemesis(state, player.id, humanId)) score += 90
      if (tags.has('target')) score += 50
      if (tags.has('rivalry')) score += 42
      if (tags.has('betrayal')) score += 35
      if (tags.has('alliance')) score -= 55
      score += seededUnit(state.game.seed ?? 0, `social-strategy-observer:${day}:${player.id}`) * 14
      return { player, score }
    })
    .sort((left, right) => right.score - left.score || left.player.id.localeCompare(right.player.id))
    .slice(0, count)
    .map((entry) => entry.player)
}

function hasRecentIncomingSource(
  state: StrategyRootState,
  source: string,
  currentDay: number,
  cooldownDays: number
): boolean {
  return (state.social.incomingInteractions ?? []).some(
    (interaction) =>
      interaction.payload?.source === source &&
      interaction.createdWeek >= Math.max(1, currentDay - cooldownDays + 1)
  )
}

function chooseFriendlyWarningSource(
  state: StrategyRootState,
  humanId: string
): Player | null {
  const candidates = activePlayers(state)
    .filter((player) => player.id !== humanId && !player.isUser)
    .filter((player) => {
      const tags = relationshipTags(state, player.id, humanId)
      return !tags.has('target') && !tags.has('rivalry') && !tags.has('betrayal')
    })
    .map((player) => ({
      player,
      affinity: relationshipAffinity(state, player.id, humanId),
    }))
    .filter((entry) => entry.affinity >= 15)
    .sort((left, right) => right.affinity - left.affinity || left.player.id.localeCompare(right.player.id))
  return candidates[0]?.player ?? null
}

function warningText(pressure: BehaviorPressure): string {
  if (pressure.exitPressure > 0 && pressure.quietPressure > 0) {
    return "People are starting to connect the dots: leaving competitions early and keeping your distance looks deliberate. I thought you should know before 'secret agenda' becomes the easy story about you."
  }
  if (pressure.exitPressure > 0) {
    return "A few people have noticed how often you've left competitions early. They're starting to wonder whether you're hiding your real level."
  }
  return "You've been hard to read lately. Some people are starting to call it a secret agenda instead of a quiet game."
}

function applyBehaviorPressure(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  humanId: string,
  pressure: BehaviorPressure
): string[] {
  if (pressure.total <= 0) return []
  const observerCount = Math.min(MAX_OBSERVERS, 1 + Math.floor((pressure.total - 1) / 2))
  const observers = rankSuspicionObservers(state, humanId, state.game.week, observerCount)
  for (const observer of observers) {
    const realityEdge = state.social.reality?.relationships?.[observer.id]?.[humanId]
    if ((realityEdge?.suspicion ?? 0) >= 78) continue
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: observer.id,
        targetId: humanId,
        day: state.game.week,
        phase: state.game.phase,
        eventId: `social-strategy:behavior:${state.game.week}:${observer.id}:${humanId}`,
        meaningful: false,
        deltas: {
          suspicion: 5 + pressure.total * 2,
          perceivedThreat: 1 + pressure.total,
          trust: -Math.min(5, pressure.total + pressure.exitPressure),
          reliability: pressure.exitPressure > 0 ? -Math.min(6, pressure.exitPressure * 2) : 0,
          warmth: pressure.quietPressure > 0 ? -Math.min(3, pressure.quietPressure) : 0,
        },
      })
    )
  }
  return observers.map((observer) => observer.id)
}

function maybeQueueBehaviorWarning(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  humanId: string,
  pressure: BehaviorPressure
): void {
  if (pressure.total < 2) return
  if (
    hasRecentIncomingSource(
      state,
      'social_strategy_warning',
      state.game.week,
      STRATEGY_WARNING_COOLDOWN_DAYS
    )
  ) {
    return
  }
  const source = chooseFriendlyWarningSource(state, humanId)
  if (!source) return
  api.dispatch(
    pushIncomingInteraction({
      id: `social-strategy-warning:${state.game.week}:${source.id}:${humanId}`,
      fromId: source.id,
      type: 'warning',
      text: warningText(pressure),
      payload: {
        source: 'social_strategy_warning',
        scenarioKey: 'betrayal_warning',
        partialExitCount: pressure.partialExitCount,
        quietStreak: pressure.quietStreak,
      },
      createdAt: Date.now(),
      createdWeek: state.game.week,
      expiresAtWeek: state.game.week + 1,
      read: false,
      requiresResponse: true,
      resolved: false,
    })
  )
}

function chooseHostileSource(state: StrategyRootState, humanId: string): Player | null {
  const candidates = activePlayers(state)
    .filter((player) => player.id !== humanId && !player.isUser)
    .map((player) => {
      const affinity = relationshipAffinity(state, player.id, humanId)
      const tags = relationshipTags(state, player.id, humanId)
      const explicitNemesis = isActiveNemesis(state, player.id, humanId)
      let hostility = Math.max(0, -affinity)
      if (explicitNemesis) hostility += 100
      if (tags.has('rivalry')) hostility += 45
      if (tags.has('target')) hostility += 45
      if (tags.has('betrayal')) hostility += 30
      return { player, hostility, explicitNemesis }
    })
    .filter((entry) => entry.explicitNemesis || entry.hostility >= 55)
    .sort((left, right) => right.hostility - left.hostility || left.player.id.localeCompare(right.player.id))
  return candidates[0]?.player ?? null
}

function chooseMisinformationListeners(
  state: StrategyRootState,
  humanId: string,
  hostileId: string,
  count: number
): Player[] {
  return activePlayers(state)
    .filter((player) => player.id !== humanId && player.id !== hostileId && !player.isUser)
    .map((player) => {
      const tags = relationshipTags(state, player.id, humanId)
      const affinity = relationshipAffinity(state, player.id, humanId)
      let score = 20 - affinity
      if (tags.has('alliance')) score -= 70
      if (tags.has('romance') || tags.has('bromance')) score -= 60
      if (tags.has('suspicious')) score += 25
      score += seededUnit(state.game.seed ?? 0, `misinformation-listener:${state.game.week}:${player.id}`) * 12
      return { player, score }
    })
    .filter((entry) => entry.score > -25)
    .sort((left, right) => right.score - left.score || left.player.id.localeCompare(right.player.id))
    .slice(0, count)
    .map((entry) => entry.player)
}

function chooseFalseTarget(
  state: StrategyRootState,
  humanId: string,
  hostileId: string
): Player | null {
  const candidates = activePlayers(state)
    .filter((player) => player.id !== humanId && player.id !== hostileId && !player.isUser)
    .map((player) => ({
      player,
      affinity: relationshipAffinity(state, player.id, humanId),
      tags: relationshipTags(state, player.id, humanId),
    }))
    .filter(
      (entry) =>
        entry.affinity >= 20 &&
        !entry.tags.has('target') &&
        !entry.tags.has('rivalry') &&
        !entry.tags.has('betrayal')
    )
    .sort((left, right) => right.affinity - left.affinity || left.player.id.localeCompare(right.player.id))
  return candidates[0]?.player ?? null
}

function maybeSpreadMisinformation(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  humanId: string
): string[] {
  if (state.game.week < 4) return []
  if (
    hasRecentIncomingSource(
      state,
      'social_strategy_misinformation',
      state.game.week,
      MISINFORMATION_COOLDOWN_DAYS
    )
  ) {
    return []
  }
  const hostile = chooseHostileSource(state, humanId)
  if (!hostile) return []
  const explicitNemesis = isActiveNemesis(state, hostile.id, humanId)
  const chance = explicitNemesis ? 0.48 : 0.24
  if (
    seededUnit(
      state.game.seed ?? 0,
      `social-strategy-misinformation:${state.game.week}:${hostile.id}:${humanId}`
    ) >= chance
  ) {
    return []
  }

  const listeners = chooseMisinformationListeners(
    state,
    humanId,
    hostile.id,
    explicitNemesis ? 2 : 1
  )
  for (const listener of listeners) {
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: listener.id,
        targetId: humanId,
        day: state.game.week,
        phase: state.game.phase,
        eventId: `social-strategy:lie:${state.game.week}:${hostile.id}:${listener.id}:${humanId}`,
        meaningful: false,
        deltas: {
          suspicion: explicitNemesis ? 13 : 9,
          perceivedThreat: explicitNemesis ? 7 : 4,
          trust: explicitNemesis ? -5 : -3,
          reliability: explicitNemesis ? -4 : -2,
          warmth: -2,
        },
      })
    )
  }

  const falseTarget = chooseFalseTarget(state, humanId, hostile.id)
  if (falseTarget) {
    api.dispatch(
      pushIncomingInteraction({
        id: `social-strategy-misinformation:${state.game.week}:${hostile.id}:${humanId}`,
        fromId: hostile.id,
        type: 'gossip',
        text: `Just so you know, ${falseTarget.name} has been quietly pushing your name. Do what you want with that.`,
        payload: {
          source: 'social_strategy_misinformation',
          scenarioKey: 'generic_gossip',
          allegedSourceId: falseTarget.id,
          deception: true,
        },
        createdAt: Date.now(),
        createdWeek: state.game.week,
        expiresAtWeek: state.game.week + 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )
  }

  return listeners.map((listener) => listener.id)
}

function processDayEnd(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState
): DayEndPlan | null {
  const human = humanPlayer(state)
  if (!human || state.game.mode === 'survival' || state.game.week < MIN_STRATEGY_DAY) return null
  if (activePlayers(state).length <= 3) return null

  const pressure = deriveBehaviorPressure({
    partialExitCount: getPartialExitCount(state, human.id),
    quietStreak: getQuietStreak(state, human.id),
  })
  const observerIds = applyBehaviorPressure(api, state, human.id, pressure)
  maybeQueueBehaviorWarning(api, state, human.id, pressure)
  const misinformationListenerIds = maybeSpreadMisinformation(api, state, human.id)
  return { pressure, observerIds, misinformationListenerIds }
}

function getInvitationTarget(
  state: StrategyRootState,
  plan: DayEndPlan,
  humanId: string
): { player: Player; actionId: string; text: string } | null {
  const byId = new Map(activePlayers(state).map((player) => [player.id, player]))
  const misinformationListener = plan.misinformationListenerIds
    .map((id) => byId.get(id))
    .find((player): player is Player => Boolean(player))
  if (misinformationListener) {
    return {
      player: misinformationListener,
      actionId: 'reassure',
      text: `${misinformationListener.name} has been keeping their distance tonight. Something has shifted. A quiet check-in before lights out might tell you why.`,
    }
  }

  const observer = plan.observerIds
    .map((id) => byId.get(id))
    .find((player): player is Player => Boolean(player))
  if (observer) {
    return {
      player: observer,
      actionId: 'reassure',
      text: `${observer.name} has been watching your game more closely than usual. They are alone in the kitchen now. This may be a good time to check in.`,
    }
  }

  const fallback = activePlayers(state)
    .filter((player) => player.id !== humanId && !player.isUser)
    .map((player) => ({ player, affinity: relationshipAffinity(state, player.id, humanId) }))
    .filter((entry) => entry.affinity >= -20)
    .sort((left, right) => right.affinity - left.affinity || left.player.id.localeCompare(right.player.id))[0]
    ?.player
  if (!fallback) return null
  return {
    player: fallback,
    actionId: 'whisper',
    text: `${fallback.name} is lingering in the kitchen after everyone else drifted away. If you want to know what is moving through the house, now is a good time to talk.`,
  }
}

function maybeQueueSocialInvitation(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  plan: DayEndPlan | null
): void {
  if (!plan || state.game.phase !== 'week_end') return
  const human = humanPlayer(state)
  if (!human) return
  if (
    state.game.tvFeed.some(
      (event) => event.meta?.socialInvitation === true && event.meta?.week === state.game.week
    )
  ) {
    return
  }
  const target = getInvitationTarget(state, plan, human.id)
  if (!target) return
  api.dispatch(
    addTvEvent({
      text: target.text,
      type: 'social',
      source: 'system',
      channels: ['tv', 'mainLog'],
      meta: {
        forceOnTv: true,
        broadcastLevel: 'minor',
        broadcastOrder: 50,
        socialInvitation: true,
        suggestedActionId: target.actionId,
        suggestedTargetId: target.player.id,
        week: state.game.week,
      },
    })
  )
}

function applyRepairFromHumanAction(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  entry: SocialActionLogEntry
): void {
  if (!REPAIR_ACTIONS.has(entry.actionId) || entry.outcome !== 'success') return
  const targetIds = entry.targetIds?.length ? entry.targetIds : [entry.targetId]
  for (const targetId of [...new Set(targetIds)]) {
    if (!targetId || targetId === entry.actorId) continue
    const edge = state.social.reality?.relationships?.[targetId]?.[entry.actorId]
    if (!edge || ((edge.suspicion ?? 0) <= 4 && (edge.reliability ?? 0) >= 0)) continue
    const groupScale = entry.actionId === 'group_chat' ? 0.55 : 1
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: targetId,
        targetId: entry.actorId,
        day: entry.week ?? state.game.week,
        phase: entry.phase ?? state.game.phase,
        eventId: `social-strategy:repair:${entry.timestamp}:${targetId}:${entry.actorId}`,
        meaningful: false,
        deltas: {
          suspicion: -Math.round(10 * groupScale),
          perceivedThreat: -Math.round(3 * groupScale),
          trust: Math.round(4 * groupScale),
          reliability: Math.round(5 * groupScale),
          warmth: Math.round(3 * groupScale),
        },
      })
    )
  }
}

function applyStrategicNudge(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  entry: SocialActionLogEntry
): void {
  const nudge = STRATEGIC_NUDGES[entry.actionId]
  if (!nudge || entry.outcome !== 'success' || !entry.subjectId || !entry.targetId) return
  if (entry.subjectId === entry.targetId) return
  api.dispatch(
    applyRealityRelationshipDelta({
      sourceId: entry.targetId,
      targetId: entry.subjectId,
      day: entry.week ?? state.game.week,
      phase: entry.phase ?? state.game.phase,
      eventId: `social-strategy:nudge:${entry.timestamp}:${entry.actionId}:${entry.targetId}:${entry.subjectId}`,
      meaningful: false,
      deltas: nudge,
    })
  )
}

function shareConcreteIntel(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  entry: SocialActionLogEntry
): void {
  if (entry.actionId !== 'share_intel' || entry.outcome !== 'success' || !entry.targetId) return
  const day = entry.week ?? state.game.week
  const selected = selectIntelFactForActor(
    state.social.reality,
    entry.actorId,
    entry.targetId,
    day
  )
  if (!selected) return
  const confidence = Math.max(0.35, Math.min(0.9, selected.belief.confidence * 0.82))
  api.dispatch(
    learnRealityKnowledge({
      ownerId: entry.targetId,
      factId: selected.fact.id,
      confidence,
      memory: makeIntelMemory({
        ownerId: entry.targetId,
        fact: selected.fact,
        sourceType: 'HEARSAY',
        sourceChain: [entry.actorId],
        confidence,
        day,
        phase: entry.phase ?? state.game.phase,
      }),
    })
  )
  api.dispatch(
    recordIntelligenceDelivery({
      id: `intel-delivery:shared:${entry.timestamp}:${entry.targetId}:${selected.fact.id}`,
      factId: selected.fact.id,
      channel: 'social_action',
      day,
      recipientId: entry.targetId,
    })
  )

  if (
    selected.fact.propositionType === 'TARGETING' &&
    selected.fact.objectId === entry.targetId &&
    selected.fact.subjectIds[0] &&
    selected.fact.subjectIds[0] !== entry.targetId
  ) {
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: entry.targetId,
        targetId: selected.fact.subjectIds[0],
        day,
        phase: entry.phase ?? state.game.phase,
        eventId: `social-strategy:intel-reaction:${entry.timestamp}:${selected.fact.id}`,
        meaningful: false,
        deltas: {
          suspicion: 12,
          perceivedThreat: 10,
          trust: -6,
          warmth: -3,
        },
      })
    )
  }
}

function processHumanSocialAction(
  api: { dispatch: (action: unknown) => unknown },
  state: StrategyRootState,
  entry: SocialActionLogEntry
): void {
  const human = humanPlayer(state)
  if (!human || entry.actorId !== human.id || entry.source === 'system') return
  applyRepairFromHumanAction(api, state, entry)
  applyStrategicNudge(api, state, entry)
  shareConcreteIntel(api, state, entry)
}

/**
 * Additive strategy bridge for the existing social simulation.
 *
 * It deliberately does not own nominations, Safety or votes. Instead it changes
 * the same Reality/legacy relationship graph that the core game already syncs
 * into `game.strategicRelationships` before `game/advance`. That keeps every
 * consequence bounded, inspectable and reversible without creating a second AI.
 */
export const socialStrategyMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) return next(action)
  const type = String((action as { type: string }).type)
  const before = api.getState() as StrategyRootState
  let dayEndPlan: DayEndPlan | null = null

  if (type === 'game/advance' && before.game.phase === 'eviction_results') {
    dayEndPlan = processDayEnd(api, before)
  }

  const result = next(action)
  const after = api.getState() as StrategyRootState

  if (type === 'game/advance' && before.game.phase === 'eviction_results') {
    maybeQueueSocialInvitation(api, after, dayEndPlan)
  }

  if (type === 'social/recordSocialAction') {
    const entry = (action as unknown as { payload: { entry: SocialActionLogEntry } }).payload.entry
    processHumanSocialAction(api, after, entry)
  }

  return result
}
