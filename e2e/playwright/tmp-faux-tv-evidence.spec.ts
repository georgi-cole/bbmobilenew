import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
  type Page,
} from './support/test'

async function startClassicGame(page: Page): Promise<void> {
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({ timeout: 30_000 })
  await closeDebugPanelIfOpen(page)

  // The location prompt can mount shortly after the Home UI. Give it a small
  // window to appear before using the normal dismissal helper so it cannot
  // intercept the Play button in CI.
  const permissionPrompt = page.getByRole('dialog', { name: 'Allow location' })
  await permissionPrompt.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined)
  await dismissPermissionPromptIfPresent(page)

  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()

  await page
    .getByRole('navigation', { name: 'Play menu' })
    .getByRole('button', { name: 'Classic', exact: true })
    .click()

  await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
    timeout: 30_000,
  })
}

async function openDebugPanel(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Debug Panel' }).click()
  }
  await expect(panel).toBeVisible()
  return panel
}

async function setDebugValue(
  page: Page,
  label: 'Force LOH' | 'Force POS' | 'Set Phase',
  value: string
): Promise<void> {
  const panel = await openDebugPanel(page)
  const row = panel.locator('.dbg-row').filter({ hasText: label }).first()
  await expect(row).toBeVisible()
  await row.locator('select').selectOption(value)
  await row.getByRole('button', { name: 'Set', exact: true }).click()
}

test('captures Faux TV presentation evidence @core-journey', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await startClassicGame(page)

  const initial = await readAppState(page)
  const human = initial.game.players.find((player) => player.isUser)
  expect(human).toBeDefined()

  // 1) Same player owns LOH + Safety -> ALL THE POWER.
  await setDebugValue(page, 'Force LOH', human!.id)
  await setDebugValue(page, 'Force POS', human!.id)
  await setDebugValue(page, 'Set Phase', 'pos_results')

  await page.getByRole('button', { name: 'Close Debug Panel' }).click()
  await expect(page.locator('.all-power-faux-tv')).toBeVisible({ timeout: 5_000 })
  await page.waitForTimeout(400)
  await page.locator('.tv-zone').screenshot({ path: testInfo.outputPath('all-the-power-faux-tv.png') })

  // Let the one-shot effect complete before setting up the next week.
  await expect(page.locator('.all-power-faux-tv')).toBeHidden({ timeout: 5_000 })

  // 2) Make the human the outgoing LOH, then advance into the following day.
  await setDebugValue(page, 'Force LOH', human!.id)
  await setDebugValue(page, 'Set Phase', 'week_end')

  const beforeWeekAdvance = await readAppState(page)
  const pendingBeforeAdvance = beforeWeekAdvance.game.tvFeed
    .filter((event) => event.meta?.broadcastConsumed !== true)
    .map((event) => event.id)

  const panel = await openDebugPanel(page)
  await panel.getByRole('button', { name: 'Advance Phase', exact: true }).click()

  const afterWeekAdvance = await readAppState(page)
  expect(afterWeekAdvance.game.week).toBe(beforeWeekAdvance.game.week + 1)
  expect(afterWeekAdvance.game.prevHohId).toBe(human!.id)

  // Every broadcast that was still pending at the day boundary must now be
  // consumed, so none can reappear as a stale Faux TV Now item.
  for (const eventId of pendingBeforeAdvance) {
    const event = afterWeekAdvance.game.tvFeed.find((candidate) => candidate.id === eventId)
    expect(event?.meta?.broadcastConsumed).toBe(true)
  }

  // Move to the new LOH announcement, where the existing Faux TV card is
  // rewritten instead of opening a separate eligibility popup.
  await panel.getByRole('button', { name: 'Advance Phase', exact: true }).click()
  await page.getByRole('button', { name: 'Close Debug Panel' }).click()

  const tvZone = page.locator('.tv-zone')
  await expect(tvZone).toContainText(/As outgoing LOH, .* is sitting this competition out\./, {
    timeout: 5_000,
  })
  await tvZone.screenshot({ path: testInfo.outputPath('outgoing-loh-faux-tv.png') })
})
