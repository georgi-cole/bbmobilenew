import { retrieveMemories } from './memory'
import type { RealityActionContract, RealityActorSnapshot } from './actionContract'
import type { RealityContext, RealityDomainState } from './types'

export interface RealityScoreBreakdown {
  base: number
  relationship: number
  goal: number
  memory: number
  mood: number
  repetition: number
  total: number
  weight: number
}

export function scoreRealityAction(input: {
  action: RealityActionContract
  actor: RealityActorSnapshot
  targetIds: readonly string[]
  context: RealityContext
  reality: RealityDomainState
}): RealityScoreBreakdown {
  const { action, actor, targetIds, context, reality } = input
  const contestant = reality.contestants[actor.id]
  const edges = targetIds
    .map((targetId) => reality.relationships[actor.id]?.[targetId])
    .filter((edge) => edge !== undefined)
  const average = (selector: (edge: NonNullable<(typeof edges)[number]>) => number) =>
    edges.length === 0
      ? 0
      : edges.reduce((sum, edge) => sum + selector(edge), 0) / edges.length / 100
  let relationship = 0
  if (action.purposes.includes('BOND')) {
    relationship += average((edge) => edge.warmth + edge.trust * 0.5) * 0.45
  }
  if (action.purposes.includes('COMMITMENT')) {
    relationship += average((edge) => edge.trust + edge.loyalty + edge.strategicValue) * 0.35
  }
  if (action.purposes.includes('CONFLICT')) {
    relationship += average((edge) => edge.resentment + edge.perceivedThreat + edge.suspicion) * 0.4
  }
  if (action.purposes.includes('ROMANCE')) {
    relationship += average((edge) => edge.attraction + edge.intimacy) * 0.45
  }
  const goalText = [
    contestant?.primaryGoalId,
    ...(contestant?.secondaryGoalIds ?? []),
    contestant?.desiredInteraction,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  const goal =
    action.purposes.some((purpose) => goalText.includes(purpose)) ||
    (action.purposes.includes('PROTECT') && goalText.includes('SAFETY'))
      ? 0.55
      : 0
  const recalled = retrieveMemories(reality, actor.id, {
    day: context.day,
    participantIds: targetIds,
    limit: 4,
  })
  const memory =
    recalled.reduce(
      (sum, item) =>
        sum +
        item.strategicRelevance *
          item.confidence *
          (action.purposes.includes('CONFLICT')
            ? Math.max(0, -item.emotionalValence)
            : Math.max(0, item.emotionalValence)),
      0
    ) * 0.22
  const mood = action.purposes.includes('CONFLICT')
    ? Math.min(0.35, ((contestant?.emotions.anger ?? 0) + (contestant?.stress ?? 0)) / 500)
    : action.purposes.includes('WITHDRAW')
      ? Math.min(0.3, (contestant?.fatigue ?? 0) / 250)
      : Math.max(-0.15, Math.min(0.15, (contestant?.mood.valence ?? 0) / 500))
  const recent = contestant?.recentActionFamilies ?? []
  const repetitions = recent.filter((family) => action.purposes.includes(family as never)).length
  const repetition = -Math.min(0.75, repetitions * 0.22)
  const base = action.baseWeight
  const total = Math.max(
    -1.5,
    Math.min(3.5, base + relationship + goal + memory + mood + repetition)
  )
  return {
    base,
    relationship,
    goal,
    memory,
    mood,
    repetition,
    total,
    weight: Math.max(0.01, Math.exp(total)),
  }
}
