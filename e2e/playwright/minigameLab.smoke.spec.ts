import { closeDebugPanelIfOpen, test, expect, type Page, type TestInfo } from './support/test'

import { getPoolByFilter, type GameRegistryEntry } from '../../src/minigames/registry'
import { assertNoHorizontalDocumentOverflow } from './support/layoutAssertions'

const ACTIVE_GAMES = getPoolByFilter({ retired: false })
  .slice()
  .sort((left, right) => {
    const titleDiff = left.title.localeCompare(right.title)
    return titleDiff !== 0 ? titleDiff : left.key.localeCompare(right.key)
  })

async function openLab(page: Page, game: GameRegistryEntry): Promise<void> {
  await page.goto(
    `./#/minigame-lab?game=${encodeURIComponent(game.key)}&seed=424242&players=4&skipRules=1&skipCountdown=1&freeze=1`
  )
  await closeDebugPanelIfOpen(page)
}

async function attachSnapshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
}

test.describe('Minigame Lab smoke @smoke @minigame', () => {
  for (const game of ACTIVE_GAMES) {
    test(`${game.key} mounts and exits through the host result contract`, async ({
      page,
    }, testInfo) => {
      await openLab(page, game)

      await expect(page.getByTestId('minigame-lab')).toBeVisible()
      await expect(page.getByTestId('minigame-lab-freeze-indicator')).toHaveText('Freeze on')
      await expect(page.getByTestId('minigame-lab-selected-title')).toHaveText(game.title)
      await expect(page.getByText(game.description, { exact: true })).toBeVisible()
      if (game.instructions.length > 0) {
        await expect(page.getByText(game.instructions[0], { exact: true })).toBeVisible()
      }
      await expect(page.getByTestId('minigame-lab-completion-count')).toHaveText('0')

      const hostDialog = page.getByRole('dialog', {
        name: new RegExp(`${game.title} minigame`, 'i'),
      })
      await expect(hostDialog).toBeVisible()

      const dialogBox = await hostDialog.boundingBox()
      expect(dialogBox?.width ?? 0).toBeGreaterThan(100)
      expect(dialogBox?.height ?? 0).toBeGreaterThan(100)

      await assertNoHorizontalDocumentOverflow(page)
      await attachSnapshot(page, testInfo, `${game.key}-${testInfo.project.name}.png`)

      const exitButton = hostDialog.getByRole('button', { name: 'Exit minigame' })
      await expect(exitButton).toBeVisible()
      await exitButton.click()

      await expect(hostDialog.getByRole('heading', { name: 'Exited early' })).toBeVisible()
      await expect(hostDialog.getByText(/You wins|AI \d+ wins/)).toBeVisible()

      await hostDialog.getByRole('button', { name: /Continue/ }).evaluate((element) => {
        const button = element as HTMLButtonElement
        button.click()
        button.click()
      })
      await expect(hostDialog).toBeVisible()
      await expect(page.getByTestId('minigame-lab-last-result')).toHaveText(
        `${game.title}: completed with 0 [partial]`
      )
      await expect(page.getByTestId('minigame-lab-completion-count')).toHaveText('1')
      await expect(page.getByTestId('minigame-lab-last-result')).toHaveCount(1)
    })
  }
})
