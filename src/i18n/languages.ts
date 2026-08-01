export const DEFAULT_APP_LANGUAGE = 'en-US' as const

export const LANGUAGE_OPTIONS = [
  { value: 'system', nativeName: 'System' },
  { value: 'en-US', nativeName: 'English (US)' },
  { value: 'en-GB', nativeName: 'English (UK)' },
  { value: 'fr-FR', nativeName: 'Français' },
  { value: 'it-IT', nativeName: 'Italiano' },
  { value: 'es-ES', nativeName: 'Español' },
  { value: 'pt-PT', nativeName: 'Português' },
  { value: 'de-DE', nativeName: 'Deutsch' },
  { value: 'zh-CN', nativeName: '简体中文' },
  { value: 'bg-BG', nativeName: 'Български' },
  { value: 'ru-RU', nativeName: 'Русский' },
  { value: 'uk-UA', nativeName: 'Українська' },
  { value: 'tr-TR', nativeName: 'Türkçe' },
] as const

export type LanguagePreference = (typeof LANGUAGE_OPTIONS)[number]['value']
export type AppLanguage = Exclude<LanguagePreference, 'system'>

const LANGUAGE_PREFERENCES = new Set<string>(LANGUAGE_OPTIONS.map(({ value }) => value))
const LANGUAGE_NATIVE_NAMES: Record<AppLanguage, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'fr-FR': 'Français',
  'it-IT': 'Italiano',
  'es-ES': 'Español',
  'pt-PT': 'Português',
  'de-DE': 'Deutsch',
  'zh-CN': '简体中文',
  'bg-BG': 'Български',
  'ru-RU': 'Русский',
  'uk-UA': 'Українська',
  'tr-TR': 'Türkçe',
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return typeof value === 'string' && LANGUAGE_PREFERENCES.has(value)
    ? (value as LanguagePreference)
    : 'system'
}

export function getLanguageNativeName(language: AppLanguage): string {
  return LANGUAGE_NATIVE_NAMES[language]
}

export function getSystemLanguageTags(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages.length > 0) return navigator.languages
  return navigator.language ? [navigator.language] : []
}

function mapSystemLanguageTag(rawTag: string): AppLanguage | null {
  const tag = rawTag.trim().replaceAll('_', '-').toLowerCase()
  if (!tag) return null

  if (tag === 'en-gb' || tag.startsWith('en-gb-')) return 'en-GB'
  if (tag === 'en' || tag.startsWith('en-')) return 'en-US'
  if (tag === 'fr' || tag.startsWith('fr-')) return 'fr-FR'
  if (tag === 'it' || tag.startsWith('it-')) return 'it-IT'
  if (tag === 'es' || tag.startsWith('es-')) return 'es-ES'
  if (tag === 'pt' || tag.startsWith('pt-')) return 'pt-PT'
  if (tag === 'de' || tag.startsWith('de-')) return 'de-DE'
  if (tag === 'bg' || tag.startsWith('bg-')) return 'bg-BG'
  if (tag === 'ru' || tag.startsWith('ru-')) return 'ru-RU'
  if (tag === 'uk' || tag.startsWith('uk-')) return 'uk-UA'
  if (tag === 'tr' || tag.startsWith('tr-')) return 'tr-TR'

  // Only Simplified Chinese is supported. Traditional Chinese intentionally
  // falls through to the next device language, then English (US), rather than
  // silently switching scripts.
  if (
    tag === 'zh' ||
    tag === 'zh-cn' ||
    tag.startsWith('zh-cn-') ||
    tag === 'zh-sg' ||
    tag.startsWith('zh-sg-') ||
    tag === 'zh-hans' ||
    tag.startsWith('zh-hans-')
  ) {
    return 'zh-CN'
  }

  return null
}

export function resolveSystemLanguage(
  systemLanguageTags: readonly string[] = getSystemLanguageTags()
): AppLanguage {
  for (const tag of systemLanguageTags) {
    const language = mapSystemLanguageTag(tag)
    if (language) return language
  }
  return DEFAULT_APP_LANGUAGE
}

export function resolveLanguagePreference(
  preference: unknown,
  systemLanguageTags: readonly string[] = getSystemLanguageTags()
): AppLanguage {
  const normalized = normalizeLanguagePreference(preference)
  return normalized === 'system' ? resolveSystemLanguage(systemLanguageTags) : normalized
}
