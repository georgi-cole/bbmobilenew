// src/store/saveStatePersistence.ts
//
// Per-profile manual save snapshots for in-progress seasons.
// Separate from season archives (which store completed seasons).
//
// Key behaviours:
//  - Each profile can keep one Classic and one Survivor run side by side.
//  - Guest mode never writes or reads snapshots.
//  - Stale/invalid snapshots are silently discarded on load.
//  - Legacy single-slot saves are migrated into the Classic slot on read.

import type { GameState } from '../types';
import type { GameMode } from '../modes/modeTypes';
import { normalizeGameMode } from '../modes/gameModes';
import { isSurvivorRunTerminal } from '../modes/survivorRun';
import type { FinaleState } from './finaleSlice';
import type { SocialState } from '../social/types';

/** Prefix for per-profile saved-season localStorage keys. */
export const SAVED_STATE_KEY_PREFIX = 'bbmobilenew:savedSeason:';
export const SAVED_RUNS_KEY_PREFIX = 'bbmobilenew:savedRuns:';

/** Shape of what we persist for a manual season save. */
export interface SavedSeasonSnapshot {
  /** Snapshot format version - bump when the shape changes incompatibly. */
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

export interface SavedRunProfileStats {
  maxSurvivorDaysSurvived: number;
}

export interface SavedRunProfile {
  version: 2;
  profileId: string;
  savedAt: string;
  activeRunId: string | null;
  lastPlayedRunId: string | null;
  runs: Partial<Record<GameMode, SavedSeasonSnapshot>>;
  stats: SavedRunProfileStats;
}

/** Build the localStorage key for a specific profile's saved-season snapshot. */
export function savedStateKeyForProfile(profileId: string): string {
  return `${SAVED_STATE_KEY_PREFIX}${encodeURIComponent(profileId)}`;
}

export function savedRunsKeyForProfile(profileId: string): string {
  return `${SAVED_RUNS_KEY_PREFIX}${encodeURIComponent(profileId)}`;
}

function emptySavedRunProfile(profileId: string): SavedRunProfile {
  return {
    version: 2,
    profileId,
    savedAt: new Date(0).toISOString(),
    activeRunId: null,
    lastPlayedRunId: null,
    runs: {},
    stats: { maxSurvivorDaysSurvived: 0 },
  };
}

function getRunId(snapshot: SavedSeasonSnapshot | undefined): string | null {
  return snapshot?.game.runId ?? snapshot?.game.gameId ?? null;
}

function isRunSnapshotResumable(snapshot: SavedSeasonSnapshot | undefined): snapshot is SavedSeasonSnapshot {
  if (!snapshot) return false;
  if (isSurvivorRunTerminal(snapshot.game)) return false;
  return snapshot.game.status !== 'completed' && snapshot.game.status !== 'failed';
}

function getSurvivorBestDay(snapshot: SavedSeasonSnapshot | undefined): number {
  if (!snapshot || snapshot.game.mode !== 'survivor') return 0;
  const modeSpecific = snapshot.game.modeSpecific?.kind === 'survivor'
    ? snapshot.game.modeSpecific
    : null;
  return Math.max(snapshot.game.week ?? 1, modeSpecific?.bestDayReached ?? 1, modeSpecific?.currentDay ?? 1);
}

function coerceSnapshot(raw: unknown, profileId: string): SavedSeasonSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<SavedSeasonSnapshot>;
  if (parsed.version !== 1) return null;
  if (parsed.profileId !== profileId || !parsed.savedAt || !parsed.game || !parsed.finale || !parsed.social) {
    return null;
  }
  return parsed as SavedSeasonSnapshot;
}

function normalizeRunProfile(profileId: string, parsed: Partial<SavedRunProfile>): SavedRunProfile | null {
  if (parsed.version !== 2 || parsed.profileId !== profileId) return null;
  const classic = coerceSnapshot(parsed.runs?.classic, profileId) ?? undefined;
  const survivor = coerceSnapshot(parsed.runs?.survivor, profileId) ?? undefined;
  const resumableClassic = isRunSnapshotResumable(classic) ? classic : undefined;
  const resumableSurvivor = isRunSnapshotResumable(survivor) ? survivor : undefined;
  const maxSurvivorDaysSurvived = Math.max(
    typeof parsed.stats?.maxSurvivorDaysSurvived === 'number' ? parsed.stats.maxSurvivorDaysSurvived : 0,
    getSurvivorBestDay(survivor),
  );
  return {
    version: 2,
    profileId,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    activeRunId: typeof parsed.activeRunId === 'string' ? parsed.activeRunId : null,
    lastPlayedRunId: typeof parsed.lastPlayedRunId === 'string' ? parsed.lastPlayedRunId : null,
    runs: {
      ...(resumableClassic ? { classic: resumableClassic } : {}),
      ...(resumableSurvivor ? { survivor: resumableSurvivor } : {}),
    },
    stats: { maxSurvivorDaysSurvived },
  };
}

/**
 * Persist a season snapshot to localStorage.
 * Returns `true` on success, `false` if storage is unavailable or quota exceeded.
 */
export function saveSeasonSnapshot(key: string, snapshot: SavedSeasonSnapshot): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch {
    // Storage unavailable or quota exceeded.
    return false;
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

export function loadSavedRunProfile(profileId: string): SavedRunProfile {
  const key = savedRunsKeyForProfile(profileId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedRunProfile>;
      const normalized = normalizeRunProfile(profileId, parsed);
      if (normalized) return normalized;
    }
  } catch {
    // Fall through to legacy migration.
  }

  const legacy = loadSeasonSnapshot(savedStateKeyForProfile(profileId));
  if (legacy && legacy.profileId === profileId) {
    return {
      ...emptySavedRunProfile(profileId),
      savedAt: legacy.savedAt,
      activeRunId: getRunId(legacy),
      lastPlayedRunId: getRunId(legacy),
      runs: { classic: { ...legacy, game: { ...legacy.game, mode: 'classic' } } },
    };
  }

  return emptySavedRunProfile(profileId);
}

export function saveRunProfile(profile: SavedRunProfile): boolean {
  try {
    localStorage.setItem(savedRunsKeyForProfile(profile.profileId), JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function saveRunSnapshot(profileId: string, snapshot: SavedSeasonSnapshot): boolean {
  const mode = normalizeGameMode(snapshot.game.mode);
  const current = loadSavedRunProfile(profileId);
  const runId = getRunId(snapshot);
  const survivorBest = mode === 'survivor'
    ? Math.max(current.stats.maxSurvivorDaysSurvived, getSurvivorBestDay(snapshot))
    : current.stats.maxSurvivorDaysSurvived;
  const nextRuns = { ...current.runs };
  const resumable = isRunSnapshotResumable(snapshot);
  if (resumable) {
    nextRuns[mode] = snapshot;
  } else {
    delete nextRuns[mode];
  }
  const next: SavedRunProfile = {
    ...current,
    savedAt: snapshot.savedAt,
    activeRunId: resumable ? runId : null,
    lastPlayedRunId: resumable ? runId : current.lastPlayedRunId,
    runs: nextRuns,
    stats: {
      ...current.stats,
      maxSurvivorDaysSurvived: survivorBest,
    },
  };
  return saveRunProfile(next);
}

export function getSavedRun(profileId: string, mode: GameMode): SavedSeasonSnapshot | null {
  return loadSavedRunProfile(profileId).runs[mode] ?? null;
}

export function getLastPlayedRun(profileId: string): SavedSeasonSnapshot | null {
  const profile = loadSavedRunProfile(profileId);
  const runs = Object.values(profile.runs).filter(Boolean) as SavedSeasonSnapshot[];
  if (profile.lastPlayedRunId) {
    const match = runs.find((snapshot) => getRunId(snapshot) === profile.lastPlayedRunId);
    if (match) return match;
  }
  return runs.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0] ?? null;
}

export function clearSavedRun(profileId: string, mode: GameMode): void {
  const current = loadSavedRunProfile(profileId);
  const nextRuns = { ...current.runs };
  delete nextRuns[mode];
  const removedRunId = getRunId(current.runs[mode]);
  saveRunProfile({
    ...current,
    runs: nextRuns,
    activeRunId: current.activeRunId === removedRunId ? null : current.activeRunId,
    lastPlayedRunId: current.lastPlayedRunId === removedRunId ? null : current.lastPlayedRunId,
    savedAt: new Date().toISOString(),
  });
}

/** Remove a season snapshot from localStorage. */
export function clearSeasonSnapshot(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
