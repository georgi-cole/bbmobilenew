import { createElement, type ReactNode } from 'react'
import { vi } from 'vitest'
import { I18nContext, type I18nContextValue } from '../i18n/I18nContext'
import { translate } from '../i18n/messages'

const TEST_I18N: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: (value, options) =>
    new Intl.NumberFormat('en-US', options).format(value),
  formatDate: (value, options) => new Intl.DateTimeFormat('en-US', options).format(value),
}

function EnglishI18nBoundary({ children }: { children: ReactNode }) {
  return createElement(I18nContext.Provider, { value: TEST_I18N }, children)
}

vi.mock('@testing-library/react', async () => {
  const actual = await vi.importActual<typeof import('@testing-library/react')>(
    '@testing-library/react'
  )

  const withI18nWrapper = (
    customWrapper?: React.JSXElementConstructor<{ children: ReactNode }>
  ): React.JSXElementConstructor<{ children: ReactNode }> => {
    if (!customWrapper) return EnglishI18nBoundary

    return function TestWrapper({ children }: { children: ReactNode }) {
      return createElement(
        EnglishI18nBoundary,
        null,
        createElement(customWrapper, null, children)
      )
    }
  }

  return {
    ...actual,
    render: (
      ui: Parameters<typeof actual.render>[0],
      options: Parameters<typeof actual.render>[1] = {}
    ) => actual.render(ui, { ...options, wrapper: withI18nWrapper(options.wrapper) }),
    renderHook: (
      callback: Parameters<typeof actual.renderHook>[0],
      options: Parameters<typeof actual.renderHook>[1] = {}
    ) => actual.renderHook(callback, { ...options, wrapper: withI18nWrapper(options.wrapper) }),
  }
})
