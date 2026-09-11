import {
  applyRealityRelationshipDelta,
  learnRealityKnowledge,
  recordIntelligenceDelivery,
} from './socialSlice'
import { makeIntelMemory, selectIntelFactForActor } from './intelligenceSystem'
import type { SocialActionLogEntry } from './types'
import { strategyHumanPlayer, type StrategyApi, type StrategyState } from './socialStrategyShared'

const REPAIR_ACTIONS = new Set([
  'compliment',
  'reassure',
  'whisper',
  'build_quiet_bond',
  'share_personal_story',
  'group_chat',
])

const STRATEGIC_NUDGES: Record<
  string,
  { suspicion: number; perceivedThreat: number; trust: number; warmth?: number }
> = {
  pitch_target: { suspicion: 8, perceivedThreat: 12, trust: -4, warmth: -2 },
  suggest_replacement: { suspicion: 6, perceivedThreat: 10, trust: -3, warmth: -1 },
  rally_votes_against: { suspicion: 7, perceivedThreat: 11, trust: -4, warmth: -2 },
  warn_about_player: { suspicion: 10, perceivedThreat: 7, trust: -3, warmth: -1 },
}

function repairSuspicion(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry
): void {
  if (!REPAIR_ACTIONS.has(entry.actionId) || entry.outcome !== 'success') return

  const targetIds = entry.targetIds?.length ? entry.targetIds : [entry.targetId]
  for (const targetId of [...new Set(targetIds)]) {
    if (!targetId || targetId === entry.actorId) continue
    const edge = state.social.reality?.relationships?.[targetId]?.[entry.actorId]
    if (!edge || ((edge.suspicion ?? 0) <= 4 && (edge.reliability ?? 0) >= 0)) continue

    const groupScale = entry.actionId === 'group_chat' ? 0.55 : 1
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: targetId,
        targetId: entry.actorId,
        day: entry.week ?? state.game.week,
        phase: entry.phase ?? state.game.phase,
        eventId: `social-strategy:repair:${entry.timestamp}:${targetId}:${entry.actorId}`,
        meaningful: false,
        deltas: {
          suspicion: -Math.round(10 * groupScale),
          perceivedThreat: -Math.round(3 * groupScale),
          trust: Math.round(4 * groupScale),
          reliability: Math.round(5 * groupScale),
          warmth: Math.round(3 * groupScale),
        },
      })
    )
  }
}

function applyStrategicNudge(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry
): void {
  const nudge = STRATEGIC_NUDGES[entry.actionId]
  if (!nudge || entry.outcome !== 'success' || !entry.subjectId || !entry.targetId) return
  if (entry.subjectId === entry.targetId) return

  api.dispatch(
    applyRealityRelationshipDelta({
      sourceId: entry.targetId,
      targetId: entry.subjectId,
      day: entry.week ?? state.game.week,
      phase: entry.phase ?? state.game.phase,
      eventId: `social-strategy:nudge:${entry.timestamp}:${entry.actionId}:${entry.targetId}:${entry.subjectId}`,
      meaningful: false,
      deltas: nudge,
    })
  )
}

function deliverKnownIntel(input: {
  api: StrategyApi
  state: StrategyState
  sourceId: string
  recipientId: string
  day: number
  phase: string
  timestamp: number
  confidenceScale: number
  deliveryKind: 'shared' | 'whispered'
}): boolean {
  const selected = selectIntelFactForActor(
    input.state.social.reality,
    input.sourceId,
    input.recipientId,
    input.day
  )
  if (!selected) return false

  const confidence = Math.max(
    0.35,
    Math.min(0.9, selected.belief.confidence * input.confidenceScale)
  )
  input.api.dispatch(
    learnRealityKnowledge({
      ownerId: input.recipientId,
      factId: selected.fact.id,
      confidence,
      memory: makeIntelMemory({
        ownerId: input.recipientId,
        fact: selected.fact,
        sourceType: 'HEARSAY',
        sourceChain: [input.sourceId],
        confidence,
        day: input.day,
        phase: input.phase,
      }),
    })
  )
  input.api.dispatch(
    recordIntelligenceDelivery({
      id: `intel-delivery:${input.deliveryKind}:${input.timestamp}:${input.recipientId}:${selected.fact.id}`,
      factId: selected.fact.id,
      channel: 'social_action',
      day: input.day,
      recipientId: input.recipientId,
    })
  )

  if (
    selected.fact.propositionType === 'TARGETING' &&
    selected.fact.objectId === input.recipientId &&
    selected.fact.subjectIds[0] &&
    selected.fact.subjectIds[0] !== input.recipientId
  ) {
    input.api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: input.recipientId,
        targetId: selected.fact.subjectIds[0],
        day: input.day,
        phase: input.phase,
        eventId: `social-strategy:intel-reaction:${input.timestamp}:${selected.fact.id}`,
        meaningful: false,
        deltas: {
          suspicion: 12,
          perceivedThreat: 10,
          trust: -6,
          warmth: -3,
        },
      })
    )
  }

  return true
}

function applyConcreteIntelPayoff(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry,
  humanId: string
): void {
  if (entry.outcome !== 'success' || !entry.targetId) return

  const day = entry.week ?? state.game.week
  const phase = entry.phase ?? state.game.phase
  if (entry.actionId === 'share_intel') {
    deliverKnownIntel({
      api,
      state,
      sourceId: humanId,
      recipientId: entry.targetId,
      day,
      phase,
      timestamp: entry.timestamp,
      confidenceScale: 0.82,
      deliveryKind: 'shared',
    })
    return
  }

  if (entry.actionId === 'whisper') {
    deliverKnownIntel({
      api,
      state,
      sourceId: entry.targetId,
      recipientId: humanId,
      day,
      phase,
      timestamp: entry.timestamp,
      confidenceScale: 0.78,
      deliveryKind: 'whispered',
    })
  }
}

export function processHumanSocialStrategyAction(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry
): void {
  const human = strategyHumanPlayer(state)
  if (!human || entry.actorId !== human.id || entry.source === 'system') return

  repairSuspicion(api, state, entry)
  applyStrategicNudge(api, state, entry)
  applyConcreteIntelPayoff(api, state, entry, human.id)
}
