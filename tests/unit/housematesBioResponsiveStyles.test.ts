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

describe('Housemates biography interactive layout contract', () => {
  it('uses a contained carousel card instead of splitting it into copy and portrait rows', () => {
    const card = ruleBody('.hbc-carousel__card')

    expect(card).not.toContain('grid-template-areas')
    expect(card).not.toContain('grid-template-rows')
    expect(card).toContain('overflow: hidden')
    expect(card).toContain('height: min(52dvh, 510px)')
  })

  it('keeps the carousel cutout visible with a protected floor margin', () => {
    const portrait = ruleBody('.hbc-carousel__card img')

    expect(portrait).toContain('object-fit: contain')
    expect(portrait).toContain('object-position: center bottom')
    expect(portrait).toContain('bottom: clamp(14px, 2dvh, 22px)')
    expect(portrait).toContain('height: calc(91% - 20px)')
  })

  it('makes the full-story talent height-driven without cropping the cutout', () => {
    const stage = ruleBody('.hbc-profile__portrait-stage')
    const portrait = ruleBody('.hbc-profile__portrait')

    expect(stage).toContain('width: min(112vw, 700px)')
    expect(stage).toContain('height: calc(100dvh - 170px)')
    expect(stage).toContain('margin-left: -23vw')
    expect(portrait).toContain('object-fit: contain')
    expect(portrait).toContain('object-position: center bottom')
  })

  it('contains dedicated short-phone and larger-screen compositions', () => {
    expect(CSS).toContain('@media (max-width: 370px) and (max-height: 700px)')
    expect(CSS).toContain('@media (min-width: 700px)')
    expect(CSS).not.toContain('* -')
  })
})
