import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectSettings,
  setAudio,
  setDisplay,
  setGameUX,
  type ThemePreset,
} from '../../store/settingsSlice';
import './Settings.css';

const THEME_PRESETS: { id: ThemePreset; label: string; swatch: string }[] = [
  { id: 'midnight', label: 'Midnight', swatch: '#6366f1' },
  { id: 'neon',     label: 'Neon',     swatch: '#22d3ee' },
  { id: 'sunset',   label: 'Sunset',   swatch: '#f97316' },
  { id: 'ocean',    label: 'Ocean',    swatch: '#0ea5e9' },
];

export default function Settings() {
  const dispatch   = useAppDispatch();
  const navigate   = useNavigate();
  const settings   = useAppSelector(selectSettings);

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

      <div className="settings-content">

        {/* ── Audio ─────────────────────────────────────────────────────── */}
        <section className="settings-section">
          <p className="settings-section__heading">🔊 Audio</p>

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

        {/* ── Theme ─────────────────────────────────────────────────────── */}
        <section className="settings-section">
          <p className="settings-section__heading">🎨 Theme</p>
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
        </section>

        {/* ── Accessibility ─────────────────────────────────────────────── */}
        <section className="settings-section">
          <p className="settings-section__heading">♿ Accessibility</p>

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
            <label className="settings-row__label">Reduce Motion</label>
            <input
              type="checkbox"
              className="settings-toggle"
              checked={settings.display.reduceMotion}
              onChange={(e) => dispatch(setDisplay({ reduceMotion: e.target.checked }))}
              aria-label="Toggle reduce motion"
            />
          </div>
        </section>

        {/* ── Feedback ──────────────────────────────────────────────────── */}
        <section className="settings-section">
          <p className="settings-section__heading">📳 Feedback</p>

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
        </section>

      </div>
    </div>
  );
}
