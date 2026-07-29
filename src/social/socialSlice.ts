import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type {
  IncomingInteraction,
  IncomingInteractionDecisionLogEntry,
  IncomingInteractionResponseType,
  ScheduledIncomingInteraction,
  SocialActionLogEntry,
  SocialCommitment,
  SocialMemoryEvent,
  SocialPhaseReport,
  SocialState,
} from './types'
import { SOCIAL_INITIAL_STATE } from './constants'
import { socialConfig } from './socialConfig'
import {
  appendSocialMemoryEvent,
  applySocialMemoryDelta,
  createSocialMemoryEntry,
  decaySocialMemoryEntry,
  hasSocialMemoryDelta,
  type SocialMemoryDelta,
} from './socialMemory'
import {
  ALLIANCE_TAG,
  enforceRelationshipTagAffinity,
  tagsAfterAllianceDecay,
} from './socialAlliance'
import {
  applyDramaActionEffect as reduceDramaActionEffect,
  applyDramaIncomingResponseEffect as reduceDramaIncomingResponseEffect,
  normalizeDramaSocialNetwork,
  type DramaActionEffectInput,
  type DramaIncomingResponseEffect,
} from './dramaModeEngine'
import type { DramaSocialNetwork } from './types'
import {
  appendPersistentSocialHistory,
  getPersistentSocialHistory,
  type SocialStateWithHistory,
} from './socialHistory'
import { clampSocialResource, migrateSocialState } from './socialStateMigration'
import { getIncomingInteractionResponsePolicy } from './socialRuntimeConfig'
import {
  appendRealitySimulationTrace,
  createInitialRealitySimulationState,
  normalizeRealitySimulationState,
  type RealitySimulationState,
  type RealitySimulationTrace,
} from './realitySimulation'
import type {
  RealityDebt,
  RealityDomainState,
  RealityFact,
  RealityMemory,
  RealityPromise,
  RealityRelationshipChange,
  RealitySecret,
  RealityThread,
} from './reality'
import {
  addRealityFact,
  applyLegacyRelationshipUpdateToReality,
  applyRealityRelationshipChange,
  finalizeRealityVote,
  ensureRealityActors,
  learnRealityFact,
  normalizeRealityDomainState,
  projectRealityAffinity,
  recordRealityCeremonyOutcome,
  upsertRealityDebt,
  upsertRealityPromise,
  upsertRealitySecret,
  upsertRealityThread,
  type RealityCeremonyInput,
} from './reality'

function clampBank(
  budgets: Record<string, number>,
  kind: 'energy' | 'influence' | 'info'
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(budgets).map(([playerId, value]) => [playerId, clampSocialResource(value, kind)])
  )
}

const REALITY_PROJECTED_TAGS = new Set([
  'alliance',
  'romance',
  'bromance',
  'rivalry',
  'betrayal',
  'safety_promise',
  'protection',
  'target',
  'suspicious',
  'unreliable',
])

function projectRealityTags(
  reality: RealityDomainState,
  sourceId: string,
  targetId: string,
  existingTags: readonly string[]
): string[] {
  const tags = existingTags.filter((tag) => !REALITY_PROJECTED_TAGS.has(tag))
  const edge = reality.relationships[sourceId]?.[targetId]
  if (!edge) return tags
  if (
    Object.values(reality.alliances).some(
      (alliance) =>
        alliance.status !== 'DISSOLVED' &&
        alliance.memberIds.includes(sourceId) &&
        alliance.memberIds.includes(targetId)
    ) ||
    edge.perceivedLabel === 'ALLY' ||
    edge.perceivedLabel === 'CORE_ALLY'
  ) {
    tags.push('alliance')
  }
  if (
    Object.values(reality.romances).some(
      (romance) =>
        romance.status === 'ACTIVE' &&
        romance.participantIds.includes(sourceId) &&
        romance.participantIds.includes(targetId)
    ) ||
    edge.perceivedLabel === 'ROMANCE' ||
    edge.perceivedLabel === 'POWER_PAIR'
  ) {
    tags.push('romance')
  }
  if (edge.perceivedLabel === 'RIVAL') tags.push('rivalry')
  if (edge.suspicion >= 55) tags.push('suspicious')
  if (edge.reliability <= -35) tags.push('unreliable')
  if (
    edge.perceivedLabel === 'ENEMY' ||
    Object.values(reality.grievances).some(
      (grievance) =>
        grievance.holderId === sourceId &&
        grievance.againstId === targetId &&
        grievance.status !== 'RESOLVED' &&
        grievance.severity >= 65
    )
  ) {
    tags.push('betrayal')
  }
  if (
    Object.values(reality.promises).some(
      (promise) =>
        promise.status === 'ACTIVE' &&
        promise.promisorId === sourceId &&
        promise.beneficiaryIds.includes(targetId) &&
        (promise.kind.toLowerCase().includes('protect') ||
          promise.kind.toLowerCase().includes('safety'))
    )
  ) {
    tags.push('safety_promise', 'protection')
  }
  if (
    Object.values(reality.alliances).some(
      (alliance) =>
        alliance.status !== 'DISSOLVED' &&
        alliance.memberIds.includes(sourceId) &&
        alliance.currentTargetIds.includes(targetId)
    )
  ) {
    tags.push('target')
  }
  return [...new Set(tags)]
}

function projectRealityEdgeIntoLegacy(
  reality: RealityDomainState,
  relationships: SocialState['relationships'],
  sourceId: string,
  targetId: string
): void {
  const edge = reality.relationships[sourceId]?.[targetId]
  if (!edge || sourceId === targetId) return
  relationships[sourceId] ??= {}
  const existing = relationships[sourceId][targetId]
  relationships[sourceId][targetId] = {
    affinity: projectRealityAffinity(edge),
    tags: projectRealityTags(reality, sourceId, targetId, existing?.tags ?? []),
  }
}

function projectRealityRelationshipsIntoLegacy(
  reality: RealityDomainState,
  relationships: SocialState['relationships']
): void {
  for (const [sourceId, targets] of Object.entries(reality.relationships)) {
    relationships[sourceId] ??= {}
    delete relationships[sourceId][sourceId]
    for (const targetId of Object.keys(targets)) {
      projectRealityEdgeIntoLegacy(reality, relationships, sourceId, targetId)
    }
  }
}

const socialSlice = createSlice({
  name: 'social',
  initialState: SOCIAL_INITIAL_STATE,
  reducers: {
    engineReady(state, action: PayloadAction<{ budgets: Record<string, number> }>) {
      state.energyBank = clampBank(action.payload.budgets, 'energy')
    },
    /** Signals the engine has finished a phase; report is written via setLastReport. */
    engineComplete() {},
    setLastReport(state, action: PayloadAction<SocialPhaseReport>) {
      state.lastReport = action.payload
    },
    /** Stores influence weights keyed by actor and decision type. */
    influenceUpdated(
      state,
      action: PayloadAction<{
        actorId: string
        decisionType: string
        weights: Record<string, number>
      }>
    ) {
      const { actorId, decisionType, weights } = action.payload
      if (!state.influenceWeights[actorId]) {
        state.influenceWeights[actorId] = {}
      }
      state.influenceWeights[actorId][decisionType] = weights
    },
    /** Set a player's energy bank value directly. */
    setEnergyBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.energyBank[action.payload.playerId] = clampSocialResource(
        action.payload.value,
        'energy'
      )
    },
    /** Add a delta to a player's energy bank and preserve resource invariants. */
    applyEnergyDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.energyBank[action.payload.playerId] ?? 0
      state.energyBank[action.payload.playerId] = clampSocialResource(
        current + action.payload.delta,
        'energy'
      )
    },
    /** Set a player's influence bank value directly. */
    setInfluenceBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.influenceBank[action.payload.playerId] = clampSocialResource(
        action.payload.value,
        'influence'
      )
    },
    /** Add a delta to a player's influence bank and preserve resource invariants. */
    applyInfluenceDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.influenceBank[action.payload.playerId] ?? 0
      state.influenceBank[action.payload.playerId] = clampSocialResource(
        current + action.payload.delta,
        'influence'
      )
    },
    /** Set a player's info bank value directly. */
    setInfoBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.infoBank[action.payload.playerId] = clampSocialResource(action.payload.value, 'info')
    },
    /** Add a delta to a player's info bank and preserve resource invariants. */
    applyInfoDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.infoBank[action.payload.playerId] ?? 0
      state.infoBank[action.payload.playerId] = clampSocialResource(
        current + action.payload.delta,
        'info'
      )
    },
    /**
     * Append to the current panel session and to a bounded persistent history.
     * Closing the panel may clear sessionLogs without erasing AI memory.
     */
    recordSocialAction(state, action: PayloadAction<{ entry: SocialActionLogEntry }>) {
      state.sessionLogs.push(action.payload.entry)
      appendPersistentSocialHistory(
        state as unknown as SocialStateWithHistory,
        action.payload.entry
      )
    },
    /**
     * Bind the persisted v3 social RNG to a game seed. Existing saves keep
     * their cursor unless an explicit new-season reset is requested.
     */
    initializeRealitySimulation(state, action: PayloadAction<{ seed: number; force?: boolean }>) {
      if (state.realitySimulation?.rng && !action.payload.force) return
      state.realitySimulation = createInitialRealitySimulationState(action.payload.seed)
    },
    replaceRealitySimulation(state, action: PayloadAction<RealitySimulationState>) {
      state.realitySimulation = normalizeRealitySimulationState(action.payload)
    },
    replaceRealityDomain(state, action: PayloadAction<RealityDomainState>) {
      state.reality = normalizeRealityDomainState(action.payload, state.relationships)
      projectRealityRelationshipsIntoLegacy(state.reality, state.relationships)
    },
    ensureRealityDomainActors(state, action: PayloadAction<{ actorIds: string[] }>) {
      ensureRealityActors(state.reality as RealityDomainState, action.payload.actorIds)
    },
    applyRealityRelationshipDelta(state, action: PayloadAction<RealityRelationshipChange>) {
      applyRealityRelationshipChange(state.reality as RealityDomainState, action.payload)
      projectRealityEdgeIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships,
        action.payload.sourceId,
        action.payload.targetId
      )
    },
    applyRealityAmbientMood(
      state,
      action: PayloadAction<{
        actorId: string
        valenceDelta: number
        arousalDelta: number
        stressDelta: number
        socialEnergyDelta: number
      }>
    ) {
      const { actorId, valenceDelta, arousalDelta, stressDelta, socialEnergyDelta } = action.payload
      ensureRealityActors(state.reality as RealityDomainState, [actorId])
      const contestant = state.reality.contestants[actorId]
      const clamp = (value: number, minimum: number, maximum: number) =>
        Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))
      contestant.mood.valence = clamp(contestant.mood.valence + valenceDelta, -100, 100)
      contestant.mood.arousal = clamp(contestant.mood.arousal + arousalDelta, -100, 100)
      contestant.stress = clamp(contestant.stress + stressDelta, 0, 100)
      contestant.socialEnergy = clamp(contestant.socialEnergy + socialEnergyDelta, -100, 100)
      if (valenceDelta > 0) {
        contestant.emotions.joy = clamp(contestant.emotions.joy + valenceDelta * 0.6, 0, 100)
      } else if (valenceDelta < 0) {
        contestant.emotions.anger = clamp(
          contestant.emotions.anger + Math.abs(valenceDelta) * 0.35,
          0,
          100
        )
      }
    },
    applyRealityAmbientRelationship(
      state,
      action: PayloadAction<{
        sourceId: string
        targetId: string
        socialDelta: number
        day: number
        phase?: string
      }>
    ) {
      const { sourceId, targetId, socialDelta, day, phase = 'week_start' } = action.payload
      if (sourceId === targetId || socialDelta === 0) return
      ensureRealityActors(state.reality as RealityDomainState, [sourceId, targetId])
      const magnitude = Math.min(3, Math.abs(socialDelta))
      const cooling = socialDelta > 0
      applyRealityRelationshipChange(state.reality as RealityDomainState, {
        sourceId,
        targetId,
        day,
        phase,
        eventId: `ambient:${day}:${phase}:${sourceId}:${targetId}`,
        meaningful: false,
        deltas: cooling
          ? {
              warmth: magnitude,
              trust: magnitude * 0.6,
              resentment: -magnitude * 3,
              suspicion: -magnitude * 2.5,
              fear: -magnitude * 1.5,
              perceivedThreat: -magnitude,
            }
          : {
              warmth: -magnitude,
              trust: -magnitude * 0.7,
              resentment: magnitude * 6,
              suspicion: magnitude * 4,
              fear: magnitude * 2,
              perceivedThreat: magnitude * 2,
            },
      })
      projectRealityEdgeIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships,
        sourceId,
        targetId
      )
    },
    recordRealityFact(state, action: PayloadAction<RealityFact>) {
      addRealityFact(state.reality as RealityDomainState, action.payload)
    },
    learnRealityKnowledge(
      state,
      action: PayloadAction<{
        ownerId: string
        factId: string
        memory: RealityMemory
        confidence?: number
      }>
    ) {
      learnRealityFact(state.reality as RealityDomainState, action.payload)
    },
    upsertRealityPromiseRecord(state, action: PayloadAction<RealityPromise>) {
      upsertRealityPromise(state.reality as RealityDomainState, action.payload)
    },
    upsertRealityDebtRecord(state, action: PayloadAction<RealityDebt>) {
      upsertRealityDebt(state.reality as RealityDomainState, action.payload)
    },
    upsertRealitySecretRecord(state, action: PayloadAction<RealitySecret>) {
      upsertRealitySecret(state.reality as RealityDomainState, action.payload)
    },
    upsertRealityThreadRecord(state, action: PayloadAction<RealityThread>) {
      upsertRealityThread(state.reality as RealityDomainState, action.payload)
    },
    recordRealityCeremony(state, action: PayloadAction<RealityCeremonyInput>) {
      recordRealityCeremonyOutcome(state.reality as RealityDomainState, action.payload)
      projectRealityRelationshipsIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships
      )
    },
    recordRealityActualVote(
      state,
      action: PayloadAction<{
        actorId: string
        targetId: string
        day: number
        phase: string
        eventId: string
      }>
    ) {
      finalizeRealityVote(
        state.reality as RealityDomainState,
        action.payload.actorId,
        action.payload.targetId,
        { day: action.payload.day, phase: action.payload.phase },
        action.payload.eventId
      )
    },
    recordRealitySimulationTrace(
      state,
      action: PayloadAction<Omit<RealitySimulationTrace, 'id' | 'sequence'>>
    ) {
      state.realitySimulation = appendRealitySimulationTrace(
        state.realitySimulation ?? createInitialRealitySimulationState(),
        action.payload
      )
    },
    replaceDramaNetwork(state, action: PayloadAction<DramaSocialNetwork>) {
      state.dramaNetwork = normalizeDramaSocialNetwork(action.payload)
    },
    applyDramaAction(state, action: PayloadAction<DramaActionEffectInput>) {
      state.dramaNetwork = reduceDramaActionEffect(state.dramaNetwork, action.payload)
    },
    applyDramaIncomingResponse(state, action: PayloadAction<DramaIncomingResponseEffect>) {
      state.dramaNetwork = reduceDramaIncomingResponseEffect(state.dramaNetwork, action.payload)
    },
    /** Add a new incoming interaction (newest-first). */
    pushIncomingInteraction(state, action: PayloadAction<IncomingInteraction>) {
      state.incomingInteractions.unshift(action.payload)
    },
    /** Schedule an incoming interaction for a future delivery window. */
    scheduleIncomingInteraction(state, action: PayloadAction<ScheduledIncomingInteraction>) {
      state.scheduledIncomingInteractions.push(action.payload)
    },
    /** Record an incoming interaction decision log entry. */
    recordIncomingInteractionDecision(
      state,
      action: PayloadAction<IncomingInteractionDecisionLogEntry>
    ) {
      const limit = socialConfig.incomingInteractionDebugConfig.maxLogEntries
      if (limit <= 0) {
        return
      }
      state.incomingInteractionLogs.push(action.payload)
      if (limit > 0 && state.incomingInteractionLogs.length > limit) {
        state.incomingInteractionLogs = state.incomingInteractionLogs.slice(-limit)
      }
    },
    /** Clear incoming interaction decision logs. */
    clearIncomingInteractionLogs(state) {
      state.incomingInteractionLogs = []
    },
    /**
     * Deliver scheduled interactions and update delivery counters in one reducer pass.
     * Any scheduled interactions not included in remainingScheduled are removed.
     */
    applyScheduledIncomingInteractionDelivery(
      state,
      action: PayloadAction<{
        deliveries: ScheduledIncomingInteraction[]
        remainingScheduled: ScheduledIncomingInteraction[]
        phase: string
        week: number
      }>
    ) {
      const { deliveries, remainingScheduled, phase, week } = action.payload
      state.scheduledIncomingInteractions = remainingScheduled
      if (deliveries.length > 0) {
        const deliveredInteractions = deliveries.map((entry) => entry.interaction)
        state.incomingInteractions = [...deliveredInteractions, ...state.incomingInteractions]
      }

      const deliveryState = state.incomingInteractionDelivery
      const samePhase =
        deliveryState.lastDeliveryPhase === phase && deliveryState.lastDeliveryWeek === week
      state.incomingInteractionDelivery = {
        lastDeliveryPhase: phase,
        lastDeliveryWeek: week,
        deliveredThisPhase: (samePhase ? deliveryState.deliveredThisPhase : 0) + deliveries.length,
      }
    },
    /** Mark a specific incoming interaction as read. */
    markIncomingInteractionRead(state, action: PayloadAction<string>) {
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === action.payload
      )
      if (entry) {
        entry.read = true
      }
    },
    /** Mark all incoming interactions as read. Retained for save and test compatibility. */
    markAllIncomingInteractionsRead(state) {
      state.incomingInteractions.forEach((interaction) => {
        interaction.read = true
      })
    },
    /** Resolve an interaction with a response. */
    resolveIncomingInteraction(
      state,
      action: PayloadAction<{
        interactionId: string
        resolvedWith: IncomingInteractionResponseType
        resolvedLabel?: string
        outcomeText?: string
        resolvedAt?: number
        resolvedWeek?: number
      }>
    ) {
      const { interactionId, resolvedWith, resolvedLabel, outcomeText, resolvedAt, resolvedWeek } =
        action.payload
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === interactionId
      )
      if (!entry || entry.resolved) return
      entry.resolved = true
      entry.read = true
      entry.resolvedAt = resolvedAt ?? Date.now()
      entry.resolvedWeek = resolvedWeek
      entry.resolvedWith = resolvedWith
      entry.resolvedLabel = resolvedLabel
      entry.outcomeText = outcomeText
    },
    /** Convenience helper for dismissing an interaction. */
    dismissIncomingInteraction(
      state,
      action: PayloadAction<{
        interactionId: string
        resolvedAt?: number
        resolvedWeek?: number
      }>
    ) {
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === action.payload.interactionId
      )
      if (!entry || entry.resolved) return
      entry.resolved = true
      entry.read = true
      entry.resolvedAt = action.payload.resolvedAt ?? Date.now()
      entry.resolvedWeek = action.payload.resolvedWeek
      entry.resolvedWith = 'dismiss'
    },
    /** Resolve invalidated interactions and remove matching scheduled entries. */
    invalidateIncomingInteractions(
      state,
      action: PayloadAction<{
        interactionIds: string[]
        resolvedAt?: number
        resolvedWeek?: number
      }>
    ) {
      const { interactionIds, resolvedAt, resolvedWeek } = action.payload
      if (interactionIds.length === 0) return
      const ids = new Set(interactionIds)
      const resolvedTimestamp = resolvedAt ?? Date.now()

      state.incomingInteractions.forEach((interaction) => {
        if (!interaction.resolved && ids.has(interaction.id)) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = resolvedTimestamp
          interaction.resolvedWeek = resolvedWeek
          interaction.resolvedWith = 'dismiss'
        }
      })

      state.scheduledIncomingInteractions = state.scheduledIncomingInteractions.filter(
        (entry) => !ids.has(entry.interaction.id)
      )
    },
    /**
     * Drain all social resources for a player who has been evicted.
     *
     * - Zeroes out energy, influence, and info banks.
     * - Dismisses all unresolved incoming interactions.
     * - Clears all scheduled incoming interactions.
     */
    drainEvictedPlayerSocial(
      state,
      action: PayloadAction<{ playerId: string; week?: number; timestamp?: number }>
    ) {
      const { playerId, week, timestamp } = action.payload
      const now = timestamp ?? Date.now()

      state.energyBank[playerId] = 0
      state.influenceBank[playerId] = 0
      state.infoBank[playerId] = 0

      for (const interaction of state.incomingInteractions) {
        if (!interaction.resolved) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = now
          interaction.resolvedWeek = week
          interaction.resolvedWith = 'dismiss'
        }
      }

      state.scheduledIncomingInteractions = []
      state.panelOpen = false
      state.incomingInboxOpen = false
    },
    /** Resolve expired interactions according to their authored response policy. */
    resolveExpiredIncomingInteractionsForWeek(
      state,
      action: PayloadAction<{ week: number; resolvedAt?: number }>
    ) {
      const { week, resolvedAt } = action.payload
      const resolvedTimestamp = resolvedAt ?? Date.now()
      state.incomingInteractions.forEach((interaction) => {
        if (!interaction.resolved && interaction.expiresAtWeek < week) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = resolvedTimestamp
          interaction.resolvedWeek = week
          interaction.resolvedWith =
            getIncomingInteractionResponsePolicy(interaction) === 'required' ? 'ignore' : 'dismiss'
        }
      })
    },
    /** Resolve the exact interactions whose day/phase deadlines have passed. */
    resolveIncomingInteractionsByDeadline(
      state,
      action: PayloadAction<{
        interactionIds: string[]
        day: number
        phase: string
        resolvedAt?: number
      }>
    ) {
      const ids = new Set(action.payload.interactionIds)
      const resolvedTimestamp =
        action.payload.resolvedAt ??
        action.payload.day * 1_000_000 + Math.max(0, action.payload.phase.length * 100)
      state.incomingInteractions.forEach((interaction) => {
        if (ids.has(interaction.id) && !interaction.resolved) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = resolvedTimestamp
          interaction.resolvedWeek = action.payload.day
          interaction.resolvedWith =
            getIncomingInteractionResponsePolicy(interaction) === 'required' ? 'ignore' : 'dismiss'
        }
      })
    },
    /** Update the affinity (and optionally tags) for a directed relationship. */
    updateRelationship(
      state,
      action: PayloadAction<{
        source: string
        target: string
        delta: number
        tags?: string[]
        /** Origin of the action that produced this relationship change. */
        actionSource?: 'manual' | 'system'
      }>
    ) {
      const { source, target, delta, tags } = action.payload
      const safeDelta = Number.isFinite(delta) ? delta : 0
      const preserveIncomingAlliance = tags?.includes(ALLIANCE_TAG) ?? false
      if (!state.relationships[source]) {
        state.relationships[source] = {}
      }
      const rel = state.relationships[source][target]
      if (rel) {
        rel.affinity = Math.max(-100, Math.min(100, rel.affinity + safeDelta))
        if (tags) {
          rel.tags = Array.from(new Set([...rel.tags, ...tags]))
        }
        rel.tags = tagsAfterAllianceDecay(rel.tags, rel.affinity, preserveIncomingAlliance)
        if (safeDelta === 0 && tags && tags.length > 0) {
          rel.affinity = enforceRelationshipTagAffinity(rel.affinity, rel.tags)
        }
      } else {
        if (safeDelta === 0 && (!tags || tags.length === 0)) {
          return
        }
        const relationshipTags = tags ?? []
        state.relationships[source][target] = {
          affinity:
            safeDelta === 0
              ? enforceRelationshipTagAffinity(safeDelta, relationshipTags)
              : Math.max(-100, Math.min(100, safeDelta)),
          tags: relationshipTags,
        }
      }
      applyLegacyRelationshipUpdateToReality(
        state.reality as RealityDomainState,
        source,
        target,
        safeDelta,
        tags,
        0,
        'legacy'
      )
    },
    /** Apply delta updates to directed social memory entries. */
    updateSocialMemory(
      state,
      action: PayloadAction<{
        actorId: string
        targetId: string
        deltas?: SocialMemoryDelta
        event?: SocialMemoryEvent
      }>
    ) {
      const { actorId, targetId, deltas, event } = action.payload
      if (!event && !hasSocialMemoryDelta(deltas)) {
        return
      }
      if (!state.socialMemory[actorId]) {
        state.socialMemory[actorId] = {}
      }
      let entry = state.socialMemory[actorId][targetId]
      if (!entry) {
        entry = createSocialMemoryEntry()
        state.socialMemory[actorId][targetId] = entry
      }

      if (deltas) {
        applySocialMemoryDelta(entry, deltas)
      }
      if (event) {
        appendSocialMemoryEvent(entry, event)
      }
    },
    /** Decay all social memory signals toward zero (called at week start). */
    decaySocialMemory(state) {
      Object.values(state.socialMemory).forEach((targets) => {
        Object.values(targets).forEach((entry) => {
          decaySocialMemoryEntry(entry)
        })
      })
    },
    /** Record a promise created by a high-stakes incoming response. */
    addSocialCommitment(state, action: PayloadAction<SocialCommitment>) {
      if (!state.commitments) state.commitments = []
      if (state.commitments.some((entry) => entry.interactionId === action.payload.interactionId))
        return
      state.commitments.unshift(action.payload)
    },
    /** Mark a pending promise as kept, broken, or void. */
    resolveSocialCommitment(
      state,
      action: PayloadAction<{
        commitmentId: string
        status: Exclude<SocialCommitment['status'], 'pending'>
        resolvedAt?: number
        resolvedWeek?: number
        resolutionReason?: string
      }>
    ) {
      const entry = (state.commitments ?? []).find(
        (commitment) => commitment.id === action.payload.commitmentId
      )
      if (!entry || entry.status !== 'pending') return
      entry.status = action.payload.status
      entry.resolvedAt = action.payload.resolvedAt ?? Date.now()
      entry.resolvedWeek = action.payload.resolvedWeek
      entry.resolutionReason = action.payload.resolutionReason
    },
    /** Manually open the social panel (e.g. via the FAB button). */
    openSocialPanel(state) {
      state.panelOpen = true
    },
    /** Manually close the social panel. */
    closeSocialPanel(state) {
      state.panelOpen = false
    },
    /** Open the incoming interactions inbox panel. */
    openIncomingInbox(state) {
      state.incomingInboxOpen = true
    },
    /** Close the incoming interactions inbox panel. */
    closeIncomingInbox(state) {
      state.incomingInboxOpen = false
    },
    /** Clear only panel-session entries; persistent actionHistory is retained. */
    clearSessionLogs(state) {
      state.sessionLogs = []
    },
    /** Snapshot current relationship affinities into weekStartRelSnapshot. */
    snapshotWeekRelationships(state) {
      const snapshot: Record<string, Record<string, number>> = {}
      for (const [actorId, targets] of Object.entries(state.relationships)) {
        snapshot[actorId] = {}
        for (const [targetId, rel] of Object.entries(targets)) {
          snapshot[actorId][targetId] = rel.affinity
        }
      }
      state.weekStartRelSnapshot = snapshot
    },

    /** Restore and migrate a previously saved social state. */
    hydrateSocial(_state, action: PayloadAction<SocialState>) {
      return migrateSocialState(action.payload)
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      (action) => action.type === 'game/resetGame',
      () => migrateSocialState({} as SocialState)
    )
  },
})

export const {
  engineReady,
  engineComplete,
  setLastReport,
  influenceUpdated,
  setEnergyBankEntry,
  applyEnergyDelta,
  setInfluenceBankEntry,
  applyInfluenceDelta,
  setInfoBankEntry,
  applyInfoDelta,
  recordSocialAction,
  initializeRealitySimulation,
  replaceRealitySimulation,
  replaceRealityDomain,
  ensureRealityDomainActors,
  applyRealityRelationshipDelta,
  applyRealityAmbientMood,
  applyRealityAmbientRelationship,
  recordRealityFact,
  learnRealityKnowledge,
  upsertRealityPromiseRecord,
  upsertRealityDebtRecord,
  upsertRealitySecretRecord,
  upsertRealityThreadRecord,
  recordRealityCeremony,
  recordRealityActualVote,
  recordRealitySimulationTrace,
  replaceDramaNetwork,
  applyDramaAction,
  applyDramaIncomingResponse,
  pushIncomingInteraction,
  scheduleIncomingInteraction,
  recordIncomingInteractionDecision,
  clearIncomingInteractionLogs,
  applyScheduledIncomingInteractionDelivery,
  markIncomingInteractionRead,
  markAllIncomingInteractionsRead,
  resolveIncomingInteraction,
  dismissIncomingInteraction,
  invalidateIncomingInteractions,
  drainEvictedPlayerSocial,
  resolveExpiredIncomingInteractionsForWeek,
  resolveIncomingInteractionsByDeadline,
  updateRelationship,
  updateSocialMemory,
  decaySocialMemory,
  addSocialCommitment,
  resolveSocialCommitment,
  openSocialPanel,
  closeSocialPanel,
  openIncomingInbox,
  closeIncomingInbox,
  clearSessionLogs,
  snapshotWeekRelationships,
  hydrateSocial,
} = socialSlice.actions
export default socialSlice.reducer

// Selectors – typed against a minimal shape to avoid circular imports with store.ts
export const selectSocialBudgets = (state: { social: SocialState }) => state.social?.energyBank
/** Alias for selectSocialBudgets – prefer this name in SocialManeuvers contexts. */
export const selectEnergyBank = (state: { social: SocialState }) => state.social?.energyBank
export const selectInfluenceBank = (state: { social: SocialState }) => state.social?.influenceBank
export const selectInfoBank = (state: { social: SocialState }) => state.social?.infoBank
export const selectRealityDomain = (state: { social: SocialState }) => state.social.reality
export const selectRealityRelationship = (
  state: { social: SocialState },
  sourceId: string,
  targetId: string
) => state.social.reality.relationships[sourceId]?.[targetId]
export const selectLastSocialReport = (state: { social: SocialState }) =>
  state.social?.lastReport ?? null
export const selectInfluenceWeights = (state: { social: SocialState }) =>
  state.social?.influenceWeights
export const selectSessionLogs = (state: { social: SocialState }) =>
  state.social?.sessionLogs as SocialState['sessionLogs']
export const selectPersistentSocialHistory = (state: { social: SocialState }) =>
  getPersistentSocialHistory(state.social as SocialStateWithHistory)
export const selectRealitySimulation = (state: { social: SocialState }) =>
  state.social?.realitySimulation ?? SOCIAL_INITIAL_STATE.realitySimulation
export const selectSocialPanelOpen = (state: { social: SocialState }) =>
  state.social?.panelOpen ?? false
export const selectSocialMemory = (state: { social: SocialState }) =>
  state.social?.socialMemory ?? {}
export const selectSocialCommitments = (state: { social: SocialState }) =>
  state.social?.commitments ?? []
export const selectDramaNetwork = (state: { social: SocialState }) =>
  state.social?.dramaNetwork ?? SOCIAL_INITIAL_STATE.dramaNetwork
export const selectPendingSocialCommitments = (state: { social: SocialState }) =>
  selectSocialCommitments(state).filter((commitment) => commitment.status === 'pending')
export const selectWeekStartRelSnapshot = (state: { social: SocialState }) =>
  state.social?.weekStartRelSnapshot ?? {}
export const selectIncomingInboxOpen = (state: { social: SocialState }) =>
  state.social?.incomingInboxOpen ?? false
export const selectIncomingInteractions = (state: { social: SocialState }) =>
  state.social?.incomingInteractions ?? []
export const selectIncomingInteractionLogs = (state: { social: SocialState }) =>
  state.social?.incomingInteractionLogs ?? []
export const selectScheduledIncomingInteractions = (state: { social: SocialState }) =>
  state.social?.scheduledIncomingInteractions ?? []
export const selectIncomingInteractionDeliveryState = (state: { social: SocialState }) =>
  state.social?.incomingInteractionDelivery
export const selectUnreadIncomingInteractionCount = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.read).length
export const selectPendingIncomingInteractionCount = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.resolved).length
export const selectActiveIncomingInteractions = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.resolved)
export const selectScheduledIncomingInteractionCount = (state: { social: SocialState }) =>
  selectScheduledIncomingInteractions(state).length
