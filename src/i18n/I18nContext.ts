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

const fallbackContext: I18nContextValue = {
  preference: DEFAULT_APP_LANGUAGE,
  language: DEFAULT_APP_LANGUAGE,
  systemLanguage: DEFAULT_APP_LANGUAGE,
  t: fallbackTranslate,
  formatNumber: (value, options) =>
    new Intl.NumberFormat(DEFAULT_APP_LANGUAGE, options).format(value),
  formatDate: (value, options) =>
    new Intl.DateTimeFormat(DEFAULT_APP_LANGUAGE, options).format(value),
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  return context ?? fallbackContext
}

export function useTranslate(): Translate {
  return useContext(I18nContext)?.t ?? fallbackTranslate
}
