import { loadSettings, type SettingsState } from './settingsSlice';

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

/**
 * The subset of settings that require starting a new game to take effect.
 * Pure UI/audio/accessibility settings (animations, useHaptics, compactRoster,
 * audio, display, visual) are intentionally excluded — changing those never
 * triggers the restart prompt.
 * Gameplay-defining fields (castSize, spectatorMode, compSelection, sim.*) are
 * included because they affect the season structure or player roster.
 */
export type RestartRelevantSettings = {
  gameUX: Pick<SettingsState['gameUX'], 'castSize' | 'spectatorMode' | 'compSelection'>;
  sim: SettingsState['sim'];
};

/**
 * Derive a restart-relevant snapshot from a live SettingsState object.
 * Use this instead of reading from localStorage so detection always reflects
 * the current in-memory (Redux) settings state.
 */
export function getRestartRelevantSnapshotFromSettings(s: SettingsState): RestartRelevantSettings {
  return {
    gameUX: {
      castSize: s.gameUX.castSize,
      spectatorMode: s.gameUX.spectatorMode,
      compSelection: s.gameUX.compSelection,
    },
    sim: { ...s.sim },
  };
}

/**
 * Return only the game-affecting settings fields for restart-detection.
 * Reads from persisted localStorage; prefer getRestartRelevantSnapshotFromSettings
 * when a live SettingsState is available.
 */
export function getRestartRelevantSnapshot(): RestartRelevantSettings {
  return getRestartRelevantSnapshotFromSettings(loadSettings());
}
