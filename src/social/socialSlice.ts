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

function clampBank(
  budgets: Record<string, number>,
  kind: 'energy' | 'influence' | 'info'
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(budgets).map(([playerId, value]) => [playerId, clampSocialResource(value, kind)])
  )
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
export const selectLastSocialReport = (state: { social: SocialState }) =>
  state.social?.lastReport ?? null
export const selectInfluenceWeights = (state: { social: SocialState }) =>
  state.social?.influenceWeights
export const selectSessionLogs = (state: { social: SocialState }) =>
  state.social?.sessionLogs as SocialState['sessionLogs']
export const selectPersistentSocialHistory = (state: { social: SocialState }) =>
  getPersistentSocialHistory(state.social as SocialStateWithHistory)
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
