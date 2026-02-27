import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectSettings,
  setAudio,
  setDisplay,
  setGameUX,
  setSim,
  setVisual,
  type ThemePreset,
} from '../../store/settingsSlice';
import './Settings.css';

type Tab = 'audio' | 'display' | 'gameux' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio',   label: '🔊 Audio'    },
  { id: 'display', label: '🎨 Display'  },
  { id: 'gameux',  label: '🎮 Game UX'  },
  { id: 'about',   label: 'ℹ️ About'    },
];

const THEME_PRESETS: { id: ThemePreset; label: string; swatch: string }[] = [
  { id: 'midnight', label: 'Midnight', swatch: '#6366f1' },
  { id: 'neon',     label: 'Neon',     swatch: '#22d3ee' },
  { id: 'sunset',   label: 'Sunset',   swatch: '#f97316' },
  { id: 'ocean',    label: 'Ocean',    swatch: '#0ea5e9' },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('audio');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const settings = useAppSelector(selectSettings);
  const [castSizeInput, setCastSizeInput] = useState<string>(String(settings.gameUX.castSize));

  // Keep the viewport meta tag in sync with the enableZoom setting.
  const enableZoom = settings.visual?.enableZoom ?? false;
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      meta.content = enableZoom
        ? 'width=device-width, initial-scale=1.0'
        : 'width=device-width, initial-scale=1.0, user-scalable=no';
    }
  }, [enableZoom]);

  return (
    <div className="settings-screen">
      <header className="settings-screen__header">
        <button
          className="settings-screen__back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
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
              <label className="settings-row__label">Allow pinch-zoom</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.visual?.enableZoom ?? false}
                onChange={(e) => dispatch(setVisual({ enableZoom: e.target.checked }))}
                aria-label="Toggle pinch zoom"
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
              <label className="settings-row__label">Compact Roster</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.gameUX.compactRoster}
                onChange={(e) => dispatch(setGameUX({ compactRoster: e.target.checked }))}
                aria-label="Toggle compact roster"
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
                  Battle Back Chance — {settings.sim.battleBackChance ?? 30}%
                </label>
                <input
                  type="range"
                  className="settings-slider"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.sim.battleBackChance ?? 30}
                  onChange={(e) =>
                    dispatch(setSim({ battleBackChance: Number(e.target.value) }))
                  }
                  aria-label="Battle Back chance percentage"
                />
                <p className="settings-helper-text">
                  Probability that a Jury Return twist activates after each eligible eviction (requires Twists on).
                </p>
              </div>
            )}

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
              <label className="settings-row__label">Jury House</label>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.sim.enableJuryHouse}
                onChange={(e) => dispatch(setSim({ enableJuryHouse: e.target.checked }))}
                aria-label="Toggle jury house"
              />
            </div>

            <div className="settings-row settings-row--col">
              <label className="settings-row__label">
                Houseguests
              </label>
              <input
                type="number"
                className="settings-number"
                min={4}
                max={16}
                value={castSizeInput}
                onChange={(e) => setCastSizeInput(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(castSizeInput, 10);
                  const clamped = isNaN(parsed) ? settings.gameUX.castSize : Math.min(16, Math.max(4, parsed));
                  setCastSizeInput(String(clamped));
                  dispatch(setGameUX({ castSize: clamped }));
                }}
                aria-label="Cast size"
              />
              <p className="settings-helper-text">
                Choose between 4 and 16 houseguests. Grid will show placeholders to preserve layout.
              </p>
            </div>
          </section>
        )}

        {/* ── About ─────────────────────────────────────────────────────── */}
        {activeTab === 'about' && (
          <section className="settings-section settings-section--about">
            <div className="settings-about__hero" aria-hidden="true">📺</div>
            <h2 className="settings-about__name">Big Brother Mobile</h2>
            <p className="settings-about__version">Version 0.0.0</p>
            <p className="settings-about__tagline">AI Edition — React + TypeScript + Vite</p>

            <button
              className="settings-about__credits-btn"
              onClick={() => navigate('/credits')}
            >
              🎬 View Credits
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
