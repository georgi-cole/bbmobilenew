import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import { FEATURE_LOCALIZATION_SETTINGS } from '../../config/featureFlags'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { AppDispatch } from '../../store/store'
import {
  selectSettings,
  setAudio,
  setDisplay,
  setGameUX,
  setLocalization,
  setSim,
  type ThemePreset,
  type SettingsState,
} from '../../store/settingsSlice'
import {
  selectHasDramaModeAccess,
  selectHasPublicModeAccess,
  selectIsVipActive,
} from '../../store/vipSlice'
import {
  REALITY_MODE_PRESETS,
  getProfileRealityAgeEligibility,
  type RealityModePreset,
} from '../../modes/realityMode'
import {
  LANGUAGE_OPTIONS,
  getLanguageNativeName,
  useI18n,
  type LanguagePreference,
  type TranslationKey,
} from '../../i18n'
import './Settings.css'

type LockedFeature = 'realityMode' | 'publicMode' | 'vipThemes'

const REALITY_PRESET_LABEL_KEYS: Record<RealityModePreset, TranslationKey> = {
  casual: 'settings.realityStyle.casual',
  tv: 'settings.realityStyle.tv',
  adult: 'settings.realityStyle.adult',
}

const LOCKED_FEATURE_KEYS: Record<LockedFeature, TranslationKey> = {
  realityMode: 'settings.feature.realityMode',
  publicMode: 'settings.feature.publicMode',
  vipThemes: 'settings.feature.vipThemes',
}

type ToggleItem = {
  type: 'toggle'
  id: string
  label: string
  badge?: string
  gated?: boolean
  lockedFeature?: LockedFeature
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
  description?: string
}

type SettingItem = ToggleItem | DropdownItem

interface SettingSection {
  id: string
  items: SettingItem[]
}

export default function Settings() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const settings = useAppSelector(selectSettings)
  const isVipActive = useAppSelector(selectIsVipActive)
  const hasDramaMode = useAppSelector(selectHasDramaModeAccess)
  const hasPublicMode = useAppSelector(selectHasPublicModeAccess)
  const realityAgeEligibility = useAppSelector((state) =>
    getProfileRealityAgeEligibility(state.profiles)
  )
  const { systemLanguage, t } = useI18n()
  const hasRealityAccess = hasDramaMode || settings.gameUX.dramaModeAdminOverride
  const showRealitySettings = hasRealityAccess && settings.gameUX.dramaMode
  const [lockedFeature, setLockedFeature] = useState<LockedFeature | null>(null)

  const themeOptions: DropdownItem['options'] = [
    { value: 'midnight', label: t('settings.theme.midnight') },
    { value: 'neon', vipOnly: true, label: t('settings.theme.neon') },
    { value: 'sunset', vipOnly: true, label: t('settings.theme.sunset') },
    { value: 'ocean', vipOnly: true, label: t('settings.theme.ocean') },
    { value: 'surveyeval', vipOnly: true, label: 'Surveyeval theme' },
  ]
  const languageOptions: DropdownItem['options'] = LANGUAGE_OPTIONS.map((option) => ({
    value: option.value,
    label:
      option.value === 'system'
        ? `${t('language.system')} · ${getLanguageNativeName(systemLanguage)}`
        : option.nativeName,
  }))
  const realityStyleOptions: DropdownItem['options'] = REALITY_MODE_PRESETS.map(({ value }) => ({
    value,
    label: t(REALITY_PRESET_LABEL_KEYS[value]),
  }))

  const localizationSections: SettingSection[] = FEATURE_LOCALIZATION_SETTINGS
    ? [
        {
          id: 'localization',
          items: [
            {
              type: 'dropdown',
              id: 'language',
              label: t('settings.language'),
              options: languageOptions,
              get: (s) => s.localization.language,
              onChange: (settingsDispatch, val) =>
                settingsDispatch(setLocalization({ language: val as LanguagePreference })),
              description: t('settings.language.description'),
            },
          ],
        },
      ]
    : []

  const sections: SettingSection[] = [
    ...localizationSections,
    {
      id: 'audio',
      items: [
        {
          type: 'toggle',
          id: 'music',
          label: t('settings.music'),
          get: (s) => s.audio.musicOn,
          onChange: (settingsDispatch, val) => settingsDispatch(setAudio({ musicOn: val })),
        },
        {
          type: 'toggle',
          id: 'sfx',
          label: t('settings.soundEffects'),
          get: (s) => s.audio.sfxOn,
          onChange: (settingsDispatch, val) => settingsDispatch(setAudio({ sfxOn: val })),
        },
      ],
    },
    {
      id: 'theme',
      items: [
        {
          type: 'dropdown',
          id: 'theme-preset',
          label: t('settings.theme'),
          options: themeOptions,
          get: (s) => s.display.themePreset,
          onChange: (settingsDispatch, val) =>
            settingsDispatch(setDisplay({ themePreset: val as ThemePreset })),
        },
      ],
    },
    {
      id: 'gameplay',
      items: [
        {
          type: 'toggle',
          id: 'compactRoster',
          label: t('settings.compactMode'),
          get: (s) => s.gameUX.compactRoster,
          onChange: (settingsDispatch, val) => settingsDispatch(setGameUX({ compactRoster: val })),
        },
        {
          type: 'toggle',
          id: 'houseFeed',
          label: t('settings.houseFeed'),
          get: (s) => s.gameUX.houseFeed,
          onChange: (settingsDispatch, val) => settingsDispatch(setGameUX({ houseFeed: val })),
        },
        {
          type: 'toggle',
          id: 'dramaMode',
          label: t('settings.realityMode'),
          badge: t('common.store'),
          gated: true,
          lockedFeature: 'realityMode',
          get: (s) => s.gameUX.dramaMode,
          onChange: (settingsDispatch, val) =>
            settingsDispatch(
              setGameUX(
                val ? { dramaMode: true } : { dramaMode: false, dramaModeAdminOverride: false }
              )
            ),
        },
        {
          type: 'dropdown',
          id: 'realityModePreset',
          label: t('settings.realityStyle'),
          options: realityStyleOptions,
          get: (s) => s.gameUX.realityModePreset,
          onChange: (settingsDispatch, val) =>
            settingsDispatch(setGameUX({ realityModePreset: val as RealityModePreset })),
          description: t('settings.realityStyle.description'),
        },
        {
          type: 'toggle',
          id: 'romanceStorylines',
          label: t('settings.romanceStorylines'),
          get: (s) => s.gameUX.romanceStorylines,
          onChange: (settingsDispatch, val) =>
            settingsDispatch(setGameUX({ romanceStorylines: val })),
        },
        {
          type: 'toggle',
          id: 'publicMode',
          label: t('settings.publicMode'),
          badge: t('common.store'),
          gated: true,
          lockedFeature: 'publicMode',
          get: (s) => s.sim.publicMode,
          onChange: (settingsDispatch, val) =>
            settingsDispatch(
              setSim(
                val ? { publicMode: true } : { publicMode: false, publicModeAdminOverride: false }
              )
            ),
        },
      ],
    },
    {
      id: 'accessibility',
      items: [
        {
          type: 'toggle',
          id: 'highContrast',
          label: t('settings.highContrast'),
          get: (s) => s.display.highContrast,
          onChange: (settingsDispatch, val) => settingsDispatch(setDisplay({ highContrast: val })),
        },
        {
          type: 'toggle',
          id: 'reduceMotion',
          label: t('settings.reduceMotion'),
          get: (s) => s.display.reduceMotion,
          onChange: (settingsDispatch, val) => settingsDispatch(setDisplay({ reduceMotion: val })),
        },
        {
          type: 'toggle',
          id: 'animations',
          label: t('settings.animations'),
          get: (s) => s.gameUX.animations,
          onChange: (settingsDispatch, val) => settingsDispatch(setGameUX({ animations: val })),
        },
      ],
    },
    {
      id: 'feedback',
      items: [
        {
          type: 'toggle',
          id: 'haptics',
          label: t('settings.hapticFeedback'),
          get: (s) => s.gameUX.useHaptics,
          onChange: (settingsDispatch, val) => settingsDispatch(setGameUX({ useHaptics: val })),
        },
      ],
    },
  ]

  useEffect(() => {
    if (settings.gameUX.realityModePreset === 'adult' && realityAgeEligibility !== 'adult') {
      dispatch(setGameUX({ realityModePreset: 'tv' }))
    }
  }, [dispatch, realityAgeEligibility, settings.gameUX.realityModePreset])

  function renderItem(item: SettingItem) {
    if (
      (item.id === 'realityModePreset' || item.id === 'romanceStorylines') &&
      !showRealitySettings
    ) {
      return null
    }
    switch (item.type) {
      case 'toggle': {
        const hasAccess =
          item.id === 'dramaMode'
            ? hasDramaMode || settings.gameUX.dramaModeAdminOverride
            : item.id === 'publicMode'
              ? hasPublicMode || settings.sim.publicModeAdminOverride
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
              onChange={(event) => {
                if (item.gated && !hasAccess) {
                  event.preventDefault()
                  setLockedFeature(item.lockedFeature ?? 'publicMode')
                  return
                }
                item.onChange(dispatch, event.target.checked)
              }}
              aria-label={t('common.toggle', { setting: item.label })}
            />
          </div>
        )
      }

      case 'dropdown': {
        const value = item.get(settings)
        return (
          <div key={item.id} className="settings-row settings-row--col">
            <div className="settings-row settings-row--nested">
              <label className="settings-row__label" htmlFor={`setting-${item.id}`}>
                {item.label}
              </label>
              <select
                id={`setting-${item.id}`}
                className="settings-select"
                value={value}
                onChange={(event) => {
                  const option = item.options.find(
                    (candidate) => candidate.value === event.target.value
                  )
                  if (option?.vipOnly && !isVipActive) {
                    setLockedFeature('vipThemes')
                    return
                  }
                  item.onChange(dispatch, event.target.value)
                }}
              >
                {item.options.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.value === 'adult' && realityAgeEligibility !== 'adult'}
                  >
                    {option.label}
                    {option.vipOnly ? ` · ${t('common.vip')}` : ''}
                    {option.value === 'adult' && realityAgeEligibility !== 'adult'
                      ? ` · ${t('settings.requiresAdult')}`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            {item.description && <p className="settings-helper-text">{item.description}</p>}
          </div>
        )
      }
    }
  }

  const lockedFeatureLabel = lockedFeature
    ? t(LOCKED_FEATURE_KEYS[lockedFeature])
    : t('settings.feature.thisFeature')

  return (
    <div className="settings-screen settings-screen--basic">
      <header className="settings-screen__header">
        <h1 className="settings-screen__title">⚙️ {t('settings.title')}</h1>
        <button
          className="settings-screen__back"
          onClick={() => navigate(-1)}
          aria-label={t('common.goBack')}
        >
          ↩
        </button>
      </header>

      <div className="settings-content settings-content--flat">
        <button
          type="button"
          className="settings-row settings-row--vip"
          onClick={() => navigate('/store')}
        >
          <span>
            <strong className="settings-row__vip-title">{t('settings.vipTitle')}</strong>
            <small>{isVipActive ? t('settings.vipOwned') : t('settings.vipUnlock')}</small>
          </span>
          <span className="settings-row__vip-action">
            {isVipActive ? t('common.owned') : t('common.view')}
          </span>
        </button>
        {sections.map((section) => (
          <section key={section.id} className="settings-section">
            {section.items.map(renderItem)}
          </section>
        ))}
        <button
          type="button"
          className="settings-row settings-row--legal"
          onClick={() => navigate('/legal')}
        >
          <span>
            <strong>{t('settings.privacyTitle')}</strong>
            <small>{t('settings.privacyDescription')}</small>
          </span>
          <span aria-hidden="true">&rsaquo;</span>
        </button>
      </div>
      <ConfirmExitModal
        open={lockedFeature != null}
        title={t('settings.unlockTitle', { feature: lockedFeatureLabel })}
        description={t('settings.unlockDescription', { feature: lockedFeatureLabel })}
        confirmLabel={t('settings.viewStore')}
        cancelLabel={t('common.notNow')}
        onConfirm={() => {
          setLockedFeature(null)
          navigate('/store')
        }}
        onCancel={() => setLockedFeature(null)}
      />
    </div>
  )
}
