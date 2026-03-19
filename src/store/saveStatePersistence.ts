// src/store/saveStatePersistence.ts
//
// Per-profile manual save snapshots for in-progress seasons.
// Separate from season archives (which store completed seasons).
//
// Key behaviours:
//  - Each profile has at most one in-progress save at a time.
//  - Guest mode never writes or reads snapshots.
//  - Stale/invalid snapshots are silently discarded on load.

import type { GameState } from '../types';
import type { FinaleState } from './finaleSlice';
import type { SocialState } from '../social/types';

/** Prefix for per-profile saved-season localStorage keys. */
export const SAVED_STATE_KEY_PREFIX = 'bbmobilenew:savedSeason:';

/** Shape of what we persist for a manual season save. */
export interface SavedSeasonSnapshot {
  /** Snapshot format version — bump when the shape changes incompatibly. */
  version: 1;
  /** Profile ID that created this snapshot (cross-profile safety check). */
  profileId: string;
  /** ISO timestamp when the snapshot was taken. */
  savedAt: string;
  /** Full game-slice state at the time of save. */
  game: GameState;
  /** Finale-slice state at the time of save. */
  finale: FinaleState;
  /** Social-slice state at the time of save. */
  social: SocialState;
}

/** Build the localStorage key for a specific profile's saved-season snapshot. */
export function savedStateKeyForProfile(profileId: string): string {
  return `${SAVED_STATE_KEY_PREFIX}${encodeURIComponent(profileId)}`;
}

/**
 * Persist a season snapshot to localStorage.
 * Silently swallows errors (quota exceeded, private-browsing, etc.).
 */
export function saveSeasonSnapshot(key: string, snapshot: SavedSeasonSnapshot): void {
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable or quota exceeded — ignore.
  }
}

/**
 * Load a season snapshot from localStorage.
 * Returns null when the key is absent, the data is unparseable, or the version
 * does not match (indicating an incompatible format change).
 */
export function loadSeasonSnapshot(key: string): SavedSeasonSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSeasonSnapshot>;
    // Basic structural validation.
    if (parsed.version !== 1) return null;
    if (!parsed.profileId || !parsed.savedAt || !parsed.game || !parsed.finale || !parsed.social) {
      return null;
    }
    return parsed as SavedSeasonSnapshot;
  } catch {
    return null;
  }
}

/** Remove a season snapshot from localStorage. */
export function clearSeasonSnapshot(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
