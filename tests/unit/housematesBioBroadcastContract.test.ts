import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/HousematesBioCinematic/HousematesBioCinematic.css'),
  'utf8'
)

describe('housemate biography talent-first contract', () => {
  it('does not introduce a split-row carousel card that shrinks the housemates', () => {
    const baseCard = css.match(/\.hbc-carousel__card\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    expect(baseCard).not.toMatch(/grid-template-(areas|rows)/)
  })

  it('protects feet from the physical screen edge and keeps the cutout height-driven', () => {
    expect(css).toContain('bottom: clamp(14px, 2dvh, 22px)')
    expect(css).toContain('height: calc(100dvh - 170px)')
    expect(css).toContain('object-fit: contain')
    expect(css).toContain('object-position: center bottom')
  })

  it('keeps full-story copy in a separate readable layer above the talent', () => {
    const copy = css.match(/\.hbc-profile__copy\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    expect(copy).toContain('z-index: 2')
    expect(copy).toContain('min-width: 0')
    expect(copy).toContain('backdrop-filter: blur(14px)')
  })
})
