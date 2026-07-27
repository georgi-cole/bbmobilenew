import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest transforms import.meta.url, so resolve this repository fixture from the checked-out root.
const CSS = readFileSync(
  resolve(process.cwd(), 'src/components/HousematesBioCinematic/HousematesBioCinematic.css'),
  'utf8'
)

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = CSS.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))
  return match?.[1] ?? ''
}

describe('Housemates biography responsive layout contract', () => {
  it('keeps portrait and copy in separate grid regions', () => {
    expect(ruleBody('.hbc-card')).toContain('grid-template-areas:')
    expect(ruleBody('.hbc-card__copy')).toContain('grid-area: copy')
    expect(ruleBody('.hbc-card__portrait-wrap')).toContain('grid-area: portrait')
    expect(ruleBody('.hbc-card__copy')).not.toContain('position: absolute')
  })

  it('allows each housemate focal point to override the default', () => {
    expect(ruleBody('.hbc-card__portrait')).toContain('object-position: center bottom')
    expect(ruleBody('.hbc-card__portrait')).not.toContain('!important')
  })

  it('contains explicit short-phone and wide-screen adaptations', () => {
    expect(CSS).toContain('@media (max-height: 700px) and (orientation: portrait)')
    expect(CSS).toContain('@media (orientation: landscape)')
    expect(CSS).toContain('grid-template-rows: minmax(0, 47%) minmax(0, 53%)')
    expect(CSS).not.toContain('* -')
  })
})
