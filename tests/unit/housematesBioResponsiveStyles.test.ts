import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(
  resolve(process.cwd(), 'src/components/HousematesBioCinematic/HousematesBioCinematic.css'),
  'utf8'
)

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = CSS.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))
  return match?.[1] ?? ''
}

describe('Housemates biography broadcast layout contract', () => {
  it('uses a full-height hero instead of splitting the phone into copy and portrait rows', () => {
    const card = ruleBody('.hbc-card')
    const portraitWrap = ruleBody('.hbc-card__portrait-wrap')

    expect(card).not.toContain('grid-template-areas')
    expect(card).not.toContain('grid-template-rows')
    expect(portraitWrap).toContain('position: absolute')
    expect(portraitWrap).toContain('top: max(48px')
    expect(portraitWrap).toContain('bottom: max(18px')
    expect(portraitWrap).toContain('left: -12vw')
    expect(portraitWrap).toContain('right: -12vw')
  })

  it('keeps the full cutout visible while preserving configured focal positions', () => {
    const portrait = ruleBody('.hbc-card__portrait')

    expect(portrait).toContain('object-fit: contain')
    expect(portrait).toContain('object-position: center bottom')
    expect(portrait).toContain('transform-origin: center bottom')
    expect(portrait).not.toContain('!important')
  })

  it('keeps biography copy subordinate to the talent', () => {
    const copy = ruleBody('.hbc-card__copy')
    const bubble = ruleBody('.hbc-bubble')

    expect(copy).toContain('position: absolute')
    expect(copy).toContain('width: min(47vw, 340px)')
    expect(copy).toContain('max-width: 340px')
    expect(bubble).toContain('-webkit-line-clamp: 4')
  })

  it('contains dedicated short-phone, tablet, and landscape compositions', () => {
    expect(CSS).toContain('@media (max-height: 700px) and (orientation: portrait)')
    expect(CSS).toContain('@media (min-width: 700px) and (orientation: portrait)')
    expect(CSS).toContain('@media (orientation: landscape)')
    expect(CSS).not.toContain('* -')
  })
})
