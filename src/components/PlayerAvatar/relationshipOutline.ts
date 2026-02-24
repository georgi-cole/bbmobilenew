/**
 * relationshipOutline — utility for computing relationship tone from an affinity value.
 *
 * Supports two affinity ranges:
 *   Normalized [-1, 1]: values strictly within -1 to 1 (e.g. -0.75, 0.0, 0.85)
 *   Percent   [0, 100]: values outside the normalized range treated as 0..100
 *
 * Thresholds:
 *   Normalized: > 0.5 → 'good', < -0.5 → 'bad', else → 'neutral'
 *   Percent:   >= 60  → 'good', <= 40  → 'bad', else → 'neutral'
 */

export type RelationshipTone = 'good' | 'neutral' | 'bad' | 'none';

/**
 * Compute the relationship tone from an affinity value.
 * Returns 'none' when affinity is undefined, null, or NaN.
 * Auto-detects range: [-1,1] treated as normalized; otherwise treated as 0–100.
 */
export function getRelationshipTone(affinity?: number | null): RelationshipTone {
  if (affinity === undefined || affinity === null || Number.isNaN(affinity)) {
    return 'none';
  }

  // Auto-detect range: if value is strictly within [-1, 1] treat as normalized
  if (affinity >= -1 && affinity <= 1) {
    if (affinity > 0.5) return 'good';
    if (affinity < -0.5) return 'bad';
    return 'neutral';
  }

  // Otherwise treat as 0..100 percent
  if (affinity >= 60) return 'good';
  if (affinity <= 40) return 'bad';
  return 'neutral';
}
