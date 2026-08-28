import { expect, type Locator, type Page } from '@playwright/test'

const VIEWPORT_TOLERANCE_PX = 1

export async function assertNoHorizontalDocumentOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(
    dimensions.scrollWidth,
    `document width ${dimensions.scrollWidth}px exceeds viewport width ${dimensions.clientWidth}px`
  ).toBeLessThanOrEqual(dimensions.clientWidth + VIEWPORT_TOLERANCE_PX)
}

export async function assertElementWithinViewport(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible()

  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }
  })

  expect(geometry.left, 'element extends past the left viewport edge').toBeGreaterThanOrEqual(
    -VIEWPORT_TOLERANCE_PX
  )
  expect(geometry.top, 'element extends past the top viewport edge').toBeGreaterThanOrEqual(
    -VIEWPORT_TOLERANCE_PX
  )
  expect(geometry.right, 'element extends past the right viewport edge').toBeLessThanOrEqual(
    geometry.viewportWidth + VIEWPORT_TOLERANCE_PX
  )
  expect(geometry.bottom, 'element extends past the bottom viewport edge').toBeLessThanOrEqual(
    geometry.viewportHeight + VIEWPORT_TOLERANCE_PX
  )
}
