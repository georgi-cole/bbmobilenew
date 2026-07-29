import type {
  RealityClock,
  RealityDebt,
  RealityDomainState,
  RealityPromise,
  RealitySecret,
  RealityThread,
} from './types'

const PHASE_ORDER = [
  'week_start',
  'morning',
  'social_1',
  'loh_comp',
  'nomination_results',
  'social_2',
  'pos_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'live_vote',
  'eviction_results',
  'night',
]

export function compareRealityClock(left: RealityClock, right: RealityClock): number {
  if (left.day !== right.day) return left.day - right.day
  const leftIndex = PHASE_ORDER.indexOf(left.phase)
  const rightIndex = PHASE_ORDER.indexOf(right.phase)
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (
      (leftIndex === -1 ? PHASE_ORDER.length : leftIndex) -
      (rightIndex === -1 ? PHASE_ORDER.length : rightIndex)
    )
  }
  return left.phase.localeCompare(right.phase)
}

export function upsertRealityPromise(state: RealityDomainState, promise: RealityPromise): void {
  state.promises[promise.id] = promise
  for (const beneficiaryId of promise.beneficiaryIds) {
    const edge = state.relationships[promise.promisorId]?.[beneficiaryId]
    if (edge && !edge.activePromiseIds.includes(promise.id)) edge.activePromiseIds.push(promise.id)
  }
}

export function resolveRealityPromise(
  state: RealityDomainState,
  promiseId: string,
  status: 'KEPT' | 'BROKEN' | 'VOID',
  at: RealityClock,
  eventId: string
): RealityPromise | null {
  const promise = state.promises[promiseId]
  if (!promise || (promise.status !== 'ACTIVE' && promise.status !== 'PROPOSED')) return null
  promise.status = status
  promise.resolvedAt = at
  promise.resolutionEventId = eventId
  for (const beneficiaryId of promise.beneficiaryIds) {
    const edge = state.relationships[promise.promisorId]?.[beneficiaryId]
    if (edge) edge.activePromiseIds = edge.activePromiseIds.filter((id) => id !== promise.id)
  }
  return promise
}

export function overdueRealityPromises(
  state: RealityDomainState,
  now: RealityClock
): RealityPromise[] {
  return Object.values(state.promises).filter(
    (promise) =>
      promise.status === 'ACTIVE' &&
      promise.deadline !== undefined &&
      compareRealityClock(promise.deadline, now) < 0
  )
}

export function upsertRealityDebt(state: RealityDomainState, debt: RealityDebt): void {
  state.debts[debt.id] = debt
  const edge = state.relationships[debt.debtorId]?.[debt.creditorId]
  if (edge && !edge.activeDebtIds.includes(debt.id)) edge.activeDebtIds.push(debt.id)
}

export function upsertRealitySecret(state: RealityDomainState, secret: RealitySecret): void {
  state.secrets[secret.id] = {
    ...secret,
    ownerIds: [...new Set(secret.ownerIds)],
    knowerIds: [...new Set(secret.knowerIds)],
    suspectedByIds: [...new Set(secret.suspectedByIds)],
  }
}

export function upsertRealityThread(state: RealityDomainState, thread: RealityThread): void {
  state.threads[thread.id] = {
    ...thread,
    participantIds: [...new Set(thread.participantIds)],
    observerIds: [...new Set(thread.observerIds)],
    continuationActionIds: [...new Set(thread.continuationActionIds)],
  }
}

export function expireRealityThreads(state: RealityDomainState, now: RealityClock): string[] {
  const expiredIds: string[] = []
  for (const thread of Object.values(state.threads)) {
    if (
      thread.status === 'OPEN' &&
      thread.deadline &&
      compareRealityClock(thread.deadline, now) < 0
    ) {
      thread.status = 'EXPIRED'
      expiredIds.push(thread.id)
    }
  }
  return expiredIds
}
