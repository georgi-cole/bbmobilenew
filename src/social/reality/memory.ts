import type { RealityDomainState, RealityMemory } from './types'

export const MAX_REALITY_MEMORIES_PER_ACTOR = 160

export function memoryRecallScore(memory: RealityMemory, day: number): number {
  const age = Math.max(0, day - memory.day)
  const decay = Math.max(0.15, 1 - age * 0.035)
  return (
    memory.recallStrength *
    decay *
    (0.35 +
      memory.importance * 0.25 +
      memory.emotionalIntensity * 0.2 +
      memory.strategicRelevance * 0.2)
  )
}

export function remember(state: RealityDomainState, memory: RealityMemory): void {
  state.memoriesByOwner[memory.ownerId] ??= []
  const current = state.memoriesByOwner[memory.ownerId]
  const existingIndex = current.findIndex((entry) => entry.id === memory.id)
  if (existingIndex >= 0) current[existingIndex] = memory
  else current.push(memory)
  state.memoriesByOwner[memory.ownerId] = current
    .sort(
      (left, right) =>
        memoryRecallScore(left, Math.max(left.day, right.day)) -
          memoryRecallScore(right, Math.max(left.day, right.day)) || left.id.localeCompare(right.id)
    )
    .slice(-MAX_REALITY_MEMORIES_PER_ACTOR)
}

export function retrieveMemories(
  state: RealityDomainState,
  ownerId: string,
  input: {
    day: number
    participantIds?: readonly string[]
    tags?: readonly string[]
    limit?: number
  }
): RealityMemory[] {
  const participants = new Set(input.participantIds ?? [])
  const tags = new Set(input.tags ?? [])
  return [...(state.memoriesByOwner[ownerId] ?? [])]
    .filter(
      (memory) =>
        participants.size === 0 ||
        memory.participantIds.some((id) => participants.has(id)) ||
        memory.tags.some((tag) => tags.has(tag))
    )
    .sort(
      (left, right) =>
        memoryRecallScore(right, input.day) - memoryRecallScore(left, input.day) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, input.limit ?? 8)
}

export function decayMemories(state: RealityDomainState, day: number): void {
  for (const [ownerId, memories] of Object.entries(state.memoriesByOwner)) {
    state.memoriesByOwner[ownerId] = memories
      .map((memory) => ({
        ...memory,
        recallStrength: Math.max(
          memory.importance >= 0.8 ? 0.35 : 0.05,
          memory.recallStrength * (memory.day < day ? 0.965 : 1)
        ),
      }))
      .filter(
        (memory) =>
          memory.importance >= 0.75 ||
          memory.tags.includes('anchor') ||
          memory.recallStrength >= 0.08
      )
      .slice(-MAX_REALITY_MEMORIES_PER_ACTOR)
  }
}
