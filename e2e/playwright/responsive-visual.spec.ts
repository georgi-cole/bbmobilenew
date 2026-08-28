import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  test,
  type Page,
} from './support/test'
import { installSafeAreaProfile, safeAreaForProject } from './support/responsiveAssertions'

const SCREEN_TIMEOUT_MS = 30_000
const SCREENSHOT_OPTIONS = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  maxDiffPixelRatio: 0.01,
  timeout: 30_000,
}

const runResponsiveVisual = process.env.RESPONSIVE_VISUAL === '1'

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: SCREEN_TIMEOUT_MS * 2 })
  await closeDebugPanelIfOpen(page)
  await dismissPermissionPromptIfPresent(page)
  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

async function createVisualProfile(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Select or Create a Profile' }).click()
  await page.getByRole('button', { name: /Create New Profile/ }).click()
  await page.getByPlaceholder('Enter display name').fill('VisualQA')
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Go back' }).click()
  await waitForHome(page)
}

async function openClassicGame(page: Page): Promise<void> {
  await createVisualProfile(page)
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu).toBeVisible()
  await playMenu.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

if (runResponsiveVisual) {
  test.describe('Responsive visual regression @responsive-visual', () => {
    for (const systemBarsVisible of [true, false]) {
      const chromeMode = systemBarsVisible ? 'system-bars' : 'immersive'

      test.describe(chromeMode, () => {
        test.describe.configure({ timeout: 120_000 })

        test(`Home Hub matches the base branch in ${chromeMode}`, async ({ page }, testInfo) => {
          const insets = safeAreaForProject(testInfo.project.name, systemBarsVisible)
          await installSafeAreaProfile(page, insets)
          await page.goto('./')
          await waitForHome(page)

          await expect(page).toHaveScreenshot(`homehub-${chromeMode}.png`, SCREENSHOT_OPTIONS)
        })

        test(`Classic game start matches the base branch in ${chromeMode}`, async ({
          page,
        }, testInfo) => {
          const insets = safeAreaForProject(testInfo.project.name, systemBarsVisible)
          await installSafeAreaProfile(page, insets)
          await page.goto('./')
          await waitForHome(page)
          await openClassicGame(page)

          await expect(page).toHaveScreenshot(`game-start-${chromeMode}.png`, {
            ...SCREENSHOT_OPTIONS,
            mask: [
              page.locator('.game-control-dock'),
              page.locator('[data-houseguest-roster="true"]'),
            ],
          })
        })
      })
    }
  })
}
