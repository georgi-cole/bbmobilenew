// src/store/saveStatePersistence.ts
//
// Per-profile manual save snapshots for in-progress seasons.
// Separate from season archives (which store completed seasons).
//
// Key behaviours:
//  - Each profile can keep one Classic and one Survival run side by side.
//  - Guest mode never writes or reads snapshots.
//  - Stale/invalid snapshots are silently discarded on load.
//  - Legacy single-slot saves are migrated into the Classic slot on read.

import type { GameState } from '../types';
import type { GameMode, SeasonExpansionMode } from '../modes/modeTypes';
import { normalizeGameMode } from '../modes/gameModes';
import { isSurvivorRunTerminal } from '../modes/survivorRun';
import {
  applySurvivorAchievementProgress,
  getSurvivorProgressDay,
  normalizeSurvivorAchievementUnlockMap,
} from '../modes/survivorAchievements';
import type { FinaleState } from './finaleSlice';
import type { SocialState } from '../social/types';
import type { PublicOpinionState } from '../publicOpinion/types';
import type { ChallengeState } from './challengeSlice';
import type { SurvivorAchievementUnlockMap } from '../modes/survivorAchievements';

/** Prefix for per-profile saved-season localStorage keys. */
export const SAVED_STATE_KEY_PREFIX = 'bbmobilenew:savedSeason:';
export const SAVED_RUNS_KEY_PREFIX = 'bbmobilenew:savedRuns:';
export const SAVE_PERSISTENCE_ISSUE_EVENT = 'bb:save-persistence-issue';
export const CORRUPT_SAVE_RECOVERY_KEY = 'bbmobilenew:recovery:lastCorruptSave';

export type SavePersistenceIssue = {
  kind: 'write_failed' | 'corrupt_recovered';
  occurredAt: string;
};

let lastSavePersistenceIssue: SavePersistenceIssue | null = null;

function reportSavePersistenceIssue(kind: SavePersistenceIssue['kind']): void {
  if (lastSavePersistenceIssue?.kind === kind) return;
  lastSavePersistenceIssue = { kind, occurredAt: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SavePersistenceIssue>(SAVE_PERSISTENCE_ISSUE_EVENT, {
      detail: lastSavePersistenceIssue,
    }));
  }
}

export function getLastSavePersistenceIssue(): SavePersistenceIssue | null {
  return lastSavePersistenceIssue;
}

export function clearLastSavePersistenceIssue(): void {
  lastSavePersistenceIssue = null;
}

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
  /** Optional for backward compatibility with snapshots created before public-mode persistence. */
  publicOpinion?: PublicOpinionState;
  /** Restores the selected challenge; an in-progress game restarts from its rules screen. */
  challenge?: ChallengeState;
}

export interface SavedRunProfileStats {
  maxSurvivorDaysSurvived: number;
  survivorAchievementsUnlocked: SurvivorAchievementUnlockMap;
}

export type SavedRunSlot = GameMode | SeasonExpansionMode;

export interface SavedRunProfile {
  version: 2;
  profileId: string;
  savedAt: string;
  activeRunId: string | null;
  lastPlayedRunId: string | null;
  runs: Partial<Record<SavedRunSlot, SavedSeasonSnapshot>>;
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
    stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
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

/** Resolve the independent save slot for a run without confusing organic Cupid with its menu expansion. */
export function getSavedRunSlot(game: GameState): SavedRunSlot {
  if (normalizeGameMode(game.mode) === 'survival') return 'survival';
  if (game.expansionMode === 'cupidArrow' || game.expansionMode === 'voxPopuli') {
    return game.expansionMode;
  }
  return 'classic';
}

function coerceSnapshot(raw: unknown, profileId: string): SavedSeasonSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<SavedSeasonSnapshot>;
  if (parsed.version !== 1) return null;
  if (parsed.profileId !== profileId || !parsed.savedAt || !parsed.game || !parsed.finale || !parsed.social) {
    return null;
  }
  const snapshot = parsed as SavedSeasonSnapshot;
  const legacyGame = snapshot.game as unknown as {
    mode?: GameMode | 'survivor';
    modeSpecific?: {
      kind?: GameMode | 'survivor';
      replacementTransition?: { mode?: GameMode | 'survivor' } | null;
    } | null;
  };
  const mode = normalizeGameMode(legacyGame.mode);
  legacyGame.mode = mode;
  if (legacyGame.modeSpecific?.kind === 'survivor') {
    legacyGame.modeSpecific.kind = 'survival';
  }
  if (legacyGame.modeSpecific?.replacementTransition?.mode === 'survivor') {
    legacyGame.modeSpecific.replacementTransition.mode = 'survival';
  }
  return snapshot;
}

function normalizeRunProfile(profileId: string, parsed: Partial<SavedRunProfile>): SavedRunProfile | null {
  if (parsed.version !== 2 || parsed.profileId !== profileId) return null;
  const runs = parsed.runs as Partial<Record<SavedRunSlot | 'survivor', SavedSeasonSnapshot>> | undefined;
  const classic = coerceSnapshot(runs?.classic, profileId) ?? undefined;
  const survivor = coerceSnapshot(runs?.survival ?? runs?.survivor, profileId) ?? undefined;
  const cupidArrow = coerceSnapshot(runs?.cupidArrow, profileId) ?? undefined;
  const voxPopuli = coerceSnapshot(runs?.voxPopuli, profileId) ?? undefined;
  const resumableClassic = isRunSnapshotResumable(classic) ? classic : undefined;
  const resumableSurvivor = isRunSnapshotResumable(survivor) ? survivor : undefined;
  const resumableCupidArrow = isRunSnapshotResumable(cupidArrow) ? cupidArrow : undefined;
  const resumableVoxPopuli = isRunSnapshotResumable(voxPopuli) ? voxPopuli : undefined;
  const maxSurvivorDaysSurvived = Math.max(
    typeof parsed.stats?.maxSurvivorDaysSurvived === 'number' ? parsed.stats.maxSurvivorDaysSurvived : 0,
    getSurvivorProgressDay(survivor?.game),
  );
  return {
    version: 2,
    profileId,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    activeRunId: typeof parsed.activeRunId === 'string' ? parsed.activeRunId : null,
    lastPlayedRunId: typeof parsed.lastPlayedRunId === 'string' ? parsed.lastPlayedRunId : null,
    runs: {
      ...(resumableClassic ? { classic: resumableClassic } : {}),
      ...(resumableSurvivor ? { survival: resumableSurvivor } : {}),
      ...(resumableCupidArrow ? { cupidArrow: resumableCupidArrow } : {}),
      ...(resumableVoxPopuli ? { voxPopuli: resumableVoxPopuli } : {}),
    },
    stats: {
      maxSurvivorDaysSurvived,
      survivorAchievementsUnlocked: normalizeSurvivorAchievementUnlockMap(
        parsed.stats?.survivorAchievementsUnlocked,
      ),
    },
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
    reportSavePersistenceIssue('write_failed');
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
    return coerceSnapshot(parsed, parsed.profileId) ?? null;
  } catch {
    return null;
  }
}

export function loadSavedRunProfile(profileId: string): SavedRunProfile {
  const key = savedRunsKeyForProfile(profileId);
  let malformedRaw: string | null = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedRunProfile>;
      const normalized = normalizeRunProfile(profileId, parsed);
      if (normalized) return normalized;
      malformedRaw = raw;
    }
  } catch {
    try {
      malformedRaw = localStorage.getItem(key);
    } catch {
      malformedRaw = null;
    }
  }

  if (malformedRaw) {
    try {
      sessionStorage.setItem(CORRUPT_SAVE_RECOVERY_KEY, malformedRaw);
      localStorage.removeItem(key);
    } catch {
      // Recovery can continue even if the damaged payload cannot be quarantined.
    }
    reportSavePersistenceIssue('corrupt_recovered');
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
    reportSavePersistenceIssue('write_failed');
    return false;
  }
}

export function saveRunSnapshot(profileId: string, snapshot: SavedSeasonSnapshot): boolean {
  const mode = normalizeGameMode(snapshot.game.mode);
  const slot = getSavedRunSlot(snapshot.game);
  const current = loadSavedRunProfile(profileId);
  const runId = getRunId(snapshot);
  const survivorBest = mode === 'survival'
    ? Math.max(current.stats.maxSurvivorDaysSurvived, getSurvivorProgressDay(snapshot.game))
    : current.stats.maxSurvivorDaysSurvived;
  const survivorAchievementsUnlocked =
    mode === 'survival'
      ? applySurvivorAchievementProgress(
          current.stats.survivorAchievementsUnlocked,
          getSurvivorProgressDay(snapshot.game),
          runId,
          snapshot.savedAt,
        ).unlocks
      : current.stats.survivorAchievementsUnlocked;
  const nextRuns = { ...current.runs };
  const resumable = isRunSnapshotResumable(snapshot);
  if (resumable) {
    nextRuns[slot] = snapshot;
  } else {
    delete nextRuns[slot];
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
      survivorAchievementsUnlocked,
    },
  };
  return saveRunProfile(next);
}

export function markSurvivorAchievementCelebrationSeen(
  profileId: string,
  achievementId: string,
): boolean {
  const current = loadSavedRunProfile(profileId);
  const unlock = current.stats.survivorAchievementsUnlocked[achievementId];
  if (!unlock || unlock.celebrationSeen) return false;

  return saveRunProfile({
    ...current,
    stats: {
      ...current.stats,
      survivorAchievementsUnlocked: {
        ...current.stats.survivorAchievementsUnlocked,
        [achievementId]: {
          ...unlock,
          celebrationSeen: true,
        },
      },
    },
  });
}

export function getSavedRun(profileId: string, slot: SavedRunSlot): SavedSeasonSnapshot | null {
  return loadSavedRunProfile(profileId).runs[slot] ?? null;
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

export function clearSavedRun(profileId: string, mode: SavedRunSlot): void {
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
