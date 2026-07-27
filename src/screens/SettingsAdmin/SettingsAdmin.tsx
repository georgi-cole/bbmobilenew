import { useState, useEffect, useCallback } from 'react'
import { buildViewportMetaContent } from '../../components/layout/viewportMeta'
import { useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  selectSettings,
  setAudio,
  setDisplay,
  setGameUX,
  setSim,
  setVisual,
  type ThemePreset,
} from '../../store/settingsSlice'
import CompSelection from '../../components/CompSelection'
import type { CompGame, CompSelectionPayload } from '../../components/compSelectionUtils'
import { getAllGames, type GameCategory } from '../../minigames/registry'
import { restartApp } from '../../utils/restartApp'
import { APP_VERSION } from '../../appVersion'
import './SettingsAdmin.css'

/** Maps the minigame registry GameCategory to the CompGame category vocabulary. */
function registryCategoryToCompCategory(category: GameCategory): CompGame['category'] {
  switch (category) {
    case 'arcade':
      return 'physical'
    case 'endurance':
      return 'endurance'
    case 'logic':
      return 'mental'
    case 'trivia':
      return 'mental'
  }
}

const REGISTRY_CATEGORY_ICONS: Record<GameCategory, string> = {
  arcade: '🕹️',
  endurance: '⏱️',
  logic: '🧩',
  trivia: '❓',
}

/** Builds the CompGame list from the in-repo minigame registry. */
function buildCompGamesFromRegistry(): CompGame[] {
  return getAllGames()
    .filter((g) => !g.retired)
    .map((g) => ({
      id: g.key,
      name: g.title,
      icon: REGISTRY_CATEGORY_ICONS[g.category],
      category: registryCategoryToCompCategory(g.category),
      enabled: true,
    }))
}

type Tab = 'audio' | 'display' | 'gameux' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: '🔊 Audio' },
  { id: 'display', label: '🎨 Display' },
  { id: 'gameux', label: '🎮 Game UX' },
  { id: 'about', label: 'ℹ️ About' },
]

const THEME_PRESETS: { id: ThemePreset; label: string; swatch: string }[] = [
  { id: 'midnight', label: 'Midnight', swatch: '#6366f1' },
  { id: 'neon', label: 'Neon', swatch: '#22d3ee' },
  { id: 'sunset', label: 'Sunset', swatch: '#f97316' },
  { id: 'ocean', label: 'Ocean', swatch: '#0ea5e9' },
]

export default function SettingsAdmin() {
  const [activeTab, setActiveTab] = useState<Tab>('audio')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const settings = useAppSelector(selectSettings)
  const [castSizeInput, setCastSizeInput] = useState<string>(String(settings.gameUX.castSize))
  const [showRestartModal, setShowRestartModal] = useState(false)

  // Migrate values enabled by earlier Advanced Settings implementations.
  useEffect(() => {
    if (settings.gameUX.dramaMode && !settings.gameUX.dramaModeAdminOverride) {
      dispatch(setGameUX({ dramaModeAdminOverride: true }))
    }
    if (settings.sim.publicMode && !settings.sim.publicModeAdminOverride) {
      dispatch(setSim({ publicModeAdminOverride: true }))
    }
  }, [
    dispatch,
    settings.gameUX.dramaMode,
    settings.gameUX.dramaModeAdminOverride,
    settings.sim.publicMode,
    settings.sim.publicModeAdminOverride,
  ])

  // Stable fetchGames callback for CompSelection — builds list from registry once.
  const fetchGames = useCallback(() => Promise.resolve(buildCompGamesFromRegistry()), [])

  // Persist comp selection changes immediately via setGameUX.
  const handleCompSelectionChange = useCallback(
    (payload: CompSelectionPayload) => {
      const mergedCompSelection = {
        ...settings.gameUX.compSelection,
        ...payload,
      }
      dispatch(setGameUX({ compSelection: mergedCompSelection }))
    },
    [dispatch, settings.gameUX.compSelection]
  )

  /**
   * Commit any pending cast-size input to Redux and return the committed value.
   * Called before save/restart checks so the user does not need to blur the
   * numeric input for changes to be detected or applied.
   */
  const commitCastSizeInput = (): number => {
    const parsed = parseInt(castSizeInput, 10)
    const clamped = isNaN(parsed) ? settings.gameUX.castSize : Math.min(16, Math.max(4, parsed))
    setCastSizeInput(String(clamped))
    if (clamped !== settings.gameUX.castSize) {
      dispatch(setGameUX({ castSize: clamped }))
    }
    return clamped
  }

  const handleSave = () => {
    commitCastSizeInput()
    setShowRestartModal(true)
  }

  const handleRestartNow = () => {
    setShowRestartModal(false)
    restartApp('#/game')
  }

  const handleNotNow = () => {
    setShowRestartModal(false)
  }

  // Keep the viewport meta tag in sync with the enableZoom setting.
  const enableZoom = settings.visual?.enableZoom ?? false
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (meta) {
      meta.content = buildViewportMetaContent(enableZoom)
    }
  }, [enableZoom])

  return (
    <div className="settings-screen">
      <header className="settings-screen__header">
        <button className="settings-screen__back" onClick={() => navigate(-1)} aria-label="Go back">
          ←
        </button>
        <h1 className="settings-screen__title">⚙️ Settings</h1>
      </header>

      {/* Tab bar */}
      <nav className="settings-tabs" role="tablist" aria-label="Settings tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab panels */}
      <div className="settings-content" role="tabpanel">
        {/* ── Audio ─────────────────────────────────────────────────────── */}
        {activeTab === 'audio' && (
          <section className="settings-section">
            <div className="settings-row">
              <label className="settings-row__label">Music</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.audio.musicOn}
                onChange={(e) => dispatch(setAudio({ musicOn: e.target.checked }))}
                aria-label="Toggle music"
              />
            </div>

            <div className="settings-row settings-row--col">
              <label className="settings-row__label">
                Music Volume — {Math.round(settings.audio.musicVolume * 100)}%
              </label>
              <input
                type="range"
                className="settings-slider"
                min={0}
                max={1}
                step={0.05}
                value={settings.audio.musicVolume}
                onChange={(e) => dispatch(setAudio({ musicVolume: parseFloat(e.target.value) }))}
                disabled={!settings.audio.musicOn}
                aria-label="Music volume"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Sound Effects</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.audio.sfxOn}
                onChange={(e) => dispatch(setAudio({ sfxOn: e.target.checked }))}
                aria-label="Toggle sound effects"
              />
            </div>

            <div className="settings-row settings-row--col">
              <label className="settings-row__label">
                SFX Volume — {Math.round(settings.audio.sfxVolume * 100)}%
              </label>
              <input
                type="range"
                className="settings-slider"
                min={0}
                max={1}
                step={0.05}
                value={settings.audio.sfxVolume}
                onChange={(e) => dispatch(setAudio({ sfxVolume: parseFloat(e.target.value) }))}
                disabled={!settings.audio.sfxOn}
                aria-label="SFX volume"
              />
            </div>
          </section>
        )}

        {/* ── Display ───────────────────────────────────────────────────── */}
        {activeTab === 'display' && (
          <section className="settings-section">
            <p className="settings-section__heading">Theme</p>
            <div className="settings-theme-grid">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`settings-theme-btn ${settings.display.themePreset === preset.id ? 'settings-theme-btn--active' : ''}`}
                  onClick={() => dispatch(setDisplay({ themePreset: preset.id }))}
                  aria-pressed={settings.display.themePreset === preset.id}
                >
                  <span
                    className="settings-theme-swatch"
                    style={{ background: preset.swatch }}
                    aria-hidden="true"
                  />
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Reduce Motion</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.display.reduceMotion}
                onChange={(e) => dispatch(setDisplay({ reduceMotion: e.target.checked }))}
                aria-label="Toggle reduce motion"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">High Contrast</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.display.highContrast}
                onChange={(e) => dispatch(setDisplay({ highContrast: e.target.checked }))}
                aria-label="Toggle high contrast"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Extra zoom range</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.visual?.enableZoom ?? false}
                onChange={(e) => dispatch(setVisual({ enableZoom: e.target.checked }))}
                aria-label="Toggle extra zoom range"
              />
            </div>
          </section>
        )}

        {/* ── Game UX ───────────────────────────────────────────────────── */}
        {activeTab === 'gameux' && (
          <section className="settings-section">
            <div className="settings-row">
              <label className="settings-row__label">Confirm Major Actions</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.gameUX.confirmMajorActions}
                onChange={(e) => dispatch(setGameUX({ confirmMajorActions: e.target.checked }))}
                aria-label="Toggle confirm major actions"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Show Tooltips</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.gameUX.showTooltips}
                onChange={(e) => dispatch(setGameUX({ showTooltips: e.target.checked }))}
                aria-label="Toggle show tooltips"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Compact mode</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.gameUX.compactRoster}
                onChange={(e) => dispatch(setGameUX({ compactRoster: e.target.checked }))}
                aria-label="Toggle compact mode"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Haptic Feedback</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.gameUX.useHaptics}
                onChange={(e) => dispatch(setGameUX({ useHaptics: e.target.checked }))}
                aria-label="Toggle haptic feedback"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Animations</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.gameUX.animations}
                onChange={(e) => dispatch(setGameUX({ animations: e.target.checked }))}
                aria-label="Toggle animations"
              />
            </div>

            <div className="settings-row settings-row--col">
              <div className="settings-row settings-row--nested">
                <label className="settings-row__label">Drama Mode</label>
                <input
                  type="checkbox"
                  className="settings-toggle"
                  checked={settings.gameUX.dramaMode}
                  onChange={(e) =>
                    dispatch(
                      setGameUX({
                        dramaMode: e.target.checked,
                        dramaModeAdminOverride: e.target.checked,
                      })
                    )
                  }
                  aria-label="Toggle drama mode"
                />
              </div>
              <p className="settings-helper-text">
                Unlocks richer alliances, grudges, pleas, betrayals, and strategic reactions.
              </p>
            </div>

            <div className="settings-row settings-row--col">
              <div className="settings-row">
                <label className="settings-row__label">Public Mode</label>
                <input
                  type="checkbox"
                  className="settings-toggle"
                  checked={settings.sim.publicMode}
                  onChange={(e) =>
                    dispatch(
                      setSim({
                        publicMode: e.target.checked,
                        publicModeAdminOverride: e.target.checked,
                      })
                    )
                  }
                  aria-label="Toggle public mode"
                />
              </div>
              <p className="settings-helper-text">
                Off uses the original 2-nominee rules. On enables the public-influence mode: a 3rd
                nominee is auto-added in normal weeks and the public saves one nominee before veto.
                Takes effect next season (requires restart to apply to the current run).
              </p>
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Twists</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.sim.enableTwists}
                onChange={(e) => dispatch(setSim({ enableTwists: e.target.checked }))}
                aria-label="Toggle twists"
              />
            </div>

            {settings.sim.enableTwists && (
              <div className="settings-row settings-row--col">
                <label className="settings-row__label">
                  Back 2 the Game Chance — {settings.sim.battleBackChance ?? 30}%
                </label>
                <input
                  type="range"
                  className="settings-slider"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.sim.battleBackChance ?? 30}
                  onChange={(e) => dispatch(setSim({ battleBackChance: Number(e.target.value) }))}
                  aria-label="Back 2 the Game chance percentage"
                />
                <p className="settings-helper-text">
                  Probability that a Tribunal Return twist activates after each eligible eviction
                  (requires Twists on).
                </p>
              </div>
            )}

            {settings.sim.enableTwists && (
              <div className="settings-row settings-row--col">
                <label className="settings-row__label">
                  Double Elimination Chance — {settings.sim.doubleEvictionChance ?? 35}%
                </label>
                <input
                  type="range"
                  className="settings-slider"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.sim.doubleEvictionChance ?? 35}
                  onChange={(e) =>
                    dispatch(setSim({ doubleEvictionChance: Number(e.target.value) }))
                  }
                  aria-label="Double Elimination chance percentage"
                />
                <p className="settings-helper-text">
                  Per-week chance that a Double Elimination activates (mid-season only, after 5
                  evictions and above final 5). Up to 2 per season.
                </p>
              </div>
            )}

            {settings.sim.enableTwists && (
              <div className="settings-row settings-row--col">
                <label className="settings-row__label">
                  Special Safety Chance — {settings.sim.specialSafetyChance ?? 25}%
                </label>
                <input
                  type="range"
                  className="settings-slider"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.sim.specialSafetyChance ?? 25}
                  onChange={(e) =>
                    dispatch(setSim({ specialSafetyChance: Number(e.target.value) }))
                  }
                  aria-label="Special Safety chance percentage"
                />
                <p className="settings-helper-text">
                  Per-week chance (checked during POS results, after 5 evictions, with 6+ players
                  and no Double Elimination) for a season-limited special safety power to activate.
                  Only one special safety may occur per season.
                </p>
              </div>
            )}

            {settings.sim.enableTwists && (
              <div className="settings-row settings-row--col">
                <label className="settings-row__label">
                  Morning Shock Chance — {settings.sim.dayStartShockChance ?? 1}%
                </label>
                <input
                  type="range"
                  className="settings-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.sim.dayStartShockChance ?? 1}
                  onChange={(e) =>
                    dispatch(setSim({ dayStartShockChance: Number(e.target.value) }))
                  }
                  aria-label="Morning Shock chance percentage"
                />
                <p className="settings-helper-text">
                  Chance that a Day 3+ morning shock removes an active housemate before the LOH comp
                  starts. Only fires when more than 4 housemates are still alive.
                </p>
              </div>
            )}

            {settings.sim.enableTwists && (
              <>
                <div className="settings-row">
                  <label className="settings-row__label">Public's Favorite (Public Vote)</label>
                  <input
                    type="checkbox"
                    className="settings-toggle"
                    checked={settings.sim.enableFavoritePlayer}
                    onChange={(e) => dispatch(setSim({ enableFavoritePlayer: e.target.checked }))}
                    aria-label="Toggle Public's Favorite Player vote"
                  />
                </div>

                {settings.sim.enableFavoritePlayer && (
                  <div className="settings-row settings-row--col">
                    <label className="settings-row__label">
                      Award Amount — {settings.sim.favoritePlayerAwardAmount ?? 25000} Eyeoleans
                    </label>
                    <input
                      type="number"
                      className="settings-number"
                      min={0}
                      step={1000}
                      value={settings.sim.favoritePlayerAwardAmount ?? 25000}
                      onChange={(e) =>
                        dispatch(setSim({ favoritePlayerAwardAmount: Number(e.target.value || 0) }))
                      }
                      aria-label="Public's Favorite award amount"
                    />
                    <p className="settings-helper-text">
                      Eyeolean prize awarded to the Public's Favorite Player (requires Twists on).
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ── 🧪 TESTING/DEBUG — Secret Mission Trigger Override ──────
                 This slider is for development & QA use only.
                 Remove or hide behind a build flag before shipping to live players.
                 ──────────────────────────────────────────────────────────── */}
            <p
              className="settings-section__heading"
              style={{ marginTop: '1.25rem', color: '#f97316' }}
            >
              🧪 Testing / Debug
            </p>
            <div className="settings-row settings-row--col">
              <label className="settings-row__label" style={{ color: '#f97316' }}>
                Secret Mission Trigger Override —{' '}
                {settings.sim.secretMissionTriggerOverride === null
                  ? 'Default (per-day chances)'
                  : `${settings.sim.secretMissionTriggerOverride}% (override)`}
              </label>
              <input
                type="range"
                className="settings-slider"
                min={-1}
                max={100}
                step={1}
                value={settings.sim.secretMissionTriggerOverride ?? -1}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  dispatch(setSim({ secretMissionTriggerOverride: v < 0 ? null : v }))
                }}
                aria-label="Secret mission trigger override (debug)"
              />
              <p className="settings-helper-text" style={{ color: '#f97316' }}>
                DEBUG ONLY. Set to 100 to guarantee a trigger on Day 5; set to 0 to prevent any
                trigger. Slide to the left-most position to restore default chances. Remove this
                slider before shipping to live players.
              </p>
            </div>
            <div className="settings-row settings-row--col">
              <label className="settings-row__label" style={{ color: '#f97316' }}>
                Secret Mission Force Week —{' '}
                {settings.sim.secretMissionTriggerWeekOverride === null
                  ? 'Disabled'
                  : `Week ${settings.sim.secretMissionTriggerWeekOverride}`}
              </label>
              <input
                type="range"
                className="settings-slider"
                min={0}
                max={20}
                step={1}
                value={settings.sim.secretMissionTriggerWeekOverride ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  dispatch(setSim({ secretMissionTriggerWeekOverride: v <= 0 ? null : v }))
                }}
                aria-label="Secret mission force week (debug)"
              />
              <p className="settings-helper-text" style={{ color: '#f97316' }}>
                DEBUG ONLY. Force the secret mission to trigger on an exact week_start. Set to 0 to
                disable. When set, this takes precedence over the chance slider above.
              </p>
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Spectator Mode</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.gameUX.spectatorMode}
                onChange={(e) => dispatch(setGameUX({ spectatorMode: e.target.checked }))}
                aria-label="Toggle spectator mode"
              />
            </div>

            <div className="settings-row">
              <label className="settings-row__label">Tribunal House</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.sim.enableJuryHouse}
                onChange={(e) => dispatch(setSim({ enableJuryHouse: e.target.checked }))}
                aria-label="Toggle tribunal house"
              />
            </div>

            <div className="settings-row settings-row--col">
              <label className="settings-row__label">Houseguests</label>
              <input
                type="number"
                className="settings-number"
                min={4}
                max={16}
                value={castSizeInput}
                onChange={(e) => setCastSizeInput(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(castSizeInput, 10)
                  const clamped = isNaN(parsed)
                    ? settings.gameUX.castSize
                    : Math.min(16, Math.max(4, parsed))
                  setCastSizeInput(String(clamped))
                  dispatch(setGameUX({ castSize: clamped }))
                }}
                aria-label="Cast size"
              />
              <p className="settings-helper-text">
                Choose between 4 and 16 players. Grid will show placeholders to preserve layout.
              </p>
            </div>

            {/* ── Comp Selection ─────────────────────────────────────────── */}
            <p className="settings-section__heading">Comp Selection</p>
            <CompSelection
              fetchGames={fetchGames}
              onChange={handleCompSelectionChange}
              initialPayload={settings.gameUX.compSelection}
            />

            <div className="settings-actions">
              <button className="settings-actions__save-btn" onClick={handleSave}>
                Save
              </button>
            </div>
          </section>
        )}

        {/* ── About ─────────────────────────────────────────────────────── */}
        {activeTab === 'about' && (
          <section className="settings-section settings-section--about">
            <div className="settings-about__hero" aria-hidden="true">
              📺
            </div>
            <h2 className="settings-about__name">The Big Eye</h2>
            <p className="settings-about__version">Version {APP_VERSION}</p>
            <p className="settings-about__tagline">AI Edition — React + TypeScript + Vite</p>

            <button className="settings-about__credits-btn" onClick={() => navigate('/credits')}>
              🎬 View Credits
            </button>
          </section>
        )}
      </div>

      {/* ── Restart-required settings modal ─────────────────────────────── */}
      {showRestartModal && (
        <div className="settings-restart-modal__backdrop" role="presentation">
          <div
            className="settings-restart-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restart-modal-title"
          >
            <p id="restart-modal-title" className="settings-restart-modal__msg">
              Settings saved. Restart the game now for the new settings to take effect?
            </p>
            <div className="settings-restart-modal__actions">
              <button
                className="settings-restart-modal__btn settings-restart-modal__btn--primary"
                onClick={handleRestartNow}
              >
                OK
              </button>
              <button
                className="settings-restart-modal__btn settings-restart-modal__btn--secondary"
                onClick={handleNotNow}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
