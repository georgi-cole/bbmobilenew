import type { RealityDomainState, RealitySocialEvent } from './types'

export type RealityEventInput = Omit<RealitySocialEvent, 'id' | 'sequence'>

export function appendRealityEvent(
  state: RealityDomainState,
  input: RealityEventInput
): RealitySocialEvent {
  const sequence = state.nextSequence
  state.nextSequence += 1
  const event: RealitySocialEvent = {
    ...input,
    id: `reality-event-${sequence}`,
    sequence,
    targetIds: [...new Set(input.targetIds)],
    participantIds: [...new Set(input.participantIds)],
    witnessIds: [...new Set(input.witnessIds)],
    tags: [...new Set(input.tags)],
    relatedFactIds: [...new Set(input.relatedFactIds)],
    relatedPromiseIds: [...new Set(input.relatedPromiseIds)],
    relatedThreadIds: [...new Set(input.relatedThreadIds)],
  }
  state.events.push(event)
  state.events = state.events.slice(-500)
  return event
}

export function visibleRealityEvents(
  state: RealityDomainState,
  input: {
    actorId?: string
    viewer?: boolean
    publicOnly?: boolean
    juryOnly?: boolean
  }
): RealitySocialEvent[] {
  return state.events.filter((event) => {
    if (input.publicOnly) return event.publicEligible
    if (input.juryOnly) return event.juryEligible
    if (input.viewer) {
      return (
        event.visibility !== 'PRIVATE' &&
        event.visibility !== 'PAIR_ONLY' &&
        event.visibility !== 'JURY_ONLY'
      )
    }
    if (!input.actorId) return false
    return (
      event.participantIds.includes(input.actorId) ||
      event.witnessIds.includes(input.actorId) ||
      event.visibility === 'HOUSE_PUBLIC' ||
      event.visibility === 'CEREMONY_PUBLIC'
    )
  })
}
