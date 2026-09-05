import { normalizeAffinity } from './affinityUtils'
import { getAuthoredIncomingSceneOutcome } from './incomingSceneOutcomeBank'
import { getSocialPersonality } from './socialPersonalityBank'
import type { SocialMemoryDelta } from './socialMemory'
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
} from './types'

export type IncomingChoiceStyle = 'positive' | 'neutral' | 'negative' | 'dismiss'

export interface ContextualIncomingChoice {
  label: string
  responseType: IncomingInteractionResponseType
  style: IncomingChoiceStyle
}

type ChoiceLabels = readonly [string, string, string, string]

type OutcomeStance = 'positive' | 'neutral' | 'negative' | 'dismiss'

interface SceneDefinition {
  topic: string
  stakes: 'quiet' | 'meaningful' | 'high'
  kind: 'bond' | 'intel' | 'pressure' | 'celebration' | 'conflict' | 'strategy'
}

const SCENE_CHOICES: Record<string, readonly ChoiceLabels[]> = {
  week_start_ally_check_in: [
    ['Share your read', 'Ask what changed', 'Keep your cards close', 'Leave it for later'],
    ['Reassure them', 'Talk through the week', 'Set a little distance', 'Change the subject'],
  ],
  week_start_enemy_gossip: [
    ['Compare notes', 'Hear them out', 'Call it fishing', 'Do not bite'],
    ['Ask who is talking', 'Keep it vague', 'Challenge the angle', 'End the chat'],
  ],
  week_start_alliance_lock: [
    ['Make it official', 'Ask for their plan', 'Keep it informal', 'Play it off'],
    ['Offer a real pact', 'Test the details', 'Say it is too soon', 'Leave it hanging'],
  ],
  hoh_congratulations: [
    ['Thank them warmly', 'Keep it light', 'Question the timing', 'Move on'],
    ['Share the moment', 'Accept the compliment', 'Call it strategy', 'Cut it short'],
  ],
  safety_win_congratulations: [
    ['Thank them genuinely', 'Keep it casual', 'Deflect the praise', 'Get back to the game'],
    ['Celebrate together', 'Nod and listen', 'Ask what they want', 'Change the subject'],
  ],
  player_nominated_support: [
    ['Let them in', 'Ask what they need', 'Keep your guard up', 'End the talk'],
    ['Thank them for checking', 'Talk it through', 'Say you are fine', 'Step away'],
  ],
  player_nominated_tension: [
    ['Ask for honesty', 'Keep it controlled', 'Call out the tension', 'Walk away'],
    ['Try to reset', 'Hear their read', 'Draw a boundary', 'Leave it there'],
  ],
  competition_low_finish_support: [
    ['Accept the support', 'Laugh it off', 'Say you do not need it', 'Move on'],
    ['Be honest about it', 'Keep it breezy', 'Question the concern', 'End the chat'],
  ],
  competition_low_finish_taunt: [
    ['Defuse it', 'Give them nothing', 'Fire back', 'Walk away'],
    ['Laugh without agreeing', 'Hold your composure', 'Name the cheap shot', 'Leave them talking'],
  ],
  social_momentum_notice: [
    ['Compare what they saw', 'Listen carefully', 'Reject the read', 'Keep it private'],
    ['Ask for specifics', 'Play it cool', 'Say they are overreaching', 'End the chat'],
  ],
  hoh_safety_request: [
    [
      'Give them a real opening',
      'Ask what they are offering',
      'Set a clear limit',
      'End the pitch',
    ],
    ['Promise consideration', 'Keep it noncommittal', 'Tell them it is unlikely', 'Send them away'],
  ],
  nominee_hoh_plea: [
    ['Offer safety', 'Ask for their case', 'Explain the risk', 'Close the meeting'],
    ['Give them your word', 'Listen without promising', 'State your reasons', 'End the talk'],
  ],
  nominee_veto_pitch: [
    ['Back their Safety', 'Ask what changes', 'Refuse to commit', 'End the conversation'],
    ['Promise the power', 'Hear their plan', 'Keep your move private', 'Walk away'],
  ],
  nominee_campaign: [
    ['Give them hope', 'Hear the campaign', 'Tell them where you stand', 'Leave it there'],
    ['Ask what they need', 'Keep your options open', 'Say you cannot help', 'End the chat'],
  ],
  nomination_aftershock: [
    ['Acknowledge the hurt', 'Explain carefully', 'Stand by the move', 'End the talk'],
    ['Offer a path back', 'Hear their anger', 'Keep it strategic', 'Walk away'],
  ],
  nominee_understands_loh: [
    ['Explain the decision', 'Hear them out', 'Keep it strictly strategic', 'End the talk'],
    ['Own the move', 'Ask what they need', 'Refuse to apologize', 'Give them space'],
  ],
  nominee_confronts_loh: [
    ['Meet the anger honestly', 'Explain the calculation', 'Push back too', 'Walk away'],
    ['Own the fallout', 'Keep your voice calm', 'Refuse the accusation', 'End the confrontation'],
  ],
  replacement_nominee_reacts_to_loh: [
    ['Explain the backup plan', 'Hear their reaction', 'Stand by the choice', 'End the talk'],
    ['Acknowledge the blow', 'Keep it factual', 'Refuse to justify it', 'Give them space'],
  ],
  post_veto_gratitude: [
    ['Share the relief', 'Accept their thanks', 'Call in the favor', 'Change the subject'],
    ['Celebrate together', 'Say it was nothing', 'Keep score', 'Move on'],
  ],
  post_veto_campaign: [
    ['Hear their new plan', 'Keep it measured', 'Tell them you cannot help', 'End the campaign'],
    ['Offer a little hope', 'Ask what changed', 'Keep your distance', 'Close the talk'],
  ],
  live_vote_pitch: [
    ['Promise your vote', 'Ask for their case', 'Tell them no', 'Avoid an answer'],
    ['Commit to keep them', 'Keep your options open', 'Choose the other side', 'End the pitch'],
  ],
  survivor_gratitude: [
    ['Share the moment', 'Accept the thanks', 'Remind them who helped', 'Move on'],
    ['Strengthen the bond', 'Keep it modest', 'Call in a favor', 'Change the subject'],
  ],
  betrayal_warning: [
    ['Compare notes', 'Ask for proof', 'Question their motive', 'Bury it for now'],
    ['Take it seriously', 'Watch quietly', 'Defend your ally', 'Refuse the drama'],
  ],
  ignored_warning: [
    ['Give them time', 'Ask what they need', 'Set a boundary', 'End the chat'],
    [
      'Acknowledge the distance',
      'Keep it brief',
      'Say they are reading too much in',
      'Leave it there',
    ],
  ],
  targeted_snark: [
    ['Ask what they mean', 'Stay unreadable', 'Call it out', 'Walk away'],
    ['Defuse the jab', 'Keep your cool', 'Push back directly', 'Let it die'],
  ],
  alliance_reassurance: [
    ['Reassure them fully', 'Compare your plans', 'Admit your doubts', 'Avoid the subject'],
    ['Renew the pact', 'Ask what changed', 'Set new terms', 'End the check-in'],
  ],
  generic_gossip: [
    ['Ask for the source', 'Listen only', 'Protect the target', 'Stop the rumour'],
    ['Trade a little intel', 'Ask who else knows', 'Challenge the story', 'Change the subject'],
  ],
  generic_check_in: [
    ['Be honest', 'Ask them back', 'Keep some distance', 'Wrap it up'],
    ['Let them in', 'Keep it light', 'Set a boundary', 'Leave it there'],
  ],
}

const SCENE_DEFINITIONS: Record<string, SceneDefinition> = {
  week_start_ally_check_in: {
    topic: 'where the two of you stand this week',
    stakes: 'meaningful',
    kind: 'bond',
  },
  week_start_enemy_gossip: {
    topic: 'the new week’s shifting alliances',
    stakes: 'meaningful',
    kind: 'intel',
  },
  week_start_alliance_lock: { topic: 'a possible alliance', stakes: 'high', kind: 'strategy' },
  hoh_congratulations: { topic: 'your LOH win', stakes: 'quiet', kind: 'celebration' },
  safety_win_congratulations: { topic: 'your Safety win', stakes: 'quiet', kind: 'celebration' },
  player_nominated_support: { topic: 'being on the block', stakes: 'high', kind: 'bond' },
  player_nominated_tension: { topic: 'the nomination fallout', stakes: 'high', kind: 'conflict' },
  competition_low_finish_support: {
    topic: 'the competition result',
    stakes: 'quiet',
    kind: 'bond',
  },
  competition_low_finish_taunt: {
    topic: 'the competition result',
    stakes: 'meaningful',
    kind: 'conflict',
  },
  social_momentum_notice: {
    topic: 'how visible your game has become',
    stakes: 'meaningful',
    kind: 'intel',
  },
  hoh_safety_request: { topic: 'your LOH decision', stakes: 'high', kind: 'strategy' },
  nominee_hoh_plea: { topic: 'keeping them off the block', stakes: 'high', kind: 'pressure' },
  nominee_veto_pitch: { topic: 'using Safety', stakes: 'high', kind: 'pressure' },
  nominee_campaign: { topic: 'their campaign to stay', stakes: 'high', kind: 'pressure' },
  nomination_aftershock: { topic: 'the nomination decision', stakes: 'high', kind: 'conflict' },
  nominee_understands_loh: {
    topic: 'why you nominated them as LOH',
    stakes: 'high',
    kind: 'conflict',
  },
  nominee_confronts_loh: {
    topic: 'the nomination confrontation',
    stakes: 'high',
    kind: 'conflict',
  },
  replacement_nominee_reacts_to_loh: {
    topic: 'the replacement nomination',
    stakes: 'high',
    kind: 'conflict',
  },
  post_veto_gratitude: { topic: 'the Safety decision', stakes: 'meaningful', kind: 'celebration' },
  post_veto_campaign: { topic: 'the new block after Safety', stakes: 'high', kind: 'pressure' },
  live_vote_pitch: { topic: 'the live vote', stakes: 'high', kind: 'pressure' },
  survivor_gratitude: { topic: 'surviving the vote', stakes: 'meaningful', kind: 'celebration' },
  betrayal_warning: { topic: 'a possible betrayal', stakes: 'high', kind: 'intel' },
  ignored_warning: { topic: 'the distance between you', stakes: 'meaningful', kind: 'bond' },
  targeted_snark: { topic: 'their read on your game', stakes: 'meaningful', kind: 'conflict' },
  alliance_reassurance: { topic: 'the state of your alliance', stakes: 'meaningful', kind: 'bond' },
  generic_gossip: { topic: 'a house rumour', stakes: 'meaningful', kind: 'intel' },
  generic_check_in: { topic: 'where things stand', stakes: 'quiet', kind: 'bond' },
}

const FALLBACK_SCENE: SceneDefinition = {
  topic: 'the conversation',
  stakes: 'meaningful',
  kind: 'bond',
}

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

function focusFromMessage(interaction: IncomingInteraction, fallback: string): string {
  const message = interaction.text.toLowerCase()
  if (/not adding up|direct answer|something between us/.test(message)) return 'what was not adding up'
  if (/wanted to talk.*direct|talk to you directly/.test(message)) return 'what had shifted'
  if (/where.*stand|in my corner|trust/.test(message)) return 'where the two of you stood'
  if (/safe|safety|block|nominee/.test(message)) return 'the Safety decision and its fallout'
  if (/vote|keep me|send me home/.test(message)) return 'how the vote was shaping up'
  return fallback
}

function describeResponseAction(
  label: string | undefined,
  stance: OutcomeStance,
  fromName: string,
  focus: string
): string {
  const action = (label ?? '').toLowerCase()
  if (/make.*explain/.test(action))
    return `asked ${fromName} to spell out exactly ${focus}`
  if (/ask.*why|ask what changed/.test(action))
    return `asked ${fromName} to explain ${focus}`
  if (/ask.*(specific|detail|proof|source|case|plan|need|offer|term)/.test(action))
    return `asked ${fromName} for specifics before showing your hand`
  if (/hear|listen/.test(action)) return `let ${fromName} make their case without promising anything`
  if (/share|honest|let.*in|reassure|thank|celebrate|accept|offer safety|promise/.test(action))
    return `gave ${fromName} a candid answer about ${focus}`
  if (/keep|guard|measured|light|noncommittal|cool|nod/.test(action))
    return `kept your answer guarded while addressing ${focus}`
  if (stance === 'negative') return `drew a line around ${focus}`
  if (stance === 'dismiss') return `ended the exchange before addressing ${focus}`
  return `responded carefully to ${fromName}'s concern about ${focus}`
}

function phasePressure(phase: string): string {
  if (phase.includes('pos')) return 'With the Safety ceremony shaping the block, '
  if (phase.includes('nomination')) return 'With nominations already in play, '
  if (phase.includes('live_vote')) return 'With the vote approaching, '
  if (phase.includes('week_start')) return 'At the start of a new week, '
  return ''
}

function relationshipQualifier(mutualAffinity: number, fromName: string): string {
  if (mutualAffinity <= -0.25) {
    return ` The existing distrust means ${fromName} will test that answer before acting on it.`
  }
  if (mutualAffinity >= 0.55) {
    return ' Your existing rapport makes the answer land as more than polite talk.'
  }
  return ''
}

function consequenceFor(
  stance: OutcomeStance,
  kind: SceneDefinition['kind'],
  fromName: string,
  mutualAffinity: number
): string {
  const relationshipRead = relationshipQualifier(mutualAffinity, fromName)
  if (stance === 'positive') {
    return `${fromName} left with a clearer reason to work with you, but will measure it against your next move.${relationshipRead}`
  }
  if (stance === 'neutral') {
    const nextStep = kind === 'pressure' ? 'They will keep looking for another route.' : 'They now know which part to watch.'
    return `${fromName} got an answer, not a promise. ${nextStep}${relationshipRead}`
  }
  if (stance === 'negative') {
    return `${fromName} now knows not to lean on you here and will adjust their game accordingly.${relationshipRead}`
  }
  return `${fromName} leaves without the clarity they wanted and has to plan around that silence.${relationshipRead}`
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
}

export interface IncomingResponseResolution {
  actorDelta: number
  playerDelta: number
  memoryDelta: SocialMemoryDelta
  outcomeText: string
}

/**
 * Resolves the immediate social meaning of a choice. The result is deterministic
 * for a saved interaction, but is shaped by the sender's disposition, the
 * existing two-way connection, phase, and the exact scene instead of a fixed
 * positive/negative table for every message type.
 */
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
  const focus = input.subjectName ?? focusFromMessage(input.interaction, scene.topic)
  const action = describeResponseAction(input.responseLabel, stance, input.fromName, focus)
  const authoredOutcome = getAuthoredIncomingSceneOutcome(
    typeof scenarioKey === 'string' ? scenarioKey : undefined,
    stance,
    seed
  )
  const consequence = authoredOutcome
    ? `${authoredOutcome.replaceAll('{from}', input.fromName).replaceAll('{focus}', focus)}${relationshipQualifier(
        mutualAffinity,
        input.fromName
      )}`
    : consequenceFor(stance, scene.kind, input.fromName, mutualAffinity)
  const outcomeText = `${phasePressure(input.phase)}you ${action}. ${consequence}`

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
