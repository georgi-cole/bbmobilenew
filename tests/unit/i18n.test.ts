import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LANGUAGE_OPTIONS,
  normalizeLanguagePreference,
  resolveLanguagePreference,
  resolveSystemLanguage,
} from '../../src/i18n/languages'
import { translate } from '../../src/i18n/messages'
import settingsReducer, {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  loadSettings,
  setLocalization,
} from '../../src/store/settingsSlice'

const EXPECTED_LANGUAGE_OPTIONS = [
  'system',
  'en-US',
  'en-GB',
  'fr-FR',
  'it-IT',
  'es-ES',
  'pt-PT',
  'de-DE',
  'zh-CN',
  'bg-BG',
  'ru-RU',
  'uk-UA',
  'tr-TR',
]

describe('language catalogue', () => {
  it('exposes the requested language choices in product order', () => {
    expect(LANGUAGE_OPTIONS.map(({ value }) => value)).toEqual(EXPECTED_LANGUAGE_OPTIONS)
  })

  it('normalizes unknown persisted values to System', () => {
    expect(normalizeLanguagePreference('ja-JP')).toBe('system')
    expect(normalizeLanguagePreference(null)).toBe('system')
  })
})

describe('System language resolution', () => {
  it('distinguishes English UK from English US', () => {
    expect(resolveSystemLanguage(['en-GB'])).toBe('en-GB')
    expect(resolveSystemLanguage(['en-AU'])).toBe('en-US')
  })

  it('maps regional variants to the supported language pack', () => {
    expect(resolveSystemLanguage(['fr-CA'])).toBe('fr-FR')
    expect(resolveSystemLanguage(['pt-BR'])).toBe('pt-PT')
    expect(resolveSystemLanguage(['uk-UA'])).toBe('uk-UA')
    expect(resolveSystemLanguage(['zh-Hans-SG'])).toBe('zh-CN')
  })

  it('tries the next device language before falling back to English US', () => {
    expect(resolveSystemLanguage(['ja-JP', 'de-DE'])).toBe('de-DE')
    expect(resolveSystemLanguage(['ja-JP'])).toBe('en-US')
  })

  it('does not silently convert Traditional Chinese to Simplified Chinese', () => {
    expect(resolveSystemLanguage(['zh-Hant-TW'])).toBe('en-US')
  })

  it('uses an explicit preference regardless of the device language', () => {
    expect(resolveLanguagePreference('bg-BG', ['fr-FR'])).toBe('bg-BG')
  })
})

describe('message fallback and variants', () => {
  it('uses targeted English UK vocabulary overrides', () => {
    expect(translate('en-GB', 'settings.vipUnlock')).toContain('advert-free')
  })

  it('falls back per key to English US', () => {
    expect(translate('en-GB', 'settings.title')).toBe('Settings')
  })

  it('interpolates translated messages', () => {
    expect(
      translate('bg-BG', 'settings.unlockTitle', {
        feature: 'Публичен режим',
      })
    ).toBe('Отключи: Публичен режим')
  })
})

describe('settings persistence migration', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY))
  afterEach(() => localStorage.removeItem(STORAGE_KEY))

  it('defaults new and legacy settings to System', () => {
    expect(loadSettings().localization.language).toBe('system')

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ display: { highContrast: true } }))
    expect(loadSettings().localization.language).toBe('system')
  })

  it('loads supported languages and rejects invalid persisted values', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ localization: { language: 'fr-FR' } }))
    expect(loadSettings().localization.language).toBe('fr-FR')

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ localization: { language: 'ja-JP' } }))
    expect(loadSettings().localization.language).toBe('system')
  })

  it('updates the language without changing gameplay settings', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, setLocalization({ language: 'uk-UA' }))

    expect(next.localization.language).toBe('uk-UA')
    expect(next.gameUX).toEqual(DEFAULT_SETTINGS.gameUX)
    expect(next.sim).toEqual(DEFAULT_SETTINGS.sim)
  })
})
