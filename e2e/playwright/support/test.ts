import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test'
import type { RootState } from '../../../src/store/store'

type BrowserErrorSource = 'console' | 'page'

export interface BrowserError {
  source: BrowserErrorSource
  message: string
}

export interface BrowserErrorCollector {
  readonly errors: readonly BrowserError[]
}

export const E2E_NEW_SEASON_FIXTURE = Object.freeze({
  rosterSeed: 0x4f1bbcdc,
  seasonSeed: 0x6d2b79f5,
})

function consoleError(message: ConsoleMessage): BrowserError | null {
  return message.type() === 'error' ? { source: 'console', message: message.text() } : null
}

async function installUnhandledRejectionReporter(page: Page): Promise<void> {
  await page.addInitScript((newSeasonFixture) => {
    Object.defineProperty(window, '__E2E__', {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    })

    Object.defineProperty(window, '__bbE2ENewSeason', {
      configurable: false,
      enumerable: false,
      value: Object.freeze(newSeasonFixture),
      writable: false,
    })

    // Most browser journeys are unrelated to optional geolocation. Persist the
    // same declined choice a user can make so the global permission modal cannot
    // obscure controls under test. PermissionPrompts itself is covered separately.
    localStorage.setItem('bb:allowLocation', 'denied')

    // Browser E2E validates UI state, not media decoding. Keeping play() inert
    // prevents codec/autoplay differences from producing false console failures,
    // especially in WebKit, while audio behavior remains covered by unit tests.
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => Promise.resolve(),
      writable: true,
    })
    const createElement = document.createElement.bind(document)
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = createElement(tagName, options)
      if (tagName.toLowerCase() === 'audio') {
        Object.defineProperty(element, 'src', {
          configurable: true,
          get: () => '',
          set: () => undefined,
        })
      }
      return element
    }) as typeof document.createElement

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const detail = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
      console.error(`[unhandledrejection] ${detail}`)
    })
  }, E2E_NEW_SEASON_FIXTURE)
}

export async function readAppState(page: Page): Promise<RootState> {
  await expect
    .poll(() => page.evaluate(() => window.__bbE2EState != null), {
      message: 'read-only E2E state probe should be installed',
    })
    .toBe(true)

  return page.evaluate(() => {
    const probe = window.__bbE2EState
    if (probe == null) throw new Error('read-only E2E state probe is unavailable')
    return probe.snapshot() as RootState
  })
}

export async function closeDebugPanelIfOpen(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(toggle).toBeVisible({ timeout: 10_000 })

  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  if (!(await panel.isVisible())) return

  await panel
    .getByRole('button', { name: 'Close Debug Panel' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await expect(panel).toBeHidden()
}

export async function dismissPermissionPromptIfPresent(page: Page): Promise<void> {
  const permissionPrompt = page.getByRole('dialog', { name: 'Allow location' })
  if (!(await permissionPrompt.isVisible())) return

  await permissionPrompt
    .getByRole('checkbox', { name: 'Remember my choice' })
    .evaluate((checkbox) => (checkbox as HTMLInputElement).click())
  await permissionPrompt
    .getByRole('button', { name: 'Deny' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await expect(permissionPrompt).toBeHidden()
}

export const test = base.extend<{ browserErrors: BrowserErrorCollector }>({
  browserErrors: [
    async ({ page }, use, testInfo) => {
      const errors: BrowserError[] = []
      const onConsole = (message: ConsoleMessage) => {
        const error = consoleError(message)
        if (error != null) errors.push(error)
      }
      const onPageError = (error: Error) => {
        errors.push({ source: 'page', message: error.message })
      }

      page.on('console', onConsole)
      page.on('pageerror', onPageError)
      await page.route('**/api/live-config', async (route) => {
        await route.fulfill({ body: '{}', contentType: 'application/json', status: 200 })
      })
      await page.route('https://fonts.googleapis.com/**', async (route) => {
        await route.fulfill({ body: '', contentType: 'text/css', status: 200 })
      })
      await page.route('https://fonts.gstatic.com/**', async (route) => {
        await route.fulfill({ body: '', contentType: 'font/woff2', status: 200 })
      })
      await page.route('https://api.dicebear.com/**', async (route) => {
        await route.fulfill({
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#263653"/></svg>',
          contentType: 'image/svg+xml',
          status: 200,
        })
      })
      await installUnhandledRejectionReporter(page)

      await use({ errors })

      page.off('console', onConsole)
      page.off('pageerror', onPageError)

      if (errors.length > 0) {
        await testInfo.attach('unexpected-browser-errors.json', {
          body: JSON.stringify(errors, null, 2),
          contentType: 'application/json',
        })
      }

      expect(
        errors,
        'unexpected browser console errors, page errors, or unhandled rejections'
      ).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
export type { Locator, Page, TestInfo } from '@playwright/test'
