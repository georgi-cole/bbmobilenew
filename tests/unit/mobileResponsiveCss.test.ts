import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readStylesheet(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('Reality Mode mobile layout contracts', () => {
  it('keeps the phone social flow full-screen with parallel player and action panes', () => {
    const css = readStylesheet('src/components/SocialPanelV2/SocialPanelV2.css')
    const phoneRules = css.slice(
      css.indexOf('@media (max-width: 699px)'),
      css.indexOf('/* Tablet and desktop retain')
    )

    expect(phoneRules).toContain('height: 100dvh')
    expect(phoneRules).toContain('grid-template-columns: minmax(7.75rem, 0.8fr) minmax(0, 1.2fr)')
    expect(phoneRules).toContain('grid-template-columns: 1fr')
    expect(phoneRules).toContain('env(safe-area-inset-bottom)')
  })

  it('keeps My Pulse full-screen with four equal phone tabs', () => {
    const css = readStylesheet('src/components/HousePulse/HousePulse.css')
    const phoneRules = css.slice(
      css.indexOf('@media (max-width: 699px)'),
      css.indexOf('@media (max-width: 359px)')
    )

    expect(phoneRules).toContain('height: 100dvh')
    expect(phoneRules).toContain('max-height: 100dvh')
    expect(phoneRules).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(phoneRules).toContain('env(safe-area-inset-top)')
    expect(phoneRules).toContain('env(safe-area-inset-bottom)')
  })
})
