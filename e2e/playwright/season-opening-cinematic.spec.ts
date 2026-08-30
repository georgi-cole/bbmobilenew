import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  test,
  type Page,
} from './support/test'

const SCREEN_TIMEOUT_MS = 30_000

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: SCREEN_TIMEOUT_MS * 2 })
  await closeDebugPanelIfOpen(page)
  await dismissPermissionPromptIfPresent(page)
  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

async function createProfile(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Select or Create a Profile' }).click()
  await page.getByRole('button', { name: /Create New Profile/ }).click()
  await page.getByPlaceholder('Enter display name').fill('Opening Preview')
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Go back' }).click()
  await waitForHome(page)
}

test(
  'season opening powers on before the elegant welcome @core-journey',
  async ({ page }, testInfo) => {
    await page.goto('./')
    await waitForHome(page)
    await createProfile(page)

    const frozenPowerOnFrame = await page.addStyleTag({
      content: `
        body.body--season-tv-wake .tv-zone__viewport,
        body.body--season-tv-wake .tv-zone__viewport::before {
          animation-delay: -170ms !important;
          animation-play-state: paused !important;
        }
      `,
    })

    await page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('button', { name: 'Play', exact: true })
      .click()
    const playMenu = page.getByRole('navigation', { name: 'Play menu' })
    await expect(playMenu).toBeVisible()
    await playMenu.getByRole('button', { name: 'Classic', exact: true }).click()

    await expect
      .poll(() => page.evaluate(() => document.body.classList.contains('body--season-tv-wake')), {
        timeout: SCREEN_TIMEOUT_MS,
      })
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('season-opening-1-tv-power-on.png'),
      fullPage: false,
    })
    await frozenPowerOnFrame.evaluate((node) => node.remove())

    const welcome = page.getByText(/Welcome to The Big Eye\. Season 1 begins now\./)
    await expect(welcome).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
    await expect
      .poll(() =>
        page.evaluate(() => document.body.classList.contains('body--season-opening-welcome'))
      )
      .toBe(true)
    await page.waitForTimeout(700)
    await page.screenshot({
      path: testInfo.outputPath('season-opening-2-projector-welcome.png'),
      fullPage: false,
    })
  }
)
