import type { IncomingInteractionResponseType } from './types'

/**
 * The spoken beat that sits between a player's reply and its social fallout.
 *
 * An incoming interaction should not resolve as a hidden relationship number.
 * This small bank gives the other housemate a specific answer, concession or
 * refusal first. The resolver then applies the relationship, memory, reality
 * and promise consequences that follow from that exchange.
 */

export interface IncomingDialogueBeatInput {
  scenarioKey?: string
  responseType: IncomingInteractionResponseType
  responseLabel?: string
  fromName: string
  subjectName?: string
  seed: number
}

type Stance = 'positive' | 'neutral' | 'negative' | 'dismiss'
type BeatSet = Record<Stance, readonly string[]>

const INTEL_BEATS: BeatSet = {
  positive: [
    '"I heard it in two separate conversations. Both pointed to {subject}, but neither person saw the whole plan — so treat it as a lead, not a fact."',
    '"The first whisper came after the last decision, then I watched people stop talking when {subject} walked in. I am telling you the pattern, not pretending I can prove the motive."',
  ],
  neutral: [
    '"I can give you the shape of it, but not a clean source. The name that keeps coming back is {subject}; I would watch before I would act."',
    '"It is second-hand, and I do not want to overstate it. Something changed around {subject}, but I cannot tell you yet whether it is strategy or nerves."',
  ],
  negative: [
    '"Fair. I will not push a rumour you do not want to hear — but I will remember who you were quick to protect."',
    '"If you think I am fishing, leave it there. I would rather keep a weak lead private than turn it into house noise."',
  ],
  dismiss: [
    '"Then forget I raised it. I will take the next piece of this to someone who wants the risk."',
    '"All right. No source, no debate — just do not say nobody tried to give you a heads-up."',
  ],
}

const CAMPAIGN_BEATS: BeatSet = {
  positive: [
    '"My case is that I am a number you can work with, while the people pushing my name have more to gain from a fractured house. If you keep me safe, I will show you that in the next decision."',
    '"I am not asking you to save me out of guilt. I am asking you to look at who benefits if I go, because it is not your game."',
  ],
  neutral: [
    '"I cannot give you certainty, but I can be clear: I am not building anything against you. I need to know what would make you comfortable enough to keep the door open."',
    '"I hear that you are not promising anything. Tell me the concern, and I will answer it instead of guessing where I lost you."',
  ],
  negative: [
    '"Then I have my answer. I will not waste either of our time pretending this is still a live conversation."',
    '"I do not like it, but I would rather know where I stand than keep campaigning to a closed door."',
  ],
  dismiss: [
    '"Okay. I will take the pitch somewhere I can get an answer before the window closes."',
    '"You do not have to explain it, but the silence tells me I cannot build my week around you."',
  ],
}

const ALLIANCE_BEATS: BeatSet = {
  positive: [
    '"Then let us make it practical: we tell each other when our names are being discussed, compare targets before a ceremony, and do not make each other guess."',
    '"Good. I do not need a showmance alliance; I need a person who will warn me before a room flips. I can be that for you too."',
  ],
  neutral: [
    '"I can work with cautious, but I need to know what that means. Are we sharing information, or are we just being friendly until power changes?"',
    '"Take the time you need. I will keep the door open, but I cannot plan my whole week around a maybe."',
  ],
  negative: [
    '"Then I will stop treating our chats as strategy. No hard feelings, but I will protect my information from here."',
    '"That is clear enough. I would rather have an honest no than build a plan on something neither of us means."',
  ],
  dismiss: [
    '"I will take that as no answer for now. If the house changes, we can see whether there is still a reason to talk."',
    '"All right. I will make my next move without assuming you are part of it."',
  ],
}

const REPAIR_BEATS: BeatSet = {
  positive: [
    '"Thank you for saying that. I did not need a perfect apology; I needed to know you saw why it landed badly."',
    '"That helps. I am still hurt, but I would rather deal with it directly than let the house write the story for us."',
  ],
  neutral: [
    '"I hear the explanation. I am not ready to call it fixed, but at least I know you are not pretending nothing changed."',
    '"Give me a little time. I can keep this from becoming a bigger thing, but I need your actions to match what you are saying."',
  ],
  negative: [
    '"Then we are not going to agree on what happened. I will stop asking you to see it my way."',
    '"That answer makes the distance clearer, even if it does not make it easier."',
  ],
  dismiss: [
    '"Fine. I will take the space you are asking for, but unresolved things do not disappear just because nobody names them."',
    '"I will leave it alone for now. It still changes what I bring to you next time."',
  ],
}

const POWER_BEATS: BeatSet = {
  positive: [
    '"That is enough for me to work with. I will keep my side of the conversation quiet and show you I can be useful when the decision lands."',
    '"I appreciate the opening. I know the power is yours; I only needed to know there was a real path for me."',
  ],
  neutral: [
    '"I understand. You are keeping options open, so I will keep working mine. If the board shifts, tell me before I hear it from somebody else."',
    '"No promise is still information. I will plan for both outcomes instead of assuming I am covered."',
  ],
  negative: [
    '"Then I will stop trying to negotiate this decision and start protecting myself from it."',
    '"That is not the answer I wanted, but it is a usable one. I know where to spend the rest of my time."',
  ],
  dismiss: [
    '"I will not chase you for an answer. I just wish I had not spent the time pretending there was a conversation to have."',
    '"All right. I will read the decision when it happens and adjust from there."',
  ],
}

const CONNECTION_BEATS: BeatSet = {
  positive: [
    '"That is the first honest answer I have had all day. I do not need us to agree on everything; I needed to know I was not guessing alone."',
    '"Thank you for meeting me halfway. It makes it easier to bring the next concern to you instead of carrying it around the house."',
  ],
  neutral: [
    '"I can live with careful. Just do not ask me to read between the lines and call it trust."',
    '"That tells me where you are today. I will watch what happens next before I decide what it means for us."',
  ],
  negative: [
    '"I hear the boundary. I will stop reaching for an answer you do not want to give."',
    '"Okay. I was hoping for more, but I would rather know the distance is real than keep inventing reasons for it."',
  ],
  dismiss: [
    '"Then we can leave it there. I will take the lack of an answer into account the next time I decide who to trust."',
    '"I will give you space. It does not mean the question goes away for me."',
  ],
}

const BEATS_BY_SCENE: Record<string, BeatSet> = {
  week_start_enemy_gossip: INTEL_BEATS,
  generic_gossip: INTEL_BEATS,
  betrayal_warning: INTEL_BEATS,
  social_momentum_notice: INTEL_BEATS,
  nominee_hoh_plea: CAMPAIGN_BEATS,
  nominee_veto_pitch: CAMPAIGN_BEATS,
  nominee_campaign: CAMPAIGN_BEATS,
  post_veto_campaign: CAMPAIGN_BEATS,
  live_vote_pitch: CAMPAIGN_BEATS,
  week_start_alliance_lock: ALLIANCE_BEATS,
  alliance_reassurance: ALLIANCE_BEATS,
  relationship_alliance_follow_up: ALLIANCE_BEATS,
  nomination_aftershock: REPAIR_BEATS,
  nominee_understands_loh: REPAIR_BEATS,
  nominee_confronts_loh: REPAIR_BEATS,
  replacement_nominee_reacts_to_loh: REPAIR_BEATS,
  ignored_warning: REPAIR_BEATS,
  relationship_frustration_follow_up: REPAIR_BEATS,
  relationship_repair_follow_up: REPAIR_BEATS,
  hoh_safety_request: POWER_BEATS,
  player_nominated_support: POWER_BEATS,
  player_nominated_tension: POWER_BEATS,
  competition_low_finish_support: CONNECTION_BEATS,
  competition_low_finish_taunt: CONNECTION_BEATS,
  hoh_congratulations: CONNECTION_BEATS,
  safety_win_congratulations: CONNECTION_BEATS,
  post_veto_gratitude: CONNECTION_BEATS,
  survivor_gratitude: CONNECTION_BEATS,
  targeted_snark: CONNECTION_BEATS,
  generic_check_in: CONNECTION_BEATS,
  week_start_ally_check_in: CONNECTION_BEATS,
  relationship_friendship_check_in: CONNECTION_BEATS,
  relationship_romance_check_in: CONNECTION_BEATS,
  relationship_confidant_check_in: CONNECTION_BEATS,
}

function stanceForResponse(responseType: IncomingInteractionResponseType): Stance {
  if (responseType === 'positive' || responseType === 'accept') return 'positive'
  if (responseType === 'negative' || responseType === 'decline') return 'negative'
  if (responseType === 'dismiss' || responseType === 'ignore') return 'dismiss'
  return 'neutral'
}

function replaceTokens(line: string, input: IncomingDialogueBeatInput): string {
  const subject = input.subjectName ?? 'the person at the centre of it'
  return line.replaceAll('{subject}', subject)
}

/** Returns a stable in-character reply for the selected player action. */
export function getIncomingDialogueBeat(input: IncomingDialogueBeatInput): string | null {
  const beats = input.scenarioKey ? BEATS_BY_SCENE[input.scenarioKey] : undefined
  if (!beats) return null
  const options = beats[stanceForResponse(input.responseType)]
  if (!options.length) return null
  return replaceTokens(options[input.seed % options.length] ?? options[0], input)
}
