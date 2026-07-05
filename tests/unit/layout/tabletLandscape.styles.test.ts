import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim()
}

describe('tablet and landscape layout styles', () => {
  it('uses a two-panel GameScreen cabinet for tablet landscape', () => {
    const gameScreenCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.css'), 'utf8'),
    )

    expect(gameScreenCss).toContain(".game-screen[data-layout-size='tablet-landscape'] { display: grid;")
    expect(gameScreenCss).toContain("grid-template-areas: 'tv roster';")
    expect(gameScreenCss).toContain('grid-template-columns: var(--game-layout-columns, minmax(0, 1fr));')
    expect(gameScreenCss).toContain(".game-screen[data-layout-size='tablet-landscape'] > .tv-zone")
    expect(gameScreenCss).toContain(".game-screen[data-layout-size='tablet-landscape'] > section[aria-labelledby='houseguests-heading']")
    expect(gameScreenCss).toContain('max-height: min(30svh, calc(var(--tv-log-item-h) * var(--tv-log-max-vis)));')
  })

  it('keeps HomeHub chips relative to the cabinet on tablet landscape', () => {
    const homeHubCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/HomeHub/HomeHub.css'), 'utf8'),
    )

    expect(homeHubCss).toContain('@media (min-width: 720px) and (orientation: landscape)')
    expect(homeHubCss).toContain('body:has(.homehub-shell) .app-shell { max-width: 100%; }')
    expect(homeHubCss).toContain('.homehub-frame #intro-hub { --hub-chip-top-offset: 18px;')
    expect(homeHubCss).toContain('width: min(calc(100% - 96px), 760px);')
    expect(homeHubCss).toContain('transform: translate(-50%, -50%);')
    expect(homeHubCss).toContain('.homehub-frame #intro-hub .hub-chip--bottom-left')
  })
})
