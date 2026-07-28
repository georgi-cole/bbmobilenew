import { normalizeAffinity } from './affinityUtils';
import { getDramaResponseBlueprint } from './incomingResponseBank';
import { socialConfig } from './socialConfig';
import { getStoryBibleResponseSet } from './socialStoryBible';
import {
  getCommitmentKindForInteraction,
  getSocialCommitmentDueCopy,
  getSocialCommitmentLabel,
} from './socialCommitments';
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
  RelationshipsMap,
  SocialMemoryMap,
} from './types';

export type IncomingInteractionResponseStyle = 'positive' | 'neutral' | 'negative' | 'dismiss';
export type IncomingInteractionTone =
  | 'Warm'
  | 'Trusting'
  | 'Guarded'
  | 'Bitter'
  | 'Tense'
  | 'Strategic'
  | 'Desperate'
  | 'Feels ignored'
  | 'Curious';

export interface IncomingInteractionResponseOption {
  label: string;
  responseType: IncomingInteractionResponseType;
  style: IncomingInteractionResponseStyle;
  description: string;
  createsCommitment?: boolean;
}

const RESPONSE_STYLE_BY_TYPE: Record<IncomingInteractionResponseType, IncomingInteractionResponseStyle> = {
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
  accept: 'positive',
  decline: 'negative',
  dismiss: 'dismiss',
  ignore: 'dismiss',
};

const RESPONSE_OPTIONS_BY_TYPE: Record<
  IncomingInteractionType,
  Array<{ label: string; responseType: IncomingInteractionResponseType }>
> = {
  warning: [
    { label: 'Thank', responseType: 'positive' },
    { label: 'Note it', responseType: 'neutral' },
    { label: 'Reject', responseType: 'negative' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  snide_remark: [
    { label: 'Defuse', responseType: 'positive' },
    { label: 'Stay cool', responseType: 'neutral' },
    { label: 'Fire back', responseType: 'negative' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  deal_offer: [
    { label: 'Accept', responseType: 'accept' },
    { label: 'Stall', responseType: 'neutral' },
    { label: 'Decline', responseType: 'decline' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  alliance_proposal: [
    { label: 'Join', responseType: 'accept' },
    { label: 'Think on it', responseType: 'neutral' },
    { label: 'Refuse', responseType: 'decline' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  nomination_plea: [
    { label: 'Reassure', responseType: 'positive' },
    { label: 'Stay vague', responseType: 'neutral' },
    { label: 'Shut down', responseType: 'negative' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  compliment: [
    { label: 'Appreciate it', responseType: 'positive' },
    { label: 'Nod', responseType: 'neutral' },
    { label: 'Brush off', responseType: 'negative' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  gossip: [
    { label: 'Lean in', responseType: 'positive' },
    { label: 'Listen', responseType: 'neutral' },
    { label: 'Push back', responseType: 'negative' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  check_in: [
    { label: 'Open up', responseType: 'positive' },
    { label: 'Keep it light', responseType: 'neutral' },
    { label: 'Brush off', responseType: 'negative' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
  other: [
    { label: 'Respond', responseType: 'positive' },
    { label: 'Acknowledge', responseType: 'neutral' },
    { label: 'Push back', responseType: 'negative' },
    { label: 'Dismiss', responseType: 'dismiss' },
  ],
};

type ResponseBlueprint = Array<{
  label: string;
  responseType: IncomingInteractionResponseType;
}>;

// The social engine still receives stable response intents, but the words the
// player sees vary so different people do not feel like copies of one form.
const RESPONSE_OPTION_VARIANTS_BY_TYPE: Partial<
  Record<IncomingInteractionType, ResponseBlueprint[]>
> = {
  warning: [
    [
      { label: 'Take seriously', responseType: 'positive' },
      { label: 'Ask more', responseType: 'neutral' },
      { label: 'Doubt it', responseType: 'negative' },
      { label: 'Ignore it', responseType: 'dismiss' },
    ],
  ],
  snide_remark: [
    [
      { label: 'Defuse', responseType: 'positive' },
      { label: 'Stay cool', responseType: 'neutral' },
      { label: 'Call it out', responseType: 'negative' },
      { label: 'Walk away', responseType: 'dismiss' },
    ],
  ],
  deal_offer: [
    [
      { label: 'Shake on it', responseType: 'accept' },
      { label: 'Ask time', responseType: 'neutral' },
      { label: 'Counter', responseType: 'decline' },
      { label: 'End pitch', responseType: 'dismiss' },
    ],
  ],
  alliance_proposal: [
    [
      { label: 'Lock it in', responseType: 'accept' },
      { label: 'Test waters', responseType: 'neutral' },
      { label: 'Keep distance', responseType: 'decline' },
      { label: 'Change subject', responseType: 'dismiss' },
    ],
  ],
  nomination_plea: [
    [
      { label: 'Comfort', responseType: 'positive' },
      { label: 'Hear out', responseType: 'neutral' },
      { label: 'Hold ground', responseType: 'negative' },
      { label: 'End talk', responseType: 'dismiss' },
    ],
  ],
  compliment: [
    [
      { label: 'Return it', responseType: 'positive' },
      { label: 'Play it cool', responseType: 'neutral' },
      { label: 'Deflect it', responseType: 'negative' },
      { label: 'Move on', responseType: 'dismiss' },
    ],
  ],
  gossip: [
    [
      { label: 'Ask details', responseType: 'positive' },
      { label: 'Listen', responseType: 'neutral' },
      { label: 'Challenge', responseType: 'negative' },
      { label: 'Stop rumor', responseType: 'dismiss' },
    ],
  ],
  check_in: [
    [
      { label: 'Be honest', responseType: 'positive' },
      { label: 'Ask them back', responseType: 'neutral' },
      { label: 'Keep distance', responseType: 'negative' },
      { label: 'Leave it', responseType: 'dismiss' },
    ],
    [
      { label: 'Let them in', responseType: 'positive' },
      { label: 'Joke it off', responseType: 'neutral' },
      { label: 'Set boundary', responseType: 'negative' },
      { label: 'End the chat', responseType: 'dismiss' },
    ],
  ],
  other: [
    [
      { label: 'Engage', responseType: 'positive' },
      { label: 'Stay neutral', responseType: 'neutral' },
      { label: 'Push back', responseType: 'negative' },
      { label: 'Move along', responseType: 'dismiss' },
    ],
  ],
};

const SCENARIO_RESPONSE_OPTIONS: Record<string, ResponseBlueprint> = {
  generic_gossip: [
    { label: 'Ask source', responseType: 'positive' },
    { label: 'Listen', responseType: 'neutral' },
    { label: 'Defend them', responseType: 'negative' },
    { label: 'Kill rumor', responseType: 'dismiss' },
  ],
  betrayal_warning: [
    { label: 'Trust warning', responseType: 'positive' },
    { label: 'Ask for proof', responseType: 'neutral' },
    { label: 'Question motive', responseType: 'negative' },
    { label: 'Drop it', responseType: 'dismiss' },
  ],
  survivor_gratitude: [
    { label: 'Share moment', responseType: 'positive' },
    { label: 'Accept thanks', responseType: 'neutral' },
    { label: 'Downplay it', responseType: 'negative' },
    { label: 'Move on', responseType: 'dismiss' },
  ],
  post_veto_gratitude: [
    { label: 'Celebrate', responseType: 'positive' },
    { label: 'Stay modest', responseType: 'neutral' },
    { label: 'Call in favor', responseType: 'negative' },
    { label: 'Change subject', responseType: 'dismiss' },
  ],
  nomination_aftershock: [
    { label: 'Reassure them', responseType: 'positive' },
    { label: 'Stay vague', responseType: 'neutral' },
    { label: 'Stand firm', responseType: 'negative' },
    { label: 'End talk', responseType: 'dismiss' },
  ],
};

const CHECK_IN_OPTIONS_BY_TONE: Partial<Record<IncomingInteractionTone, ResponseBlueprint>> = {
  Warm: [
    { label: 'Open up', responseType: 'positive' },
    { label: 'Keep it easy', responseType: 'neutral' },
    { label: 'Hold back', responseType: 'negative' },
    { label: 'Wrap it up', responseType: 'dismiss' },
  ],
  Trusting: [
    { label: 'Confide in them', responseType: 'positive' },
    { label: 'Stay casual', responseType: 'neutral' },
    { label: 'Keep your guard', responseType: 'negative' },
    { label: 'Move on', responseType: 'dismiss' },
  ],
  Guarded: [
    { label: 'Meet halfway', responseType: 'positive' },
    { label: 'Stay measured', responseType: 'neutral' },
    { label: 'Set boundary', responseType: 'negative' },
    { label: 'End the chat', responseType: 'dismiss' },
  ],
  Bitter: [
    { label: 'Acknowledge hurt', responseType: 'positive' },
    { label: 'Keep your cool', responseType: 'neutral' },
    { label: 'Push back', responseType: 'negative' },
    { label: 'Walk away', responseType: 'dismiss' },
  ],
  'Feels ignored': [
    { label: 'Give time', responseType: 'positive' },
    { label: 'Check briefly', responseType: 'neutral' },
    { label: 'Stay distant', responseType: 'negative' },
    { label: 'Put it off', responseType: 'dismiss' },
  ],
};

function getStableVariantIndex(interaction: IncomingInteraction, tone: IncomingInteractionTone | undefined, count: number): number {
  const source = `${interaction.fromId}|${interaction.id}|${interaction.payload?.scenarioKey ?? ''}|${tone ?? ''}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(31, hash) + source.charCodeAt(index) | 0;
  }
  return Math.abs(hash) % count;
}

function getSafetyPlanBlueprint(interaction: IncomingInteraction): ResponseBlueprint | null {
  const scenarioKey = interaction.payload?.scenarioKey
  if (scenarioKey !== 'safety_holder_consults_loh' && scenarioKey !== 'loh_consults_safety_holder') {
    return null
  }
  const rawNames = interaction.payload?.nomineeNames
  const nomineeNames = Array.isArray(rawNames)
    ? rawNames.filter((name): name is string => typeof name === 'string').slice(0, 2)
    : []
  const first = nomineeNames[0] ?? 'Nominee 1'
  const second = nomineeNames[1] ?? 'Nominee 2'
  return [
    { label: `Save ${first}`, responseType: 'accept' },
    { label: `Save ${second}`, responseType: 'decline' },
    { label: 'Save nobody', responseType: 'negative' },
    { label: 'Not decided', responseType: 'neutral' },
  ]
}

function getResponseBlueprints(
  type: IncomingInteractionType,
  interaction?: IncomingInteraction,
  tone?: IncomingInteractionTone,
  dramaMode = false,
): ResponseBlueprint {
  if (!interaction) return RESPONSE_OPTIONS_BY_TYPE[type];

  const safetyPlan = getSafetyPlanBlueprint(interaction);
  if (safetyPlan) return safetyPlan;

  const scenarioKey = interaction.payload?.scenarioKey;
  const configuredResponses = getStoryBibleResponseSet(
    typeof scenarioKey === 'string' ? scenarioKey : undefined,
  );
  if (configuredResponses) return configuredResponses;
  if (typeof scenarioKey === 'string' && SCENARIO_RESPONSE_OPTIONS[scenarioKey]) {
    return SCENARIO_RESPONSE_OPTIONS[scenarioKey];
  }
  if (dramaMode) {
    const dramaBlueprint = getDramaResponseBlueprint(type, interaction, tone);
    if (dramaBlueprint) return dramaBlueprint;
  }

  if (type === 'check_in' && tone && CHECK_IN_OPTIONS_BY_TONE[tone]) {
    return CHECK_IN_OPTIONS_BY_TONE[tone];
  }

  const variants = [RESPONSE_OPTIONS_BY_TYPE[type], ...(RESPONSE_OPTION_VARIANTS_BY_TYPE[type] ?? [])];
  return variants[getStableVariantIndex(interaction, tone, variants.length)];
}

const DEFAULT_TONES_BY_TYPE: Partial<Record<IncomingInteractionType, IncomingInteractionTone>> = {
  compliment: 'Warm',
  gossip: 'Curious',
  warning: 'Guarded',
  alliance_proposal: 'Strategic',
  deal_offer: 'Strategic',
  nomination_plea: 'Desperate',
  snide_remark: 'Tense',
  check_in: 'Curious',
  other: 'Curious',
};

const DEFAULT_TONE_FALLBACK: IncomingInteractionTone = 'Curious';

// Social memory thresholds expressed as fractions of configured caps.
const HIGH_GRATITUDE_THRESHOLD = 0.55; // Gratitude peaks sooner to surface warmth.
const HIGH_RESENTMENT_THRESHOLD = 0.5; // Resentment triggers at a moderate level.
const HIGH_NEGLECT_THRESHOLD = 0.6; // Neglect requires sustained neglect to surface.
const TRUST_HIGH_THRESHOLD = 0.45; // Trust momentum must be strongly positive.
const TRUST_LOW_THRESHOLD = 0.3; // Trust momentum dips below this when negative.

// Affinity thresholds use the normalized [-1, 1] scale.
const AFFINITY_TENSE_THRESHOLD = -0.3;
const AFFINITY_GUARDED_THRESHOLD = -0.2;
const AFFINITY_BITTER_THRESHOLD = -0.15;
const AFFINITY_NEUTRAL_THRESHOLD = 0;
const AFFINITY_TRUSTING_THRESHOLD = 0.45;

const DEFAULT_RESOLVED_LABEL = 'Resolved';

function formatResponseType(responseType: IncomingInteractionResponseType): string {
  const cleaned = responseType.replace(/_/g, ' ');
  return cleaned
    .split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function hasNegativeRelationshipIndicators(
  affinity: number,
  trustLow: boolean,
  threshold: number,
): boolean {
  return affinity <= threshold || trustLow;
}

function detectBitterTone(highResentment: boolean, affinity: number): boolean {
  return highResentment && affinity <= AFFINITY_BITTER_THRESHOLD;
}

function detectTenseTone(isSnideOrWarning: boolean, affinity: number, trustLow: boolean): boolean {
  return (
    isSnideOrWarning &&
    hasNegativeRelationshipIndicators(affinity, trustLow, AFFINITY_TENSE_THRESHOLD)
  );
}

function detectGuardedTone(isGuardedEligible: boolean, affinity: number, trustLow: boolean): boolean {
  return (
    isGuardedEligible &&
    hasNegativeRelationshipIndicators(affinity, trustLow, AFFINITY_GUARDED_THRESHOLD)
  );
}

function detectWarmTone(highGratitude: boolean, trustHigh: boolean, affinity: number): boolean {
  return highGratitude && trustHigh && affinity >= AFFINITY_NEUTRAL_THRESHOLD;
}

function detectTrustingTone(trustHigh: boolean, affinity: number): boolean {
  return (
    (trustHigh && affinity >= AFFINITY_NEUTRAL_THRESHOLD) ||
    affinity >= AFFINITY_TRUSTING_THRESHOLD
  );
}

export function getIncomingInteractionResponseOptions(
  type: IncomingInteractionType,
  interaction?: IncomingInteraction,
  tone?: IncomingInteractionTone,
  dramaMode = false,
): IncomingInteractionResponseOption[] {
  const options = getResponseBlueprints(type, interaction, tone, dramaMode);
  const commitmentKind = interaction ? getCommitmentKindForInteraction(interaction) : null;
  return options.map((option) => ({
    ...option,
    style: 'neutral' as const,
    ...(commitmentKind ? getCommitmentResponsePresentation(commitmentKind, option.responseType) : {
      description: getDefaultResponseDescription(option.responseType),
    }),
  }));
}

function getDefaultResponseDescription(responseType: IncomingInteractionResponseType): string {
  if (responseType === 'positive' || responseType === 'accept') return 'Builds trust and goodwill.';
  if (responseType === 'neutral') return 'Avoids a commitment, with a smaller relationship gain.';
  if (responseType === 'negative' || responseType === 'decline') return 'Sets a clear boundary and damages trust.';
  return 'Ends the conversation without engaging.';
}

function getCommitmentResponsePresentation(
  kind: NonNullable<ReturnType<typeof getCommitmentKindForInteraction>>,
  responseType: IncomingInteractionResponseType,
): { label?: string; description: string; createsCommitment?: boolean } {
  const makesPromise = responseType === 'positive' || responseType === 'accept';
  if (makesPromise) {
    const label = kind === 'protect_from_nomination'
      ? 'Promise safety'
      : kind === 'use_safety_on_player'
        ? 'Promise the power'
        : 'Promise your vote';
    return {
      label,
      description: `Creates a promise: ${getSocialCommitmentLabel(kind)}. ${getSocialCommitmentDueCopy(kind)}.`,
      createsCommitment: true,
    };
  }
  if (responseType === 'neutral') {
    return { label: 'Give no guarantees', description: 'Keeps your options open without making a promise.' };
  }
  if (responseType === 'negative' || responseType === 'decline') {
    return { label: 'Refuse clearly', description: 'No promise is made, but they will remember the rejection.' };
  }
  return { label: 'End the talk', description: 'Dismisses them and closes the conversation.' };
}

export function getIncomingInteractionResponseLabel(
  type: IncomingInteractionType,
  responseType?: IncomingInteractionResponseType,
): string {
  if (!responseType) return DEFAULT_RESOLVED_LABEL;
  const options = RESPONSE_OPTIONS_BY_TYPE[type];
  const match = options.find((option) => option.responseType === responseType);
  return match?.label ?? formatResponseType(responseType);
}

export function getIncomingInteractionTone({
  interaction,
  relationships,
  socialMemory,
  humanId,
  isUrgent = false,
}: {
  interaction: IncomingInteraction;
  relationships: RelationshipsMap;
  socialMemory: SocialMemoryMap;
  humanId: string;
  isUrgent?: boolean;
}): IncomingInteractionTone {
  const relEntry = relationships[interaction.fromId]?.[humanId];
  const affinity = normalizeAffinity(relEntry?.affinity ?? 0);
  const memoryEntry = socialMemory[interaction.fromId]?.[humanId];
  const { caps } = socialConfig.socialMemoryConfig;

  const gratitude = memoryEntry?.gratitude ?? 0;
  const resentment = memoryEntry?.resentment ?? 0;
  const neglect = memoryEntry?.neglect ?? 0;
  const trustMomentum = memoryEntry?.trustMomentum ?? 0;

  const highGratitude = gratitude >= caps.gratitude * HIGH_GRATITUDE_THRESHOLD;
  const highResentment = resentment >= caps.resentment * HIGH_RESENTMENT_THRESHOLD;
  const highNeglect = neglect >= caps.neglect * HIGH_NEGLECT_THRESHOLD;
  const trustHigh = trustMomentum >= caps.trustMomentum * TRUST_HIGH_THRESHOLD;
  const trustLow = trustMomentum <= -caps.trustMomentum * TRUST_LOW_THRESHOLD;

  if (highNeglect) return 'Feels ignored';
  if (detectBitterTone(highResentment, affinity)) return 'Bitter';
  const isSnideOrWarning = interaction.type === 'snide_remark' || interaction.type === 'warning';
  if (detectTenseTone(isSnideOrWarning, affinity, trustLow)) return 'Tense';
  const isGuardedEligible = !isSnideOrWarning;
  if (detectGuardedTone(isGuardedEligible, affinity, trustLow)) return 'Guarded';
  if (interaction.type === 'nomination_plea' && isUrgent) return 'Desperate';
  if (detectWarmTone(highGratitude, trustHigh, affinity)) return 'Warm';
  if (detectTrustingTone(trustHigh, affinity)) return 'Trusting';

  return DEFAULT_TONES_BY_TYPE[interaction.type] ?? DEFAULT_TONE_FALLBACK;
}
