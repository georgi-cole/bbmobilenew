import type { SocialActionDefinition } from './socialActions'
import type { DramaArcStage, DramaArcType, DramaRumourKind } from './types'

export const DRAMA_MODE_CONFIG = {
  pacing: {
    minArcStartWeek: 2,
    maxActiveArcs: 5,
    maxNewArcsPerWeek: 1,
    maxRumourHopsPerWeek: 2,
    maxPublicEventsPerWeek: 1,
    publicEventCooldownWeeks: 2,
    maxStoredEvents: 40,
    rumourLifetimeWeeks: 4,
  },
  arcs: {
    romanceMinMutualAffinity: 0.56,
    bromanceMinMutualAffinity: 0.42,
    rivalryMaxMutualAffinity: -0.28,
    establishedIntensity: 62,
    climaxIntensity: 86,
  },
  rumours: { beliefThreshold: 0.48, exposureListenerCount: 3, exposureConfidence: 0.58 },
} as const

/** Premium actions are catalog data, so future packs can append actions without UI rewrites. */
export const DRAMA_SOCIAL_ACTIONS: SocialActionDefinition[] = [
  {
    id: 'flirt',
    title: 'Test the Spark',
    icon: '\uD83D\uDC95',
    description: 'Explore a possible romantic connection.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'romance_seed',
    yields: { influence: 0.02 },
    dramaOnly: true,
    minAffinity: 12,
    excludedArcTypes: ['romance'],
  },
  {
    id: 'private_flirt',
    title: 'Flirt in Private',
    icon: '\uD83D\uDC8B',
    description: 'Nudge a growing spark away from the group.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'romance',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['spark', 'building'],
  },
  {
    id: 'late_night_talk',
    title: 'Late-Night Talk',
    icon: '\uD83C\uDF19',
    description: 'Open up when the rest of the house is asleep.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'romance',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['spark', 'building', 'established'],
  },
  {
    id: 'cuddle',
    title: 'Cuddle',
    icon: '\uD83E\uDD17',
    description: 'Share a close private moment under the blankets.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'romance',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['established', 'climax'],
  },
  {
    id: 'kiss_under_covers',
    title: 'Secret Kiss',
    icon: '\uD83D\uDC8B',
    description: 'Risk a kiss where another housemate might notice.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'romance',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['established', 'climax'],
  },
  {
    id: 'pool_makeout',
    title: 'Pool Makeout',
    icon: '\uD83C\uDF0A',
    description: 'Turn the chemistry up with very little cover.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 3 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'romance',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['established', 'climax'],
  },
  {
    id: 'spend_night',
    title: 'Spend the Night',
    icon: '\uD83D\uDECF\uFE0F',
    description: 'Choose intimacy over subtlety and accept the risk.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 4 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'romance',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['climax'],
  },
  {
    id: 'go_public',
    title: 'Go Public',
    icon: '\uD83D\uDCE3',
    description: 'Stop hiding the romance and face the strategic fallout.',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: { energy: 3, influence: 1 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'romance',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['established', 'climax'],
    requiredArcPublic: false,
  },
  {
    id: 'end_romance',
    title: 'End It',
    icon: '\uD83D\uDC94',
    description: 'Break off the relationship before the game does it for you.',
    category: 'aggressive',
    kind: 'aggressive',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'ex',
    dramaOnly: true,
    requiredArcTypes: ['romance'],
    requiredArcStages: ['building', 'established', 'strained', 'climax'],
  },
  {
    id: 'break_alliance',
    title: 'Break the Pact',
    icon: '\uD83D\uDDE1\uFE0F',
    description: 'End an alliance and accept the memory it leaves behind.',
    category: 'aggressive',
    kind: 'aggressive',
    baseCost: { energy: 3 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'betrayal',
    dramaOnly: true,
    requiredRelationshipTags: ['alliance'],
  },
  {
    id: 'snoop_around',
    title: 'Snoop Around',
    icon: '\uD83D\uDD75\uFE0F',
    description: 'Look for private deals, hidden chemistry, or loose receipts.',
    category: 'strategic',
    kind: 'intel_gain',
    baseCost: { energy: 2 },
    targetMode: 'none',
    needsTargets: false,
    successWeight: 2,
    yields: { info: 2 },
    dramaOnly: true,
  },
  {
    id: 'ride_or_die',
    title: 'Make a Pact',
    icon: '\uD83E\uDD1D',
    description: 'Turn a close friendship into a ride-or-die bond.',
    category: 'alliance',
    kind: 'rapport',
    baseCost: { energy: 3, influence: 1 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'bromance_seed',
    yields: { influence: 0.04 },
    dramaOnly: true,
    minAffinity: 24,
    excludedArcTypes: ['bromance'],
  },
  {
    id: 'risk_the_vibe',
    title: 'Risk the Vibe',
    icon: '\uD83C\uDFB2',
    description: 'See whether a ride-or-die friendship is becoming something more.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'romance_seed',
    dramaOnly: true,
    requiredArcTypes: ['bromance'],
    requiredArcStages: ['building', 'established', 'climax'],
    excludedArcTypes: ['romance'],
  },
  {
    id: 'break_bromance',
    title: 'End the Pact',
    icon: '\u2702\uFE0F',
    description: 'Tell your ride-or-die the partnership is over.',
    category: 'aggressive',
    kind: 'aggressive',
    baseCost: { energy: 3 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'betrayal',
    dramaOnly: true,
    requiredArcTypes: ['bromance'],
    requiredArcStages: ['building', 'established', 'strained', 'climax'],
  },
  {
    id: 'plant_lie',
    title: 'Plant a Lie',
    icon: '\uD83D\uDC0D',
    description: 'Tell one housemate a calculated lie about another.',
    category: 'aggressive',
    kind: 'intel_spend',
    baseCost: { energy: 3, info: 2 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'houseguests',
    successWeight: 1,
    outcomeTag: 'rumour_source',
    yields: { influence: 0.05 },
    dramaOnly: true,
  },
  {
    id: 'trade_secrets',
    title: 'Trade Secrets',
    icon: '\uD83E\uDD2B',
    description: 'Exchange named information and create an obligation.',
    category: 'strategic',
    kind: 'intel_spend',
    baseCost: { energy: 2, info: 1 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'houseguests',
    successWeight: 2,
    outcomeTag: 'information_bond',
    yields: { influence: 0.05, info: 0.5 },
    dramaOnly: true,
  },
  {
    id: 'eavesdrop',
    title: 'Eavesdrop',
    icon: '\uD83D\uDC42',
    description: 'Listen for a circulating story without joining in.',
    category: 'strategic',
    kind: 'intel_gain',
    baseCost: { energy: 2 },
    targetMode: 'none',
    needsTargets: false,
    successWeight: 2,
    yields: { info: 2 },
    dramaOnly: true,
  },
  {
    id: 'expose_secret',
    title: 'Expose a Secret',
    icon: '\uD83D\uDCFA',
    description: 'Take a known story public. A false claim can ruin credibility.',
    category: 'aggressive',
    kind: 'intel_spend',
    baseCost: { energy: 4, info: 3 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'exposed',
    yields: { influence: 0.06 },
    dramaOnly: true,
    requiresKnownSecret: true,
    allowedPhases: ['social_1', 'nomination_results', 'pos_ceremony_results', 'social_2'],
  },
  {
    id: 'stir_rivalry',
    title: 'Pit Them Against',
    icon: '\u26A1',
    description: 'Use existing tension to push two housemates apart.',
    category: 'aggressive',
    kind: 'political_spend',
    baseCost: { energy: 3, influence: 1, info: 1 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'houseguests',
    successWeight: 1,
    outcomeTag: 'rivalry',
    yields: { influence: 0.04 },
    dramaOnly: true,
  },
  {
    id: 'public_callout',
    title: 'Call Them Out',
    icon: '\uD83D\uDD25',
    description: 'Turn private conflict into a public confrontation.',
    category: 'aggressive',
    kind: 'aggressive',
    baseCost: { energy: 4, influence: 1 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'rivalry',
    dramaOnly: true,
    requiredRelationshipTags: ['rivalry', 'betrayal', 'target'],
    allowedPhases: ['nomination_results', 'pos_ceremony_results', 'social_2', 'eviction_results'],
  },
  {
    id: 'repair_bond',
    title: 'Private Truce',
    icon: '\uD83D\uDD4A\uFE0F',
    description: 'De-escalate a rivalry or repair a damaged alliance.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'reconciliation',
    yields: { influence: 0.02 },
    dramaOnly: true,
    requiredRelationshipTags: ['rivalry', 'betrayal', 'strained'],
  },
]

type ArcBank = Record<DramaArcType, Record<DramaArcStage, readonly string[]>>
const resolved = [
  '{a} and {b} closed that chapter, although neither forgot it.',
  'The story between {a} and {b} has gone quiet for now.',
]
export const DRAMA_DIALOGUE_BANK: {
  arc: ArcBank
  rumour: Record<DramaRumourKind, readonly string[]>
  exposure: Record<DramaRumourKind, readonly string[]>
} = {
  arc: {
    romance: {
      spark: [
        '{a} and {b} keep finding reasons to sit together after everyone leaves.',
        "{a} laughed a little too hard at {b}'s joke, and the room noticed.",
      ],
      building: [
        'The chemistry between {a} and {b} is no longer subtle.',
        '{a} and {b} protect their late-night conversations.',
      ],
      established: [
        "{a} and {b} are the house's worst-kept romantic secret.",
        '{a} and {b} choose each other before strategy enters the room.',
      ],
      strained: ['Jealousy and game pressure entered the conversation between {a} and {b}.'],
      climax: ['{a} and {b} can no longer separate their feelings from the game.'],
      resolved,
    },
    bromance: {
      spark: [
        '{a} and {b} discovered they share the same humour and enemies.',
        '{a} and {b} move through the house as a pair.',
      ],
      building: ['{a} and {b} swap information before speaking to anyone else.'],
      established: ['{a} and {b} are a genuine ride-or-die duo.'],
      strained: ['A crack is forming in the pact between {a} and {b}.'],
      climax: ['{a} and {b} put their shared game on the line for each other.'],
      resolved,
    },
    rivalry: {
      spark: [
        '{a} and {b} traded a look sharp enough to nominate itself.',
        '{a} challenged {b} in the kitchen, and nobody changed the subject.',
      ],
      building: ['{a} and {b} are campaigning against each other in separate rooms.'],
      established: ['{a} and {b} are public rivals, and the house is choosing sides.'],
      strained: ['{a} and {b} attempted a truce, but neither sounded convinced.'],
      climax: ['{a} and {b} finally said everything in front of the whole house.'],
      resolved,
    },
    betrayal: {
      spark: [
        "{a} realised that {b}'s promise and plan were two different things.",
        '{a} compared notes and caught {b} playing both sides.',
      ],
      building: ['{a} is quietly collecting proof that {b} broke their deal.'],
      established: ['{a} now treats {b} as a former ally and a current threat.'],
      strained: ['{a} heard an apology from {b}, but trust did not follow.'],
      climax: ["{a} exposed {b}'s betrayal to the entire house."],
      resolved,
    },
  },
  rumour: {
    secret_alliance: ['{source} says {subject} has a deal nobody admits to.'],
    secret_romance: [
      '{source} says {subject} keeps disappearing with the same person after lights-out.',
    ],
    targeting: ["{source} says {subject}'s name is circulating as the next target."],
    fake_deal: ['{source} says {subject} offered the same deal in two rooms.'],
    personal_comment: ['{source} says {subject} made a comment that did not stay private.'],
  },
  exposure: {
    secret_alliance: ["HOUSE EXPOSED: {subject}'s hidden voting bloc is now public."],
    secret_romance: ["HOUSE EXPOSED: {subject}'s secret romance has been caught on camera."],
    targeting: ['HOUSE EXPOSED: The campaign against {subject} is no longer quiet.'],
    fake_deal: ["HOUSE EXPOSED: {subject}'s deals do not match from room to room."],
    personal_comment: [
      'HOUSE EXPOSED: A private comment involving {subject} detonated in the living room.',
    ],
  },
}

// Expand short arc stages without making the engine aware of copy storage.
DRAMA_DIALOGUE_BANK.arc.romance.strained = [
  ...DRAMA_DIALOGUE_BANK.arc.romance.strained,
  '{a} noticed {b} sharing the same private smile with somebody else.',
  '{a} and {b} tried to talk feelings while both were still counting votes.',
  'A strategic secret put unexpected distance between {a} and {b}.',
]
DRAMA_DIALOGUE_BANK.arc.romance.climax = [
  ...DRAMA_DIALOGUE_BANK.arc.romance.climax,
  '{a} asked {b} whether this connection survives a nomination.',
  '{a} and {b} finally addressed the romance the whole house had narrated for them.',
  'One vote forced {a} and {b} to choose between chemistry and the game.',
]
DRAMA_DIALOGUE_BANK.arc.bromance.building = [
  ...DRAMA_DIALOGUE_BANK.arc.bromance.building,
  '{a} and {b} now debrief every room before either makes a move.',
  '{a} and {b} invented a handshake and accidentally announced a voting pair.',
  '{a} trusts {b} with names that never reach the rest of the alliance.',
]
DRAMA_DIALOGUE_BANK.arc.bromance.established = [
  ...DRAMA_DIALOGUE_BANK.arc.bromance.established,
  '{a} and {b} have become a package deal, whether the house likes it or not.',
  '{a} and {b} defend each other before hearing the accusation.',
  'Everyone now plans around the fact that {a} and {b} compare notes.',
]
DRAMA_DIALOGUE_BANK.arc.bromance.strained = [
  ...DRAMA_DIALOGUE_BANK.arc.bromance.strained,
  '{a} heard that {b} had a backup plan, and it did not include them.',
  '{a} and {b} disagreed over a vote neither can afford to lose.',
  'The jokes stopped when {a} questioned where {b} had really been all night.',
]
DRAMA_DIALOGUE_BANK.arc.bromance.climax = [
  ...DRAMA_DIALOGUE_BANK.arc.bromance.climax,
  '{a} risked the week to keep {b} out of danger.',
  '{a} and {b} drew a public line: target one and inherit both.',
  'The house demanded that {a} choose between {b} and the numbers.',
]
DRAMA_DIALOGUE_BANK.arc.rivalry.building = [
  ...DRAMA_DIALOGUE_BANK.arc.rivalry.building,
  '{a} and {b} have started correcting each other in every room.',
  '{a} blamed {b} for the vote, and {b} brought witnesses.',
  'Separate campaigns by {a} and {b} are turning the house into two camps.',
]
DRAMA_DIALOGUE_BANK.arc.rivalry.established = [
  ...DRAMA_DIALOGUE_BANK.arc.rivalry.established,
  '{a} and {b} no longer pretend their plans can coexist.',
  'Every conversation involving {a} eventually becomes a case against {b}.',
  '{a} and {b} have made mutual destruction part of the weekly routine.',
]
DRAMA_DIALOGUE_BANK.arc.rivalry.strained = [
  ...DRAMA_DIALOGUE_BANK.arc.rivalry.strained,
  '{a} offered {b} peace, then immediately asked who would benefit.',
  '{a} and {b} managed one civil conversation; nobody trusted it.',
  'A temporary truce between {a} and {b} is making both alliances nervous.',
]
DRAMA_DIALOGUE_BANK.arc.rivalry.climax = [
  ...DRAMA_DIALOGUE_BANK.arc.rivalry.climax,
  '{a} and {b} turned the living room into a courtroom with no recess.',
  '{a} named every move {b} had made and {b} answered with receipts.',
  'The feud between {a} and {b} finally forced the house to choose sides.',
]
DRAMA_DIALOGUE_BANK.arc.betrayal.building = [
  ...DRAMA_DIALOGUE_BANK.arc.betrayal.building,
  '{a} is comparing every promise from {b} against the actual vote.',
  '{a} quietly asked three people whether {b} had offered them the same deal.',
  '{a} stopped sharing names with {b} and started collecting theirs.',
]
DRAMA_DIALOGUE_BANK.arc.betrayal.established = [
  ...DRAMA_DIALOGUE_BANK.arc.betrayal.established,
  '{a} now repeats promises from {b} only when warning other people.',
  '{a} has moved {b} from ally to evidence.',
  'The broken deal between {a} and {b} is shaping every new conversation.',
]
DRAMA_DIALOGUE_BANK.arc.betrayal.strained = [
  ...DRAMA_DIALOGUE_BANK.arc.betrayal.strained,
  '{b} tried to explain the vote; {a} listened without forgiving it.',
  '{a} accepted a conversation from {b}, not an apology.',
  '{a} and {b} agreed on what happened and nothing else.',
]
DRAMA_DIALOGUE_BANK.arc.betrayal.climax = [
  ...DRAMA_DIALOGUE_BANK.arc.betrayal.climax,
  '{a} read the conflicting promises from {b} aloud to the whole house.',
  '{a} confronted {b} with the one secret that could not be explained away.',
  'The house watched {a} turn the private betrayal by {b} into public strategy.',
]

DRAMA_DIALOGUE_BANK.rumour.secret_alliance = [
  ...DRAMA_DIALOGUE_BANK.rumour.secret_alliance,
  '{source} heard that {subject} has a final deal hidden inside a larger alliance.',
  '{source} claims {subject} meets the same person after every vote.',
]
DRAMA_DIALOGUE_BANK.rumour.secret_romance = [
  ...DRAMA_DIALOGUE_BANK.rumour.secret_romance,
  '{source} spotted {subject} sharing a suspiciously private late-night moment.',
  '{source} heard that {subject} is hiding feelings that could change the game.',
]
DRAMA_DIALOGUE_BANK.rumour.targeting = [
  ...DRAMA_DIALOGUE_BANK.rumour.targeting,
  '{source} says {subject} is the name power players keep testing.',
  '{source} heard that {subject} is the backup plan nobody wants to own.',
]
DRAMA_DIALOGUE_BANK.rumour.fake_deal = [
  ...DRAMA_DIALOGUE_BANK.rumour.fake_deal,
  '{source} compared promises and says {subject} reused the exact same pitch.',
  '{source} believes {subject} has promised safety to both sides.',
]
DRAMA_DIALOGUE_BANK.rumour.personal_comment = [
  ...DRAMA_DIALOGUE_BANK.rumour.personal_comment,
  '{source} says {subject} got personal when the cameras moved away.',
  '{source} heard that {subject} made a joke that landed like an insult.',
]
DRAMA_DIALOGUE_BANK.exposure.secret_alliance = [
  ...DRAMA_DIALOGUE_BANK.exposure.secret_alliance,
  'HOUSE EXPOSED: Receipts reveal {subject} has been protecting a hidden partner.',
  'HOUSE EXPOSED: The secret voting arrangement around {subject} has reached the living room.',
]
DRAMA_DIALOGUE_BANK.exposure.secret_romance = [
  ...DRAMA_DIALOGUE_BANK.exposure.secret_romance,
  'HOUSE EXPOSED: A hidden kiss involving {subject} is no longer secret.',
  'HOUSE EXPOSED: The late-night chemistry around {subject} has reached the whole house.',
]
DRAMA_DIALOGUE_BANK.exposure.targeting = [
  ...DRAMA_DIALOGUE_BANK.exposure.targeting,
  'HOUSE EXPOSED: Multiple private pitches named {subject} as the next move.',
  'HOUSE EXPOSED: {subject} was the backup plan in more rooms than anyone admitted.',
]
DRAMA_DIALOGUE_BANK.exposure.fake_deal = [
  ...DRAMA_DIALOGUE_BANK.exposure.fake_deal,
  'HOUSE EXPOSED: Two promises from {subject}; one impossible vote.',
  'HOUSE EXPOSED: {subject} gave both sides the same guarantee.',
]
DRAMA_DIALOGUE_BANK.exposure.personal_comment = [
  ...DRAMA_DIALOGUE_BANK.exposure.personal_comment,
  'HOUSE EXPOSED: The private remark involving {subject} has become public ammunition.',
  'HOUSE EXPOSED: The comment involving {subject} has split the house.',
]

export function pickDramaCopy(lines: readonly string[], seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0
  return lines[Math.abs(hash) % lines.length] ?? lines[0] ?? ''
}
