import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  test,
  type Page,
} from './support/test'
import { assertElementWithinViewport } from './support/layoutAssertions'
import {
  assertElementWithinSafeArea,
  assertNoCriticalOverlap,
  assertResponsiveDocumentContract,
  installSafeAreaProfile,
  safeAreaForProject,
} from './support/responsiveAssertions'

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

async function createProfileFromHome(page: Page, playerName: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Select or Create a Profile' }).click()
  await expect(page.getByRole('heading', { name: /Profiles/ })).toBeVisible()
  await page.getByRole('button', { name: /Create New Profile/ }).click()
  await page.getByPlaceholder('Enter display name').fill(playerName)
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Go back' }).click()
  await waitForHome(page)
}

async function startFreshCampaign(page: Page, playerName: string): Promise<void> {
  await page.goto('./')
  await waitForHome(page)
  await createProfileFromHome(page, playerName)

  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu).toBeVisible()
  await playMenu.getByRole('button', { name: 'Classic', exact: true }).click()
}

function playerNameFor(projectName: string, systemBarsVisible: boolean): string {
  const mode = systemBarsVisible ? 'bars' : 'immersive'
  return `QA-${projectName}-${mode}`.replace(/[^a-z0-9-]/gi, '').slice(0, 28)
}

for (const systemBarsVisible of [true, false]) {
  const chromeMode = systemBarsVisible ? 'system-bars' : 'immersive'

  test.describe(`Responsive game contract - ${chromeMode} @responsive-contract`, () => {
    test.describe.configure({ mode: 'parallel', timeout: 120_000 })

    test(`Home Hub stays usable with ${chromeMode}`, async ({ page }, testInfo) => {
      const insets = safeAreaForProject(testInfo.project.name, systemBarsVisible)
      await installSafeAreaProfile(page, insets)
      await page.goto('./')
      await waitForHome(page)

      const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
      const play = mainMenu.getByRole('button', { name: 'Play', exact: true })
      const profile = mainMenu.getByRole('button', { name: 'Profile', exact: true })

      await assertElementWithinViewport(mainMenu)
      await assertElementWithinSafeArea(play, insets)
      await assertElementWithinSafeArea(profile, insets)
      await assertResponsiveDocumentContract(page, insets)
    })

    test(`Classic game start stays playable with ${chromeMode}`, async ({ page }, testInfo) => {
      const insets = safeAreaForProject(testInfo.project.name, systemBarsVisible)
      await installSafeAreaProfile(page, insets)
      const playerName = playerNameFor(testInfo.project.name, systemBarsVisible)
      await startFreshCampaign(page, playerName)

      const actionZone = page.getByRole('region', { name: 'Game action zone' })
      const toolbar = page.getByRole('toolbar', { name: 'Game actions' })
      const navigation = page.getByRole('navigation', { name: 'Main navigation' })

      await expect(actionZone).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
      await expect(actionZone.getByLabel('Season start', { exact: true })).toBeVisible()
      await expect(actionZone.getByLabel('Season 1, day 1', { exact: true })).toBeVisible()
      await expect(toolbar).toBeVisible()
      await expect(navigation).toBeVisible()
      await expect(page.getByRole('heading', { name: /HUBMATES/ })).toBeVisible()

      await assertElementWithinViewport(actionZone)
      await assertElementWithinViewport(toolbar)
      await assertElementWithinViewport(navigation)
      await assertNoCriticalOverlap(toolbar, navigation)
      await assertResponsiveDocumentContract(page, insets)
    })
  })
}
