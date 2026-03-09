import { socialConfig } from './socialConfig';
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  SocialMemoryEntry,
  SocialMemoryEvent,
} from './types';

export interface SocialMemoryDelta {
  gratitude?: number;
  resentment?: number;
  neglect?: number;
  trustMomentum?: number;
}

const RESPONSE_EVENT_PREFIX: Record<IncomingInteractionResponseType, string> = {
  positive: 'appreciated',
  neutral: 'noted',
  negative: 'rebuffed',
  accept: 'accepted',
  decline: 'declined',
  dismiss: 'dismissed',
  ignore: 'ignored',
};

export function createSocialMemoryEntry(): SocialMemoryEntry {
  return {
    gratitude: 0,
    resentment: 0,
    neglect: 0,
    trustMomentum: 0,
    recentEvents: [],
  };
}

function clampSignal(value: number, cap: number, allowNegative = false): number {
  if (allowNegative) {
    return Math.max(-cap, Math.min(cap, value));
  }
  return Math.max(0, Math.min(cap, value));
}

function decayTowardZero(value: number, step: number): number {
  if (value === 0 || step <= 0) return value;
  const magnitude = Math.max(0, Math.abs(value) - step);
  if (magnitude === 0) return 0;
  return Math.sign(value) * magnitude;
}

export function hasSocialMemoryDelta(delta?: SocialMemoryDelta): boolean {
  if (!delta) return false;
  return Object.values(delta).some((value) => value !== undefined && value !== 0);
}

export function applySocialMemoryDelta(entry: SocialMemoryEntry, delta: SocialMemoryDelta): void {
  const { caps } = socialConfig.socialMemoryConfig;
  entry.gratitude = clampSignal(entry.gratitude + (delta.gratitude ?? 0), caps.gratitude);
  entry.resentment = clampSignal(entry.resentment + (delta.resentment ?? 0), caps.resentment);
  entry.neglect = clampSignal(entry.neglect + (delta.neglect ?? 0), caps.neglect);
  entry.trustMomentum = clampSignal(
    entry.trustMomentum + (delta.trustMomentum ?? 0),
    caps.trustMomentum,
    true,
  );
}

export function appendSocialMemoryEvent(entry: SocialMemoryEntry, event: SocialMemoryEvent): void {
  const limit = socialConfig.socialMemoryConfig.recentEventsLimit;
  entry.recentEvents = [event, ...entry.recentEvents].slice(0, limit);
}

export function decaySocialMemoryEntry(entry: SocialMemoryEntry): void {
  const { decayPerWeek, caps } = socialConfig.socialMemoryConfig;
  entry.gratitude = clampSignal(decayTowardZero(entry.gratitude, decayPerWeek.gratitude), caps.gratitude);
  entry.resentment = clampSignal(decayTowardZero(entry.resentment, decayPerWeek.resentment), caps.resentment);
  entry.neglect = clampSignal(decayTowardZero(entry.neglect, decayPerWeek.neglect), caps.neglect);
  entry.trustMomentum = clampSignal(
    decayTowardZero(entry.trustMomentum, decayPerWeek.trustMomentum),
    caps.trustMomentum,
    true,
  );
}

export function buildSocialMemoryDeltaForResponse(
  responseType: IncomingInteractionResponseType,
): SocialMemoryDelta {
  const deltas = socialConfig.socialMemoryConfig.incomingInteractionDeltas[responseType];
  if (!deltas && socialConfig.verbose) {
    console.warn(`[socialMemory] Missing incomingInteractionDeltas config for ${responseType}`);
  }
  return deltas ?? {};
}

export function buildSocialMemoryEvent(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  actorId: string,
  targetId: string,
  week: number,
  timestamp: number,
): SocialMemoryEvent {
  const prefix = RESPONSE_EVENT_PREFIX[responseType] ?? 'noted';
  return {
    type: `${prefix}_${interaction.type}`,
    actorId,
    targetId,
    week,
    timestamp,
    interactionType: interaction.type,
    responseType,
  };
}

export function computeSocialMemoryIntensity(entry?: SocialMemoryEntry): number {
  if (!entry) return 0;
  const caps = socialConfig.socialMemoryConfig.caps;
  const totalCap = caps.gratitude + caps.resentment + caps.neglect;
  if (totalCap <= 0) return 0;
  const total = entry.gratitude + entry.resentment + entry.neglect;
  return Math.min(1, Math.max(0, total / totalCap));
}

export function computeTrustMomentumNormalized(entry?: SocialMemoryEntry): number {
  if (!entry) return 0;
  const cap = socialConfig.socialMemoryConfig.caps.trustMomentum;
  if (cap <= 0) return 0;
  return clampSignal(entry.trustMomentum / cap, 1, true);
}

export function computeSocialMemoryAffinityBias(entry?: SocialMemoryEntry): number {
  if (!entry) return 0;
  const { caps, affinityBiasWeight, trustMomentumBiasWeight } = socialConfig.socialMemoryConfig;
  const totalCap = caps.gratitude + caps.resentment + caps.neglect;
  if (totalCap <= 0) return 0;
  const baseBias = (entry.gratitude - (entry.resentment + entry.neglect)) / totalCap;
  const trustBias = computeTrustMomentumNormalized(entry);
  return clampSignal(baseBias * affinityBiasWeight + trustBias * trustMomentumBiasWeight, 1, true);
}
