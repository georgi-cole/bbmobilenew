import { normalizeAffinity } from './affinityUtils';
import { socialConfig } from './socialConfig';
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
): IncomingInteractionResponseOption[] {
  const options = RESPONSE_OPTIONS_BY_TYPE[type];
  return options.map((option) => ({
    ...option,
    style: RESPONSE_STYLE_BY_TYPE[option.responseType] ?? 'neutral',
  }));
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
