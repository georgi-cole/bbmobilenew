import { test, expect, type Page } from '@playwright/test';

// NOTE: Start the dev server before running this test. The app should be
// reachable at http://localhost:3000/bbmobilenew. Example: npm run dev -- --port 3000
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000/bbmobilenew';

/** Navigate to the app with the debug panel enabled (?debug=1). */
async function gotoDebug(page: Page) {
  await page.goto(`${BASE}?debug=1`);
}

/** Open the debug panel by clicking the FAB toggle (if not already open). */
async function openDebugPanel(page: Page) {
  const fab = page.getByRole('button', { name: 'Toggle Debug Panel' });
  await expect(fab).toBeVisible({ timeout: 5000 });
  const panel = page.getByRole('complementary', { name: 'Debug Panel' });
  if (!(await panel.isVisible())) {
    await fab.click();
  }
  await expect(panel).toBeVisible({ timeout: 3000 });
}

/**
 * Force two nominees via the "Force Nominees" row in the DebugPanel.
 * Picks the first two available options from each select (skipping the blank placeholder).
 */
async function forceNominees(page: Page) {
  const nomRow = page.locator('.dbg-row', { has: page.locator('.dbg-label', { hasText: 'Force Nominees' }) });
  const [sel1, sel2] = await nomRow.locator('select').all();
  const opts1 = await sel1.locator('option').all();
  const opts2 = await sel2.locator('option').all();
  // Pick first real option (index 1 skips the blank placeholder)
  if (opts1.length > 1) await sel1.selectOption({ index: 1 });
  // Pick second real option (index 2) to avoid duplicate
  if (opts2.length > 2) await sel2.selectOption({ index: 2 });
  await nomRow.getByRole('button', { name: 'Set' }).click();
}

/**
 * Force a POV winner via the "Force POV" row in the DebugPanel.
 * `playerIndex` selects which alive player becomes POV holder (1 = first in list, 2 = second, etc.).
 * Default is 2 (typically an AI player) to avoid picking the human player at index 1.
 */
async function forcePov(page: Page, playerIndex = 2) {
  const povRow = page.locator('.dbg-row', { has: page.locator('.dbg-label', { hasText: 'Force POV' }) });
  const sel = povRow.locator('select');
  const opts = await sel.locator('option').all();
  if (opts.length > playerIndex) await sel.selectOption({ index: playerIndex });
  await povRow.getByRole('button', { name: 'Set' }).click();
}

test.describe('Final 4 POV messaging & sequencing', () => {
  /**
   * AI POV holder path:
   * 1. Set up nominees and an AI POV winner via DebugPanel.
   * 2. Force phase to final4_eviction.
   * 3. Click Continue — advance() emits plea messages then AI picks the evictee.
   * 4. Assert TV feed contains plea request, nominee pleas, and the eviction message.
   * 5. Assert game has advanced to Final 3.
   */
  test('AI POV holder — plea messages appear and game advances to final3', async ({ page }) => {
    await gotoDebug(page);
    await openDebugPanel(page);

    // Set up nominees and a non-human (AI) POV winner
    await forceNominees(page);
    await forcePov(page, 2); // index 2 = second alive player (AI)

    // Force the phase to final4_eviction
    const forceF4Btn = page.getByRole('button', { name: 'Force Final 4' });
    await expect(forceF4Btn).toBeVisible({ timeout: 3000 });
    await forceF4Btn.click();

    const tvFeed = page.getByTestId('tv-feed');
    await expect(tvFeed).toBeVisible({ timeout: 3000 });

    // Advance — Continue is visible because the AI is the POV holder (no blocking flag)
    const continueBtn = page.getByRole('button', { name: /Continue/i });
    await expect(continueBtn).toBeVisible({ timeout: 3000 });
    await continueBtn.click();

    // After advance(): plea sequence + AI eviction decision should appear in TV feed
    await expect(tvFeed).toContainText(/asks nominees for their pleas/i, { timeout: 5000 });
    await expect(tvFeed).toContainText(/has chosen to evict/i, { timeout: 5000 });

    // Game must have advanced to Final 3
    await expect(tvFeed).toContainText(/Final 3/i, { timeout: 5000 });
  });

  /**
   * Human POV holder path:
   * 1. Set up nominees and force the human player as POV winner.
   * 2. Force phase to final4_eviction.
   * 3. Click Continue — advance() emits plea messages then sets awaitingPovDecision.
   * 4. Assert plea messages appear in the TV feed.
   * 5. Assert the TvDecisionModal is visible.
   * 6. Select a nominee and confirm — assert eviction message and Final 3 transition.
   */
  test('Human POV holder — plea messages appear, decision modal shown, eviction performed', async ({ page }) => {
    await gotoDebug(page);
    await openDebugPanel(page);

    // Set up nominees first (they must not be the human player)
    await forceNominees(page);
    // Force the human player as POV winner (index 1 = first alive player = human "You")
    await forcePov(page, 1);

    // Force the phase to final4_eviction
    const forceF4Btn = page.getByRole('button', { name: 'Force Final 4' });
    await expect(forceF4Btn).toBeVisible({ timeout: 3000 });
    await forceF4Btn.click();

    const tvFeed = page.getByTestId('tv-feed');
    await expect(tvFeed).toBeVisible({ timeout: 3000 });

    // Continue is visible until advance() sets awaitingPovDecision
    const continueBtn = page.getByRole('button', { name: /Continue/i });
    await expect(continueBtn).toBeVisible({ timeout: 3000 });
    await continueBtn.click();

    // Plea messages must appear in the TV feed
    await expect(tvFeed).toContainText(/asks nominees for their pleas/i, { timeout: 5000 });

    // Decision modal must appear (awaitingPovDecision is now true)
    const decisionModal = page.getByRole('dialog');
    await expect(decisionModal).toBeVisible({ timeout: 5000 });

    // Select the first nominee option from the modal
    const options = decisionModal.getByRole('button').filter({ hasNotText: /Confirm|Change/i });
    await options.first().click();

    // Confirm the selection
    const confirmBtn = decisionModal.getByRole('button', { name: /Confirm/i });
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });
    await confirmBtn.click();

    // TV feed must contain the "has chosen to evict" message and the Final 3 announcement
    await expect(tvFeed).toContainText(/has chosen to evict/i, { timeout: 5000 });
    await expect(tvFeed).toContainText(/Final 3/i, { timeout: 5000 });
  });

  /**
   * Final 3 competition flow:
   * 1. Force the game to final3 phase (3-part HOH begins).
   * 2. Advance through all three competition parts.
   * 3. Assert TV feed announcement messages appear before each part's result.
   *
   * NOTE: This test forces the phase directly. The alive player pool in a fresh
   * game may contain more than 3 players; the competition logic picks from
   * whoever is alive, which is valid for messaging/sequencing verification.
   */
  test('Final 3 competition phases run sequentially with TV feed messages', async ({ page }) => {
    await gotoDebug(page);
    await openDebugPanel(page);

    // Force phase to final3 (the entry point for the three-part HOH sequence)
    const forceF3Btn = page.getByRole('button', { name: 'Force Final 3' });
    await expect(forceF3Btn).toBeVisible({ timeout: 3000 });
    await forceF3Btn.click();

    const tvFeed = page.getByTestId('tv-feed');
    await expect(tvFeed).toBeVisible({ timeout: 3000 });

    const continueBtn = page.getByRole('button', { name: /Continue/i });

    // final3 → final3_comp1: "three-part HOH" announcement
    await expect(continueBtn).toBeVisible({ timeout: 3000 });
    await continueBtn.click();
    await expect(tvFeed).toContainText(/three-part HOH/i, { timeout: 5000 });

    // final3_comp1 → final3_comp2: Part 1 underway + result messages
    await expect(continueBtn).toBeVisible({ timeout: 3000 });
    await continueBtn.click();
    await expect(tvFeed).toContainText(/Part 1 is underway/i, { timeout: 5000 });
    await expect(tvFeed).toContainText(/Part 1 result/i, { timeout: 5000 });

    // final3_comp2 → final3_comp3: Part 2 underway + result messages
    await expect(continueBtn).toBeVisible({ timeout: 3000 });
    await continueBtn.click();
    await expect(tvFeed).toContainText(/Part 2 is underway/i, { timeout: 5000 });
    await expect(tvFeed).toContainText(/Part 2 result/i, { timeout: 5000 });

    // final3_comp3 → final3_decision or week_end: Part 3 underway + winner announcement
    await expect(continueBtn).toBeVisible({ timeout: 3000 });
    await continueBtn.click();
    await expect(tvFeed).toContainText(/Part 3 is underway/i, { timeout: 5000 });
    await expect(tvFeed).toContainText(/Final Head of Household/i, { timeout: 5000 });
  });
});
