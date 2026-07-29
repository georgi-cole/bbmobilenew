import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { closeDebugPanelIfOpen, expect, test, type Page } from './support/test'

import { getPoolByFilter, type GameRegistryEntry } from '../../src/minigames/registry'
import { assertNoHorizontalDocumentOverflow } from './support/layoutAssertions'

const writeVisualAudit = process.env.VISUAL_AUDIT_WRITE === '1'
const visualAuditRoot = path.resolve(process.cwd(), 'docs/visual-audit/current')

const ACTIVE_GAMES = getPoolByFilter({ retired: false })
  .slice()
  .sort((left, right) => left.title.localeCompare(right.title) || left.key.localeCompare(right.key))

async function openLab(page: Page, game: GameRegistryEntry): Promise<void> {
  await page.goto(
    `./#/minigame-lab?game=${encodeURIComponent(game.key)}&seed=424242&players=4&skipRules=1&skipCountdown=1&freeze=1`
  )
  await closeDebugPanelIfOpen(page)
}

async function writeScreenshot(
  page: Page,
  projectName: string,
  gameKey: string,
  state: 'start' | 'partial-result'
): Promise<void> {
  const gameDirectory = path.join(visualAuditRoot, projectName, gameKey)
  await mkdir(gameDirectory, { recursive: true })
  await page.screenshot({ path: path.join(gameDirectory, `${state}.png`) })
}

test.describe('Minigame visual audit @visual-audit', () => {
  test.skip(!writeVisualAudit, 'Visual audit artifacts are generated only by npm run audit:visual')

  for (const game of ACTIVE_GAMES) {
    test(`${game.key} captures start and partial-result states`, async ({ page }, testInfo) => {
      await openLab(page, game)

      const hostDialog = page.getByRole('dialog', {
        name: new RegExp(`${game.title} minigame`, 'i'),
      })
      await expect(hostDialog).toBeVisible()
      await expect(page.getByTestId('minigame-lab-selected-title')).toHaveText(game.title)
      await assertNoHorizontalDocumentOverflow(page)
      await writeScreenshot(page, testInfo.project.name, game.key, 'start')

      const menuButton = hostDialog.getByRole('button', { name: 'Open minigame menu' })
      await menuButton.click()
      await hostDialog.getByRole('menuitem', { name: /Leave competition/i }).click()
      await hostDialog.getByRole('button', { name: 'Exit with 0' }).click()

      await expect(hostDialog.getByRole('heading', { name: 'Exited early' })).toBeVisible()
      await assertNoHorizontalDocumentOverflow(page)
      await writeScreenshot(page, testInfo.project.name, game.key, 'partial-result')
    })
  }
})
