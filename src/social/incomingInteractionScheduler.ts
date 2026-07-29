import { socialConfig } from './socialConfig'
import { normalizeAffinity } from './affinityUtils'
import { INCOMING_INTERACTION_PHASE_ORDER } from './incomingInteractionPhases'
import { applyScheduledIncomingInteractionDelivery } from './socialSlice'
import { logIncomingInteractionDecision } from './incomingInteractionLogging'
import { isIncomingInteractionInvalidated } from './incomingInteractionValidity'
import { isIncomingInteractionActionable } from './socialRuntimeConfig'
import type {
  IncomingInteraction,
  IncomingInteractionDeliveryState,
  IncomingInteractionPriority,
  IncomingInteractionType,
  ScheduledIncomingInteraction,
} from './types'

const DELIVERY_PHASE_ORDER = INCOMING_INTERACTION_PHASE_ORDER

const PRIORITY_ORDER: Record<IncomingInteractionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

type DeliveryPhase = (typeof DELIVERY_PHASE_ORDER)[number]

interface SchedulerStore {
  dispatch: (action: unknown) => unknown
  getState: () => {
    social?: {
      incomingInteractions?: IncomingInteraction[]
      scheduledIncomingInteractions?: ScheduledIncomingInteraction[]
      incomingInteractionDelivery?: IncomingInteractionDeliveryState
      relationships?: Record<string, Record<string, { affinity: number; tags: string[] }>>
    }
    game?: {
      week?: number
      phase?: string
      lohId?: string | null
      posWinnerId?: string | null
      nomineeIds?: string[]
      awaitingPovDecision?: boolean
      awaitingPovSaveTarget?: boolean
      players?: Array<{ id: string; status: string; isUser?: boolean }>
    }
  }
}

function getDeliveryPhaseIndex(phase: string): number | null {
  const idx = DELIVERY_PHASE_ORDER.indexOf(phase as DeliveryPhase)
  if (idx === -1) {
    if (socialConfig.verbose) {
      console.warn(`[incomingInteractions] unknown delivery phase '${phase}'`)
    }
    return null
  }
  return idx
}

function buildSlotKey(week: number, phase: string): string {
  return `${week}:${phase}`
}

function computeSlotFromOffset(
  week: number,
  phaseIndex: number,
  offset: number
): { week: number; phase: DeliveryPhase } {
  const total = DELIVERY_PHASE_ORDER.length
  const absoluteIndex = phaseIndex + offset
  const weekOffset = Math.floor(absoluteIndex / total)
  const slotIndex = absoluteIndex % total
  return { week: week + weekOffset, phase: DELIVERY_PHASE_ORDER[slotIndex] }
}

function getDeliveredThisPhase(
  deliveryState: IncomingInteractionDeliveryState | undefined,
  phase: string,
  week: number
): number {
  if (!deliveryState) return 0
  return deliveryState.lastDeliveryPhase === phase && deliveryState.lastDeliveryWeek === week
    ? deliveryState.deliveredThisPhase
    : 0
}

function computePhaseDistance(
  from: { week: number; phase: string },
  to: { week: number; phase: string }
): number {
  const total = DELIVERY_PHASE_ORDER.length
  const fromIndex = getDeliveryPhaseIndex(from.phase)
  const toIndex = getDeliveryPhaseIndex(to.phase)
  if (fromIndex === null || toIndex === null) return 0
  return (to.week - from.week) * total + (toIndex - fromIndex)
}

export function buildPendingIncomingInteractions(
  incomingInteractions: IncomingInteraction[],
  scheduled: ScheduledIncomingInteraction[]
): IncomingInteraction[] {
  return [...incomingInteractions, ...scheduled.map((entry) => entry.interaction)]
}

export function buildDeliverySlotCounts(
  scheduled: ScheduledIncomingInteraction[],
  phase: string,
  week: number,
  deliveredThisPhase: number
): Map<string, number> {
  const slotCounts = new Map<string, number>()
  for (const entry of scheduled) {
    const slotWeek = entry.scheduledForWeek ?? week
    const slotPhase = entry.scheduledForPhase ?? phase
    const key = buildSlotKey(slotWeek, slotPhase)
    slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1)
  }
  const currentKey = buildSlotKey(week, phase)
  slotCounts.set(currentKey, (slotCounts.get(currentKey) ?? 0) + deliveredThisPhase)
  return slotCounts
}

export function getIncomingInteractionPriority(
  type: IncomingInteractionType,
  scenarioKey?: string
): IncomingInteractionPriority {
  // These are decision-bearing scenes, not flavour chatter. Keep them ahead of
  // the normal spam controls even when their generic interaction type is a
  // warning or snide remark.
  if (
    [
      'nominee_confronts_loh',
      'replacement_nominee_reacts_to_loh',
      'betrayal_warning',
      'targeted_snark',
      'player_nominated_tension',
      'live_vote_pitch',
      'loh_consults_safety_holder',
      'safety_holder_consults_loh',
    ].includes(scenarioKey ?? '')
  ) {
    return 'high'
  }
  return socialConfig.incomingInteractionDeliveryConfig.defaultPriorityByType[type] ?? 'medium'
}

export function getInteractionDedupeReason({
  interaction,
  priority,
  pendingInteractions,
  week,
}: {
  interaction: IncomingInteraction
  priority: IncomingInteractionPriority
  pendingInteractions: IncomingInteraction[]
  week: number
}): string | null {
  const { dedupe } = socialConfig.incomingInteractionDeliveryConfig
  const allFromActor = pendingInteractions.filter((entry) => entry.fromId === interaction.fromId)
  const unresolvedFromActor = allFromActor.filter(
    (entry) => !entry.resolved && isIncomingInteractionActionable(entry)
  )
  const scenarioKey =
    typeof interaction.payload?.scenarioKey === 'string' ? interaction.payload.scenarioKey : null
  const phaseKey = typeof interaction.payload?.phase === 'string' ? interaction.payload.phase : null

  if (
    dedupe.blockLowPriorityIfActorPending &&
    priority === 'low' &&
    unresolvedFromActor.length > 0
  ) {
    return 'deduped_actor_pending'
  }

  if (scenarioKey && phaseKey) {
    const sameScenario = unresolvedFromActor.find(
      (entry) =>
        entry.createdWeek === week &&
        entry.payload?.scenarioKey === scenarioKey &&
        entry.payload?.phase === phaseKey
    )
    if (sameScenario) {
      return 'deduped_same_scenario'
    }
  }

  const sameType = allFromActor.find(
    (entry) =>
      entry.type === interaction.type &&
      week >= entry.createdWeek &&
      week - entry.createdWeek <= dedupe.sameTypeCooldownWeeks
  )
  if (sameType) {
    return 'deduped_similar_pending'
  }

  // Family-level dedupe: prevent near-duplicate phrasing by blocking the same
  // variant family from the same actor within the configured cooldown window.
  const incomingFamilyId =
    typeof interaction.payload?.variantFamilyId === 'string'
      ? interaction.payload.variantFamilyId
      : null
  if (incomingFamilyId && dedupe.familyCooldownWeeks > 0) {
    const sameFamily = allFromActor.find(
      (entry) =>
        typeof entry.payload?.variantFamilyId === 'string' &&
        entry.payload.variantFamilyId === incomingFamilyId &&
        week >= entry.createdWeek &&
        week - entry.createdWeek <= dedupe.familyCooldownWeeks
    )
    if (sameFamily) {
      return 'deduped_same_family'
    }
  }

  if (scenarioKey) {
    const scenarioCountThisWeek = pendingInteractions.filter(
      (entry) => entry.createdWeek === week && entry.payload?.scenarioKey === scenarioKey
    ).length
    if (scenarioCountThisWeek >= dedupe.maxSameScenarioPerWeek[priority]) {
      return 'deduped_scenario_weekly_cap'
    }
  }

  if (priority === 'low' && dedupe.lowPriorityCooldownWeeks > 0) {
    const lastFromActor = allFromActor.reduce<IncomingInteraction | null>((latest, entry) => {
      if (!latest || entry.createdAt > latest.createdAt) {
        return entry
      }
      return latest
    }, null)
    if (
      lastFromActor &&
      week >= lastFromActor.createdWeek &&
      week - lastFromActor.createdWeek <= dedupe.lowPriorityCooldownWeeks
    ) {
      return 'deduped_low_priority_cooldown'
    }
  }

  return null
}

export function shouldSkipDueToInteractionDedupe({
  interaction,
  priority,
  pendingInteractions,
  week,
}: {
  interaction: IncomingInteraction
  priority: IncomingInteractionPriority
  pendingInteractions: IncomingInteraction[]
  week: number
}): boolean {
  return (
    getInteractionDedupeReason({
      interaction,
      priority,
      pendingInteractions,
      week,
    }) !== null
  )
}

export function assignDeliverySlot({
  phase,
  week,
  priority,
  slotCounts,
  visibleActiveCount,
}: {
  phase: string
  week: number
  priority: IncomingInteractionPriority
  slotCounts: Map<string, number>
  visibleActiveCount: number
}): { scheduledForWeek: number; scheduledForPhase: string; deliveryReason: string } | null {
  const deliveryConfig = socialConfig.incomingInteractionDeliveryConfig
  const phaseIndex = getDeliveryPhaseIndex(phase)
  if (phaseIndex === null) {
    return null
  }
  let minOffset = deliveryConfig.priorityOffsets[priority] ?? 0
  if (visibleActiveCount >= deliveryConfig.maxActiveVisible) {
    minOffset = Math.max(minOffset, 1)
  }

  for (let offset = minOffset; offset < deliveryConfig.maxFutureSlots; offset += 1) {
    const slot = computeSlotFromOffset(week, phaseIndex, offset)
    const key = buildSlotKey(slot.week, slot.phase)
    const count = slotCounts.get(key) ?? 0
    if (count < deliveryConfig.maxDeliveredPerPhase) {
      slotCounts.set(key, count + 1)
      const reason = offset === 0 ? 'deliver_now' : 'spaced'
      return {
        scheduledForWeek: slot.week,
        scheduledForPhase: slot.phase,
        deliveryReason: reason,
      }
    }
  }

  if (priority === 'low') {
    return null
  }

  const fallback = computeSlotFromOffset(
    week,
    phaseIndex,
    Math.max(0, deliveryConfig.maxFutureSlots - 1)
  )
  const fallbackKey = buildSlotKey(fallback.week, fallback.phase)
  slotCounts.set(fallbackKey, (slotCounts.get(fallbackKey) ?? 0) + 1)
  return {
    scheduledForWeek: fallback.week,
    scheduledForPhase: fallback.phase,
    deliveryReason: 'queued',
  }
}

export function deliverScheduledIncomingInteractionsForPhase(
  phase: string,
  store: SchedulerStore,
  contextOverride?: { week?: number }
): void {
  const state = store.getState()
  const socialState = state.social
  if (!socialState) return

  const scheduled = socialState.scheduledIncomingInteractions ?? []
  if (scheduled.length === 0) return

  const deliveryConfig = socialConfig.incomingInteractionDeliveryConfig
  const week = contextOverride?.week ?? state.game?.week ?? 1
  const phaseIndex = getDeliveryPhaseIndex(phase)
  if (phaseIndex === null) return

  const activeVisible = (socialState.incomingInteractions ?? []).filter(
    (entry) => !entry.resolved && isIncomingInteractionActionable(entry)
  )
  let activeVisibleCount = activeVisible.length
  let activeMajorCount = activeVisible.filter(
    (entry) =>
      getIncomingInteractionPriority(
        entry.type,
        typeof entry.payload?.scenarioKey === 'string' ? entry.payload.scenarioKey : undefined
      ) === 'high'
  ).length
  const deliveredThisPhase = getDeliveredThisPhase(
    socialState.incomingInteractionDelivery,
    phase,
    week
  )
  let remainingPhaseSlots = Math.max(0, deliveryConfig.maxDeliveredPerPhase - deliveredThisPhase)
  let remainingActionableSlots = Math.max(0, deliveryConfig.maxActiveVisible - activeVisibleCount)
  let remainingMajorSlots = Math.max(0, deliveryConfig.maxMajorActiveVisible - activeMajorCount)

  const eligible: ScheduledIncomingInteraction[] = []
  const remaining: ScheduledIncomingInteraction[] = []

  const logDecision = (
    entry: ScheduledIncomingInteraction,
    stage: 'delivery' | 'postponed' | 'dropped' | 'expiration',
    reason: string,
    detail?: string
  ) => {
    logIncomingInteractionDecision(store.dispatch, {
      stage,
      reason,
      interactionId: entry.interaction.id,
      actorId: entry.interaction.fromId,
      type: entry.interaction.type,
      priority: entry.priority,
      week,
      phase,
      scheduledForWeek: entry.scheduledForWeek,
      scheduledForPhase: entry.scheduledForPhase,
      detail,
    })
  }

  for (const entry of scheduled) {
    if (isIncomingInteractionInvalidated(entry.interaction, state.game ?? {})) {
      logDecision(entry, 'expiration', 'invalidated_before_delivery')
      continue
    }
    if (entry.interaction.type === 'alliance_proposal') {
      const humanId = state.game?.players?.find((player) => player.isUser)?.id
      const senderId = entry.interaction.fromId
      const relationship = humanId ? state.social?.relationships?.[senderId]?.[humanId] : undefined
      const alreadyAllied = relationship?.tags.includes('alliance') === true
      const intentionalBluff = entry.interaction.payload?.strategicDeception === true
      const minAffinity =
        socialConfig.incomingInteractionAutonomyTuning.scenarioThresholds
          .allianceProposalMinAffinity
      if (
        alreadyAllied ||
        (!intentionalBluff && normalizeAffinity(relationship?.affinity ?? 0) < minAffinity)
      ) {
        logDecision(
          entry,
          'expiration',
          alreadyAllied ? 'alliance_already_active' : 'relationship_changed_before_delivery'
        )
        continue
      }
    }
    if (entry.interaction.expiresAtWeek < week) {
      logDecision(entry, 'expiration', 'expired_before_delivery')
      continue
    }
    const scheduledWeek = entry.scheduledForWeek ?? week
    const scheduledPhase = entry.scheduledForPhase ?? phase
    const scheduledIndex = getDeliveryPhaseIndex(scheduledPhase)
    if (scheduledIndex === null) {
      logDecision(entry, 'expiration', 'invalid_scheduled_phase')
      continue
    }
    const overduePhases = computePhaseDistance(
      { week: scheduledWeek, phase: scheduledPhase },
      { week, phase }
    )
    if (
      deliveryConfig.maxScheduledWaitPhases > 0 &&
      overduePhases > deliveryConfig.maxScheduledWaitPhases
    ) {
      logDecision(entry, 'expiration', 'expired_before_delivery', `overduePhases=${overduePhases}`)
      continue
    }
    if (scheduledWeek < week) {
      eligible.push(entry)
      continue
    }
    if (scheduledWeek > week) {
      remaining.push(entry)
      continue
    }
    if (scheduledIndex <= phaseIndex) {
      eligible.push(entry)
    } else {
      remaining.push(entry)
    }
  }

  eligible.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return a.scheduledAt - b.scheduledAt
  })

  const deliveries: ScheduledIncomingInteraction[] = []

  for (const entry of eligible) {
    const hasActiveFromActor = activeVisible.some(
      (visible) => !visible.resolved && visible.fromId === entry.interaction.fromId
    )
    const hasSameTypeVisible = activeVisible.some(
      (visible) =>
        !visible.resolved &&
        visible.fromId === entry.interaction.fromId &&
        visible.type === entry.interaction.type
    )

    if (entry.priority === 'low' && (hasActiveFromActor || hasSameTypeVisible)) {
      logDecision(entry, 'postponed', 'postponed_low_priority')
      remaining.push(entry)
      continue
    }

    const actionable = isIncomingInteractionActionable(entry.interaction)
    const isMajor = entry.priority === 'high'
    const canUseMajorLane = isMajor && remainingMajorSlots > 0
    if (
      remainingPhaseSlots <= 0 ||
      (actionable && remainingActionableSlots <= 0 && !canUseMajorLane)
    ) {
      const scheduledWeek = entry.scheduledForWeek ?? week
      const scheduledPhase = entry.scheduledForPhase ?? phase
      const overduePhases = computePhaseDistance(
        { week: scheduledWeek, phase: scheduledPhase },
        { week, phase }
      )
      if (
        actionable &&
        entry.priority === 'low' &&
        activeVisibleCount >= deliveryConfig.maxActiveVisible &&
        overduePhases >= deliveryConfig.lowPriorityDropAfterPhases
      ) {
        logDecision(entry, 'dropped', 'dropped_low_priority_overdue')
        continue
      }
      logDecision(entry, 'postponed', 'blocked_by_visible_cap')
      remaining.push(entry)
      continue
    }

    deliveries.push(entry)
    logDecision(entry, 'delivery', 'phase_checkpoint', entry.deliveryReason)
    remainingPhaseSlots -= 1
    if (actionable) {
      activeVisibleCount += 1
      if (isMajor) {
        activeMajorCount += 1
        remainingMajorSlots = Math.max(0, deliveryConfig.maxMajorActiveVisible - activeMajorCount)
      }
      remainingActionableSlots = Math.max(0, deliveryConfig.maxActiveVisible - activeVisibleCount)
      activeVisible.push(entry.interaction)
    }
  }

  if (deliveries.length === 0 && remaining.length === scheduled.length) {
    return
  }

  store.dispatch(
    applyScheduledIncomingInteractionDelivery({
      deliveries,
      remainingScheduled: remaining,
      phase,
      week,
    })
  )
}
