import { createContext, useContext } from 'react'
import type { AppLanguage, LanguagePreference } from './languages'
import type { Translate } from './messages'

export interface I18nContextValue {
  preference: LanguagePreference
  language: AppLanguage
  systemLanguage: AppLanguage
  t: Translate
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
