import { test, expect, type Page, type TestInfo } from '@playwright/test';

import { getPoolByFilter, type GameRegistryEntry } from '../../src/minigames/registry';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
const ACTIVE_GAMES = getPoolByFilter({ retired: false }).slice().sort((left, right) => {
  const titleDiff = left.title.localeCompare(right.title);
  return titleDiff !== 0 ? titleDiff : left.key.localeCompare(right.key);
});

async function openLab(page: Page, game: GameRegistryEntry): Promise<void> {
  const url = new URL(`${BASE}/`);
  url.hash = `#/minigame-lab?game=${encodeURIComponent(game.key)}&seed=424242&players=4&skipRules=1&skipCountdown=1&freeze=1`;
  await page.goto(url.toString());
}

async function attachSnapshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

async function assertNoOverflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });

  expect(hasOverflow).toBe(false);
}

test.describe('Minigame Lab smoke', () => {
  for (const game of ACTIVE_GAMES) {
    test(`${game.key} renders in the lab`, async ({ page }, testInfo) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: page.viewportSize()?.height ?? 720 });
      await openLab(page, game);

      await expect(page.getByTestId('minigame-lab')).toBeVisible();
      await expect(page.getByTestId('minigame-lab-freeze-indicator')).toHaveText('Freeze on');
      await expect(page.getByTestId('minigame-lab-selected-title')).toHaveText(game.title);

      const hostDialog = page.getByRole('dialog', { name: new RegExp(`${game.title} minigame`, 'i') });
      await expect(hostDialog).toBeVisible();

      const dialogBox = await hostDialog.boundingBox();
      expect(dialogBox?.width ?? 0).toBeGreaterThan(100);
      expect(dialogBox?.height ?? 0).toBeGreaterThan(100);

      await assertNoOverflow(page);
      await attachSnapshot(page, testInfo, `${game.key}-${testInfo.project.name}.png`);

      expect(consoleErrors, `console errors while loading ${game.key}`).toEqual([]);
      expect(pageErrors, `page errors while loading ${game.key}`).toEqual([]);
    });
  }
});
