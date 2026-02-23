/**
 * Relationship label utilities for the SocialPanelV2 UI.
 *
 * Maps a numeric affinity value to a human-readable label and a CSS key.
 */

export type RelationshipKey = 'enemies' | 'strained' | 'neutral' | 'friendly' | 'allies';

export interface RelationshipLabel {
  label: string;
  key: RelationshipKey;
}

/**
 * Returns a relationship label (and CSS key) for a given affinity value.
 *
 * Thresholds (affinity is in the same arbitrary units as RelationshipEntry.affinity):
 *   < -30  : Enemies
 *   -30..-11 : Strained
 *   -10..19  : Neutral
 *   20..59   : Friendly
 *   ≥ 60     : Allies
 */
export function getRelationshipLabel(affinity: number): RelationshipLabel {
  if (affinity < -30) return { label: 'Enemies', key: 'enemies' };
  if (affinity < -10) return { label: 'Strained', key: 'strained' };
  if (affinity < 20) return { label: 'Neutral', key: 'neutral' };
  if (affinity < 60) return { label: 'Friendly', key: 'friendly' };
  return { label: 'Allies', key: 'allies' };
}
