import { test, expect } from '@playwright/test';

// NOTE: Start the dev server before running this test. The app should be
// reachable at http://localhost:3000/bbmobilenew. Example: npm run dev -- --port 3000
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000/bbmobilenew';

test.describe('Finale / Jury flow', () => {
  test('mounts FinalFaceoff and completes finale via DebugPanel', async ({ page }) => {
    await page.goto(`${BASE}/#/?debug=1`);

    // Open DebugPanel — DebugPanel is mounted in AppShell; ensure it's visible
    // The debug controls render a section with title "Finale / Jury"; find the
    // button that forces the phase to jury.

    // Expand debug panel if collapsed (the panel markup may vary). We'll search
    // for the button labelled '→ Force jury'.
    const forceJury = page.getByRole('button', { name: /Force jury/ });
    await expect(forceJury).toBeVisible();
    await forceJury.click();

    // Wait for the FinalFaceoff overlay to mount — it has role=dialog and aria-label="Jury Finale"
    const overlay = page.getByRole('dialog', { name: 'Jury Finale' });
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Use the Fast-fwd Finale button in the DebugPanel to complete the finale quickly
    const fastFwd = page.getByRole('button', { name: /Fast-fwd Finale/ });
    await expect(fastFwd).toBeVisible();
    await fastFwd.click();

    // Wait until the overlay shows winner text (the subtitle shows winner when isComplete)
    // The subtitle may contain 'wins Big Brother' when winner is declared.
    await expect(overlay).toContainText(/wins Big Brother|Winner declared/, { timeout: 5000 });

    // Optionally dismiss overlay if Dismiss button present
    const dismiss = page.getByRole('button', { name: /Dismiss Overlay/ });
    if (await dismiss.isVisible()) {
      await dismiss.click();
    }

    // Ensure phase has progressed (the overlay unmounts) — the dialog should be hidden
    await expect(overlay).not.toBeVisible({ timeout: 3000 });
  });
});
