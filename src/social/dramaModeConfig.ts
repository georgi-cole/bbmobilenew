import type { SocialActionDefinition } from './socialActions';
import type { DramaArcStage, DramaArcType, DramaRumourKind } from './types';

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
} as const;

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
  },
  {
    id: 'ride_or_die',
    title: 'Make a Pact',
    icon: '\uD83E\uDD1D',
    description: 'Turn a close friendship into a ride-or-die bond.',
    category: 'alliance',
    kind: 'rapport',
    baseCost: { energy: 2, influence: 1 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'bromance_seed',
    yields: { influence: 0.04 },
    dramaOnly: true,
    minAffinity: 24,
  },
  {
    id: 'plant_lie',
    title: 'Plant a Lie',
    icon: '\uD83D\uDC0D',
    description: 'Tell one housemate a calculated lie about another.',
    category: 'aggressive',
    kind: 'intel_spend',
    baseCost: { energy: 2, info: 2 },
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
    baseCost: { energy: 1, info: 1 },
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
    baseCost: { energy: 2, info: 3 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'exposed',
    yields: { influence: 0.06 },
    dramaOnly: true,
    allowedPhases: ['social_1', 'nomination_results', 'pos_ceremony_results', 'social_2'],
  },
  {
    id: 'stir_rivalry',
    title: 'Pit Them Against',
    icon: '\u26A1',
    description: 'Use existing tension to push two housemates apart.',
    category: 'aggressive',
    kind: 'political_spend',
    baseCost: { energy: 2, influence: 1, info: 1 },
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
    baseCost: { energy: 3, influence: 1 },
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
];

type ArcBank = Record<DramaArcType, Record<DramaArcStage, readonly string[]>>;
const resolved = [
  '{a} and {b} closed that chapter, although neither forgot it.',
  'The story between {a} and {b} has gone quiet for now.',
];
export const DRAMA_DIALOGUE_BANK: {
  arc: ArcBank;
  rumour: Record<DramaRumourKind, readonly string[]>;
  exposure: Record<DramaRumourKind, readonly string[]>;
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
    targeting: ["{source} says {subject}'s name is circulating as the next target."],
    fake_deal: ['{source} says {subject} offered the same deal in two rooms.'],
    personal_comment: ['{source} says {subject} made a comment that did not stay private.'],
  },
  exposure: {
    secret_alliance: ["HOUSE EXPOSED: {subject}'s hidden voting bloc is now public."],
    targeting: ['HOUSE EXPOSED: The campaign against {subject} is no longer quiet.'],
    fake_deal: ["HOUSE EXPOSED: {subject}'s deals do not match from room to room."],
    personal_comment: [
      'HOUSE EXPOSED: A private comment involving {subject} detonated in the living room.',
    ],
  },
};

export function pickDramaCopy(lines: readonly string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
  return lines[Math.abs(hash) % lines.length] ?? lines[0] ?? '';
}
