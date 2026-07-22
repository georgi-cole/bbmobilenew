import { socialConfig } from './socialConfig';
import { normalizeAffinity } from './affinityUtils';
import type { RelationshipEntry, RelationshipsMap } from './types';

export const ALLIANCE_TAG = 'alliance';
export const BETRAYAL_TAG = 'betrayal';
export const MIN_ALLIANCE_AFFINITY = 10;

export function hasAllianceTag(relationship?: RelationshipEntry): boolean {
  return relationship?.tags.includes(ALLIANCE_TAG) ?? false;
}

export function hasAllianceBetween(
  relationships: RelationshipsMap,
  actorId: string,
  targetId: string,
): boolean {
  const tagged = (
    hasAllianceTag(relationships[actorId]?.[targetId]) ||
    hasAllianceTag(relationships[targetId]?.[actorId])
  );
  if (!tagged) return false;
  const actorAffinity = relationships[actorId]?.[targetId]?.affinity ?? 0;
  const targetAffinity = relationships[targetId]?.[actorId]?.affinity ?? 0;
  // A stale tag cannot make two people aligned when either side actively
  // distrusts the other. Ten is the minimum for a tentative strategic pact.
  return Math.min(actorAffinity, targetAffinity) >= MIN_ALLIANCE_AFFINITY;
}

export function shouldDropAllianceTag(affinity: number): boolean {
  return normalizeAffinity(affinity) < socialConfig.relationshipThresholds.allyThreshold;
}

export function tagsAfterAllianceDecay(
  tags: string[],
  affinity: number,
  preserveIncomingAlliance: boolean,
): string[] {
  if (!tags.includes(ALLIANCE_TAG)) {
    return tags;
  }
  if (tags.includes(BETRAYAL_TAG)) {
    return tags.filter((tag) => tag !== ALLIANCE_TAG);
  }
  if (preserveIncomingAlliance || !shouldDropAllianceTag(affinity)) {
    return tags;
  }
  return tags.filter((tag) => tag !== ALLIANCE_TAG);
}
