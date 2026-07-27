import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import type { CompSelectionPayload } from '../components/compSelectionUtils'

export const STORAGE_KEY = 'bbmobilenew_settings_v1'

export type ThemePreset = 'midnight' | 'neon' | 'sunset' | 'ocean'

export interface SettingsState {
  audio: {
    musicOn: boolean
    sfxOn: boolean
    musicVolume: number // 0–1
    sfxVolume: number // 0–1
  }
  display: {
    themePreset: ThemePreset
    reduceMotion: boolean
    highContrast: boolean
  }
  gameUX: {
    confirmMajorActions: boolean
    showTooltips: boolean
    compactRoster: boolean
    houseFeed: boolean
    useHaptics: boolean
    animations: boolean
    spectatorMode: boolean
    /** Enables richer, context-driven social simulation and reactions. */
    dramaMode: boolean
    /** Persistent entitlement bypass set only by hidden Advanced Settings. */
    dramaModeAdminOverride: boolean
    castSize: number
    /** Comp Selection configuration: which games are eligible, optional weekly draw limit, and category filter. */
    compSelection: CompSelectionPayload
  }
  sim: {
    /** Enables the public-influence ruleset (3rd nominee + pre-veto public save). */
    publicMode: boolean
    /** Persistent entitlement bypass set only by hidden Advanced Settings. */
    publicModeAdminOverride: boolean
    enableJuryHouse: boolean
    enableFanFavorite: boolean
    enableTwists: boolean
    allowSelfEvict: boolean
    /** Probability (0–100) that the Battle Back twist activates after an eligible eviction. */
    battleBackChance: number
    /** Probability (0–100) that a special safety twist activates after the POS winner is revealed on eligible weeks (after ≥5 evictions, with more than 5 players still in, and only if no other twist has already fired via `twistActivatedThisWeek`). */
    specialSafetyChance: number
    /** Probability (0–100) that a Double Eviction activates on each eligible week (after 5 evictions, above final 5). */
    doubleEvictionChance: number
    /** Probability (0–100) that a random day-start shock eliminates an active housemate before the LOH flow begins. */
    dayStartShockChance: number
    /** When true, show the "Public's Favorite Player" vote after the finale winner reveal. */
    enableFavoritePlayer: boolean
    /** Cash prize (USD) awarded to the Public's Favorite Player winner. */
    favoritePlayerAwardAmount: number
    /**
     * DEBUG/TESTING ONLY — overrides the secret mission trigger chance for all eligible days.
     * Set to 100 to guarantee a trigger on Day 5; set to 0 to prevent any trigger.
     * Set to null to use the default per-day chances from the trigger table.
     * Remove or ignore this field in production builds.
     */
    secretMissionTriggerOverride: number | null
    /**
     * DEBUG/TESTING ONLY — force the secret mission to trigger on an exact week.
     * Set to null to disable. When set, this takes precedence over the percent
     * override and the mission will trigger on that exact week_start entry.
     */
    secretMissionTriggerWeekOverride: number | null
  }
  visual: {
    /** Allow pinch-to-zoom on touch devices. Default false (fixed layout). */
    enableZoom: boolean
  }
}

function isLegacyEmptyUserSelection(compSelection?: Partial<CompSelectionPayload>): boolean {
  return (
    compSelection?.mode === 'user-selection' &&
    (compSelection.selectedGameId ?? '') === '' &&
    (compSelection.selectedGameIds?.length ?? 0) === 0 &&
    (compSelection.enabledIds?.length ?? 0) === 0 &&
    (compSelection.weeklyLimit ?? null) === null &&
    (compSelection.filterCategory ?? null) === null
  )
}

function normalizeCompSelection(
  compSelection?: Partial<CompSelectionPayload>
): CompSelectionPayload {
  const merged: CompSelectionPayload = {
    ...DEFAULT_SETTINGS.gameUX.compSelection,
    ...(compSelection ?? {}),
  }

  if (compSelection?.mode === undefined || isLegacyEmptyUserSelection(compSelection)) {
    merged.mode = 'unique'
  }

  return merged
}

function normalizeGameUX(gameUX?: Partial<SettingsState['gameUX']>): SettingsState['gameUX'] {
  const legacyCompactRosterLayout = (gameUX as { compactRosterLayout?: unknown } | undefined)
    ?.compactRosterLayout
  const merged = { ...DEFAULT_SETTINGS.gameUX, ...(gameUX ?? {}) }
  merged.compSelection = normalizeCompSelection(gameUX?.compSelection)
  if (legacyCompactRosterLayout === 'small') {
    merged.compactRoster = true
  }
  return merged
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
    houseFeed: false,
    useHaptics: true,
    animations: true,
    spectatorMode: true,
    dramaMode: false,
    dramaModeAdminOverride: false,
    castSize: 16,
    compSelection: {
      mode: 'unique' as const,
      enabledIds: [],
      weeklyLimit: null,
      filterCategory: null,
    },
  },
  sim: {
    publicMode: false,
    publicModeAdminOverride: false,
    enableJuryHouse: false,
    enableFanFavorite: true,
    enableTwists: true,
    allowSelfEvict: false,
    battleBackChance: 85,
    specialSafetyChance: 75,
    doubleEvictionChance: 35,
    dayStartShockChance: 1,
    enableFavoritePlayer: true,
    favoritePlayerAwardAmount: 25000,
    // DEBUG/TESTING ONLY — null means default per-day chances are used.
    secretMissionTriggerOverride: null,
    // DEBUG/TESTING ONLY — null means no forced trigger week is set.
    secretMissionTriggerWeekOverride: null,
  },
  visual: {
    enableZoom: false,
  },
}

type LegacySimSettings = Partial<SettingsState['sim']> & {
  /** Backwards-compatibility key used before the special-safety rename. */
  specialVetoChance?: number
}

// ── localStorage helpers ──────────────────────────────────────────────────────

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SettingsState>
    const mergedGameUX = normalizeGameUX(parsed.gameUX)
    const parsedSim = parsed.sim as LegacySimSettings | undefined
    const normalizedSim: Partial<SettingsState['sim']> = parsedSim
      ? (({ specialVetoChance: legacyVetoChance, ...rest }) => ({
          ...rest,
          ...(parsedSim.specialSafetyChance === undefined && typeof legacyVetoChance === 'number'
            ? { specialSafetyChance: legacyVetoChance }
            : {}),
        }))(parsedSim)
      : {}
    const mergedSim = { ...DEFAULT_SETTINGS.sim, ...normalizedSim }
    return {
      audio: { ...DEFAULT_SETTINGS.audio, ...parsed.audio },
      display: { ...DEFAULT_SETTINGS.display, ...parsed.display },
      gameUX: mergedGameUX,
      sim: mergedSim,
      visual: { ...DEFAULT_SETTINGS.visual, ...parsed.visual },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(state: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore write errors (e.g. private browsing quota)
  }
}

export function clearSettingsStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
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
      Object.assign(state.audio, action.payload)
    },
    setDisplay(state, action: PayloadAction<Partial<SettingsState['display']>>) {
      Object.assign(state.display, action.payload)
    },
    setGameUX(state, action: PayloadAction<Partial<SettingsState['gameUX']>>) {
      Object.assign(state.gameUX, action.payload)
      if (action.payload.compSelection !== undefined) {
        state.gameUX.compSelection = normalizeCompSelection(action.payload.compSelection)
      }
    },
    setSim(state, action: PayloadAction<Partial<SettingsState['sim']>>) {
      Object.assign(state.sim, action.payload)
    },
    setVisual(state, action: PayloadAction<Partial<SettingsState['visual']>>) {
      Object.assign(state.visual, action.payload)
    },
    resetSettings() {
      return DEFAULT_SETTINGS
    },
    importSettings(_state, action: PayloadAction<SettingsState>) {
      return {
        audio: { ...DEFAULT_SETTINGS.audio, ...action.payload.audio },
        display: { ...DEFAULT_SETTINGS.display, ...action.payload.display },
        gameUX: normalizeGameUX(action.payload.gameUX),
        sim: { ...DEFAULT_SETTINGS.sim, ...action.payload.sim },
        visual: { ...DEFAULT_SETTINGS.visual, ...action.payload.visual },
      }
    },
  },
})

export const { setAudio, setDisplay, setGameUX, setSim, setVisual, resetSettings, importSettings } =
  settingsSlice.actions

export const selectSettings = (state: RootState) => state.settings

export default settingsSlice.reducer
