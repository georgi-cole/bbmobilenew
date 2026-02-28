import type { SeasonArchive } from './seasonArchive';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Set to `false` to disable localStorage persistence entirely.
 * When false, `saveSeasonArchives` is a no-op and `loadSeasonArchives`
 * always returns undefined — making it easy to replace with a server-backed
 * persistence layer without touching call-sites.
 */
export const enabled = true;

export const DEFAULT_ARCHIVE_KEY = 'bbmobilenew:seasonArchives';

// ─── Persistence helpers ──────────────────────────────────────────────────────

/**
 * Persist `archives` to localStorage under `key`.
 * Silently swallows errors (quota exceeded, private-browsing restrictions, etc.)
 * so the calling code never has to guard against storage failures.
 */
export function saveSeasonArchives(key: string, archives: SeasonArchive[]): void {
  if (!enabled) return;
  try {
    localStorage.setItem(key, JSON.stringify(archives));
  } catch {
    // Storage unavailable or quota exceeded — ignore.
  }
}

/**
 * Load season archives from localStorage under `key`.
 * Returns `undefined` when persistence is disabled, the key is not present,
 * or the stored value cannot be parsed as JSON.
 */
export function loadSeasonArchives(key: string): SeasonArchive[] | undefined {
  if (!enabled) return undefined;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as SeasonArchive[];
  } catch {
    return undefined;
  }
}
