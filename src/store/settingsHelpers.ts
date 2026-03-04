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
 * Non-restart settings (audio, theme, accessibility) are intentionally excluded
 * so changing volume or theme never triggers the restart prompt.
 */
export type RestartRelevantSettings = {
  gameUX: Pick<SettingsState['gameUX'], 'castSize' | 'spectatorMode' | 'compactRoster' | 'animations' | 'useHaptics'>;
  sim: SettingsState['sim'];
};

/**
 * Return only the game-affecting settings fields for restart-detection.
 * Call once on Settings mount; compare via JSON.stringify on Back to detect changes.
 */
export function getRestartRelevantSnapshot(): RestartRelevantSettings {
  const s = loadSettings();
  return {
    gameUX: {
      castSize: s.gameUX.castSize,
      spectatorMode: s.gameUX.spectatorMode,
      compactRoster: s.gameUX.compactRoster,
      animations: s.gameUX.animations,
      useHaptics: s.gameUX.useHaptics,
    },
    sim: { ...s.sim },
  };
}
