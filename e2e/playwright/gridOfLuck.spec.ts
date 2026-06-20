import { test, expect, type Page } from '@playwright/test';

// NOTE: Playwright starts Vite for this suite via `webServer`.
// Override E2E_BASE_URL if you want to point at a different local host.
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

async function gotoGridOfLuck(page: Page) {
  await page.goto(`${BASE}/#/gol-test`);
  await expect(page.getByRole('heading', { name: /Mystic Chamber/i })).toBeVisible({ timeout: 10000 });
}

async function playThroughOneReveal(page: Page) {
  const eventCard = page.getByTestId('grid-of-luck-event-card');
  const feed = page.getByTestId('grid-of-luck-ritual-feed');
  const boxes = page.getByTestId('grid-of-luck-box');

  await expect(boxes).toHaveCount(20);
  await boxes.nth(10).click({ force: true });

  await expect(eventCard).toContainText(/choice locked/i, { timeout: 3000 });
  await expect(eventCard).toContainText(/you reach for box 11/i, { timeout: 3000 });

  await expect(eventCard).toContainText(/seal opening/i, { timeout: 4000 });
  await expect(eventCard).toContainText(/box 11 opens and reveals/i, { timeout: 4000 });

  await expect(eventCard).toContainText(/continue ritual/i, { timeout: 4000 });
  await expect(feed.getByRole('listitem')).toHaveCount(2);
  await expect(feed.getByRole('listitem').first()).toContainText(/You uncover a hidden bonus/i);
  await expect(feed.getByRole('listitem').nth(1)).toContainText(/The chamber awakens/i);
}

test.describe('Grid of Luck / Mystic Chamber', () => {
  test('reveals a box with a readable beat on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1600 });
    await gotoGridOfLuck(page);

    await expect(page.getByText('Choose a box to begin the ritual.')).toBeVisible();
    await playThroughOneReveal(page);
  });

  test('keeps the key CTA readable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoGridOfLuck(page);

    await expect(page.getByRole('button', { name: /Continue Ritual/i })).toBeHidden();
    await playThroughOneReveal(page);
    await expect(page.getByRole('button', { name: /Continue Ritual/i })).toBeVisible();
    await expect(page.getByTestId('grid-of-luck-player-card').first()).toBeVisible();
    await expect(page.getByTestId('grid-of-luck-box').first()).toBeVisible();
  });
});
