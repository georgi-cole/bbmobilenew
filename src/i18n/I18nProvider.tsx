import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAppSelector } from '../store/hooks'
import { selectLanguagePreference } from '../store/settingsSlice'
import {
  getSystemLanguageTags,
  resolveLanguagePreference,
  resolveSystemLanguage,
  type AppLanguage,
  type LanguagePreference,
} from './languages'
import {
  translate,
  type Translate,
  type TranslationKey,
  type TranslationParams,
} from './messages'

interface I18nContextValue {
  preference: LanguagePreference
  language: AppLanguage
  systemLanguage: AppLanguage
  t: Translate
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readSystemLanguageTags(): readonly string[] {
  return [...getSystemLanguageTags()]
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const preference = useAppSelector(selectLanguagePreference)
  const [systemLanguageTags, setSystemLanguageTags] = useState<readonly string[]>(
    readSystemLanguageTags
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleLanguageChange = () => setSystemLanguageTags(readSystemLanguageTags())
    window.addEventListener('languagechange', handleLanguageChange)
    return () => window.removeEventListener('languagechange', handleLanguageChange)
  }, [])

  const systemLanguage = useMemo(
    () => resolveSystemLanguage(systemLanguageTags),
    [systemLanguageTags]
  )
  const language = useMemo(
    () => resolveLanguagePreference(preference, systemLanguageTags),
    [preference, systemLanguageTags]
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = language
    document.documentElement.dir = 'ltr'
    document.documentElement.dataset.language = language
    document.documentElement.dataset.languagePreference = preference
  }, [language, preference])

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language]
  )
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(language, options).format(value),
    [language]
  )
  const formatDate = useCallback(
    (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(language, options).format(value),
    [language]
  )

  const contextValue = useMemo<I18nContextValue>(
    () => ({ preference, language, systemLanguage, t, formatNumber, formatDate }),
    [preference, language, systemLanguage, t, formatNumber, formatDate]
  )

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
