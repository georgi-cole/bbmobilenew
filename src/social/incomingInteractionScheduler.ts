import { socialConfig } from './socialConfig';
import { applyScheduledIncomingInteractionDelivery } from './socialSlice';
import type {
  IncomingInteraction,
  IncomingInteractionDeliveryState,
  IncomingInteractionPriority,
  IncomingInteractionType,
  ScheduledIncomingInteraction,
} from './types';

const DELIVERY_PHASE_ORDER = [
  'week_start',
  'nominations',
  'hoh_results',
  'pov_results',
  'live_vote',
  'eviction_results',
] as const;

const PRIORITY_ORDER: Record<IncomingInteractionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type DeliveryPhase = (typeof DELIVERY_PHASE_ORDER)[number];

interface SchedulerStore {
  dispatch: (action: unknown) => unknown;
  getState: () => {
    social?: {
      incomingInteractions?: IncomingInteraction[];
      scheduledIncomingInteractions?: ScheduledIncomingInteraction[];
      incomingInteractionDelivery?: IncomingInteractionDeliveryState;
    };
    game?: {
      week?: number;
    };
  };
}

function getDeliveryPhaseIndex(phase: string): number {
  const idx = DELIVERY_PHASE_ORDER.indexOf(phase as DeliveryPhase);
  return idx >= 0 ? idx : 0;
}

function buildSlotKey(week: number, phase: string): string {
  return `${week}:${phase}`;
}

function computeSlotFromOffset(
  week: number,
  phaseIndex: number,
  offset: number,
): { week: number; phase: DeliveryPhase } {
  const total = DELIVERY_PHASE_ORDER.length;
  const absoluteIndex = phaseIndex + offset;
  const weekOffset = Math.floor(absoluteIndex / total);
  const slotIndex = absoluteIndex % total;
  return { week: week + weekOffset, phase: DELIVERY_PHASE_ORDER[slotIndex] };
}

function getDeliveredThisPhase(
  deliveryState: IncomingInteractionDeliveryState | undefined,
  phase: string,
  week: number,
): number {
  if (!deliveryState) return 0;
  return deliveryState.lastDeliveryPhase === phase && deliveryState.lastDeliveryWeek === week
    ? deliveryState.deliveredThisPhase
    : 0;
}

function computePhaseDistance(
  from: { week: number; phase: string },
  to: { week: number; phase: string },
): number {
  const total = DELIVERY_PHASE_ORDER.length;
  const fromIndex = getDeliveryPhaseIndex(from.phase);
  const toIndex = getDeliveryPhaseIndex(to.phase);
  return (to.week - from.week) * total + (toIndex - fromIndex);
}

export function buildPendingIncomingInteractions(
  incomingInteractions: IncomingInteraction[],
  scheduled: ScheduledIncomingInteraction[],
): IncomingInteraction[] {
  return [...incomingInteractions, ...scheduled.map((entry) => entry.interaction)];
}

export function buildDeliverySlotCounts(
  scheduled: ScheduledIncomingInteraction[],
  phase: string,
  week: number,
  deliveredThisPhase: number,
): Map<string, number> {
  const slotCounts = new Map<string, number>();
  for (const entry of scheduled) {
    const slotWeek = entry.scheduledForWeek ?? week;
    const slotPhase = entry.scheduledForPhase ?? phase;
    const key = buildSlotKey(slotWeek, slotPhase);
    slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1);
  }
  const currentKey = buildSlotKey(week, phase);
  slotCounts.set(currentKey, (slotCounts.get(currentKey) ?? 0) + deliveredThisPhase);
  return slotCounts;
}

export function getIncomingInteractionPriority(
  type: IncomingInteractionType,
): IncomingInteractionPriority {
  return socialConfig.incomingInteractionDeliveryConfig.defaultPriorityByType[type] ?? 'medium';
}

export function shouldSkipDueToInteractionDedupe({
  interaction,
  priority,
  pendingInteractions,
  week,
}: {
  interaction: IncomingInteraction;
  priority: IncomingInteractionPriority;
  pendingInteractions: IncomingInteraction[];
  week: number;
}): boolean {
  const { dedupe } = socialConfig.incomingInteractionDeliveryConfig;
  const unresolvedFromActor = pendingInteractions.filter(
    (entry) => entry.fromId === interaction.fromId && !entry.resolved,
  );

  if (dedupe.blockLowPriorityIfActorPending && priority === 'low' && unresolvedFromActor.length > 0) {
    return true;
  }

  const sameType = unresolvedFromActor.find(
    (entry) =>
      entry.type === interaction.type && Math.abs(week - entry.createdWeek) <= dedupe.sameTypeCooldownWeeks,
  );
  if (sameType) {
    return true;
  }

  if (priority === 'low' && dedupe.lowPriorityCooldownWeeks > 0) {
    const lastFromActor = unresolvedFromActor.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (lastFromActor && Math.abs(week - lastFromActor.createdWeek) <= dedupe.lowPriorityCooldownWeeks) {
      return true;
    }
  }

  return false;
}

export function assignDeliverySlot({
  phase,
  week,
  priority,
  slotCounts,
  visibleActiveCount,
}: {
  phase: string;
  week: number;
  priority: IncomingInteractionPriority;
  slotCounts: Map<string, number>;
  visibleActiveCount: number;
}): { scheduledForWeek: number; scheduledForPhase: string; deliveryReason: string } | null {
  const deliveryConfig = socialConfig.incomingInteractionDeliveryConfig;
  const phaseIndex = getDeliveryPhaseIndex(phase);
  let minOffset = deliveryConfig.priorityOffsets[priority] ?? 0;
  if (visibleActiveCount >= deliveryConfig.maxActiveVisible) {
    minOffset = Math.max(minOffset, 1);
  }

  for (let offset = minOffset; offset < deliveryConfig.maxFutureSlots; offset += 1) {
    const slot = computeSlotFromOffset(week, phaseIndex, offset);
    const key = buildSlotKey(slot.week, slot.phase);
    const count = slotCounts.get(key) ?? 0;
    if (count < deliveryConfig.maxDeliveredPerPhase) {
      slotCounts.set(key, count + 1);
      const reason = offset === 0 ? 'deliver_now' : 'spaced';
      return {
        scheduledForWeek: slot.week,
        scheduledForPhase: slot.phase,
        deliveryReason: reason,
      };
    }
  }

  if (priority === 'low') {
    return null;
  }

  const fallback = computeSlotFromOffset(
    week,
    phaseIndex,
    Math.max(0, deliveryConfig.maxFutureSlots - 1),
  );
  const fallbackKey = buildSlotKey(fallback.week, fallback.phase);
  slotCounts.set(fallbackKey, (slotCounts.get(fallbackKey) ?? 0) + 1);
  return {
    scheduledForWeek: fallback.week,
    scheduledForPhase: fallback.phase,
    deliveryReason: 'queued',
  };
}

export function deliverScheduledIncomingInteractionsForPhase(
  phase: string,
  store: SchedulerStore,
  contextOverride?: { week?: number },
): void {
  const state = store.getState();
  const socialState = state.social;
  if (!socialState) return;

  const scheduled = socialState.scheduledIncomingInteractions ?? [];
  if (scheduled.length === 0) return;

  const deliveryConfig = socialConfig.incomingInteractionDeliveryConfig;
  const week = contextOverride?.week ?? (state.game?.week ?? 1);
  const phaseIndex = getDeliveryPhaseIndex(phase);

  const activeVisible = (socialState.incomingInteractions ?? []).filter((entry) => !entry.resolved);
  let activeVisibleCount = activeVisible.length;
  const deliveredThisPhase = getDeliveredThisPhase(
    socialState.incomingInteractionDelivery,
    phase,
    week,
  );
  const remainingPhaseCapacity = Math.max(
    0,
    deliveryConfig.maxDeliveredPerPhase - deliveredThisPhase,
  );
  let remainingVisibleCapacity = Math.max(0, deliveryConfig.maxActiveVisible - activeVisibleCount);
  let remainingSlots = Math.min(remainingPhaseCapacity, remainingVisibleCapacity);

  const eligible: ScheduledIncomingInteraction[] = [];
  const remaining: ScheduledIncomingInteraction[] = [];

  for (const entry of scheduled) {
    if (entry.interaction.expiresAtWeek < week) {
      continue;
    }
    const scheduledWeek = entry.scheduledForWeek ?? week;
    const scheduledPhase = entry.scheduledForPhase ?? phase;
    if (scheduledWeek < week) {
      eligible.push(entry);
      continue;
    }
    if (scheduledWeek > week) {
      remaining.push(entry);
      continue;
    }
    const scheduledIndex = getDeliveryPhaseIndex(scheduledPhase);
    if (scheduledIndex <= phaseIndex) {
      eligible.push(entry);
    } else {
      remaining.push(entry);
    }
  }

  eligible.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.scheduledAt - b.scheduledAt;
  });

  const deliveries: ScheduledIncomingInteraction[] = [];

  for (const entry of eligible) {
    const hasActiveFromActor = activeVisible.some(
      (visible) => !visible.resolved && visible.fromId === entry.interaction.fromId,
    );
    const hasSameTypeVisible = activeVisible.some(
      (visible) =>
        !visible.resolved &&
        visible.fromId === entry.interaction.fromId &&
        visible.type === entry.interaction.type,
    );

    if (entry.priority === 'low' && (hasActiveFromActor || hasSameTypeVisible)) {
      remaining.push(entry);
      continue;
    }

    if (remainingSlots <= 0) {
      const scheduledWeek = entry.scheduledForWeek ?? week;
      const scheduledPhase = entry.scheduledForPhase ?? phase;
      const overduePhases = computePhaseDistance(
        { week: scheduledWeek, phase: scheduledPhase },
        { week, phase },
      );
      if (
        entry.priority === 'low' &&
        activeVisibleCount >= deliveryConfig.maxActiveVisible &&
        overduePhases >= deliveryConfig.lowPriorityDropAfterPhases
      ) {
        continue;
      }
      remaining.push(entry);
      continue;
    }

    deliveries.push(entry);
    remainingSlots -= 1;
    activeVisibleCount += 1;
    remainingVisibleCapacity = Math.max(0, deliveryConfig.maxActiveVisible - activeVisibleCount);
    remainingSlots = Math.min(remainingSlots, remainingVisibleCapacity);
    activeVisible.push(entry.interaction);
  }

  if (deliveries.length === 0 && remaining.length === scheduled.length) {
    return;
  }

  store.dispatch(
    applyScheduledIncomingInteractionDelivery({
      deliveries,
      remainingScheduled: remaining,
      phase,
      week,
    }),
  );
}
