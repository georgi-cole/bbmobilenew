import { expect, type Locator, type Page } from '@playwright/test'

import { assertElementWithinViewport, assertNoHorizontalDocumentOverflow } from './layoutAssertions'

export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_SAFE_AREA: SafeAreaInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
})

export function safeAreaForProject(
  projectName: string,
  systemBarsVisible: boolean
): SafeAreaInsets {
  const name = projectName.toLowerCase()

  if (name.includes('ios-small')) {
    return systemBarsVisible ? { top: 20, right: 0, bottom: 0, left: 0 } : NO_SAFE_AREA
  }

  if (name.includes('webkit') || name.includes('ios-')) {
    // Notched / Dynamic-Island-class iPhones keep the hardware safe area even
    // when status text is hidden. The larger value is deliberately conservative.
    const top = name.includes('modern') || name.includes('large') ? 59 : 47
    return { top, right: 0, bottom: 34, left: 0 }
  }

  if (
    name.includes('android') ||
    name.includes('mobile-chromium') ||
    name.includes('compact-mobile') ||
    name.includes('narrow')
  ) {
    return systemBarsVisible
      ? { top: 24, right: 0, bottom: 24, left: 0 }
      : { top: 0, right: 0, bottom: 24, left: 0 }
  }

  return NO_SAFE_AREA
}

export async function installSafeAreaProfile(page: Page, insets: SafeAreaInsets): Promise<void> {
  await page.addInitScript((safeArea) => {
    const apply = () => {
      const root = document.documentElement
      if (!root) return

      root.style.setProperty('--safe-area-inset-top', `${safeArea.top}px`)
      root.style.setProperty('--safe-area-inset-right', `${safeArea.right}px`)
      root.style.setProperty('--safe-area-inset-bottom', `${safeArea.bottom}px`)
      root.style.setProperty('--safe-area-inset-left', `${safeArea.left}px`)
      root.style.setProperty('--safe-top', `${safeArea.top}px`)
      root.style.setProperty('--safe-right', `${safeArea.right}px`)
      root.style.setProperty('--safe-bottom', `${safeArea.bottom}px`)
      root.style.setProperty('--safe-left', `${safeArea.left}px`)
      root.style.setProperty('--app-safe-area-top', `${safeArea.top}px`)
    }

    apply()
    document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, insets)
}

export async function assertNoVerticalDocumentOverflow(page: Page, tolerance = 2): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }))

  expect(
    dimensions.scrollHeight,
    `document height ${dimensions.scrollHeight}px exceeds viewport height ${dimensions.clientHeight}px`
  ).toBeLessThanOrEqual(dimensions.clientHeight + tolerance)
}

export async function assertElementWithinSafeArea(
  locator: Locator,
  insets: SafeAreaInsets,
  tolerance = 1
): Promise<void> {
  await assertElementWithinViewport(locator)

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

  expect(geometry.left, 'element extends into the left unsafe area').toBeGreaterThanOrEqual(
    insets.left - tolerance
  )
  expect(geometry.top, 'element extends into the top unsafe area').toBeGreaterThanOrEqual(
    insets.top - tolerance
  )
  expect(geometry.right, 'element extends into the right unsafe area').toBeLessThanOrEqual(
    geometry.viewportWidth - insets.right + tolerance
  )
  expect(geometry.bottom, 'element extends into the bottom unsafe area').toBeLessThanOrEqual(
    geometry.viewportHeight - insets.bottom + tolerance
  )
}

type InteractiveViolation = {
  label: string
  rect: { top: number; right: number; bottom: number; left: number }
  reason: string
}

export async function assertVisibleInteractiveElementsUsable(
  page: Page,
  insets: SafeAreaInsets
): Promise<void> {
  const violations = await page.evaluate((safeArea): InteractiveViolation[] => {
    const selector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      '[role="menuitem"]:not([aria-disabled="true"])',
      '[role="tab"]:not([aria-disabled="true"])',
    ].join(',')

    const viewport = {
      top: safeArea.top,
      right: window.innerWidth - safeArea.right,
      bottom: window.innerHeight - safeArea.bottom,
      left: safeArea.left,
    }

    const isScrollableAncestor = (element: Element): boolean => {
      let ancestor = element.parentElement
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor)
        const scrollsY =
          /(auto|scroll)/.test(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1
        const scrollsX =
          /(auto|scroll)/.test(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + 1
        if (scrollsY || scrollsX) return true
        ancestor = ancestor.parentElement
      }
      return false
    }

    const labelFor = (element: Element): string => {
      const aria = element.getAttribute('aria-label')
      if (aria) return aria
      const testId = element.getAttribute('data-testid')
      if (testId) return `[data-testid=${testId}]`
      const text = element.textContent?.replace(/\s+/g, ' ').trim()
      return text?.slice(0, 80) || element.tagName.toLowerCase()
    }

    const issues: InteractiveViolation[] = []
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const htmlElement = element as HTMLElement
      const style = getComputedStyle(htmlElement)
      const rect = htmlElement.getBoundingClientRect()

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0 ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        continue
      }

      // Controls intentionally outside the current view inside a real scroll
      // container are still reachable and should not be treated as clipping bugs.
      if (isScrollableAncestor(element)) continue

      const reasons: string[] = []
      if (rect.left < viewport.left - 1) reasons.push('left edge outside usable viewport')
      if (rect.top < viewport.top - 1) reasons.push('top edge inside unsafe area')
      if (rect.right > viewport.right + 1) reasons.push('right edge outside usable viewport')
      if (rect.bottom > viewport.bottom + 1) reasons.push('bottom edge inside unsafe area')

      if (reasons.length > 0) {
        issues.push({
          label: labelFor(element),
          rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
          reason: reasons.join(', '),
        })
      }
    }

    return issues
  }, insets)

  expect(
    violations,
    `interactive viewport violations:\n${JSON.stringify(violations, null, 2)}`
  ).toEqual([])
}

export async function assertNoCriticalOverlap(upper: Locator, lower: Locator): Promise<void> {
  await expect(upper).toBeVisible()
  await expect(lower).toBeVisible()

  const [upperBox, lowerBox] = await Promise.all([upper.boundingBox(), lower.boundingBox()])
  expect(upperBox, 'upper critical element should have measurable geometry').not.toBeNull()
  expect(lowerBox, 'lower critical element should have measurable geometry').not.toBeNull()
  if (!upperBox || !lowerBox) return

  expect(
    upperBox.y + upperBox.height,
    'upper critical element overlaps the element below it'
  ).toBeLessThanOrEqual(lowerBox.y + 1)
}

export async function assertResponsiveDocumentContract(
  page: Page,
  insets: SafeAreaInsets,
  options: { allowVerticalScroll?: boolean } = {}
): Promise<void> {
  await assertNoHorizontalDocumentOverflow(page)
  if (!options.allowVerticalScroll) await assertNoVerticalDocumentOverflow(page)
  await assertVisibleInteractiveElementsUsable(page, insets)
}
