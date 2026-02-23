/**
 * Relationship label and mood utilities for the SocialPanelV2 UI.
 *
 * Maps a numeric affinity value to a human-readable label and a CSS key,
 * and derives a deterministic mood string for a player.
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

// ── Mood ──────────────────────────────────────────────────────────────────────

const MOODS_GOOD    = ['Content', 'Cheerful', 'Relaxed', 'Optimistic', 'Warm'] as const;
const MOODS_NEUTRAL = ['Pensive', 'Focused', 'Reserved', 'Observant', 'Quiet'] as const;
const MOODS_BAD     = ['Anxious', 'Suspicious', 'Irritable', 'Distant', 'Guarded'] as const;

export type MoodClass = 'good' | 'neutral' | 'bad';

/**
 * Returns a deterministic mood string for a player, influenced by their affinity.
 * Uses a simple hash of the player id to keep the mood stable across renders.
 */
export function getPlayerMood(playerId: string, affinity?: number): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) & 0x7fffffff;
  }
  if (affinity !== undefined) {
    if (affinity >= 60) return MOODS_GOOD[hash % MOODS_GOOD.length];
    if (affinity <= 20) return MOODS_BAD[hash % MOODS_BAD.length];
  }
  return MOODS_NEUTRAL[hash % MOODS_NEUTRAL.length];
}

/** Returns the CSS class key for a given mood string. */
export function getMoodClass(mood: string): MoodClass {
  if ((MOODS_GOOD as readonly string[]).includes(mood)) return 'good';
  if ((MOODS_BAD as readonly string[]).includes(mood)) return 'bad';
  return 'neutral';
}
