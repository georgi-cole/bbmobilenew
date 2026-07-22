export type StoryResponseType =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'accept'
  | 'decline'
  | 'dismiss'

export interface SocialStoryMoment {
  id: string
  lines: string[]
  effects: {
    relationship: [number, number]
    trustSignal?: 'warmth' | 'honesty' | 'pressure' | 'deception' | 'protection'
  }
}

export interface SocialStoryline {
  id: string
  title: string
  trigger: string
  cooldownWeeks: number
  stages: Array<{ id: string; interactionType: string; line: string; effect: number }>
}

export const SOCIAL_STORY_BIBLE = {
  actionMoments: {
    compliment: [
      {
        id: 'summer_forest_hair',
        lines: [
          '{actor} told {target} their hair looked like a summer forest—beautiful, mysterious, and probably hiding a secret alliance.',
          '{actor} called {target} the emotional support lamp of the house: unexpectedly warm and always on during drama.',
          '{actor} praised {target} so sincerely that two people nearby immediately assumed it was strategy.',
        ],
        effects: { relationship: [1, 5], trustSignal: 'warmth' },
      },
    ],
    whisper: [
      {
        id: 'kitchen_counter_intel',
        lines: [
          '{actor} pulled {target} beside the kitchen counter and shared a detail quiet enough to make every camera zoom in.',
          '{actor} whispered one name to {target}; three minutes later the entire sofa area looked suspicious.',
          '{actor} gave {target} intel with the solemnity of a state secret and the reliability of house gossip.',
        ],
        effects: { relationship: [0, 4], trustSignal: 'honesty' },
      },
    ],
    group_chat: [
      {
        id: 'living_room_summit',
        lines: [
          '{actor} called a living-room summit with {target}; it began with snacks and ended with everyone recalculating the vote.',
          '{actor} gathered {target} for a “casual chat” so organized that it practically needed minutes and a chairperson.',
          '{actor} hosted a group chat with {target}. Nobody called it an alliance meeting, which made it feel exactly like one.',
        ],
        effects: { relationship: [0, 3], trustSignal: 'warmth' },
      },
    ],
    confront: [
      {
        id: 'laundry_room_showdown',
        lines: [
          '{actor} cornered {target} by the laundry room and asked the question the whole house had avoided.',
          '{actor} confronted {target}; the conversation got so tense even the decorative cushions looked uncomfortable.',
          '{actor} told {target} the story was not adding up. Somewhere, a confessional producer quietly celebrated.',
        ],
        effects: { relationship: [-6, 2], trustSignal: 'pressure' },
      },
    ],
    proposeAlliance: [
      {
        id: 'quiet_handshake',
        lines: [
          '{actor} offered {target} a quiet handshake deal—no matching jackets, no alliance name, and allegedly no betrayal.',
          '{actor} pitched {target} a partnership with enough eye contact to feel serious and enough vagueness to deny later.',
        ],
        effects: { relationship: [-6, 6], trustSignal: 'honesty' },
      },
    ],
    ask_loh_target: [
      {
        id: 'loh_plan_probe',
        lines: [
          '{actor} asked {target} for the real target. The pause before the answer said almost as much as the answer.',
          '{actor} pressed {target} about the backup plan and watched every word for the part they were not saying.',
        ],
        effects: { relationship: [-4, 2], trustSignal: 'pressure' },
      },
    ],
    ask_use_safety: [
      {
        id: 'safety_plea',
        lines: [
          '{actor} made a personal Safety plea to {target}; gratitude was offered up front, loyalty was implied in the small print.',
          '{actor} asked {target} for Safety and promised they would remember the answer long after the ceremony.',
        ],
        effects: { relationship: [-2, 5], trustSignal: 'protection' },
      },
    ],
    rumor: [
      {
        id: 'rumor_with_legs',
        lines: [
          '{actor} gave {target} a rumor so dramatic it had a motive, an alibi, and its own fan base by dinner.',
          '{actor} told {target} something “strictly between us.” It barely survived the walk back to the bedroom.',
        ],
        effects: { relationship: [-3, 3], trustSignal: 'deception' },
      },
    ],
  } satisfies Record<string, SocialStoryMoment[]>,

  responseSets: {
    background_nominate: [
      { label: 'Ask why', responseType: 'positive' },
      { label: 'Offer a deal', responseType: 'neutral' },
      { label: 'Stand your ground', responseType: 'negative' },
      { label: 'Keep it private', responseType: 'dismiss' },
    ],
    safety_plan: [
      { label: 'Ask for honesty', responseType: 'positive' },
      { label: 'Read between lines', responseType: 'neutral' },
      { label: 'Call out the dodge', responseType: 'negative' },
      { label: 'End the talk', responseType: 'dismiss' },
    ],
    safety_request: [
      { label: 'Promise to consider', responseType: 'accept' },
      { label: 'Give no guarantee', responseType: 'neutral' },
      { label: 'Refuse clearly', responseType: 'decline' },
      { label: 'Walk away', responseType: 'dismiss' },
    ],
    nomination_reason: [
      { label: 'Hear them out', responseType: 'positive' },
      { label: 'Challenge the logic', responseType: 'neutral' },
      { label: 'Call it personal', responseType: 'negative' },
      { label: 'Leave it there', responseType: 'dismiss' },
    ],
    safety_holder_consults_loh: [
      { label: 'Ask them to use it', responseType: 'accept' },
      { label: 'Let them decide', responseType: 'neutral' },
      { label: 'Ask them to hold it', responseType: 'decline' },
      { label: 'End consultation', responseType: 'dismiss' },
    ],
    nominee_understands_loh: [
      { label: 'Explain the strategy', responseType: 'positive' },
      { label: 'Hear them out', responseType: 'neutral' },
      { label: 'Stand by the move', responseType: 'negative' },
      { label: 'End the talk', responseType: 'dismiss' },
    ],
    nominee_confronts_loh: [
      { label: 'Own the decision', responseType: 'positive' },
      { label: 'Keep it strategic', responseType: 'neutral' },
      { label: 'Confront them back', responseType: 'negative' },
      { label: 'Walk away', responseType: 'dismiss' },
    ],
    replacement_nominee_reacts_to_loh: [
      { label: 'Explain the backup plan', responseType: 'positive' },
      { label: 'Say it was strategic', responseType: 'neutral' },
      { label: 'Refuse to justify it', responseType: 'negative' },
      { label: 'End the talk', responseType: 'dismiss' },
    ],
  } satisfies Record<string, Array<{ label: string; responseType: StoryResponseType }>>,

  storylines: [
    {
      id: 'unlikely_duo',
      title: 'The Unlikely Duo',
      trigger: 'Former rivals gain 20+ relationship within two weeks',
      cooldownWeeks: 2,
      stages: [
        {
          id: 'truce',
          interactionType: 'check_in',
          line: 'Maybe we stop wasting energy on each other.',
          effect: 3,
        },
        {
          id: 'test',
          interactionType: 'deal_offer',
          line: 'One vote. No promises after that.',
          effect: 4,
        },
        {
          id: 'bond',
          interactionType: 'alliance_proposal',
          line: 'This should not work, which is why nobody will see it coming.',
          effect: 6,
        },
      ],
    },
    {
      id: 'cracks_in_the_pair',
      title: 'Cracks in the Pair',
      trigger: 'Allies break a promise or withhold Safety',
      cooldownWeeks: 1,
      stages: [
        {
          id: 'doubt',
          interactionType: 'check_in',
          line: 'Tell me I am reading this wrong.',
          effect: -2,
        },
        {
          id: 'proof',
          interactionType: 'warning',
          line: 'I heard what you promised them. Was any of ours real?',
          effect: -5,
        },
        {
          id: 'break',
          interactionType: 'snide_remark',
          line: 'Keep the alliance name. I am done carrying it.',
          effect: -10,
        },
      ],
    },
    {
      id: 'slow_burn_showmance',
      title: 'Slow-Burn Showmance',
      trigger: 'Repeated warmth, mutual trust, and no recent betrayal',
      cooldownWeeks: 2,
      stages: [
        {
          id: 'spark',
          interactionType: 'compliment',
          line: 'You make this place feel less like a game.',
          effect: 3,
        },
        {
          id: 'confession',
          interactionType: 'check_in',
          line: 'I keep looking for you when something happens.',
          effect: 5,
        },
        {
          id: 'choice',
          interactionType: 'deal_offer',
          line: 'If it comes down to game or us, what are we?',
          effect: 7,
        },
      ],
    },
  ] satisfies SocialStoryline[],
}

function stableIndex(seed: number, length: number): number {
  return Math.abs(Math.trunc(seed)) % Math.max(1, length)
}

export function getStoryBibleNarrative(
  actionId: string,
  actorName: string,
  targetName: string,
  seed: number
): string | null {
  const moments =
    SOCIAL_STORY_BIBLE.actionMoments[actionId as keyof typeof SOCIAL_STORY_BIBLE.actionMoments]
  if (!moments?.length) return null
  const moment = moments[stableIndex(seed, moments.length)]
  const line = moment.lines[stableIndex(seed * 31 + actionId.length, moment.lines.length)]
  return line.replace(/\{actor\}/g, actorName).replace(/\{target\}/g, targetName)
}

export function getStoryBibleResponseSet(scenarioKey: string | undefined) {
  if (!scenarioKey) return null
  return (
    SOCIAL_STORY_BIBLE.responseSets[scenarioKey as keyof typeof SOCIAL_STORY_BIBLE.responseSets] ??
    null
  )
}
