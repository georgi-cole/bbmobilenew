import type { PublicDirection } from './types'

export interface PublicRequestProgressStage {
  label: string
  guidance: string
}

/**
 * Gives the player a readable sense of momentum without exposing the internal
 * trigger list or turning a social story into a prescribed button sequence.
 */
export function getPublicRequestProgressStage(
  direction: Pick<PublicDirection, 'status' | 'progressPercent' | 'progressHistory'>
): PublicRequestProgressStage {
  const progress = direction.status === 'completed' ? 100 : (direction.progressPercent ?? 0)
  const history = direction.progressHistory ?? []
  const lastChange = history[history.length - 1]

  if (direction.status === 'completed' || progress >= 100) {
    return {
      label: 'Story landed',
      guidance: 'The audience saw a convincing arc, not just one moment.',
    }
  }
  if (lastChange && lastChange.delta < 0) {
    return {
      label: 'Momentum slipped',
      guidance: 'A recent choice cut against the story. The connection can still recover.',
    }
  }
  if (progress <= 0) {
    return {
      label: 'Waiting for a first beat',
      guidance: 'Start something believable and see how they respond.',
    }
  }
  if (progress < 35) {
    return {
      label: 'First signs',
      guidance: 'The audience noticed, but one moment is not a relationship.',
    }
  }
  if (progress < 70) {
    return {
      label: 'Momentum building',
      guidance: 'Keep the story moving in a way that feels consistent.',
    }
  }
  return {
    label: 'The pattern is visible',
    guidance: 'The audience is close to believing this change is real.',
  }
}
