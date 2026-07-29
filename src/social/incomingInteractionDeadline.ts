import { INCOMING_INTERACTION_PHASE_ORDER } from './incomingInteractionPhases'
import type { IncomingInteraction, IncomingInteractionType } from './types'
import type { RealityDeadline, RealityClock } from './reality'

const LABELS: Record<string, string> = {
  week_start: 'day start',
  loh_results: 'the power result',
  social_1: 'the first social window',
  nominations: 'nominations',
  nomination_results: 'the nomination ceremony',
  pos_results: 'the Safety result',
  pos_ceremony_results: 'the Safety ceremony',
  social_2: 'the final campaign window',
  live_vote: 'the live vote',
  eviction_results: 'eviction',
}

function phaseIndex(phase: string): number {
  const index = INCOMING_INTERACTION_PHASE_ORDER.indexOf(
    phase as (typeof INCOMING_INTERACTION_PHASE_ORDER)[number]
  )
  return index === -1 ? INCOMING_INTERACTION_PHASE_ORDER.length : index
}

export function compareIncomingClock(left: RealityClock, right: RealityClock): number {
  if (left.day !== right.day) return left.day - right.day
  return phaseIndex(left.phase) - phaseIndex(right.phase)
}

export function deriveIncomingDeadline(input: {
  day: number
  phase: string
  type: IncomingInteractionType
  payload?: Record<string, unknown>
  required: boolean
}): RealityDeadline | undefined {
  if (!input.required) return undefined
  const authoredPhase =
    typeof input.payload?.deadlinePhase === 'string' ? input.payload.deadlinePhase : undefined
  const scenario = typeof input.payload?.scenarioKey === 'string' ? input.payload.scenarioKey : ''
  let phase = authoredPhase
  if (!phase && scenario.includes('safety')) phase = 'pos_ceremony_results'
  if (!phase && (input.type === 'nomination_plea' || input.type === 'deal_offer')) {
    phase = 'live_vote'
  }
  if (!phase && input.type === 'warning') phase = 'pos_ceremony_results'
  if (!phase && input.type === 'alliance_proposal') phase = 'social_2'
  if (!phase) phase = 'eviction_results'
  const deadlineDay = phaseIndex(phase) < phaseIndex(input.phase) ? input.day + 1 : input.day
  return {
    day: deadlineDay,
    phase,
    policy: 'AUTO_IGNORE',
  }
}

export function getIncomingDeadline(interaction: IncomingInteraction): RealityDeadline {
  if (interaction.deadline) return interaction.deadline
  return {
    day: interaction.expiresAtWeek,
    phase: 'eviction_results',
    policy: 'AUTO_IGNORE',
  }
}

export function isIncomingInteractionOverdue(
  interaction: IncomingInteraction,
  now: RealityClock
): boolean {
  return !interaction.resolved && compareIncomingClock(getIncomingDeadline(interaction), now) < 0
}

export function isIncomingInteractionUrgent(
  interaction: IncomingInteraction,
  now: RealityClock
): boolean {
  if (interaction.resolved) return false
  const deadline = getIncomingDeadline(interaction)
  return deadline.day === now.day && compareIncomingClock(now, deadline) <= 0
}

export function formatIncomingDeadline(interaction: IncomingInteraction): string {
  const deadline = getIncomingDeadline(interaction)
  return `Answer before ${LABELS[deadline.phase] ?? deadline.phase.replaceAll('_', ' ')}`
}
