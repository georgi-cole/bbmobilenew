import { useState } from 'react'
import { useNavigate } from 'react-router'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { AppDispatch } from '../../store/store'
import {
  selectSettings,
  setAudio,
  setDisplay,
  setGameUX,
  setSim,
  type ThemePreset,
  type SettingsState,
} from '../../store/settingsSlice'
import {
  selectHasDramaModeAccess,
  selectHasPublicModeAccess,
  selectHasTribunalHouseAccess,
  selectIsVipActive,
} from '../../store/vipSlice'
import './Settings.css'

// ── Theme options ──────────────────────────────────────────────────────────────
// To add a new theme: append an entry here AND add a matching body.theme-* CSS
// rule in Settings.css.
const THEME_OPTIONS: { value: ThemePreset; label: string; vipOnly?: boolean }[] = [
  { value: 'midnight', label: '🌙 Midnight' },
  { value: 'neon', vipOnly: true, label: '⚡ Neon' },
  { value: 'sunset', vipOnly: true, label: '🌅 Sunset' },
  { value: 'ocean', vipOnly: true, label: '🌊 Ocean' },
]

// ── Setting item types ─────────────────────────────────────────────────────────
// Add a new member to this union + a matching case in renderItem() to support
// a new control type (e.g. 'number-input', 'radio-group', …).

type ToggleItem = {
  type: 'toggle'
  id: string
  label: string
  badge?: string
  gated?: boolean
  lockedFeature?: 'Drama Mode' | 'Public Mode' | 'Tribunal House' | 'VIP themes'
  get: (s: SettingsState) => boolean
  onChange: (dispatch: AppDispatch, val: boolean) => void
}

type DropdownItem = {
  type: 'dropdown'
  id: string
  label: string
  options: { value: string; label: string; vipOnly?: boolean }[]
  get: (s: SettingsState) => string
  onChange: (dispatch: AppDispatch, val: string) => void
}

type SettingItem = ToggleItem | DropdownItem

interface SettingSection {
  id: string
  items: SettingItem[]
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
        id: 'houseFeed',
        label: 'House Feed',
        get: (s) => s.gameUX.houseFeed,
        onChange: (dispatch, val) => dispatch(setGameUX({ houseFeed: val })),
      },
      {
        type: 'toggle',
        id: 'dramaMode',
        label: 'Drama Mode',
        badge: 'Store',
        gated: true,
        lockedFeature: 'Drama Mode',
        get: (s) => s.gameUX.dramaMode,
        onChange: (dispatch, val) => dispatch(setGameUX({ dramaMode: val })),
      },
      {
        type: 'toggle',
        id: 'publicMode',
        label: 'Public Mode',
        badge: 'Store',
        gated: true,
        lockedFeature: 'Public Mode',
        get: (s) => s.sim.publicMode,
        onChange: (dispatch, val) =>
          dispatch(
            setSim(
              val ? { publicMode: true } : { publicMode: false, publicModeAdminOverride: false }
            )
          ),
      },
      {
        type: 'toggle',
        id: 'tribunalHouse',
        label: 'Tribunal House',
        badge: 'Store',
        gated: true,
        lockedFeature: 'Tribunal House',
        get: (s) => s.sim.enableJuryHouse,
        onChange: (dispatch, val) => dispatch(setSim({ enableJuryHouse: val })),
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
]

// ── Component ──────────────────────────────────────────────────────────────────

export default function Settings() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const settings = useAppSelector(selectSettings)
  const isVipActive = useAppSelector(selectIsVipActive)
  const hasDramaMode = useAppSelector(selectHasDramaModeAccess)
  const hasPublicMode = useAppSelector(selectHasPublicModeAccess)
  const hasTribunalHouse = useAppSelector(selectHasTribunalHouseAccess)
  const [lockedFeature, setLockedFeature] = useState<
    'Drama Mode' | 'Public Mode' | 'Tribunal House' | 'VIP themes' | null
  >(null)

  function renderItem(item: SettingItem) {
    switch (item.type) {
      case 'toggle': {
        const hasAccess =
          item.id === 'dramaMode'
            ? hasDramaMode || settings.gameUX.dramaMode
            : item.id === 'publicMode'
              ? hasPublicMode || settings.sim.publicModeAdminOverride
              : item.id === 'tribunalHouse'
                ? hasTribunalHouse
                : true
        const checked = item.gated && !hasAccess ? false : item.get(settings)
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
                if (item.gated && !hasAccess) {
                  e.preventDefault()
                  setLockedFeature(item.lockedFeature ?? 'Public Mode')
                  return
                }
                item.onChange(dispatch, e.target.checked)
              }}
              aria-label={`Toggle ${item.label.toLowerCase()}`}
            />
          </div>
        )
      }

      case 'dropdown': {
        const value = item.get(settings)
        return (
          <div key={item.id} className="settings-row">
            <label className="settings-row__label" htmlFor={`setting-${item.id}`}>
              {item.label}
            </label>
            <select
              id={`setting-${item.id}`}
              className="settings-select"
              value={value}
              onChange={(e) => {
                const option = item.options.find((candidate) => candidate.value === e.target.value)
                if (option?.vipOnly && !isVipActive) {
                  setLockedFeature('VIP themes')
                  return
                }
                item.onChange(dispatch, e.target.value)
              }}
            >
              {item.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                  {opt.vipOnly ? ' · VIP' : ''}
                </option>
              ))}
            </select>
          </div>
        )
      }
    }
  }

  return (
    <div className="settings-screen settings-screen--basic">
      <header className="settings-screen__header">
        <button className="settings-screen__back" onClick={() => navigate(-1)} aria-label="Go back">
          ←
        </button>
        <h1 className="settings-screen__title">⚙️ Settings</h1>
      </header>

      <div className="settings-content settings-content--flat">
        <button
          type="button"
          className="settings-row settings-row--vip"
          onClick={() => navigate('/store')}
        >
          <span>
            <strong className="settings-row__vip-title">The Big Eye VIP</strong>
            <small>
              {isVipActive ? 'Your VIP bundle is owned' : 'Unlock premium modes and ad-free play'}
            </small>
          </span>
          <span className="settings-row__vip-action">{isVipActive ? 'Owned' : 'View'}</span>
        </button>
        {SECTIONS.map((section) => (
          <section key={section.id} className="settings-section">
            {section.items.map(renderItem)}
          </section>
        ))}
      </div>
      <ConfirmExitModal
        open={lockedFeature != null}
        title={`Unlock ${lockedFeature ?? 'this feature'}`}
        description={`${lockedFeature ?? 'This feature'} is available as a permanent one-time purchase or as part of The Big Eye VIP bundle.`}
        confirmLabel="View Store"
        cancelLabel="Not now"
        onConfirm={() => {
          setLockedFeature(null)
          navigate('/store')
        }}
        onCancel={() => setLockedFeature(null)}
      />
    </div>
  )
}
