import { normalizeAffinity } from './affinityUtils'
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
  relationship_friendship_check_in: [
    ['Let them in', 'Ask how they are', 'Keep it friendly', 'Leave it for now'],
  ],
  relationship_alliance_follow_up: [
    ['Work together', 'Ask for time', 'Do not pitch me again', 'End the talk'],
  ],
  relationship_romance_check_in: [
    ['See where this goes', 'Keep it light', 'Keep this platonic', 'Leave it for now'],
  ],
  relationship_confidant_check_in: [
    ['Hear them out', 'Ask for context', 'Do not confide in me', 'Change the subject'],
  ],
  relationship_frustration_follow_up: [
    ['Talk it through', 'Ask for time', 'Do not push this', 'Walk away'],
  ],
  relationship_repair_follow_up: [
    ['Try to repair it', 'Take some space', 'Keep your distance', 'End the talk'],
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
  relationship_friendship_check_in: {
    topic: 'the connection that has been building between you',
    stakes: 'meaningful',
    kind: 'bond',
  },
  relationship_alliance_follow_up: {
    topic: 'whether the two of you are actually working together',
    stakes: 'meaningful',
    kind: 'strategy',
  },
  relationship_romance_check_in: {
    topic: 'whether there may be something more between you',
    stakes: 'meaningful',
    kind: 'bond',
  },
  relationship_confidant_check_in: {
    topic: 'whether they can trust you with something personal',
    stakes: 'meaningful',
    kind: 'bond',
  },
  relationship_frustration_follow_up: {
    topic: 'the unresolved tension between you',
    stakes: 'high',
    kind: 'conflict',
  },
  relationship_repair_follow_up: {
    topic: 'repairing what went wrong between you',
    stakes: 'meaningful',
    kind: 'bond',
  },
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

function compactOutcomeText(text: string, maxLength = 280): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const clipped = normalized.slice(0, maxLength - 1).replace(/\s+\S*$/, '')
  return `${clipped}…`
}

type ConcreteResponseIntent =
  | 'ask_wellbeing'
  | 'ask_back'
  | 'ask_source'
  | 'ask_proof'
  | 'ask_case'
  | 'ask_plan'
  | 'ask_reason'
  | 'listen'
  | 'positive'
  | 'negative'
  | 'dismiss'
  | 'neutral'

function responseIntent(label: string | undefined, stance: OutcomeStance): ConcreteResponseIntent {
  const action = (label ?? '').toLowerCase()
  if (/ask how they are|ask what they need/.test(action)) return 'ask_wellbeing'
  if (/ask them back/.test(action)) return 'ask_back'
  if (/source|who else knows/.test(action)) return 'ask_source'
  if (/proof|specifics|detail/.test(action)) return 'ask_proof'
  if (/case|campaign/.test(action)) return 'ask_case'
  if (/ask.*(plan|offer)|term|what changes/.test(action)) return 'ask_plan'
  if (/why|what changed|explain|context|what they mean/.test(action)) return 'ask_reason'
  if (/hear|listen|nod/.test(action)) return 'listen'
  if (stance === 'positive') return 'positive'
  if (stance === 'negative') return 'negative'
  if (stance === 'dismiss') return 'dismiss'
  return 'neutral'
}

function checkInPressure(fromName: string, phase: string, senderIsNominated: boolean): string {
  if (senderIsNominated && ['social_2', 'live_vote'].includes(phase)) {
    return `${fromName} says they feel the house is against them.`
  }
  if (
    ['nominations', 'nomination_results', 'pos_comp', 'pos_results', 'pos_ceremony'].includes(phase)
  ) {
    return `${fromName} says they are worried they could be used as a pawn.`
  }
  if (['week_start', 'social_1', 'hoh_comp', 'hoh_results'].includes(phase)) {
    return `${fromName} says they are worried about the upcoming nominations.`
  }
  return `${fromName} says they are watching who they can still trust.`
}

function scenarioReply(
  scenarioKey: string | undefined,
  intent: ConcreteResponseIntent,
  fromName: string,
  subjectName: string | undefined,
  phase: string,
  senderIsNominated: boolean
): string {
  const target = subjectName ?? 'the name involved'
  if (intent === 'dismiss') return `${fromName} drops the subject, but remembers the brush-off.`
  if (intent === 'negative') return `${fromName} backs off and adjusts their plans without you.`

  if (intent === 'ask_wellbeing') return checkInPressure(fromName, phase, senderIsNominated)
  if (intent === 'ask_back')
    return `${fromName} says they are still trying to read where they stand with you.`
  if (intent === 'ask_source')
    return `${fromName} says the story came up twice, but will not name anyone yet.`
  if (intent === 'ask_proof')
    return `${fromName} admits they have a pattern, not proof, against ${target}.`
  if (intent === 'ask_case')
    return `${fromName} says keeping them gives you a vote that is still open.`
  if (intent === 'ask_plan') return `${fromName} says they need a clear deal before names are set.`
  if (intent === 'ask_reason')
    return `${fromName} says they felt shut out and wanted a direct answer.`
  if (intent === 'listen')
    return `${fromName} lays out their position and waits to see what you do with it.`

  const replies: Record<string, string> = {
    week_start_ally_check_in: `${fromName} says they want to compare notes before the week gets away from them.`,
    week_start_enemy_gossip: `${fromName} says a new voting group is forming, but the names are still moving.`,
    week_start_alliance_lock: `${fromName} says they want to test the alliance with one small vote first.`,
    hoh_congratulations: `${fromName} says the LOH win has put every conversation under a spotlight.`,
    safety_win_congratulations: `${fromName} says your Safety win changed who has room to take risks.`,
    player_nominated_support: `${fromName} says the block has made every friendly face harder to trust.`,
    player_nominated_tension: `${fromName} says the nomination changed how they read your relationship.`,
    competition_low_finish_support: `${fromName} says the result stung, but they are not giving up ground.`,
    competition_low_finish_taunt: `${fromName} says the result showed exactly who is under pressure.`,
    social_momentum_notice: `${fromName} says people have started comparing notes about your social game.`,
    hoh_safety_request: `${fromName} says a promise of safety would change their whole week.`,
    nominee_hoh_plea: `${fromName} says putting them up would create a vote you cannot fully control.`,
    nominee_veto_pitch: `${fromName} says using Safety on them would force a weaker replacement.`,
    nominee_campaign: `${fromName} says they have two votes leaning their way, but need one more.`,
    nomination_aftershock: `${fromName} says the nomination made them question who was really with them.`,
    nominee_understands_loh: `${fromName} says they understand the move, but will remember who approved it.`,
    nominee_confronts_loh: `${fromName} says the nomination felt personal, whatever the strategy was.`,
    replacement_nominee_reacts_to_loh: `${fromName} says being the replacement changed the way they see you.`,
    post_veto_gratitude: `${fromName} says the Safety decision bought them time they will not waste.`,
    post_veto_campaign: `${fromName} says the new block has reopened every vote in the house.`,
    live_vote_pitch: `${fromName} says they need one honest answer before the vote locks.`,
    survivor_gratitude: `${fromName} says surviving the vote showed them who really came through.`,
    betrayal_warning: `${fromName} says the same name has come up too often to ignore.`,
    ignored_warning: `${fromName} says the distance between you is starting to affect their choices.`,
    targeted_snark: `${fromName} says they wanted to see whether the jab would get under your skin.`,
    alliance_reassurance: `${fromName} says the alliance needs one clear move to prove it still exists.`,
    generic_gossip: `${fromName} says ${target}'s name is circulating, but the story is incomplete.`,
    generic_check_in: checkInPressure(fromName, phase, senderIsNominated),
    relationship_friendship_check_in: checkInPressure(fromName, phase, senderIsNominated),
    relationship_alliance_follow_up: `${fromName} says they need to know whether the two of you are actually working together.`,
    relationship_romance_check_in: `${fromName} says they do not want the connection to become a house rumour.`,
    relationship_confidant_check_in: `${fromName} says they have something personal to share, but are still testing trust.`,
    relationship_frustration_follow_up: `${fromName} says the tension is affecting how they play around you.`,
    relationship_repair_follow_up: `${fromName} says repairing this would take more than one good conversation.`,
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
  // The message above this result already contains the opening. Show only the
  // answer it earned: a short, action-specific reply grounded in the current
  // phase. This keeps results readable and prevents different choices from
  // collapsing into the same generic relationship summary.
  const outcomeText = compactOutcomeText(
    scenarioReply(
      typeof scenarioKey === 'string' ? scenarioKey : undefined,
      responseIntent(input.responseLabel, stance),
      input.fromName,
      input.subjectName,
      input.phase,
      input.senderIsNominated ?? false
    ),
    180
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
