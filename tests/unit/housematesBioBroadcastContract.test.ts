import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/HousematesBioCinematic/HousematesBioCinematic.css'),
  'utf8'
)

describe('housemate biography talent-first contract', () => {
  it('does not restore the split-screen phone grid that shrank the housemates', () => {
    const baseCard = css.match(/\.hbc-card\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    expect(baseCard).not.toMatch(/grid-template-(areas|rows)/)
  })

  it('protects feet from the physical screen edge and keeps the cutout height-driven', () => {
    expect(css).toContain(
      'bottom: max(18px, calc(env(safe-area-inset-bottom, 0px) + 10px))'
    )
    expect(css).toContain('object-fit: contain')
    expect(css).toContain('transform-origin: center bottom')
  })

  it('caps the copy treatment so it cannot become the dominant half of the frame', () => {
    expect(css).toContain('width: min(47vw, 340px)')
    expect(css).toContain('max-width: 340px')
    expect(css).toContain('-webkit-line-clamp: 4')
  })
})
