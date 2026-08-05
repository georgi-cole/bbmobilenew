import { createContext, useContext } from 'react'
import { DEFAULT_APP_LANGUAGE, type AppLanguage, type LanguagePreference } from './languages'
import { translate, type Translate } from './messages'

export interface I18nContextValue {
  preference: LanguagePreference
  language: AppLanguage
  systemLanguage: AppLanguage
  t: Translate
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

const fallbackTranslate: Translate = (key, params) => translate(DEFAULT_APP_LANGUAGE, key, params)

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}

export function useTranslate(): Translate {
  return useContext(I18nContext)?.t ?? fallbackTranslate
}
