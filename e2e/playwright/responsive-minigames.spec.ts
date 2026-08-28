import { closeDebugPanelIfOpen, expect, test, type Page } from './support/test'

import { getPoolByFilter, type GameRegistryEntry } from '../../src/minigames/registry'
import { assertElementWithinViewport } from './support/layoutAssertions'
import {
  assertResponsiveDocumentContract,
  installSafeAreaProfile,
  safeAreaForProject,
} from './support/responsiveAssertions'

const ACTIVE_GAMES = getPoolByFilter({ retired: false })
  .slice()
  .sort((left, right) => left.title.localeCompare(right.title) || left.key.localeCompare(right.key))
const runResponsiveMinigameSweep = process.env.RESPONSIVE_MINIGAME_SWEEP === '1'

async function openLab(page: Page, game: GameRegistryEntry): Promise<void> {
  await page.goto(
    `./#/minigame-lab?game=${encodeURIComponent(game.key)}&seed=424242&players=4&skipRules=1&skipCountdown=1&freeze=1`
  )
  await closeDebugPanelIfOpen(page)
  await page.addStyleTag({
    content: `
      .minigame-lab__panel {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `,
  })
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

if (runResponsiveMinigameSweep) {
  test.describe('Responsive minigame sweep @responsive-minigame', () => {
    for (const systemBarsVisible of [true, false]) {
      const chromeMode = systemBarsVisible ? 'system-bars' : 'immersive'

      test.describe(chromeMode, () => {
        test.describe.configure({ mode: 'parallel', timeout: 60_000 })

        for (const game of ACTIVE_GAMES) {
          test(`${game.key} stays bounded in start and result states`, async ({
            page,
          }, testInfo) => {
            const insets = safeAreaForProject(testInfo.project.name, systemBarsVisible)
            await installSafeAreaProfile(page, insets)
            await openLab(page, game)

            const hostDialog = page.getByRole('dialog', {
              name: new RegExp(`${game.title} minigame`, 'i'),
            })
            await expect(hostDialog).toBeVisible()
            await expect(page.getByTestId('minigame-lab-selected-title')).toHaveText(game.title)
            await assertElementWithinViewport(hostDialog)
            await assertResponsiveDocumentContract(page, insets)

            const menuButton = hostDialog.getByRole('button', { name: 'Open minigame menu' })
            await menuButton.evaluate((button) => (button as HTMLButtonElement).click())
            await hostDialog
              .getByRole('menuitem', { name: /Leave competition/i })
              .evaluate((button) => (button as HTMLButtonElement).click())
            await hostDialog
              .getByRole('button', { name: 'Exit with 0' })
              .evaluate((button) => (button as HTMLButtonElement).click())

            await expect(hostDialog.getByRole('heading', { name: 'Exited early' })).toBeVisible()
            await assertElementWithinViewport(hostDialog)
            await assertResponsiveDocumentContract(page, insets)
          })
        }
      })
    }
  })
}
