import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

const STORAGE_KEY = 'bbmobilenew_settings_v1';

export type ThemePreset = 'midnight' | 'neon' | 'sunset' | 'ocean';

export interface SettingsState {
  audio: {
    musicOn: boolean;
    sfxOn: boolean;
    musicVolume: number; // 0–1
    sfxVolume: number;   // 0–1
  };
  display: {
    themePreset: ThemePreset;
    reduceMotion: boolean;
    highContrast: boolean;
  };
  gameUX: {
    confirmMajorActions: boolean;
    showTooltips: boolean;
    compactRoster: boolean;
    useHaptics: boolean;
    animations: boolean;
    spectatorMode: boolean;
    castSize: number;
  };
  sim: {
    enableJuryHouse: boolean;
    enableFanFavorite: boolean;
    enableTwists: boolean;
    allowSelfEvict: boolean;
  };
}

export const DEFAULT_SETTINGS: SettingsState = {
  audio: {
    musicOn: true,
    sfxOn: true,
    musicVolume: 0.7,
    sfxVolume: 0.8,
  },
  display: {
    themePreset: 'midnight',
    reduceMotion: false,
    highContrast: false,
  },
  gameUX: {
    confirmMajorActions: true,
    showTooltips: true,
    compactRoster: false,
    useHaptics: true,
    animations: true,
    spectatorMode: false,
    castSize: 12,
  },
  sim: {
    enableJuryHouse: false,
    enableFanFavorite: false,
    enableTwists: false,
    allowSelfEvict: false,
  },
};

// ── localStorage helpers ──────────────────────────────────────────────────────

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    // Deep-merge to preserve new defaults when schema is extended
    return {
      audio:   { ...DEFAULT_SETTINGS.audio,   ...parsed.audio },
      display: { ...DEFAULT_SETTINGS.display, ...parsed.display },
      gameUX:  { ...DEFAULT_SETTINGS.gameUX,  ...parsed.gameUX },
      sim:     { ...DEFAULT_SETTINGS.sim,     ...parsed.sim },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(state: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore write errors (e.g. private browsing quota)
  }
}

export function clearSettingsStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Slice ─────────────────────────────────────────────────────────────────────

const settingsSlice = createSlice({
  name: 'settings',
  initialState: DEFAULT_SETTINGS,
  reducers: {
    setAudio(state, action: PayloadAction<Partial<SettingsState['audio']>>) {
      Object.assign(state.audio, action.payload);
    },
    setDisplay(state, action: PayloadAction<Partial<SettingsState['display']>>) {
      Object.assign(state.display, action.payload);
    },
    setGameUX(state, action: PayloadAction<Partial<SettingsState['gameUX']>>) {
      Object.assign(state.gameUX, action.payload);
    },
    setSim(state, action: PayloadAction<Partial<SettingsState['sim']>>) {
      Object.assign(state.sim, action.payload);
    },
    resetSettings() {
      return DEFAULT_SETTINGS;
    },
    importSettings(_state, action: PayloadAction<SettingsState>) {
      return action.payload;
    },
  },
});

export const { setAudio, setDisplay, setGameUX, setSim, resetSettings, importSettings } =
  settingsSlice.actions;

export const selectSettings = (state: RootState) => state.settings;

export default settingsSlice.reducer;
