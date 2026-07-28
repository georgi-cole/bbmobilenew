import { expect, test } from './support/test'

test.describe('Credits cinematic @core-journey', () => {
  test('uses the smooth adaptive renderer on a real mobile viewport', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('bb:homeHubSplashShownThisSession', 'true')
      localStorage.setItem(
        'bbmobilenew_settings_v1',
        JSON.stringify({
          audio: { musicOn: false, sfxOn: false },
          gameUX: { animations: true },
        })
      )
    })

    await page.goto('./#/credits')

    const start = page.getByRole('button', { name: 'Tap to start credits' })
    if (await start.isVisible()) {
      await start.click()
    }

    const cinematic = page.locator('.big-eye-cinematic')
    await expect(cinematic).toBeVisible({ timeout: 15_000 })
    await expect(cinematic).toHaveAttribute('data-cinematic-quality', 'performance')
    await expect(cinematic).toHaveAttribute('data-cinematic-renderer', 'adaptive-dom')
    await expect(page.locator('.light-cinematic')).toBeVisible()
    await expect(page.locator('.credits-webgl canvas')).toHaveCount(0)

    await page.waitForTimeout(2_500)
    await expect(page.locator('.light-cinematic__city')).toBeVisible()
    await page.screenshot({
      path: 'test-results/credits-adaptive-mobile.png',
      fullPage: false,
    })
  })
})
