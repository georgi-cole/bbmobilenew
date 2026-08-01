import { closeDebugPanelIfOpen, expect, test } from './support/test'

test.describe('Credits cinematic @core-journey', () => {
  test.setTimeout(60_000)

  test('starts the pre-rendered cinematic immediately with live credits', async ({ page }) => {
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
    await closeDebugPanelIfOpen(page)

    const cinematic = page.locator('.credits-media')
    await expect(cinematic).toBeVisible({ timeout: 15_000 })
    await expect(cinematic).toHaveAttribute('data-cinematic-renderer', 'prerendered-video')
    await expect(page.getByLabel('Credits background video')).toBeVisible()
    await expect(page.locator('.credits-webgl canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tap to start credits' })).toHaveCount(0)

    await page.waitForTimeout(500)
    await expect(page.getByLabel('Credits background video')).toBeVisible()
  })
})
