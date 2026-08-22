import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
  type Page,
} from './support/test'

const SCREEN_TIMEOUT_MS = 30_000
const SAVED_RUNS_KEY_PREFIX = 'bbmobilenew:savedRuns:'

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: SCREEN_TIMEOUT_MS * 2 })
  await closeDebugPanelIfOpen(page)
  await dismissPermissionPromptIfPresent(page)
  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

async function createProfileFromHome(page: Page, playerName: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Select or Create a Profile' }).click()
  await page.getByRole('button', { name: /Create New Profile/ }).click()
  await page.getByPlaceholder('Enter display name').fill(playerName)
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Go back' }).click()
  await waitForHome(page)
}

async function startClassicSeason(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu).toBeVisible()
  await playMenu.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

async function advanceToAutosavableProgress(page: Page): Promise<void> {
  const phaseInfo = page.getByRole('dialog', { name: /^Phase info:/ })
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
  const advanceButton = page.getByRole('button', { name: 'Advance to next phase' })

  for (let step = 0; step < 6; step += 1) {
    const { phase } = (await readAppState(page)).game
    if (phase !== 'season_start' && phase !== 'week_start') return

    if (await phaseInfo.isVisible()) {
      await phaseInfo.getByRole('button', { name: 'Close' }).click()
      await expect(phaseInfo).toBeHidden()
    }

    if (await continueButton.isVisible()) {
      await continueButton.click()
    } else {
      await expect(advanceButton).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
      await expect(advanceButton).toBeEnabled()
      await advanceButton.click()
    }
  }

  throw new Error('Autosavable gameplay progress was not reachable.')
}

test.describe('Run exit lifecycle', () => {
  test('abandon season deletes an already-autosaved run and removes Continue Last @core-journey @mobile @release', async ({
    page,
  }) => {
    await page.goto('./')
    await waitForHome(page)
    await createProfileFromHome(page, 'Abandon Regression Player')
    await startClassicSeason(page)

    // Season/week start are intentionally not durable checkpoints. Follow the
    // player-facing phase flow until progress is eligible for background autosave.
    await advanceToAutosavableProgress(page)

    await expect
      .poll(
        () =>
          page.evaluate(
            (prefix) => Object.keys(localStorage).some((key) => key.startsWith(prefix)),
            SAVED_RUNS_KEY_PREFIX
          ),
        { timeout: SCREEN_TIMEOUT_MS }
      )
      .toBe(true)

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: /^home$/i })
      .click()

    const exitDialog = page.getByRole('dialog', { name: 'Save and return home?' })
    await expect(exitDialog).toBeVisible()
    await exitDialog.getByRole('button', { name: 'Abandon Season' }).click()
    await waitForHome(page)

    // Reload so this assertion is against persistence, not only in-memory state.
    await page.reload()
    await waitForHome(page)
    await page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('button', { name: 'Play', exact: true })
      .click()

    const playMenu = page.getByRole('navigation', { name: 'Play menu' })
    await expect(playMenu).toBeVisible()
    await expect(playMenu.getByRole('button', { name: 'Continue Last' })).toHaveCount(0)
    await expect(playMenu.getByRole('button', { name: 'Classic', exact: true })).toBeVisible()
  })
})