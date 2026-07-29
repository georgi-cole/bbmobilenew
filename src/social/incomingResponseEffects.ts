import type { IncomingInteractionResponseType, IncomingInteractionType } from './types'

type DeltaTable = Partial<Record<IncomingInteractionResponseType, number>>

const BASE: Record<IncomingInteractionResponseType, number> = {
  positive: 5,
  neutral: 1,
  negative: -6,
  accept: 8,
  decline: -7,
  dismiss: -3,
  ignore: -4,
}

/** Relationship consequences tuned to the emotional stakes of each approach. */
export const INCOMING_RESPONSE_EFFECTS: Partial<Record<IncomingInteractionType, DeltaTable>> = {
  compliment: { positive: 4, neutral: 1, negative: -3, dismiss: -2, ignore: -2 },
  check_in: { positive: 6, neutral: 2, negative: -5, dismiss: -4, ignore: -6 },
  gossip: { positive: 5, neutral: 1, negative: -5, dismiss: -3, ignore: -2 },
  warning: { positive: 7, neutral: 2, negative: -7, dismiss: -4, ignore: -8 },
  snide_remark: { positive: 3, neutral: 0, negative: -7, dismiss: -2, ignore: 1 },
  deal_offer: { accept: 9, neutral: 0, decline: -6, dismiss: -4, ignore: -7 },
  alliance_proposal: { accept: 12, neutral: 1, decline: -10, dismiss: -7, ignore: -12 },
  nomination_plea: { positive: 8, neutral: 0, negative: -9, dismiss: -6, ignore: -10 },
  other: { positive: 5, neutral: 1, negative: -5, dismiss: -3, ignore: -4 },
}

const WARM_TONES = new Set(['Warm', 'Trusting'])
const HOSTILE_TONES = new Set(['Bitter', 'Tense', 'Feels ignored'])

export function getIncomingResponseRelationshipDelta(
  type: IncomingInteractionType,
  responseType: IncomingInteractionResponseType,
  tone?: string
): number {
  const base = INCOMING_RESPONSE_EFFECTS[type]?.[responseType] ?? BASE[responseType]
  if (WARM_TONES.has(tone ?? '') && (responseType === 'positive' || responseType === 'accept')) {
    return base + 2
  }
  if (HOSTILE_TONES.has(tone ?? '') && ['negative', 'decline', 'dismiss'].includes(responseType)) {
    return base - 2
  }
  return base
}

const RESPONSE_LOG_COPY: Record<IncomingInteractionResponseType, readonly string[]> = {
  positive: [
    'You met {name} halfway, and they noticed.',
    'You gave {name} the response they hoped for.',
    'You leaned into the conversation with {name}.',
    'You turned the approach from {name} into genuine goodwill.',
  ],
  neutral: [
    'You heard {name} out without showing your whole hand.',
    'You kept things measured with {name}.',
    'You gave {name} an answer, but no guarantee.',
    'You left the door open without promising {name} anything.',
  ],
  negative: [
    'You pushed back and {name} did not hide their reaction.',
    'You drew a hard line with {name}.',
    'You challenged the story from {name}.',
    'You made it clear to {name} that the pitch did not land.',
  ],
  accept: [
    'You accepted the offer from {name} and made the deal real.',
    'You shook on it with {name}; now the promises count.',
    'You told {name} yes, and raised the stakes for both of you.',
    'You joined the plan from {name} with cameras watching.',
  ],
  decline: [
    'You refused the offer from {name} and closed that strategic door.',
    'You told {name} no without leaving much room for repair.',
    'You rejected the deal; {name} will remember it.',
    'You chose distance over the arrangement {name} offered.',
  ],
  dismiss: [
    'You ended the conversation before {name} could finish the pitch.',
    'You gave {name} nothing to work with.',
    'You walked away from the approach by {name}.',
    'You left {name} without an answer.',
  ],
  ignore: [
    'You let the message from {name} expire unanswered.',
    'You never answered {name}, and the silence became the answer.',
    'You ignored the approach by {name} until the moment passed.',
    'You left {name} waiting until the decision window closed.',
  ],
}

function copyIndex(seed: string, count: number): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % count
}

export function getIncomingResponseLogCopy(
  interactionId: string,
  responseType: IncomingInteractionResponseType,
  fromName: string
): string {
  const pool = RESPONSE_LOG_COPY[responseType]
  return (pool[copyIndex(`${interactionId}:${responseType}`, pool.length)] ?? pool[0]).replace(
    '{name}',
    fromName
  )
}
