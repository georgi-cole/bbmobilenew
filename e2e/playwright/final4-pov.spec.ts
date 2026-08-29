import { expect, readAppState, test, type Page } from './support/test'

async function expectTvFeedText(page: Page, pattern: RegExp): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await readAppState(page)
        return state.game.tvFeed.map((event) => event.text).join('\n')
      },
      { timeout: 10000 }
    )
    .toMatch(pattern)
}

/** Navigate to the game screen with the debug panel enabled. */
async function gotoDebug(page: Page) {
  // A fresh run intentionally redirects direct game deep links to Home. Start
  // a deterministic season through the supported Home flow before exercising
  // the debug-only finale setup.
  await page.goto('./#/?debug=1')
  const locationPrompt = page.getByRole('dialog', { name: 'Allow location' })
  await locationPrompt.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined)
  if (await locationPrompt.isVisible()) {
    await locationPrompt.getByRole('button', { name: 'Deny' }).click()
    await expect(locationPrompt).toBeHidden()
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
    timeout: 15000,
  })
}

/** Open the debug panel by clicking the FAB toggle (if not already open). */
async function openDebugPanel(page: Page) {
  const fab = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(fab).toBeVisible({ timeout: 10000 })
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  if (!(await panel.isVisible())) {
    await fab.click()
  }
  await expect(panel).toBeVisible({ timeout: 5000 })
}

/**
 * Force two nominees via the "Force Nominees" row in the DebugPanel.
 * `idx1` and `idx2` are the option indices to pick (0 is the blank placeholder).
 * Default picks indices 1 and 2 (first two alive players).
 */
async function forceNominees(page: Page, idx1 = 1, idx2 = 2) {
  const nomRow = page.locator('.dbg-row', {
    has: page.locator('.dbg-label', { hasText: 'Force Nominees' }),
  })
  const [sel1, sel2] = await nomRow.locator('select').all()
  const opts1 = await sel1.locator('option').all()
  const opts2 = await sel2.locator('option').all()
  if (opts1.length > idx1) await sel1.selectOption({ index: idx1 })
  if (opts2.length > idx2) await sel2.selectOption({ index: idx2 })
  await nomRow.getByRole('button', { name: 'Set' }).click()
}

/**
 * Force a POS winner via the "Force POS" row in the DebugPanel.
 * `playerIndex` selects which alive player becomes POS holder (1 = first in list, 2 = second, etc.).
 * Default is 2 (typically an AI player) to avoid picking the human player at index 1.
 */
async function forcePov(page: Page, playerIndex = 2) {
  const povRow = page.locator('.dbg-row', {
    has: page.locator('.dbg-label', { hasText: 'Force POS' }),
  })
  const sel = povRow.locator('select')
  const opts = await sel.locator('option').all()
  if (opts.length > playerIndex) await sel.selectOption({ index: playerIndex })
  await povRow.getByRole('button', { name: 'Set' }).click()
}

test.describe.serial('Final 4 POS messaging & sequencing @release', () => {
  /**
   * AI POS holder path:
   * 1. Set up nominees and an AI POS winner via DebugPanel.
   * 2. Force phase to final4_eviction.
   * 3. Advance once to emit the plea beat, then advance again for the AI sole-vote decision.
   * 4. Assert TV feed contains plea request, nominee pleas, and the eviction message.
   * 5. Assert game has advanced to Final 3.
   */
  test('AI POS holder — plea messages appear and game advances to final3', async ({ page }) => {
    await gotoDebug(page)
    await openDebugPanel(page)

    // Set up nominees (indices 2 & 3 — both AI players; human is always at index 1)
    // POS holder (index 4) must NOT overlap with nominees (indices 2 and 3)
    await forceNominees(page, 2, 3)
    await forcePov(page, 4) // index 4 = fourth alive player (AI)
    await page.waitForTimeout(500)

    // Force the phase to final4_eviction
    const forceF4Btn = page.getByRole('button', { name: 'Force Final 4' })
    await expect(forceF4Btn).toBeVisible({ timeout: 3000 })
    await forceF4Btn.click()

    // Debug mode intentionally bypasses the public control dock during forced
    // ceremony states. The first debug advance presents the plea beat.
    const advancePhase = page.getByRole('button', { name: 'Advance Phase' })
    await advancePhase.click()
    await expectTvFeedText(page, /asks nominees for their pleas/i)

    // Complete the same plea cinematic callback used by players. For an AI POS
    // holder this callback commits the sole vote and advances to Final 3.
    const skipPleas = page.getByRole('button', { name: 'Skip to end', exact: true })
    await expect(skipPleas).toBeVisible({ timeout: 3000 })
    await skipPleas.click()
    await expectTvFeedText(page, /has chosen to evict/i)

    // Game must have advanced to The Finale — check the phase pill which reliably
    // shows "THE FINALE" without the TVLog duplicate-suppression that hides the
    // "Final 3!" TV-feed entry when it is also the main viewport's latest event.
    await expect(page.locator('.status-pill--phase')).toContainText(/the finale/i, {
      timeout: 10000,
    })
  })

  /**
   * Human POS holder path:
   * 1. Set up nominees and force the human player as POS winner.
   * 2. Force phase to final4_eviction.
   * 3. Click Continue — advance() emits plea messages then sets awaitingPovDecision.
   * 4. Assert plea messages appear in the TV feed.
   * 5. Assert the TvDecisionModal is visible.
   * 6. Select a nominee and confirm — assert eviction message and Final 3 transition.
   */
  test('Human POS holder — plea messages appear, decision modal shown, eviction performed', async ({
    page,
  }) => {
    await gotoDebug(page)
    await openDebugPanel(page)

    // Set up nominees first — use indices 2 & 3 (non-human players; human is at index 1)
    await forceNominees(page, 2, 3)
    // Force the human player as POS winner (index 1 = first alive player = human "You")
    await forcePov(page, 1)

    // Force the phase to final4_eviction
    const forceF4Btn = page.getByRole('button', { name: 'Force Final 4' })
    await expect(forceF4Btn).toBeVisible({ timeout: 3000 })
    await forceF4Btn.click()

    // Debug mode intentionally bypasses the public control dock during forced
    // ceremony states. This dispatches the same advance action directly.
    await page.getByRole('button', { name: 'Advance Phase' }).click()

    // Plea messages must appear in the TV feed
    await expectTvFeedText(page, /asks nominees for their pleas/i)

    // If the ChatOverlay is present (skippable plea cinematic), click "Skip to end"
    // to immediately complete it so the decision modal appears without delay.
    // Use the specific aria-label to avoid matching the debug-panel "Skip Minigame" button.
    const skipBtn = page.getByRole('button', { name: 'Skip to end', exact: true })
    if (await skipBtn.isVisible({ timeout: 1000 })) {
      await skipBtn.click()
    }

    // Decision modal must appear (awaitingPovDecision is now true)
    const decisionModal = page.getByRole('dialog')
    await expect(decisionModal).toBeVisible({ timeout: 5000 })

    // Select the first nominee option from the modal
    const options = decisionModal.getByRole('button').filter({ hasNotText: /Confirm|Change/i })
    await options.first().click()

    // Confirm the selection
    const confirmBtn = decisionModal.getByRole('button', { name: /Confirm/i })
    await expect(confirmBtn).toBeVisible({ timeout: 3000 })
    await confirmBtn.click()

    // TV feed must contain the "has chosen to evict" message and the Final 3 announcement
    await expectTvFeedText(page, /has chosen to evict/i)
    // Game must have advanced to The Finale — check the phase pill (reliable; not subject to TVLog suppression)
    await expect(page.locator('.status-pill--phase')).toContainText(/the finale/i, {
      timeout: 10000,
    })
  })

  /**
   * Final 3 competition flow:
   * 1. Force the game to final3 phase (3-part LOH begins).
   * 2. Advance through all three competition parts.
   * 3. Assert TV feed announcement messages appear before each part's result.
   *
   * NOTE: Because the default game has a human player, advancing from a comp phase
   * launches an interactive minigame. Each minigame is dismissed via the
   * "Dismiss challenge" button (which scores 0 for the human; an AI wins the part).
   * This tests the full human-in-final3 flow end-to-end.
   */
  test('Final 3 competition phases run sequentially with TV feed messages', async ({ page }) => {
    await gotoDebug(page)
    await openDebugPanel(page)

    // Force phase to final3 (the entry point for the three-part LOH sequence)
    const forceF3Btn = page.getByRole('button', { name: 'Force Final 3' })
    await expect(forceF3Btn).toBeVisible({ timeout: 3000 })
    await forceF3Btn.click()

    const continueBtn = page.getByRole('button', { name: 'Advance to next phase' })
    const dismissBtn = page.getByRole('button', { name: 'Dismiss challenge (score 0)' })

    // final3 → final3_comp1: "three-part LOH" announcement
    await expect(continueBtn).toBeVisible({ timeout: 3000 })
    await continueBtn.click()
    await expectTvFeedText(page, /three-part LOH/i)

    // final3_comp1 → final3_comp1_minigame (human present): Part 1 underway message appears.
    // Dismiss the minigame (scores 0 for human; AI wins Part 1).
    // Then advance() result: "Part 1 result" message appears and phase goes to final3_comp2.
    await expect(continueBtn).toBeVisible({ timeout: 3000 })
    await continueBtn.click()
    await expectTvFeedText(page, /Part 1 is underway/i)
    await expect(dismissBtn).toBeVisible({ timeout: 5000 })
    await dismissBtn.click()
    await expectTvFeedText(page, /Part 1 result/i)

    // final3_comp2 → final3_comp2_minigame (human is a Part-2 competitor unless they won Part 1).
    // Dismiss the minigame → "Part 2 result" message appears and phase goes to final3_comp3.
    await expect(continueBtn).toBeVisible({ timeout: 3000 })
    await continueBtn.click()
    await expectTvFeedText(page, /Part 2 is underway/i)
    // Part 2 involves the two Part-1 losers. If the human won Part 1, they sit out Part 2
    // and the game advances deterministically (no minigame). Otherwise dismiss the minigame.
    const isDismissVisible = await dismissBtn.isVisible().catch(() => false)
    if (isDismissVisible) {
      await dismissBtn.click()
    }
    await expectTvFeedText(page, /Part 2 result/i)

    // final3_comp3 → final3_comp3_minigame: Part 3 underway + Final LOH winner announcement.
    await expect(continueBtn).toBeVisible({ timeout: 3000 })
    await continueBtn.click()
    await expectTvFeedText(page, /Part 3 is underway/i)
    // Dismiss the Part 3 minigame if the human is a finalist.
    const isDismissVisible3 = await dismissBtn.isVisible().catch(() => false)
    if (isDismissVisible3) {
      await dismissBtn.click()
    }
    await expectTvFeedText(page, /Final Leader of the House/i)
  })
})
