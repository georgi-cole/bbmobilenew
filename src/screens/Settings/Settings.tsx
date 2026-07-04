import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { AppDispatch } from '../../store/store';
import {
  selectSettings,
  setAudio,
  setDisplay,
  setGameUX,
  type ThemePreset,
  type SettingsState,
} from '../../store/settingsSlice';
import './Settings.css';

// ── Theme options ──────────────────────────────────────────────────────────────
// To add a new theme: append an entry here AND add a matching body.theme-* CSS
// rule in Settings.css.
const THEME_OPTIONS: { value: ThemePreset; label: string }[] = [
  { value: 'midnight', label: '🌙 Midnight' },
  { value: 'neon',     label: '⚡ Neon'     },
  { value: 'sunset',   label: '🌅 Sunset'   },
  { value: 'ocean',    label: '🌊 Ocean'    },
];

// ── Setting item types ─────────────────────────────────────────────────────────
// Add a new member to this union + a matching case in renderItem() to support
// a new control type (e.g. 'number-input', 'radio-group', …).

type ToggleItem = {
  type: 'toggle';
  id: string;
  label: string;
  badge?: string;
  gated?: boolean;
  get: (s: SettingsState) => boolean;
  onChange: (dispatch: AppDispatch, val: boolean) => void;
};

type DropdownItem = {
  type: 'dropdown';
  id: string;
  label: string;
  options: { value: string; label: string }[];
  get: (s: SettingsState) => string;
  onChange: (dispatch: AppDispatch, val: string) => void;
};

type SettingItem = ToggleItem | DropdownItem;

interface SettingSection {
  id: string;
  items: SettingItem[];
}

// ── Sections config ────────────────────────────────────────────────────────────
// Edit this array to add, remove, or reorder settings sections and rows.
//
//  • New toggle row   → append a { type: 'toggle', … } entry to a section
//  • New section      → append a new SettingSection to the array
//  • New theme option → append to THEME_OPTIONS above

const SECTIONS: SettingSection[] = [
  {
    id: 'audio',
    items: [
      {
        type: 'toggle',
        id: 'music',
        label: 'Music',
        get: (s) => s.audio.musicOn,
        onChange: (dispatch, val) => dispatch(setAudio({ musicOn: val })),
      },
      {
        type: 'toggle',
        id: 'sfx',
        label: 'Sound Effects',
        get: (s) => s.audio.sfxOn,
        onChange: (dispatch, val) => dispatch(setAudio({ sfxOn: val })),
      },
    ],
  },
  {
    id: 'theme',
    items: [
      {
        type: 'dropdown',
        id: 'theme-preset',
        label: 'Theme',
        options: THEME_OPTIONS,
        get: (s) => s.display.themePreset,
        onChange: (dispatch, val) => dispatch(setDisplay({ themePreset: val as ThemePreset })),
      },
    ],
  },
  {
    id: 'gameplay',
    items: [
      {
        type: 'toggle',
        id: 'compactRoster',
        label: 'Compact mode',
        get: (s) => s.gameUX.compactRoster,
        onChange: (dispatch, val) => dispatch(setGameUX({ compactRoster: val })),
      },
      {
        type: 'toggle',
        id: 'publicMode',
        label: 'Public Mode',
        badge: 'VIP',
        gated: true,
        get: (s) => s.sim.publicMode,
        onChange: () => {},
      },
    ],
  },
  {
    id: 'accessibility',
    items: [
      {
        type: 'toggle',
        id: 'highContrast',
        label: 'High Contrast',
        get: (s) => s.display.highContrast,
        onChange: (dispatch, val) => dispatch(setDisplay({ highContrast: val })),
      },
      {
        type: 'toggle',
        id: 'reduceMotion',
        label: 'Reduce Motion',
        get: (s) => s.display.reduceMotion,
        onChange: (dispatch, val) => dispatch(setDisplay({ reduceMotion: val })),
      },
      {
        // Disables spotlights, badge animations, dimmers, eviction sequences,
        // and all other purely-visual effects (body.no-animations).
        type: 'toggle',
        id: 'animations',
        label: 'Animations',
        get: (s) => s.gameUX.animations,
        onChange: (dispatch, val) => dispatch(setGameUX({ animations: val })),
      },
    ],
  },
  {
    id: 'feedback',
    items: [
      {
        type: 'toggle',
        id: 'haptics',
        label: 'Haptic Feedback',
        get: (s) => s.gameUX.useHaptics,
        onChange: (dispatch, val) => dispatch(setGameUX({ useHaptics: val })),
      },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function Settings() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const settings = useAppSelector(selectSettings);
  const [showVipPrompt, setShowVipPrompt] = useState(false);

  function renderItem(item: SettingItem) {
    switch (item.type) {
      case 'toggle': {
        const checked = item.get(settings);
        return (
          <div key={item.id} className="settings-row">
            <label className="settings-row__label">
              {item.label}
              {item.badge && <span className="settings-row__badge">{item.badge}</span>}
            </label>
            <input
              type="checkbox"
              className="settings-toggle"
              checked={checked}
              onChange={(e) => {
                if (item.gated) {
                  e.preventDefault();
                  setShowVipPrompt(true);
                  return;
                }
                item.onChange(dispatch, e.target.checked);
              }}
              aria-label={`Toggle ${item.label.toLowerCase()}`}
            />
          </div>
        );
      }

      case 'dropdown': {
        const value = item.get(settings);
        return (
          <div key={item.id} className="settings-row">
            <label className="settings-row__label" htmlFor={`setting-${item.id}`}>
              {item.label}
            </label>
            <select
              id={`setting-${item.id}`}
              className="settings-select"
              value={value}
              onChange={(e) => item.onChange(dispatch, e.target.value)}
            >
              {item.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );
      }
    }
  }

  return (
    <div className="settings-screen settings-screen--basic">
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

      <div className="settings-content settings-content--flat">
        {SECTIONS.map((section) => (
          <section key={section.id} className="settings-section">
            {section.items.map(renderItem)}
          </section>
        ))}
      </div>
      <ConfirmExitModal
        open={showVipPrompt}
        title="VIP Required"
        description="Public Mode is a VIP setting. Advanced Settings can override it for testing."
        confirmLabel="OK"
        showCancel={false}
        onConfirm={() => setShowVipPrompt(false)}
        onCancel={() => setShowVipPrompt(false)}
      />
    </div>
  );
}
