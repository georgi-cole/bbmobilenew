import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  test,
} from './support/test'

// Broadcast QA covers both portrait and landscape geometry on the real overlay.
test.describe('Housemate biographies @core-journey', () => {
  test('keeps the first housemate full-height with compact side copy', async ({ page }) => {
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

    await page.goto('./')
    const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
    await expect(mainMenu).toBeVisible({ timeout: 30_000 })
    await dismissPermissionPromptIfPresent(page)
    await closeDebugPanelIfOpen(page)

    await mainMenu.getByRole('button', { name: 'Play', exact: true }).click()
    const playMenu = page.getByRole('navigation', { name: 'Play menu' })
    await expect(playMenu).toBeVisible()
    await playMenu.getByRole('button', { name: 'Housemates', exact: true }).click()

    const cinematic = page.getByRole('dialog', { name: 'Meet the Housemates cinematic' })
    await expect(cinematic).toBeVisible()
    await expect(cinematic.getByRole('heading', { name: 'Aria' })).toBeVisible({
      timeout: 10_000,
    })

    const portrait = cinematic.locator('.hbc-card__portrait')
    const portraitWrap = cinematic.locator('.hbc-card__portrait-wrap')
    const copy = cinematic.locator('.hbc-card__copy')
    await expect(portrait).toBeVisible()
    await expect
      .poll(() => portrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)

    const viewport = page.viewportSize()
    const portraitBox = await portraitWrap.boundingBox()
    const copyBox = await copy.boundingBox()
    if (!viewport || !portraitBox || !copyBox) {
      throw new Error('Biography layout measurements are unavailable')
    }

    expect(portraitBox.height).toBeGreaterThan(viewport.height * 0.78)
    expect(portraitBox.y + portraitBox.height).toBeLessThanOrEqual(viewport.height - 10)
    expect(copyBox.width).toBeLessThanOrEqual(viewport.width * 0.5)
    expect(copyBox.x).toBeGreaterThanOrEqual(viewport.width * 0.48)

    await page.screenshot({
      path: 'test-results/housemates-biography-aria-mobile.png',
      fullPage: false,
    })

    await page.setViewportSize({ width: 915, height: 412 })
    await page.waitForTimeout(300)

    const landscapePortraitBox = await portraitWrap.boundingBox()
    const landscapeCopyBox = await copy.boundingBox()
    if (!landscapePortraitBox || !landscapeCopyBox) {
      throw new Error('Landscape biography measurements are unavailable')
    }

    expect(landscapePortraitBox.width).toBeGreaterThan(915 * 0.42)
    expect(landscapePortraitBox.height).toBeGreaterThan(412 * 0.72)
    expect(landscapePortraitBox.y + landscapePortraitBox.height).toBeLessThanOrEqual(412 - 8)
    expect(landscapeCopyBox.x).toBeGreaterThan(915 * 0.5)
    expect(landscapeCopyBox.x + landscapeCopyBox.width).toBeLessThanOrEqual(915 - 20)

    await page.screenshot({
      path: 'test-results/housemates-biography-aria-landscape.png',
      fullPage: false,
    })
  })
})
