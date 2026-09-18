import type {
  RealityClock,
  RealityDebt,
  RealityDomainState,
  RealityPromise,
  RealitySecret,
  RealityThread,
} from './types'
import { recordGroundedScandalFromSecret } from './relationshipAutonomy'
import { adjustRealityAllianceCommitment } from './relationshipForms'

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

function strongestSharedPromiseAlliance(
  state: RealityDomainState,
  leftId: string,
  rightId: string
) {
  return Object.values(state.alliances)
    .filter(
      (alliance) =>
        alliance.status !== 'DISSOLVED' &&
        alliance.memberIds.includes(leftId) &&
        alliance.memberIds.includes(rightId)
    )
    .sort((left, right) => {
      const statusRank = (status: typeof left.status) =>
        status === 'ACTIVE' ? 4 : status === 'PROBATIONARY' ? 3 : status === 'FRACTURED' ? 2 : 1
      const leftCommitment = Math.min(
        left.memberCommitment[leftId] ?? 0,
        left.memberCommitment[rightId] ?? 0
      )
      const rightCommitment = Math.min(
        right.memberCommitment[leftId] ?? 0,
        right.memberCommitment[rightId] ?? 0
      )
      return (
        statusRank(right.status) - statusRank(left.status) ||
        rightCommitment - leftCommitment ||
        right.cohesion - left.cohesion ||
        left.memberIds.length - right.memberIds.length ||
        left.id.localeCompare(right.id)
      )
    })[0]
}

function applyPromiseAllianceConsequence(
  state: RealityDomainState,
  promise: RealityPromise,
  status: 'KEPT' | 'BROKEN' | 'VOID'
): void {
  if (status === 'VOID') return
  const stakeWeight = 0.5 + Math.max(0, Math.min(1, promise.stakes)) * 0.5
  const beneficiariesByAlliance = new Map<string, string[]>()

  for (const beneficiaryId of promise.beneficiaryIds) {
    const alliance = strongestSharedPromiseAlliance(state, promise.promisorId, beneficiaryId)
    if (!alliance) continue
    beneficiariesByAlliance.set(alliance.id, [
      ...(beneficiariesByAlliance.get(alliance.id) ?? []),
      beneficiaryId,
    ])
  }

  for (const [allianceId, beneficiaryIds] of beneficiariesByAlliance) {
    adjustRealityAllianceCommitment(
      state,
      allianceId,
      promise.promisorId,
      (status === 'KEPT' ? 0.035 : -0.07) * stakeWeight
    )
    for (const beneficiaryId of [...new Set(beneficiaryIds)]) {
      adjustRealityAllianceCommitment(
        state,
        allianceId,
        beneficiaryId,
        (status === 'KEPT' ? 0.02 : -0.03) * stakeWeight
      )
    }
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
  applyPromiseAllianceConsequence(state, promise, status)
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
  recordGroundedScandalFromSecret(state, secret.id)
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
