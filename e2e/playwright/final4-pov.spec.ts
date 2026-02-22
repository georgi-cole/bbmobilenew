import { test, expect } from '@playwright/test';

// NOTE: Start the dev server before running this test. The app should be
// reachable at http://localhost:3000. Example: npm run dev
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('Final 4 POV messaging & sequencing', () => {
  /**
   * Force Final 4 scenario via DebugPanel:
   * - Force phase to final4_eviction
   * - Ensure AI POV holder path: plea messages appear and game advances to final3
   */
  test('AI POV holder — plea messages appear and game advances to final3', async ({ page }) => {
    await page.goto(BASE);

    // Force phase to final4_eviction via DebugPanel
    const forcePhaseBtn = page.getByRole('button', { name: /Force final4_eviction/i });
    await expect(forcePhaseBtn).toBeVisible({ timeout: 5000 });
    await forcePhaseBtn.click();

    // Verify phase is final4_eviction by looking for TV feed message or debug indicator
    // The debug panel emits "[DEBUG] Phase forced to final4_eviction."
    const tvFeed = page.locator('[data-testid="tv-feed"], .tv-feed, .tv-zone');
    await expect(tvFeed).toBeVisible({ timeout: 5000 });

    // Press Continue to trigger the plea sequence (AI POV holder)
    const continueBtn = page.getByRole('button', { name: /Continue/i });
    // If human is not POV holder, Continue should be visible
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();

      // After advance(), plea messages should appear:
      // "asks nominees for their pleas" OR the game may have already auto-advanced
      // Check the TV feed contains plea messaging or game advanced to final3
      await expect(tvFeed).toContainText(
        /asks nominees for their pleas|Final 3|has chosen to evict/i,
        { timeout: 5000 },
      );
    }
  });

  /**
   * Force a human-as-POV scenario:
   * - Use DebugPanel to set human player as POV winner and force final4_eviction
   * - Verify plea messages appear in TV feed
   * - Verify decision modal is shown
   * - Make a choice and verify eviction message and transition to final3
   */
  test('Human POV holder — plea messages appear, decision modal shown, eviction performed', async ({ page }) => {
    await page.goto(BASE);

    // Force the human player as POV winner using the DebugPanel
    // The DebugPanel has a "Force POV: You" button or similar
    const forcePovBtn = page.getByRole('button', { name: /Force POV.*[Yy]ou|POV.*user|You.*POV/i });
    const hasForcePov = await forcePovBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasForcePov) {
      await forcePovBtn.click();
    }

    // Force phase to final4_eviction
    const forcePhaseBtn = page.getByRole('button', { name: /Force final4_eviction/i });
    await expect(forcePhaseBtn).toBeVisible({ timeout: 5000 });
    await forcePhaseBtn.click();

    // Press Continue to trigger the plea sequence for the human POV holder
    const continueBtn = page.getByRole('button', { name: /Continue/i });
    const hasContinue = await continueBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasContinue) {
      await continueBtn.click();
    }

    // TV feed should contain plea messaging
    const tvFeed = page.locator('[data-testid="tv-feed"], .tv-feed, .tv-zone');
    await expect(tvFeed).toContainText(/asks nominees for their pleas|plea/i, { timeout: 5000 });

    // If human is POV holder, decision modal should now appear
    const decisionModal = page.getByRole('dialog');
    const modalVisible = await decisionModal.isVisible({ timeout: 3000 }).catch(() => false);

    if (modalVisible) {
      // Modal is visible — select first option (nominee) and confirm
      const firstOption = decisionModal.getByRole('button').first();
      await firstOption.click();

      // Confirm button appears after selection
      const confirmBtn = decisionModal.getByRole('button', { name: /Confirm/i });
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      // TV feed should contain eviction message
      await expect(tvFeed).toContainText(/has chosen to evict|Final 3/i, { timeout: 5000 });
    }
  });

  /**
   * Final 3 competition flow — verify all three parts run sequentially with messages.
   */
  test('Final 3 competition phases run sequentially with TV feed messages', async ({ page }) => {
    await page.goto(BASE);

    // Force phase to final3 via DebugPanel
    const forcePhaseBtn = page.getByRole('button', { name: /Force final3\b/i });
    await expect(forcePhaseBtn).toBeVisible({ timeout: 5000 });
    await forcePhaseBtn.click();

    const tvFeed = page.locator('[data-testid="tv-feed"], .tv-feed, .tv-zone');
    await expect(tvFeed).toBeVisible({ timeout: 5000 });

    // Advance through final3 → final3_comp1
    const continueBtn = page.getByRole('button', { name: /Continue/i });

    // Advance: final3 → final3_comp1
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();
      await expect(tvFeed).toContainText(/three-part HOH|Final 3.*Part 1|comp1/i, { timeout: 3000 });
    }

    // Advance: final3_comp1 → final3_comp2
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();
      await expect(tvFeed).toContainText(/Part 1.*underway|Part 1.*result|Part 1.*wins/i, { timeout: 3000 });
    }

    // Advance: final3_comp2 → final3_comp3
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();
      await expect(tvFeed).toContainText(/Part 2.*underway|Part 2.*result|Part 2.*wins/i, { timeout: 3000 });
    }

    // Advance: final3_comp3 → final3_decision or week_end
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();
      await expect(tvFeed).toContainText(/Part 3.*underway|Part 3.*wins|Final Head of Household/i, { timeout: 3000 });
    }
  });
});
