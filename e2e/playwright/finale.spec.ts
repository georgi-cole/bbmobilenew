import { test, expect, type Page } from '@playwright/test';

// NOTE: Start the dev server before running this test. The app should be
// reachable at http://localhost:3000/bbmobilenew. Example: npm run dev -- --port 3000
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000/bbmobilenew';

/** Open the debug panel by clicking the FAB toggle (if not already open). */
async function openDebugPanel(page: Page) {
  const fab = page.getByRole('button', { name: 'Toggle Debug Panel' });
  await expect(fab).toBeVisible({ timeout: 10000 });
  const panel = page.getByRole('complementary', { name: 'Debug Panel' });
  if (!(await panel.isVisible())) {
    await fab.click();
  }
  await expect(panel).toBeVisible({ timeout: 5000 });
}

test.describe('Finale / Jury flow', () => {
  test('mounts FinalFaceoff and completes finale via DebugPanel', async ({ page }) => {
    // Hash router: navigate to the game screen with debug=1 in the hash search string
    await page.goto(`${BASE}/#/game?debug=1`);

    // Open the DebugPanel (starts closed — click the FAB first)
    await openDebugPanel(page);

    // Force the game directly to jury phase (FinalFaceoff overlay initialises on next render)
    const forceJury = page.getByRole('button', { name: '→ Force jury' });
    await expect(forceJury).toBeVisible({ timeout: 5000 });
    await forceJury.click();

    // Wait for the FinalFaceoff overlay to mount — it has role=dialog and aria-label="Jury Finale"
    const overlay = page.getByRole('dialog', { name: 'Jury Finale' });
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Use the Fast-fwd Finale button in the DebugPanel to complete the finale quickly
    const fastFwd = page.getByRole('button', { name: 'Fast-fwd Finale' });
    await expect(fastFwd).toBeVisible({ timeout: 5000 });
    await fastFwd.click();

    // Wait until the overlay shows winner text (the subtitle shows winner when isComplete)
    // The subtitle may contain 'wins Big Brother' when winner is declared.
    await expect(overlay).toContainText(/wins Big Brother|Winner declared/, { timeout: 5000 });

    // Dismiss overlay — try the overlay Continue button first, then the DebugPanel
    // Dismiss Overlay button, otherwise just wait for the overlay to unmount on its own.
    const continueBtn = overlay.getByRole('button', { name: /Continue/i });
    const dismiss = page.getByRole('button', { name: 'Dismiss Overlay' });
    if (await continueBtn.isVisible({ timeout: 1000 })) {
      await continueBtn.click();
    } else if (await dismiss.isVisible({ timeout: 1000 })) {
      await dismiss.click();
    }

    // Ensure phase has progressed (the overlay unmounts) — the dialog should be hidden
    await expect(overlay).not.toBeVisible({ timeout: 5000 });
  });
});
