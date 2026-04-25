import { socialConfig } from './socialConfig';
import type { RelationshipEntry, RelationshipsMap } from './types';

export const ALLIANCE_TAG = 'alliance';
export const BETRAYAL_TAG = 'betrayal';

export function hasAllianceTag(relationship?: RelationshipEntry): boolean {
  return relationship?.tags.includes(ALLIANCE_TAG) ?? false;
}

export function hasAllianceBetween(
  relationships: RelationshipsMap,
  actorId: string,
  targetId: string,
): boolean {
  return (
    hasAllianceTag(relationships[actorId]?.[targetId]) ||
    hasAllianceTag(relationships[targetId]?.[actorId])
  );
}

export function shouldDropAllianceTag(affinity: number): boolean {
  return affinity < socialConfig.relationshipThresholds.allyThreshold;
}

export function tagsAfterAllianceDecay(
  tags: string[],
  affinity: number,
  preserveIncomingAlliance: boolean,
): string[] {
  if (preserveIncomingAlliance || !tags.includes(ALLIANCE_TAG) || !shouldDropAllianceTag(affinity)) {
    return tags;
  }
  return tags.filter((tag) => tag !== ALLIANCE_TAG);
}
