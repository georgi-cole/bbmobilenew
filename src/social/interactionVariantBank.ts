/**
 * interactionVariantBank – layered interaction text generation.
 *
 * Separates interaction intent (scenario key) from wording by organising
 * lines into:
 *   Scenario → Variant families → Individual line variants
 *
 * Each family is tagged with voice dimensions so that different characters
 * sound distinct, and follow-up families are used when the same actor has
 * already reached out recently, making repeated contact feel like an
 * evolving conversation rather than copy-paste restarts.
 */

// ── Voice system ──────────────────────────────────────────────────────────

export type VoiceTag =
  | 'direct'
  | 'indirect'
  | 'emotional'
  | 'composed'
  | 'strategic'
  | 'sincere'
  | 'playful'
  | 'blunt'
  | 'soft'

export interface VoiceProfile {
  primary: VoiceTag[]
  secondary: VoiceTag[]
}

/**
 * Six archetypal voice profiles used to differentiate how housemates speak.
 * Actors are deterministically assigned to one based on a hash of their ID.
 */
export const VOICE_ARCHETYPES: VoiceProfile[] = [
  { primary: ['direct', 'strategic'], secondary: ['composed', 'blunt'] }, // Strategist
  { primary: ['emotional', 'sincere'], secondary: ['soft', 'indirect'] }, // Loyalist
  { primary: ['playful', 'indirect'], secondary: ['soft', 'sincere'] }, // Charmer
  { primary: ['blunt', 'direct'], secondary: ['strategic', 'composed'] }, // Intimidator
  { primary: ['emotional', 'indirect'], secondary: ['soft', 'sincere'] }, // Pleader
  { primary: ['composed', 'sincere'], secondary: ['direct', 'strategic'] }, // Analyst
]

/** Assign a stable voice profile from an actor ID using a simple hash. */
export function getVoiceProfile(actorId: string): VoiceProfile {
  let hash = 0
  for (let i = 0; i < actorId.length; i++) {
    hash = (hash * 31 + actorId.charCodeAt(i)) & 0x0fffffff
  }
  return VOICE_ARCHETYPES[hash % VOICE_ARCHETYPES.length]
}

// ── Variant structures ────────────────────────────────────────────────────

export interface VariantEntry {
  /** Template text; supports player, role, nominee, and Safety placeholders. */
  text: string
  /** Voice dimensions this line is best suited for. */
  voiceTags: VoiceTag[]
}

export interface VariantFamily {
  /** Stable identifier used for family-level dedupe tracking. */
  id: string
  /** Voice dimensions that characterise this whole family. */
  voiceTags: VoiceTag[]
  /**
   * When true the family is preferred when the actor has already contacted
   * the player recently, making the conversation feel like a follow-up rather
   * than a restart.
   */
  isFollowUp?: boolean
  variants: VariantEntry[]
}

function getVariantId(family: VariantFamily, variantIndex: number): string {
  return `${family.id}:${variantIndex}`
}

function makeScenePool(
  id: string,
  direct: readonly string[],
  warm: readonly string[],
  followUp: readonly string[]
): VariantFamily[] {
  const toVariants = (lines: readonly string[], voiceTags: VoiceTag[]): VariantEntry[] =>
    lines.map((text) => ({ text, voiceTags }))
  return [
    {
      id: `${id}_direct`,
      voiceTags: ['direct', 'composed', 'strategic'],
      variants: toVariants(direct, ['direct', 'composed']),
    },
    {
      id: `${id}_warm`,
      voiceTags: ['emotional', 'sincere', 'soft'],
      variants: toVariants(warm, ['emotional', 'sincere']),
    },
    {
      id: `${id}_followup`,
      voiceTags: ['indirect', 'soft'],
      isFollowUp: true,
      variants: toVariants(followUp, ['indirect', 'soft']),
    },
  ]
}

// ── Scenario variant pools ────────────────────────────────────────────────

/**
 * Rich variant pool keyed by scenario key.
 * Each scenario contains multiple families, each with multiple line variants.
 * For supported scenarios, this augments and effectively supersedes the old
 * flat SCENARIO_TEMPLATES entries; unsupported scenarios may still use the
 * legacy SCENARIO_TEMPLATES fallback elsewhere.
 */
export const SCENARIO_VARIANT_POOLS: Record<string, VariantFamily[]> = {
  // ── Week start ─────────────────────────────────────────────────────────

  week_start_ally_check_in: [
    {
      id: 'wsac_casual',
      voiceTags: ['indirect', 'soft', 'sincere'],
      variants: [
        {
          text: 'Just checking in, {player} — I want us on the same page this week.',
          voiceTags: ['indirect', 'soft'],
        },
        {
          text: 'New week. Wanted to see where your head is at before things get loud.',
          voiceTags: ['indirect', 'sincere'],
        },
        {
          text: 'Hey, I figured it was worth touching base before anything kicks off.',
          voiceTags: ['soft', 'sincere'],
        },
      ],
    },
    {
      id: 'wsac_strategic',
      voiceTags: ['direct', 'strategic', 'composed'],
      variants: [
        {
          text: 'Fresh week, clean slate. I wanted to touch base with you early, {player}.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'Before the house gets loud, I wanted to make sure you and I are solid.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'I like to know where I stand early. Can we take a minute?',
          voiceTags: ['direct', 'strategic'],
        },
      ],
    },
    {
      id: 'wsac_warm',
      voiceTags: ['emotional', 'sincere', 'soft'],
      variants: [
        {
          text: 'I have been thinking about us a lot. I just want to make sure we are genuinely good.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'Starting fresh this week. You are someone I actually trust in here.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'This house will test everything. I am glad I have you in my corner.',
          voiceTags: ['sincere', 'soft'],
        },
      ],
    },
    {
      id: 'wsac_followup',
      voiceTags: ['indirect', 'soft'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know we already talked, but I just wanted to check back in before the week gets away from us.',
          voiceTags: ['indirect', 'soft'],
        },
        {
          text: 'Still thinking about what we said. Everything still feel the same to you?',
          voiceTags: ['indirect', 'sincere'],
        },
        {
          text: 'I keep coming back to you, {player}. I think that says something.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
  ],

  week_start_enemy_gossip: [
    {
      id: 'wseg_observational',
      voiceTags: ['indirect', 'composed', 'strategic'],
      variants: [
        {
          text: 'New week, same whispers. People are already circling names.',
          voiceTags: ['indirect', 'composed'],
        },
        {
          text: 'You can feel the house shifting already. Nobody is sitting still.',
          voiceTags: ['composed', 'strategic'],
        },
        {
          text: 'It did not take long for people to start talking again this week.',
          voiceTags: ['indirect', 'composed'],
        },
      ],
    },
    {
      id: 'wseg_pointed',
      voiceTags: ['direct', 'blunt', 'strategic'],
      variants: [
        {
          text: 'I am going to be honest with you. The house has a short memory but I do not.',
          voiceTags: ['direct', 'blunt'],
        },
        {
          text: 'Some people in here act like last week never happened. I am watching closely.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'People think starting a new week resets everything. It does not.',
          voiceTags: ['blunt', 'strategic'],
        },
      ],
    },
    {
      id: 'wseg_followup',
      voiceTags: ['indirect', 'composed'],
      isFollowUp: true,
      variants: [
        {
          text: 'Still watching how things are moving. Some patterns never really change.',
          voiceTags: ['indirect', 'composed'],
        },
        {
          text: 'Told you things were shifting. Are you seeing what I am seeing now?',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'Each week confirms what I already suspected. Just so you know.',
          voiceTags: ['composed', 'indirect'],
        },
      ],
    },
  ],

  week_start_alliance_lock: [
    {
      id: 'wsal_strategic_pitch',
      voiceTags: ['direct', 'strategic', 'composed'],
      variants: [
        {
          text: 'I trust you more than most people in here. Maybe we should make that official.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'This house is about to fracture. I think you and I should lock something in.',
          voiceTags: ['strategic', 'composed'],
        },
        {
          text: 'If we are serious about going deep, this is the week to commit.',
          voiceTags: ['direct', 'strategic'],
        },
      ],
    },
    {
      id: 'wsal_sincere_appeal',
      voiceTags: ['sincere', 'emotional', 'soft'],
      variants: [
        {
          text: 'I feel like you and I just naturally work. I want to make it real.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'This game makes everything complicated. You are one of the few people I actually want to work with.',
          voiceTags: ['sincere', 'soft'],
        },
        {
          text: 'I am not looking for a number — I want someone I can genuinely trust in here.',
          voiceTags: ['sincere', 'emotional'],
        },
      ],
    },
    {
      id: 'wsal_followup',
      voiceTags: ['direct', 'strategic'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know I brought this up before, but I keep coming back to it. Are we doing this or not?',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'Last time we talked, you did not say no. I need to know if you are in.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'I have been patient, but I need an answer. I am trying to plan ahead.',
          voiceTags: ['blunt', 'strategic'],
        },
      ],
    },
  ],

  // ── LOH interactions ───────────────────────────────────────────────────

  hoh_congratulations: [
    {
      id: 'hohc_genuine',
      voiceTags: ['sincere', 'emotional', 'soft'],
      variants: [
        {
          text: 'Congrats on the power, {player}. That was a strong win.',
          voiceTags: ['sincere', 'direct'],
        },
        {
          text: 'You earned that room this week, {player}. Respect.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'I was rooting for you. Really glad that one went your way.',
          voiceTags: ['emotional', 'sincere'],
        },
      ],
    },
    {
      id: 'hohc_strategic',
      voiceTags: ['strategic', 'composed', 'indirect'],
      variants: [
        {
          text: 'Big win. I figured you should hear that from me directly.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'The right person won this week, if you ask me. I mean that.',
          voiceTags: ['strategic', 'indirect'],
        },
        {
          text: 'Congratulations. I was hoping it would end up in good hands.',
          voiceTags: ['composed', 'strategic'],
        },
      ],
    },
    {
      id: 'hohc_warm',
      voiceTags: ['emotional', 'soft', 'playful'],
      variants: [
        {
          text: 'Yes! That is what I am talking about. You killed it.',
          voiceTags: ['playful', 'emotional'],
        },
        {
          text: 'I am so genuinely happy for you right now. You deserved that.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'Okay, you actually needed that win more than anyone in here. I am thrilled.',
          voiceTags: ['playful', 'soft'],
        },
      ],
    },
    {
      id: 'hohc_followup',
      voiceTags: ['sincere', 'soft'],
      isFollowUp: true,
      variants: [
        {
          text: 'Still thinking about your win. It felt good to see the right person get power.',
          voiceTags: ['sincere', 'soft'],
        },
        {
          text: 'I keep coming back to how well things turned out for you this week. Good.',
          voiceTags: ['composed', 'sincere'],
        },
        {
          text: 'I said it once and I will say it again — that LOH win was well deserved.',
          voiceTags: ['sincere', 'emotional'],
        },
      ],
    },
  ],

  hoh_safety_request: [
    {
      id: 'hsr_loyal_appeal',
      voiceTags: ['sincere', 'soft', 'emotional'],
      variants: [
        {
          text: 'I know you have a lot to weigh, {hoh}. I just want you to know I am not coming after you.',
          voiceTags: ['sincere', 'soft'],
        },
        {
          text: 'I have never done anything to hurt your game. I hope that counts for something this week.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'We have kept it solid. I am trusting that means something to you right now.',
          voiceTags: ['sincere', 'soft'],
        },
      ],
    },
    {
      id: 'hsr_strategic_pitch',
      voiceTags: ['direct', 'strategic', 'composed'],
      variants: [
        {
          text: 'With you holding power, I wanted to check in early and keep things clear between us.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'If names are flying around, I hope mine is not one of them. I can be good for your game.',
          voiceTags: ['strategic', 'direct'],
        },
        {
          text: 'I am not here to pressure you. I just want to make sure we are still moving in the same direction.',
          voiceTags: ['composed', 'strategic'],
        },
      ],
    },
    {
      id: 'hsr_indirect',
      voiceTags: ['indirect', 'soft', 'playful'],
      variants: [
        {
          text: 'I am not going to make this weird, but I hope you are not thinking about me this week.',
          voiceTags: ['indirect', 'playful'],
        },
        {
          text: 'I know everybody is scrambling right now. I would rather talk than sit around guessing.',
          voiceTags: ['indirect', 'soft'],
        },
        {
          text: 'Not trying to put you on the spot, but is there anything I should be worried about?',
          voiceTags: ['indirect', 'soft'],
        },
      ],
    },
    {
      id: 'hsr_vulnerable',
      voiceTags: ['emotional', 'indirect', 'soft'],
      variants: [
        {
          text: 'I am nervous, and I would rather talk to you than pretend I am not.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'The waiting is the hardest part. Can you give me anything to go on?',
          voiceTags: ['emotional', 'indirect'],
        },
        {
          text: 'I trust you. I just need to know if that trust goes both ways right now.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
    {
      id: 'hsr_followup',
      voiceTags: ['indirect', 'composed'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know we already touched on this, but I need to ask again — am I safe?',
          voiceTags: ['direct', 'emotional'],
        },
        {
          text: 'I hate that I keep coming back to you about this, but I just need to hear it clearly.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'Still thinking about what you said. Nothing has changed for you, right?',
          voiceTags: ['indirect', 'composed'],
        },
      ],
    },
  ],

  // ── Nomination phase ────────────────────────────────────────────────────

  nominee_hoh_plea: [
    {
      id: 'nhp_direct_ask',
      voiceTags: ['direct', 'sincere', 'strategic'],
      variants: [
        {
          text: 'I know you have the power this week, {hoh}. Please give me a chance to stay off the block.',
          voiceTags: ['direct', 'sincere'],
        },
        {
          text: 'Before you lock anything in, {hoh}, I am asking you to hear me out. I am not the shot you need.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'You decide what happens next, {hoh}. I need you to know I would not come after you.',
          voiceTags: ['sincere', 'direct'],
        },
      ],
    },
    {
      id: 'nhp_loyalty_appeal',
      voiceTags: ['emotional', 'sincere', 'soft'],
      variants: [
        {
          text: 'I thought we had something real, {hoh}. I am asking you to honour that this week.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'Everything we built counts for something, right, {hoh}? Please do not put me up.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'I am not asking as a game move, {hoh}. I am asking because I thought you trusted me.',
          voiceTags: ['sincere', 'emotional'],
        },
      ],
    },
    {
      id: 'nhp_strategic_pitch',
      voiceTags: ['strategic', 'composed', 'direct'],
      variants: [
        {
          text: 'If you spare me this week, {hoh}, I become someone who owes you. That is worth more than my name on the block.',
          voiceTags: ['strategic', 'direct'],
        },
        {
          text: 'There are better moves available to you, {hoh}. I am not your biggest threat in this house.',
          voiceTags: ['composed', 'strategic'],
        },
        {
          text: 'Think about who actually benefits if I go home, {hoh}. It is not you.',
          voiceTags: ['direct', 'strategic'],
        },
      ],
    },
    {
      id: 'nhp_vulnerable',
      voiceTags: ['emotional', 'soft', 'indirect'],
      variants: [
        {
          text: 'I am trying to hold it together, but I need to know if I have any shot here, {hoh}.',
          voiceTags: ['emotional', 'indirect'],
        },
        {
          text: 'I am not going to pretend I am not scared. I just need a chance, {hoh}.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'The thought of my name going up is awful, {hoh}. Please tell me there is another way.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
    {
      id: 'nhp_followup',
      voiceTags: ['emotional', 'direct'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know I already talked to you, {hoh}. I am just trying to make sure nothing has changed.',
          voiceTags: ['emotional', 'direct'],
        },
        {
          text: 'I keep coming back because I cannot settle, {hoh}. Please just tell me where I stand.',
          voiceTags: ['emotional', 'indirect'],
        },
        {
          text: 'I am not hounding you, {hoh} — I just need clarity. Are we good or not?',
          voiceTags: ['direct', 'emotional'],
        },
      ],
    },
  ],

  nominee_veto_pitch: [
    {
      id: 'nvp_direct_ask',
      voiceTags: ['direct', 'sincere', 'strategic'],
      variants: [
        {
          text: 'If you use {specialVeto}, I will remember it. I need that chance right now.',
          voiceTags: ['direct', 'sincere'],
        },
        {
          text: 'You hold the power to change my week. I would owe you if you saved me.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'I am asking straight up: if you can help me here, I will not forget it.',
          voiceTags: ['direct', 'blunt'],
        },
      ],
    },
    {
      id: 'nvp_strategic_offer',
      voiceTags: ['strategic', 'composed', 'direct'],
      variants: [
        {
          text: 'Use that power on me and you gain a shield for the rest of the game. Think about it.',
          voiceTags: ['strategic', 'composed'],
        },
        {
          text: 'Saving me right now is the most valuable move available to you. I genuinely mean that.',
          voiceTags: ['strategic', 'direct'],
        },
        {
          text: 'I am not desperate — I am making you an offer. The return on using {specialVeto} on me is real.',
          voiceTags: ['composed', 'strategic'],
        },
      ],
    },
    {
      id: 'nvp_sincere',
      voiceTags: ['emotional', 'sincere', 'soft'],
      variants: [
        {
          text: 'I am not going to put on a performance. I just really need this, and I am trusting you.',
          voiceTags: ['sincere', 'emotional'],
        },
        {
          text: 'If there is any part of you that trusts me, please use Safety. I would do the same for you.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'I know this is your call. I just want you to know what it would mean to me.',
          voiceTags: ['soft', 'sincere'],
        },
      ],
    },
    {
      id: 'nvp_followup',
      voiceTags: ['direct', 'emotional'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know I have already asked. I would not keep coming back if I did not really need this.',
          voiceTags: ['emotional', 'direct'],
        },
        {
          text: 'Still thinking about {specialVeto}. I hope your answer has not changed.',
          voiceTags: ['indirect', 'composed'],
        },
        {
          text: 'I respect your position, but I have to keep trying. Please consider saving me.',
          voiceTags: ['sincere', 'direct'],
        },
      ],
    },
  ],

  nominee_campaign: [
    {
      id: 'nc_composed_pitch',
      voiceTags: ['composed', 'strategic', 'direct'],
      variants: [
        {
          text: 'I know I am vulnerable, but I am still fighting. I hope you will keep me in mind.',
          voiceTags: ['composed', 'direct'],
        },
        {
          text: 'I am not going to spiral. I am going to make my case. Starting with you.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'I need calm numbers around me this week. I wanted to see where your head is at.',
          voiceTags: ['composed', 'strategic'],
        },
      ],
    },
    {
      id: 'nc_loyalty_remind',
      voiceTags: ['sincere', 'emotional', 'soft'],
      variants: [
        {
          text: 'Being up there changes everything. I am trying to make sure I still have people.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'I hope the relationship we have built means something when you cast your vote.',
          voiceTags: ['sincere', 'emotional'],
        },
        {
          text: 'I have been real with you this whole time. I just need you to have my back now.',
          voiceTags: ['sincere', 'soft'],
        },
      ],
    },
    {
      id: 'nc_comparison_pitch',
      voiceTags: ['strategic', 'direct', 'blunt'],
      variants: [
        {
          text: 'Keep me over the other nominee and you will not regret it. I am the less dangerous option for your game.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'Think about who comes after you if the other person stays. I never would.',
          voiceTags: ['strategic', 'blunt'],
        },
        {
          text: 'I am giving you the honest version: keeping me helps your game more than keeping them.',
          voiceTags: ['direct', 'blunt'],
        },
      ],
    },
    {
      id: 'nc_indirect',
      voiceTags: ['indirect', 'soft', 'sincere'],
      variants: [
        {
          text: 'I am not going to corner everyone all day. I just wanted you to hear from me directly.',
          voiceTags: ['indirect', 'soft'],
        },
        {
          text: 'I would love the chance to prove I am worth keeping. I just need a few more weeks.',
          voiceTags: ['sincere', 'indirect'],
        },
        {
          text: 'Whatever you decide, I want you to know it was not nothing between us in here.',
          voiceTags: ['soft', 'emotional'],
        },
      ],
    },
    {
      id: 'nc_followup',
      voiceTags: ['emotional', 'direct'],
      isFollowUp: true,
      variants: [
        {
          text: 'I am not going to beg, but I am going to be honest: I need your vote. Please.',
          voiceTags: ['direct', 'emotional'],
        },
        {
          text: 'I know I already asked. I am just making sure you know I am still here and still fighting.',
          voiceTags: ['sincere', 'emotional'],
        },
        {
          text: 'Last time we talked, you were open. Has anything changed?',
          voiceTags: ['indirect', 'direct'],
        },
      ],
    },
  ],

  nomination_aftershock: [
    {
      id: 'na_processing',
      voiceTags: ['emotional', 'soft', 'indirect'],
      variants: [
        {
          text: 'I am still trying to process seeing my name up there. I needed to talk to someone.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'That ceremony hit hard. I am scrambling a little, if I am honest.',
          voiceTags: ['emotional', 'indirect'],
        },
        {
          text: 'I do not want to sit alone with this. Can we talk for a second?',
          voiceTags: ['soft', 'emotional'],
        },
      ],
    },
    {
      id: 'na_trust_check',
      voiceTags: ['direct', 'sincere', 'composed'],
      variants: [
        {
          text: 'Now that the block is real, I need to know who I can still trust.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'Everything looks different from up on the block. I need to know where you stand.',
          voiceTags: ['direct', 'sincere'],
        },
        {
          text: 'I figured out quickly who actually reached out to me. You are one of them.',
          voiceTags: ['sincere', 'composed'],
        },
      ],
    },
    {
      id: 'na_strategic',
      voiceTags: ['strategic', 'composed', 'direct'],
      variants: [
        {
          text: 'Okay. I am nominated. Now I figure out what my next move is.',
          voiceTags: ['composed', 'strategic'],
        },
        {
          text: 'I am not going down quietly. I want to know who is with me before I start working the room.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'Being on the block is not a death sentence. But I need real information right now.',
          voiceTags: ['strategic', 'composed'],
        },
      ],
    },
    {
      id: 'na_followup',
      voiceTags: ['emotional', 'soft'],
      isFollowUp: true,
      variants: [
        {
          text: 'I keep wanting to check in with you because you made me feel less alone earlier.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'Still processing everything. The house feels different when you are on the block.',
          voiceTags: ['emotional', 'indirect'],
        },
        {
          text: 'Sorry to keep coming back. This week has me more unsettled than I expected.',
          voiceTags: ['soft', 'sincere'],
        },
      ],
    },
  ],

  // ── Safety / post-Safety ───────────────────────────────────────────────

  post_veto_gratitude: [
    {
      id: 'pvg_heartfelt',
      voiceTags: ['emotional', 'sincere', 'soft'],
      variants: [
        {
          text: 'You changed my whole week. I needed you to know I see that.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'Getting saved matters. I am not taking that lightly.',
          voiceTags: ['sincere', 'composed'],
        },
        {
          text: 'I am breathing again because of that move. Thank you for giving me another shot.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
    {
      id: 'pvg_strategic',
      voiceTags: ['direct', 'strategic', 'composed'],
      variants: [
        {
          text: 'That move tells me everything I needed to know about where we stand. Thank you.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'You took a real risk using that, and I will not make you regret it.',
          voiceTags: ['sincere', 'composed'],
        },
        {
          text: 'I know that was not easy to do. I want you to know the loyalty goes both ways.',
          voiceTags: ['direct', 'sincere'],
        },
      ],
    },
    {
      id: 'pvg_followup',
      voiceTags: ['sincere', 'emotional'],
      isFollowUp: true,
      variants: [
        {
          text: 'Still thinking about what you did for me. It is not something I will forget.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'I keep wanting to say it again: that move meant everything. We are solid.',
          voiceTags: ['sincere', 'soft'],
        },
        {
          text: 'I have been looking for a way to repay the favour. Let me know if there is ever anything.',
          voiceTags: ['sincere', 'direct'],
        },
      ],
    },
  ],

  post_veto_campaign: [
    {
      id: 'pvc_urgent',
      voiceTags: ['direct', 'emotional', 'strategic'],
      variants: [
        {
          text: 'The Safety decision changed everything, and now I have to rebuild fast.',
          voiceTags: ['direct', 'emotional'],
        },
        {
          text: 'Once the ceremony shifted, I knew I needed to start talking immediately.',
          voiceTags: ['strategic', 'composed'],
        },
        {
          text: 'The block looks different now, but the danger feels even sharper.',
          voiceTags: ['emotional', 'direct'],
        },
      ],
    },
    {
      id: 'pvc_sincere_appeal',
      voiceTags: ['sincere', 'soft', 'emotional'],
      variants: [
        {
          text: 'I know the ceremony just flipped everything. I just need to know if you are still with me.',
          voiceTags: ['sincere', 'emotional'],
        },
        {
          text: 'Everything changed in that room. I am starting fresh and I hope you are part of that.',
          voiceTags: ['soft', 'sincere'],
        },
        {
          text: 'I was not supposed to still be here. I want to make every day count now.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
    {
      id: 'pvc_strategic',
      voiceTags: ['strategic', 'composed', 'direct'],
      variants: [
        {
          text: 'New situation, same goal. I am going to get through this week. I need your vote.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'The game reset after that ceremony. Let me tell you why keeping me around helps you.',
          voiceTags: ['strategic', 'composed'],
        },
        {
          text: 'I am still here and I am still fighting. Are you with me or not?',
          voiceTags: ['direct', 'blunt'],
        },
      ],
    },
    {
      id: 'pvc_followup',
      voiceTags: ['emotional', 'direct'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know I keep circling back to you. I just do not have many safe people right now.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'Still need to know: am I getting your vote? I would rather hear a no than a silence.',
          voiceTags: ['direct', 'blunt'],
        },
        {
          text: 'Every time I think I have a read on this, something shifts. You are the one person I trust right now.',
          voiceTags: ['sincere', 'emotional'],
        },
      ],
    },
  ],

  // ── Live vote ──────────────────────────────────────────────────────────

  live_vote_pitch: [
    {
      id: 'lvp_urgent_direct',
      voiceTags: ['direct', 'blunt', 'strategic'],
      variants: [
        {
          text: 'The vote is here, and I need every conversation I can get. Can we keep this open?',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'I am running out of time, so I will be direct: I need your support tonight.',
          voiceTags: ['blunt', 'direct'],
        },
        {
          text: 'This is my last shot to make my case. I am not asking for charity, just a fair chance.',
          voiceTags: ['direct', 'sincere'],
        },
      ],
    },
    {
      id: 'lvp_sincere',
      voiceTags: ['emotional', 'sincere', 'soft'],
      variants: [
        {
          text: 'This is the last stretch before the vote. I hope there is a path for me with you.',
          voiceTags: ['soft', 'sincere'],
        },
        {
          text: 'I have tried to play honestly in here. I hope that means something when you vote.',
          voiceTags: ['sincere', 'emotional'],
        },
        {
          text: 'Whatever happens tonight, I am glad we got to know each other. But I really want to stay.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
    {
      id: 'lvp_strategic_close',
      voiceTags: ['strategic', 'composed', 'direct'],
      variants: [
        {
          text: 'When you vote tonight, think about who is more dangerous to your game to keep. It is not me.',
          voiceTags: ['strategic', 'direct'],
        },
        {
          text: 'I have given you every reason to keep me. I just need you to act on it.',
          voiceTags: ['composed', 'direct'],
        },
        {
          text: 'The math is simple. Keeping me is the smarter play for where you want to be in this game.',
          voiceTags: ['strategic', 'composed'],
        },
      ],
    },
    {
      id: 'lvp_relationship_close',
      voiceTags: ['sincere', 'emotional', 'soft'],
      variants: [
        {
          text: 'Everything we have built together — I am counting on that tonight.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'I am not going to manipulate you. I am just asking you to remember what we have been in here.',
          voiceTags: ['sincere', 'soft'],
        },
        {
          text: 'If you ever trusted me in here, I need that trust right now.',
          voiceTags: ['emotional', 'direct'],
        },
      ],
    },
    {
      id: 'lvp_followup',
      voiceTags: ['emotional', 'direct'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know I already asked. I just need to hear it one more time before the vote.',
          voiceTags: ['emotional', 'direct'],
        },
        {
          text: 'Nothing has changed for you, right? Because everything depends on tonight.',
          voiceTags: ['emotional', 'indirect'],
        },
        {
          text: 'I am not going to pretend I am not scared. I just need your word.',
          voiceTags: ['emotional', 'sincere'],
        },
      ],
    },
  ],

  // ── Eviction survivor ──────────────────────────────────────────────────

  survivor_gratitude: [
    {
      id: 'sg_relieved',
      voiceTags: ['emotional', 'sincere', 'soft'],
      variants: [
        {
          text: 'I am still here, and I am not forgetting the people who did not leave me hanging.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'Surviving that vote changed how I see the house. I know who showed up for me.',
          voiceTags: ['sincere', 'composed'],
        },
        {
          text: 'After a night like that, gratitude hits harder than anything else.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
    {
      id: 'sg_strategic',
      voiceTags: ['direct', 'composed', 'strategic'],
      variants: [
        {
          text: 'I made it. And I remember exactly who I owe and who I do not.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'Staying in this game means something. The next week is for everyone who kept me here.',
          voiceTags: ['strategic', 'sincere'],
        },
        {
          text: 'I came too close to leaving. I will not let that happen again.',
          voiceTags: ['composed', 'strategic'],
        },
      ],
    },
    {
      id: 'sg_followup',
      voiceTags: ['sincere', 'emotional'],
      isFollowUp: true,
      variants: [
        {
          text: 'Still cannot believe I am still here. And I am still grateful that you kept me.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'That vote is behind us now but what you did for me? That stays with me.',
          voiceTags: ['sincere', 'soft'],
        },
        {
          text: 'I wanted to check back in now that things have settled. We are good, right?',
          voiceTags: ['indirect', 'sincere'],
        },
      ],
    },
  ],

  // ── Tension / warning ──────────────────────────────────────────────────

  betrayal_warning: [
    {
      id: 'bw_cold',
      voiceTags: ['composed', 'direct', 'blunt'],
      variants: [
        {
          text: 'After everything that happened, I am keeping my eyes open around you.',
          voiceTags: ['composed', 'direct'],
        },
        {
          text: 'I have not forgotten how you moved. Just know that.',
          voiceTags: ['blunt', 'direct'],
        },
        {
          text: 'I am not in the mood to pretend that last move did not matter.',
          voiceTags: ['blunt', 'composed'],
        },
      ],
    },
    {
      id: 'bw_emotional',
      voiceTags: ['emotional', 'sincere', 'direct'],
      variants: [
        {
          text: 'That hurt. And I am not going to act like it did not.',
          voiceTags: ['emotional', 'direct'],
        },
        {
          text: 'I thought we were in a different place. What you did showed me otherwise.',
          voiceTags: ['emotional', 'sincere'],
        },
        {
          text: 'I gave you a lot. What you did with it said everything.',
          voiceTags: ['sincere', 'emotional'],
        },
      ],
    },
    {
      id: 'bw_followup',
      voiceTags: ['composed', 'strategic'],
      isFollowUp: true,
      variants: [
        {
          text: 'Still not over what happened. I am watching more carefully now.',
          voiceTags: ['composed', 'direct'],
        },
        {
          text: 'I told you how I felt. I want to see if actions follow words.',
          voiceTags: ['direct', 'sincere'],
        },
        {
          text: 'You know exactly where things stand with us. Nothing has changed.',
          voiceTags: ['blunt', 'composed'],
        },
      ],
    },
  ],

  ignored_warning: [
    {
      id: 'iw_pointed',
      voiceTags: ['direct', 'blunt', 'composed'],
      variants: [
        {
          text: 'You have been hard to get a read on lately. That does not go unnoticed.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'I keep reaching out and getting nothing back. That tells me something.',
          voiceTags: ['blunt', 'direct'],
        },
        {
          text: 'Silence is still a message in this house, {player}.',
          voiceTags: ['direct', 'composed'],
        },
      ],
    },
    {
      id: 'iw_vulnerable',
      voiceTags: ['emotional', 'soft', 'sincere'],
      variants: [
        {
          text: 'I am not trying to make this dramatic, but I need to know you still see me.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'It stings a little that you have been quiet. I do not want to read into it.',
          voiceTags: ['soft', 'sincere'],
        },
        {
          text: 'I miss actually talking to you. Something feels off and I do not like it.',
          voiceTags: ['emotional', 'sincere'],
        },
      ],
    },
    {
      id: 'iw_followup',
      voiceTags: ['direct', 'blunt'],
      isFollowUp: true,
      variants: [
        {
          text: 'I have tried multiple times. At some point I need to know what is going on.',
          voiceTags: ['direct', 'blunt'],
        },
        {
          text: 'Still not getting much from you. I am starting to wonder what that means for us.',
          voiceTags: ['direct', 'composed'],
        },
        { text: 'This cannot keep going. Can we just talk?', voiceTags: ['emotional', 'direct'] },
      ],
    },
  ],

  targeted_snark: [
    {
      id: 'ts_subtle',
      voiceTags: ['indirect', 'composed', 'strategic'],
      variants: [
        {
          text: 'Interesting how your name keeps coming up whenever people talk strategy.',
          voiceTags: ['indirect', 'composed'],
        },
        {
          text: 'You have been moving like nobody is paying attention. That is risky.',
          voiceTags: ['composed', 'strategic'],
        },
        {
          text: 'Some of your choices are getting harder for the house to ignore.',
          voiceTags: ['indirect', 'strategic'],
        },
      ],
    },
    {
      id: 'ts_direct',
      voiceTags: ['direct', 'blunt', 'strategic'],
      variants: [
        {
          text: 'I am going to say what others will not: people are talking about you.',
          voiceTags: ['direct', 'blunt'],
        },
        {
          text: 'You think you are playing quietly, but this house hears everything.',
          voiceTags: ['blunt', 'strategic'],
        },
        {
          text: 'Your game is showing more than you think it is.',
          voiceTags: ['direct', 'composed'],
        },
      ],
    },
    {
      id: 'ts_followup',
      voiceTags: ['composed', 'strategic'],
      isFollowUp: true,
      variants: [
        {
          text: 'Still watching. And what I am seeing has not made me more comfortable.',
          voiceTags: ['composed', 'strategic'],
        },
        {
          text: 'I said something before and you did not adjust. That is your choice.',
          voiceTags: ['direct', 'blunt'],
        },
        {
          text: 'I gave you a heads up. What you do with it is up to you.',
          voiceTags: ['composed', 'indirect'],
        },
      ],
    },
  ],

  // ── Alliance ───────────────────────────────────────────────────────────

  alliance_reassurance: [
    {
      id: 'ar_loyal',
      voiceTags: ['sincere', 'emotional', 'soft'],
      variants: [
        {
          text: 'I am not wavering on us. I just wanted to make that clear.',
          voiceTags: ['sincere', 'direct'],
        },
        {
          text: 'No matter how loud the house gets, I still see us as solid.',
          voiceTags: ['sincere', 'emotional'],
        },
        {
          text: 'I needed a quick check-in with you because our connection still matters to me.',
          voiceTags: ['emotional', 'soft'],
        },
      ],
    },
    {
      id: 'ar_strategic',
      voiceTags: ['strategic', 'composed', 'direct'],
      variants: [
        {
          text: 'We are the most stable pairing in here. I want to make sure we both remember that.',
          voiceTags: ['strategic', 'composed'],
        },
        {
          text: 'Everybody is trying to disrupt us. Let us not let them.',
          voiceTags: ['direct', 'strategic'],
        },
        {
          text: 'I keep reminding myself who my real allies are. You are at the top of that list.',
          voiceTags: ['strategic', 'sincere'],
        },
      ],
    },
    {
      id: 'ar_followup',
      voiceTags: ['sincere', 'soft'],
      isFollowUp: true,
      variants: [
        {
          text: 'I know we keep saying it. I just want to make sure we mean it.',
          voiceTags: ['sincere', 'direct'],
        },
        {
          text: 'Every time I check in with you, I feel better about where we are. Keep being you.',
          voiceTags: ['soft', 'sincere'],
        },
        {
          text: 'This house will try to get between us. I am not letting that happen.',
          voiceTags: ['sincere', 'emotional'],
        },
      ],
    },
  ],

  // ── Event-specific scenes ──────────────────────────────────────────────

  safety_win_congratulations: makeScenePool(
    'swc',
    [
      'You earned Safety. That is a move people will have to work around.',
      'Winning Safety changes the board. You handled it well.',
    ],
    [
      'I am really happy you got Safety. You needed a little breathing room.',
      'That Safety win felt good to watch. I am glad it went your way.',
    ],
    [
      'Still thinking about your Safety win. It says a lot about how hard you fight.',
      'You have Safety now. I hope you know I am happy for you.',
    ]
  ),

  loh_consults_safety_holder: makeScenePool(
    'lcsh',
    [
      'You hold Safety, and I need to know whether you are thinking about changing my nominations.',
      'Before the Safety ceremony, I want your read. Keep the block the same, or make a move?',
    ],
    [
      'This is your power now. I would rather talk honestly than guess what you are feeling.',
      'Safety can change everything. I want us to be clear before the ceremony does.',
    ],
    [
      'I know we covered this, but the Safety choice affects both our games. Where are you landing?',
      'Before we walk into that ceremony, I need to know if your plan has changed.',
    ]
  ),

  safety_holder_consults_loh: makeScenePool(
    'shcl',
    [
      'You are LOH, but I hold Safety. Tell me what outcome you want from this ceremony.',
      'I have the Safety decision. I want to hear your plan before I decide what to do.',
    ],
    [
      'I know this week is heavy for you as LOH. I am willing to listen before Safety makes it messier.',
      'This is not me trying to corner you. I just want to understand what you are protecting.',
    ],
    [
      'We should check in once more before I use Safety or leave things alone.',
      'I keep coming back to the Safety choice because I do not want it to blindside you.',
    ]
  ),

  player_nominated_support: makeScenePool(
    'pns',
    [
      'Seeing your name on the block changes the whole week. I wanted to check on you.',
      'You are nominated, but you do not have to carry the whole thing alone.',
    ],
    [
      'I know that ceremony hurt. I am here if you want an honest conversation.',
      'I hate seeing you on the block. Tell me what would actually help right now.',
    ],
    [
      'I have been thinking about the nomination. Are you holding up?',
      'I meant it when I checked in. I do not want you feeling isolated this week.',
    ]
  ),

  player_nominated_tension: makeScenePool(
    'pnt',
    [
      'Your name is on the block, and I can feel the tension between us. We should not pretend otherwise.',
      'The nominations made things clearer. I need to know what you think this means for us.',
    ],
    [
      'I know this is raw, but I would rather talk before resentment fills in the blanks.',
      'Being nominated changes how people move. I do not want us guessing at each other.',
    ],
    [
      'That ceremony is still sitting with me. Are we going to talk about it or let it get worse?',
      'I keep replaying the nominations. I do not think either of us is as fine as we are acting.',
    ]
  ),

  competition_low_finish_support: makeScenePool(
    'clfs',
    [
      'That competition did not go your way, but one result does not define your game.',
      'You had a rough finish. Shake it off; there is still a lot of week left.',
    ],
    [
      'I know you wanted that win. You do not have to pretend it did not sting.',
      'Come sit with me for a minute. Losing a competition can make the whole house feel louder.',
    ],
    [
      'You seemed quieter after the competition. Just checking that you are okay.',
      'I meant what I said earlier: one bad result does not change how I see you.',
    ]
  ),

  competition_low_finish_taunt: makeScenePool(
    'clft',
    [
      'That competition result gave the house a pretty clear read on where you stand.',
      'You looked confident going in. The finish told a different story.',
    ],
    [
      'I am not trying to be cruel, but that loss was hard to miss.',
      'Maybe the competition just was not your moment. It happens.',
    ],
    [
      'Still thinking about that finish. You took it better than I expected.',
      'I said what I said about the competition. I am curious whether it changed your plans.',
    ]
  ),

  social_momentum_notice: makeScenePool(
    'smn',
    [
      'You have been working the house hard today. People are starting to notice.',
      'Your social game has momentum right now. That can be useful, or dangerous.',
    ],
    [
      'You have been everywhere today, and I mean that as an observation, not an accusation.',
      'The house is paying attention to how much ground you are covering. I thought you should know.',
    ],
    [
      'I keep seeing your name come up after conversations. Your momentum is becoming a story.',
      'I mentioned your social game earlier. The house has not stopped noticing it.',
    ]
  ),

  nominee_understands_loh: makeScenePool(
    'nul',
    [
      'You put me on the block as LOH. I can understand the game move, but I need the honest version.',
      'I know LOH has to make a decision. Tell me whether nominating me was strategy or something else.',
    ],
    [
      'I am hurt, but I do not want to turn this into a scene. Can we talk plainly about why it was me?',
      'I am trying to separate the nomination from our relationship. Help me understand where you are.',
    ],
    [
      'I have had time to sit with the nomination. I still want the real explanation from you.',
      'I said I understood the move, but I am still trying to understand what it means for us.',
    ]
  ),

  nominee_confronts_loh: makeScenePool(
    'ncl',
    [
      'You nominated me as LOH. Do not expect me to act like it was nothing.',
      'You made your choice. Now I want to hear you say why I was worth taking the shot at.',
    ],
    [
      'I am angry because I thought we had more trust than this. I need you to be straight with me.',
      'Maybe it was the right move for you, but it still hurt. Do not minimize that.',
    ],
    [
      'I have not cooled off about the nomination. Are you ready to have the real conversation now?',
      'You know where I stand after that ceremony. I am giving you one chance to explain it.',
    ]
  ),

  replacement_nominee_reacts_to_loh: makeScenePool(
    'rnrl',
    [
      'You named me as the replacement. I need to know why I became your backup plan.',
      'I was safe until Safety changed the board. Explain why your LOH decision landed on me.',
    ],
    [
      'That replacement nomination blindsided me. I am trying to hear you before I decide what it means.',
      'I know the Safety ceremony forced a choice, but I still feel like I got caught in the blast.',
    ],
    [
      'I have been replaying the replacement decision. I still want an honest answer from you.',
      'The block changed fast, and I am still trying to understand why you chose me.',
    ]
  ),

  // ── Gossip / general ───────────────────────────────────────────────────

  generic_gossip: [
    {
      id: 'gg_ambient',
      voiceTags: ['indirect', 'composed', 'strategic'],
      variants: [
        {
          text: 'There is a lot moving underneath the surface right now.',
          voiceTags: ['indirect', 'composed'],
        },
        {
          text: 'House dynamics are getting messy, and I thought you should know that.',
          voiceTags: ['strategic', 'direct'],
        },
        {
          text: 'The vibe is shifting again. Nobody feels settled.',
          voiceTags: ['indirect', 'composed'],
        },
      ],
    },
    {
      id: 'gg_pointed',
      voiceTags: ['direct', 'strategic', 'blunt'],
      variants: [
        {
          text: 'I am not trying to stir anything up, but there are conversations happening that you should be aware of.',
          voiceTags: ['indirect', 'strategic'],
        },
        {
          text: 'I heard some things today that I think you would want to know.',
          voiceTags: ['direct', 'sincere'],
        },
        {
          text: 'Information matters in here. Let me share something with you.',
          voiceTags: ['strategic', 'direct'],
        },
      ],
    },
    {
      id: 'gg_followup',
      voiceTags: ['composed', 'indirect'],
      isFollowUp: true,
      variants: [
        {
          text: 'Still watching things develop. The picture keeps getting clearer.',
          voiceTags: ['composed', 'strategic'],
        },
        {
          text: 'I said there was movement. There is even more now.',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'Each day in this house teaches me something new. I keep wanting to compare notes with you.',
          voiceTags: ['indirect', 'sincere'],
        },
      ],
    },
  ],

  generic_check_in: [
    {
      id: 'gci_casual',
      voiceTags: ['soft', 'indirect', 'sincere'],
      variants: [
        { text: 'Hey — wanted to check where your head is at.', voiceTags: ['indirect', 'soft'] },
        {
          text: 'Just checking in. This week feels different already.',
          voiceTags: ['soft', 'composed'],
        },
        {
          text: 'I figured it was worth touching base for a second.',
          voiceTags: ['indirect', 'sincere'],
        },
      ],
    },
    {
      id: 'gci_direct',
      voiceTags: ['direct', 'composed', 'strategic'],
      variants: [
        {
          text: 'I like to know where I stand. Can we be straight with each other for a minute?',
          voiceTags: ['direct', 'composed'],
        },
        {
          text: 'Nothing specific. Just wanted to read you before the house gets loud.',
          voiceTags: ['strategic', 'direct'],
        },
        {
          text: 'You seem like the kind of person worth talking to. How are you reading things?',
          voiceTags: ['direct', 'sincere'],
        },
      ],
    },
    {
      id: 'gci_warm',
      voiceTags: ['emotional', 'soft', 'playful'],
      variants: [
        {
          text: 'I do not have a specific agenda. I just like talking to you.',
          voiceTags: ['soft', 'sincere'],
        },
        {
          text: 'How are you holding up? Not everyone handles this house the same way.',
          voiceTags: ['emotional', 'soft'],
        },
        {
          text: 'Wanted to find you before the day gets away from both of us.',
          voiceTags: ['playful', 'soft'],
        },
      ],
    },
    {
      id: 'gci_followup',
      voiceTags: ['indirect', 'soft'],
      isFollowUp: true,
      variants: [
        {
          text: 'I keep finding myself wanting to talk to you. That is probably a good sign.',
          voiceTags: ['soft', 'sincere'],
        },
        { text: 'Back again. Hope that is not getting old.', voiceTags: ['playful', 'indirect'] },
        {
          text: 'Every time we talk, I feel like we are actually getting somewhere real.',
          voiceTags: ['sincere', 'soft'],
        },
      ],
    },
  ],
}

// ── Variant selection ──────────────────────────────────────────────────────

/**
 * Pick a variant text from the scenario's family pool using voice-profile
 * weighting, recency avoidance, and follow-up preference.
 *
 * @param families      - The variant families for the chosen scenario.
 * @param profile       - The speaking actor's voice profile.
 * @param recentFamilyIds - Family IDs recently used by the same actor → player pair.
 * @param repeatCount   - Number of prior unresolved interactions from this actor to this player.
 * @param rng           - Seeded random function in [0, 1).
 * @returns Selected text template and the family ID used.
 */
export function pickVariantText(
  families: VariantFamily[],
  profile: VoiceProfile,
  recentFamilyIds: Set<string>,
  repeatCount: number,
  rng: () => number,
  recentVariantIds: Set<string> = new Set()
): { text: string; familyId: string; variantId: string } {
  if (families.length === 0) {
    return { text: 'We need to talk.', familyId: 'fallback', variantId: 'fallback:0' }
  }

  const allVoiceTags = [...profile.primary, ...profile.secondary]
  const familiesWithFreshLines = families.filter((family) =>
    family.variants.some((_, index) => !recentVariantIds.has(getVariantId(family, index)))
  )
  const freshnessPool = familiesWithFreshLines.length > 0 ? familiesWithFreshLines : families

  // Prefer families not recently used.
  let candidates = freshnessPool.filter((family) => !recentFamilyIds.has(family.id))
  if (candidates.length === 0) {
    candidates = freshnessPool
  }

  // If this is a follow-up contact, prefer follow-up families.
  if (repeatCount > 0) {
    const followUpCandidates = candidates.filter((family) => family.isFollowUp)
    if (followUpCandidates.length > 0) {
      candidates = followUpCandidates
    }
  }

  // Score each candidate family by how many voice tags match the actor's profile.
  const scored = candidates
    .map((family) => ({
      family,
      score: family.voiceTags.filter((tag) => allVoiceTags.includes(tag)).length,
    }))
    .sort((a, b) => b.score - a.score)

  // Pick from the top tier (any family within 1 point of the best) to add variety.
  const topScore = scored[0]?.score ?? 0
  const topFamilies = scored
    .filter((entry) => entry.score >= Math.max(0, topScore - 1))
    .map((entry) => entry.family)

  const chosenFamily = topFamilies[Math.floor(rng() * topFamilies.length)] ?? families[0]

  // Within the chosen family, prefer variants whose voice tags match.
  const indexedVariants = chosenFamily.variants.map((variant, index) => ({
    variant,
    variantId: getVariantId(chosenFamily, index),
  }))
  const freshVariants = indexedVariants.filter(({ variantId }) => !recentVariantIds.has(variantId))
  const freshnessVariants = freshVariants.length > 0 ? freshVariants : indexedVariants
  const voiceMatchedVariants = freshnessVariants.filter(({ variant }) =>
    variant.voiceTags.some((tag) => allVoiceTags.includes(tag))
  )
  const variantPool = voiceMatchedVariants.length > 0 ? voiceMatchedVariants : freshnessVariants

  const chosen = variantPool[Math.floor(rng() * variantPool.length)] ?? indexedVariants[0]

  return {
    text: chosen?.variant.text ?? 'We need to talk.',
    familyId: chosenFamily.id,
    variantId: chosen?.variantId ?? `${chosenFamily.id}:0`,
  }
}
