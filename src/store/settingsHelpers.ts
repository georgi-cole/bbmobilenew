import { loadSettings } from './settingsSlice';

/** Default cast / roster size used when no valid persisted value exists. */
export const DEFAULT_ROSTER_SIZE = 12;

/**
 * Read the configured cast size from persisted settings.
 * Coerces to a number, clamps to [4, 16], and falls back to DEFAULT_ROSTER_SIZE.
 */
export function getConfiguredCastSize(): number {
  const raw = loadSettings().gameUX.castSize;
  if (!Number.isFinite(raw)) return DEFAULT_ROSTER_SIZE;
  return Math.min(16, Math.max(4, Math.floor(raw)));
}
