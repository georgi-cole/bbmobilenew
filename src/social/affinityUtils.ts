/**
 * affinityUtils – helpers for converting display-scale affinity values into
 * the normalised [-1, +1] range used by the AI autonomy layer.
 *
 * The display affinity is stored/shown in an approximate -100 … +100 range.
 * Normalisation is kept LOCAL to the autonomy layer; stored values are never
 * modified by these helpers.
 */

/**
 * Clamp `x` to the inclusive range [min, max].
 */
function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/**
 * Convert a display-scale affinity value (~-100 to +100) to a normalised
 * value in [-1, +1].
 *
 * - Values at or beyond ±100 are clamped to ±1.
 * - 0 maps to 0.
 * - Linear interpolation between those bounds.
 */
export function normalizeAffinity(displayAffinity: number): number {
  const clamped = clamp(displayAffinity, -100, 100);
  return clamped / 100;
}
