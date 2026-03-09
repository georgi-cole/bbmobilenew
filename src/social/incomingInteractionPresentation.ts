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
};

const RESPONSE_LABEL_FALLBACK = 'Resolved';

function formatResponseType(responseType: IncomingInteractionResponseType): string {
  const cleaned = responseType.replace(/_/g, ' ');
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
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
  if (!responseType) return RESPONSE_LABEL_FALLBACK;
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
}): IncomingInteractionTone | null {
  const relEntry = relationships[interaction.fromId]?.[humanId];
  const affinity = normalizeAffinity(relEntry?.affinity ?? 0);
  const memoryEntry = socialMemory[interaction.fromId]?.[humanId];
  const { caps } = socialConfig.socialMemoryConfig;

  const gratitude = memoryEntry?.gratitude ?? 0;
  const resentment = memoryEntry?.resentment ?? 0;
  const neglect = memoryEntry?.neglect ?? 0;
  const trustMomentum = memoryEntry?.trustMomentum ?? 0;

  const highGratitude = gratitude >= caps.gratitude * 0.55;
  const highResentment = resentment >= caps.resentment * 0.5;
  const highNeglect = neglect >= caps.neglect * 0.6;
  const trustHigh = trustMomentum >= caps.trustMomentum * 0.4;
  const trustLow = trustMomentum <= -caps.trustMomentum * 0.35;

  if (highNeglect) return 'Feels ignored';
  if (highResentment && affinity <= -0.15) return 'Bitter';
  if (
    (affinity <= -0.35 || trustLow) &&
    (interaction.type === 'snide_remark' || interaction.type === 'warning')
  ) {
    return 'Tense';
  }
  if (affinity <= -0.3 || trustLow) return 'Guarded';
  if (interaction.type === 'nomination_plea' && isUrgent) return 'Desperate';
  if (highGratitude && trustHigh && affinity >= 0) return 'Warm';
  if ((trustHigh && affinity >= 0) || affinity >= 0.45) return 'Trusting';

  return DEFAULT_TONES_BY_TYPE[interaction.type] ?? null;
}
