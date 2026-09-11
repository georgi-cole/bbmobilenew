import { normalizeAffinity } from './affinityUtils'
import { getIncomingActionOutcome } from './incomingOutcomeMatrix'
import { FALLBACK_SCENE, SCENE_DEFINITIONS } from './incomingSceneDefinitionBank'
import { SCENE_CHOICES } from './incomingSceneChoiceBank'
import { getSocialPersonality } from './socialPersonalityBank'
import type { SocialMemoryDelta } from './socialMemory'
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
} from './types'
import type { SceneDefinition } from './incomingSceneDefinitionBank'

export type IncomingChoiceStyle = 'positive' | 'neutral' | 'negative' | 'dismiss'

export interface ContextualIncomingChoice {
  label: string
  responseType: IncomingInteractionResponseType
  style: IncomingChoiceStyle
}

type OutcomeStance = 'positive' | 'neutral' | 'negative' | 'dismiss'

function hash(source: string): number {
  let value = 2166136261
  for (const character of source) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return Math.abs(value >>> 0)
}

function stanceForResponse(responseType: IncomingInteractionResponseType): OutcomeStance {
  if (responseType === 'positive' || responseType === 'accept') return 'positive'
  if (responseType === 'negative' || responseType === 'decline') return 'negative'
  if (responseType === 'dismiss' || responseType === 'ignore') return 'dismiss'
  return 'neutral'
}

function styleForResponse(responseType: IncomingInteractionResponseType): IncomingChoiceStyle {
  const stance = stanceForResponse(responseType)
  return stance === 'positive' ? 'positive' : stance
}

function responseTypesFor(
  interactionType: IncomingInteractionType
): readonly IncomingInteractionResponseType[] {
  if (interactionType === 'deal_offer' || interactionType === 'alliance_proposal') {
    return ['accept', 'neutral', 'decline', 'dismiss']
  }
  return ['positive', 'neutral', 'negative', 'dismiss']
}

export function getContextualIncomingChoices(
  interaction: IncomingInteraction
): ContextualIncomingChoice[] | null {
  const scenarioKey = interaction.payload?.scenarioKey
  if (typeof scenarioKey !== 'string') return null
  const variants = SCENE_CHOICES[scenarioKey]
  if (!variants?.length) return null
  const labels =
    variants[hash(`${interaction.id}:${interaction.fromId}:${scenarioKey}`) % variants.length]
  const responseTypes = responseTypesFor(interaction.type)
  return labels.map((label, index) => ({
    label,
    responseType: responseTypes[index] ?? 'dismiss',
    style: styleForResponse(responseTypes[index] ?? 'dismiss'),
  }))
}

function baseDelta(kind: SceneDefinition['kind'], stance: OutcomeStance): number {
  const values: Record<SceneDefinition['kind'], Record<OutcomeStance, number>> = {
    bond: { positive: 5, neutral: 1, negative: -5, dismiss: -3 },
    intel: { positive: 4, neutral: 1, negative: -4, dismiss: -2 },
    pressure: { positive: 6, neutral: 0, negative: -7, dismiss: -5 },
    celebration: { positive: 4, neutral: 1, negative: -3, dismiss: -2 },
    conflict: { positive: 3, neutral: 0, negative: -7, dismiss: -3 },
    strategy: { positive: 6, neutral: 0, negative: -6, dismiss: -4 },
  }
  return values[kind][stance]
}

function compactOutcomeText(text: string, maxLength = 140): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const clipped = normalized.slice(0, maxLength - 1).replace(/\s+\S*$/, '')
  return `${clipped}…`
}

function fallbackScenarioOutcome(
  scenarioKey: string | undefined,
  stance: OutcomeStance,
  fromName: string,
  subjectName?: string
): string {
  if (stance === 'dismiss') return `${fromName} drops the subject and moves on.`
  if (stance === 'negative') return `${fromName} backs off and adjusts their plan without you.`

  const target = subjectName ?? 'that player'
  const replies: Record<string, string> = {
    week_start_ally_check_in: `${fromName} says they want to compare notes before the week gets away from them.`,
    week_start_enemy_gossip: `${fromName} says the house is already splitting into new groups.`,
    week_start_alliance_lock: `${fromName} says they want one move to prove the alliance is real.`,
    hoh_congratulations: `${fromName} says the LOH win has made every conversation more visible.`,
    safety_win_congratulations: `${fromName} says your Safety win changed who can take risks this week.`,
    player_nominated_support: `${fromName} says the block has made every friendly face harder to read.`,
    player_nominated_tension: `${fromName} says the nomination changed how they see your relationship.`,
    competition_low_finish_support: `${fromName} says one weak result does not define your week.`,
    competition_low_finish_taunt: `${fromName} says the result showed exactly who is under pressure.`,
    social_momentum_notice: `${fromName} says people have started comparing notes about your social game.`,
    hoh_safety_request: `${fromName} says safety from you would change their whole week.`,
    nominee_hoh_plea: `${fromName} says staying off the block keeps one more vote within your reach.`,
    nominee_veto_pitch: `${fromName} says using Safety on them would force the house to recalculate.`,
    nominee_campaign: `${fromName} says the vote is still movable, but they need another number.`,
    nomination_aftershock: `${fromName} says the nomination changed who they think is really with them.`,
    nominee_understands_loh: `${fromName} says they understand the move, but will remember who made it.`,
    nominee_confronts_loh: `${fromName} says the nomination felt personal, whatever the strategy was.`,
    replacement_nominee_reacts_to_loh: `${fromName} says the replacement choice changed how they see you.`,
    post_veto_gratitude: `${fromName} says the Safety decision bought them time they will remember.`,
    post_veto_campaign: `${fromName} says the new block has reopened votes they thought were settled.`,
    live_vote_pitch: `${fromName} says they need one honest answer before the vote locks.`,
    survivor_gratitude: `${fromName} says surviving showed them who actually came through.`,
    betrayal_warning: `${fromName} says the same suspicious pattern has come up too often to ignore.`,
    ignored_warning: `${fromName} says the distance between you is starting to affect their choices.`,
    targeted_snark: `${fromName} says they wanted to see whether the jab would get a reaction.`,
    alliance_reassurance: `${fromName} says the alliance needs one clear move to prove it still exists.`,
    generic_gossip: `${fromName} says ${target} is being discussed, but the claim is still incomplete.`,
    generic_check_in: `${fromName} says they are still trying to read where they stand with you.`,
    relationship_friendship_check_in: `${fromName} says the friendship feels more real than they expected.`,
    relationship_alliance_follow_up: `${fromName} says they need to know whether you are actually working together.`,
    relationship_romance_check_in: `${fromName} says they do not want the connection to become house gossip.`,
    relationship_confidant_check_in: `${fromName} says they have something private to share if they can trust you.`,
    relationship_frustration_follow_up: `${fromName} says the mixed signals are affecting how they play around you.`,
    relationship_repair_follow_up: `${fromName} says fixing this will take more than one good conversation.`,
  }
  return replies[scenarioKey ?? ''] ?? `${fromName} gives you a clearer read on where they stand.`
}

export interface IncomingResponseResolutionInput {
  interaction: IncomingInteraction
  responseType: IncomingInteractionResponseType
  fromName: string
  phase: string
  actorAffinity: number
  playerAffinity: number
  subjectName?: string
  responseLabel?: string
  senderIsNominated?: boolean
}

export interface IncomingResponseResolution {
  actorDelta: number
  playerDelta: number
  memoryDelta: SocialMemoryDelta
  outcomeText: string
}

export function resolveIncomingResponse(
  input: IncomingResponseResolutionInput
): IncomingResponseResolution {
  const scenarioKey = input.interaction.payload?.scenarioKey
  const scene =
    typeof scenarioKey === 'string'
      ? (SCENE_DEFINITIONS[scenarioKey] ?? FALLBACK_SCENE)
      : FALLBACK_SCENE
  const stance = stanceForResponse(input.responseType)
  const personality = getSocialPersonality(input.interaction.fromId)
  const seed = hash(
    `${input.interaction.id}:${scenarioKey ?? input.interaction.type}:${input.responseType}:${input.phase}`
  )
  const mutualAffinity =
    (normalizeAffinity(input.actorAffinity) + normalizeAffinity(input.playerAffinity)) / 2
  const volatility =
    personality.emotionalReactivity + personality.assertiveness - personality.forgiveness
  const relationshipAdjustment =
    stance === 'positive'
      ? mutualAffinity < -0.25
        ? -1
        : mutualAffinity > 0.55
          ? 1
          : 0
      : stance === 'negative' || stance === 'dismiss'
        ? volatility > 0.45
          ? -1
          : personality.forgiveness > 0.7
            ? 1
            : 0
        : 0
  const sceneAdjustment = scene.stakes === 'high' ? (seed % 3) - 1 : seed % 2
  const actorDelta = Math.max(
    -14,
    Math.min(14, baseDelta(scene.kind, stance) + relationshipAdjustment + sceneAdjustment)
  )
  const reciprocalWeight =
    0.35 +
    personality.warmth * 0.2 +
    (scene.kind === 'bond' || scene.kind === 'celebration' ? 0.1 : 0)
  const playerDelta = Math.max(-10, Math.min(10, Math.round(actorDelta * reciprocalWeight)))

  const scenarioName = typeof scenarioKey === 'string' ? scenarioKey : undefined
  const authoredOutcome = getIncomingActionOutcome({
    scenarioKey: scenarioName,
    responseLabel: input.responseLabel,
    fromName: input.fromName,
    subjectName: input.subjectName,
    phase: input.phase,
    senderIsNominated: input.senderIsNominated ?? false,
  })
  const outcomeText = compactOutcomeText(
    authoredOutcome ??
      fallbackScenarioOutcome(scenarioName, stance, input.fromName, input.subjectName)
  )

  return {
    actorDelta,
    playerDelta,
    memoryDelta:
      stance === 'positive'
        ? { gratitude: scene.stakes === 'high' ? 2 : 1, trustMomentum: 1 }
        : stance === 'neutral'
          ? { trustMomentum: scene.kind === 'strategy' ? 0 : 1 }
          : stance === 'negative'
            ? { resentment: scene.stakes === 'high' ? 2 : 1, trustMomentum: -1 }
            : { neglect: 1, trustMomentum: -1 },
    outcomeText,
  }
}
