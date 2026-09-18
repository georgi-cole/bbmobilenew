import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function getRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  expect(match, `Expected CSS rule for ${selector}`).toBeTruthy()
  return match?.[1] ?? ''
}

describe('Battery Low responsive styles', () => {
  it('fills the minigame host without allowing normal gameplay page scrolling', () => {
    const css = read('src/components/VaultVerdict/VaultVerdict.css')
    const root = getRule(css, '.vault-verdict')
    const stage = getRule(css, '.vault-verdict__stage')
    const board = getRule(css, '.vault-verdict__board')

    expect(root).toContain('height: 100%;')
    expect(root).toContain('min-height: 0;')
    expect(root).toContain('overflow: hidden;')
    expect(root).toContain('var(--minigame-stage-top-padding')
    expect(stage).toContain('grid-template-rows: auto minmax(0, 1fr);')
    expect(stage).toContain('height: 100%;')
    expect(board).toContain('height: 100%;')
    expect(board).toContain('overflow: hidden;')
  })

  it('keeps all 24 batteries in a three-column, eight-row board', () => {
    const css = read('src/components/VaultVerdict/VaultVerdict.css')
    const grid = getRule(css, '.vault-verdict__battery-grid')

    expect(grid).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));')
    expect(grid).toContain('grid-template-rows: repeat(8, minmax(44px, 54px));')
    expect(css).toContain('@media (max-height: 760px) and (orientation: portrait)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('keeps hero reactions inside a fixed center-stage overlay', () => {
    const css = read('src/components/VaultVerdict/VaultVerdict.css')
    const heroStage = getRule(css, '.vault-verdict__hero-stage')
    const heroEvent = getRule(css, '.vault-verdict__hero-event')
    const heroIcon = getRule(css, '.vault-verdict__hero-event-icon')

    expect(heroStage).toContain('position: relative;')
    expect(heroStage).toContain('min-height:')
    expect(heroEvent).toContain('position: absolute;')
    expect(heroEvent).toContain('pointer-events: none;')
    expect(heroIcon).toContain('color: var(--hero-accent);')
    expect(css).toContain('var(--battery-low-stage)')
    expect(css).toContain('.vault-verdict__hero-event.is-inferno')
    expect(css).toContain('.vault-verdict__hero-event.is-blush')
    expect(css).toContain('.vault-verdict__hero-event.is-overcharge')
    expect(css).toContain('.vault-verdict__hero-event.is-power-cell')
    expect(css).toContain('.vault-verdict__hero-event.is-blackout-cell')
  })

  it('uses a labelled Bank Offer sheet and removes the permanent ticker UI', () => {
    const source = read('src/components/VaultVerdict/VaultVerdict.tsx')

    expect(source).toContain('Accept offer')
    expect(source).toContain('Keep playing')
    expect(source).toContain('Counteroffer')
    expect(source).toContain('Insure &amp; continue')
    expect(source).toContain('Blind swap')
    expect(source).toContain('PRESSURE OFFER · NON-NEGOTIABLE')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain('RevealSigil')
    expect(source).toContain('STAGE_BACKGROUND')
    expect(source).toContain('EYE_BANK_CREST')
    expect(source).toContain('vault-verdict__hero-stage')
    expect(source).toContain('vault-verdict__hero-event')
    expect(source).toContain('vault-verdict__offer-bank-mark')
    expect(source).not.toContain('vault-verdict__show-fx')
    expect(source).not.toContain('vault-verdict__lower-third')
    expect(source).not.toContain('vault-verdict__ticker')
    expect(source).not.toContain("'MY'")
  })
})
