import { getRemoteResponseSet } from './socialRuntimeConfig'
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
} from './types'

export interface IncomingResponseChoice {
  label: string
  responseType: IncomingInteractionResponseType
  description?: string
  style?: 'positive' | 'neutral' | 'negative' | 'dismiss'
}

type ResponseSet = IncomingResponseChoice[]

const set = (
  positive: string,
  neutral: string,
  negative: string,
  dismiss: string,
  deal = false
): ResponseSet => [
  { label: positive, responseType: deal ? 'accept' : 'positive' },
  { label: neutral, responseType: 'neutral' },
  { label: negative, responseType: deal ? 'decline' : 'negative' },
  { label: dismiss, responseType: 'dismiss' },
]

/** Compact four-choice banks keyed by conversation, event and emotional tone. */
export const DRAMA_RESPONSE_BANK: Record<string, ResponseSet[]> = {
  'type:warning': [
    set('Take seriously', 'Ask for proof', 'Question motive', 'File it away'),
    set('Thank them', 'Ask who knows', 'Call their bluff', 'Say nothing'),
    set('Act on it', 'Hear them out', 'Defend the target', 'End warning'),
  ],
  'type:snide_remark': [
    set('Kill with kindness', 'Stay ice-cold', 'Fire back', 'Walk away'),
    set('Laugh it off', 'Make them explain', 'Read them', 'Leave them hanging'),
    set('Lower the heat', 'Hold eye contact', 'Call it out', 'Exit the room'),
  ],
  'type:deal_offer': [
    set('Shake on it', 'Ask for terms', 'Counteroffer', 'End pitch', true),
    set('Take the deal', 'Buy some time', 'Reject terms', 'Change subject', true),
    set('Lock it in', 'Demand proof', 'Walk away', 'Leave unanswered', true),
  ],
  'type:alliance_proposal': [
    set('Join forces', 'Test loyalty', 'Refuse pact', 'Play it off', true),
    set('Seal the deal', 'Ask their plan', 'Keep distance', 'Change subject', true),
    set('Make it official', 'Sleep on it', 'Say no', 'Give no answer', true),
  ],
  'type:nomination_plea': [
    set('Promise support', 'Hear their pitch', 'Hold your ground', 'End campaign'),
    set('Give them hope', 'Ask their plan', 'Tell the truth', 'Stay silent'),
    set('Fight for them', 'Offer no promises', 'Refuse request', 'Close the door'),
  ],
  'type:compliment': [
    set('Return the love', 'Play it cool', 'Question sincerity', 'Brush past'),
    set('Open up', 'Thank them', 'Tease them', 'Change subject'),
    set('Build on it', 'Accept gracefully', 'Call it flattery', 'Move along'),
  ],
  'type:gossip': [
    set('Trade a secret', 'Ask their source', 'Defend the name', 'Kill the rumor'),
    set('Lean all the way in', 'Listen carefully', 'Challenge the story', 'Refuse gossip'),
    set('Share what you know', 'Ask who else knows', 'Warn the subject', 'Shut it down'),
  ],
  'type:check_in': [
    set('Be vulnerable', 'Keep it light', 'Set a boundary', 'Wrap it up'),
    set('Let them in', 'Ask them back', 'Keep your guard', 'End the chat'),
    set('Tell the truth', 'Joke it off', 'Keep distance', 'Leave it there'),
  ],
  'type:other': [
    set('Engage fully', 'Stay measured', 'Push back', 'Move along'),
    set('Match energy', 'Ask what they mean', 'Challenge them', 'End it'),
    set('Open the door', 'Keep neutral', 'Draw a line', 'Say nothing'),
  ],
  'scenario:betrayal_warning': [
    set('Believe them', 'Demand receipts', 'Question their angle', 'Bury it'),
    set('Compare notes', 'Ask who leaked it', 'Defend your ally', 'Drop it'),
    set('Plan a response', 'Watch quietly', 'Confront the warning', 'Refuse drama'),
  ],
  'scenario:generic_gossip': [
    set('Trade names', 'Ask the source', 'Correct the story', 'Stop the rumor'),
    set('Give your read', 'Ask who heard', 'Protect the target', 'Change topic'),
    set('Follow the trail', 'Listen only', 'Expose the lie', 'Walk away'),
  ],
  'scenario:nominee_hoh_plea': [
    set('Offer safety', 'Ask for loyalty', 'Explain the risk', 'End meeting'),
    set('Give your word', 'Stay noncommittal', 'Name your reason', 'Send them away'),
    set('Work with them', 'Ask for a plan', 'Hold nominations', 'Close the talk'),
  ],
  'scenario:nominee_veto_pitch': [
    set('Promise the power', 'Ask their pitch', 'Refuse to commit', 'End the talk'),
    set('Back their safety', 'Ask what they offer', 'Keep your plan', 'Stay silent'),
    set('Say you will use it', 'Give no guarantees', 'Say you will not', 'Walk away'),
  ],
  'scenario:live_vote_pitch': [
    set('Promise your vote', 'Ask for reasons', 'Refuse the vote', 'Stay silent'),
    set('Commit to keep them', 'Hear campaign', 'Choose the other side', 'End pitch'),
    set('Lock your vote', 'Keep options open', 'Tell them no', 'Avoid answer'),
  ],
  'scenario:alliance_reassurance': [
    set('Reassure fully', 'Ask what changed', 'Admit your doubts', 'Avoid it'),
    set('Renew the pact', 'Compare plans', 'Set new terms', 'End check-in'),
    set('Show loyalty', 'Stay cautious', 'Call out the crack', 'Move on'),
  ],
  'scenario:nomination_aftershock': [
    set('Own your choice', 'Explain carefully', 'Stand your ground', 'End talk'),
    set('Offer a path back', 'Hear their anger', 'Refuse apology', 'Walk away'),
    set('Calm the fallout', 'Keep it strategic', 'Match their heat', 'Say nothing'),
  ],
  'scenario:survivor_gratitude': [
    set('Share the moment', 'Accept thanks', 'Call in a favor', 'Move on'),
    set('Celebrate together', 'Keep it modest', 'Remind them they owe you', 'Change topic'),
    set('Strengthen bond', 'Say it was nothing', 'Keep score', 'Leave it there'),
  ],
  'tone:check_in:Warm': [
    set('Open your heart', 'Keep it sweet', 'Slow things down', 'Say goodnight'),
    set('Confide in them', 'Share a laugh', 'Protect your space', 'Wrap it up'),
  ],
  'tone:check_in:Guarded': [
    set('Meet halfway', 'Stay measured', 'Set a boundary', 'End the chat'),
    set('Offer one truth', 'Ask what they want', 'Keep your guard', 'Walk away'),
  ],
  'tone:check_in:Bitter': [
    set('Acknowledge hurt', 'Keep your cool', 'Name betrayal', 'Leave them there'),
    set('Try a truce', 'Ask why now', 'Refuse the reset', 'End it'),
  ],
  'tone:gossip:Trusting': [
    set('Trade real intel', 'Ask for details', 'Protect the secret', 'Change subject'),
    set('Name your source', 'Compare notes', 'Warn them gently', 'Stop there'),
  ],
  'tone:warning:Guarded': [
    set('Keep it private', 'Ask for evidence', 'Test their story', 'Pocket it'),
    set('Thank quietly', 'Ask who benefits', 'Challenge warning', 'End it'),
  ],
}

function stableIndex(source: string, count: number): number {
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (Math.imul(31, hash) + source.charCodeAt(index)) | 0
  }
  return count > 0 ? Math.abs(hash) % count : 0
}

export function getDramaResponseBlueprint(
  type: IncomingInteractionType,
  interaction: IncomingInteraction,
  tone?: string
): ResponseSet | null {
  const scenario = interaction.payload?.scenarioKey
  const keys = [
    tone ? `tone:${type}:${tone}` : '',
    typeof scenario === 'string' ? `scenario:${scenario}` : '',
    `type:${type}`,
  ].filter(Boolean)

  // Validated live-config content wins, while the local bank remains the
  // offline fallback and keeps old saves deterministic.
  for (const key of keys) {
    const remote = getRemoteResponseSet(key)
    if (remote?.length) return remote.map((choice) => ({ ...choice }))
  }

  const key = keys.find((candidate) => DRAMA_RESPONSE_BANK[candidate]?.length)
  if (!key) return null
  const pool = DRAMA_RESPONSE_BANK[key]
  return pool[stableIndex(`${interaction.id}|${interaction.fromId}|${key}`, pool.length)] ?? null
}
