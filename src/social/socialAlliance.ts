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
  if (tags.includes(BETRAYAL_TAG)) {
    return tags.filter(
      (tag) => ![ALLIANCE_TAG, 'romance', 'bromance', 'romance_seed', 'bromance_seed'].includes(tag),
    );
  }
  if (tags.includes('ex')) {
    tags = tags.filter((tag) => !['romance', 'romance_seed'].includes(tag));
  }
  if (!tags.includes(ALLIANCE_TAG)) return tags;
  if (preserveIncomingAlliance || !shouldDropAllianceTag(affinity)) {
    return tags;
  }
  return tags.filter((tag) => tag !== ALLIANCE_TAG);
}

export const RELATIONSHIP_TAG_AFFINITY_BOUNDS: Record<
  string,
  { min?: number; max?: number }
> = {
  alliance: { min: socialConfig.relationshipThresholds.allyThreshold * 100 },
  bromance: { min: 40 },
  romance: { min: 30 },
  rivalry: { max: -30 },
  betrayal: { max: -40 },
};

/**
 * Keep named relationship states mathematically credible. Tags still decay
 * normally, but creating one can no longer leave an Ally chip at 0%.
 */
export function enforceRelationshipTagAffinity(affinity: number, tags: string[]): number {
  let next = affinity;
  if (tags.includes(BETRAYAL_TAG)) return Math.max(-100, Math.min(-40, next));
  for (const tag of tags) {
    const bound = RELATIONSHIP_TAG_AFFINITY_BOUNDS[tag];
    if (tag === BETRAYAL_TAG) continue;
    if (!bound) continue;
    if (typeof bound.min === 'number') next = Math.max(next, bound.min);
    if (typeof bound.max === 'number') next = Math.min(next, bound.max);
  }
  return Math.max(-100, Math.min(100, next));
}

export function normalizeRelationshipsForTags(relationships: RelationshipsMap): RelationshipsMap {
  return Object.fromEntries(
    Object.entries(relationships).map(([sourceId, targets]) => [
      sourceId,
      Object.fromEntries(
        Object.entries(targets).map(([targetId, relationship]) => [
          targetId,
          {
            ...relationship,
            affinity: enforceRelationshipTagAffinity(relationship.affinity, relationship.tags),
          },
        ]),
      ),
    ]),
  );
}
