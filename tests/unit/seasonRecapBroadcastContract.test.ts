import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/SeasonRecapCinematic/SeasonRecapCinematic.tsx'),
  'utf8'
)
const highlights = readFileSync(
  resolve(process.cwd(), 'src/components/SeasonRecapCinematic/seasonRecapHighlights.ts'),
  'utf8'
)

describe('season recap broadcast contract', () => {
  it('keeps the real season photoshoot and does not restore the avatar wall', () => {
    expect(source).toContain('thegirls.webp')
    expect(source).toContain('the%20boys.webp')
    expect(source).not.toContain('src-cast-grid')
    expect(source).not.toContain('RecapAvatar')
  })

  it('uses one full-screen photoshoot at a time instead of a split collage', () => {
    expect(source).not.toContain('src-broadcast-photoshoot__reduced-grid')
    expect(source).toContain('reducedMotion ? 3_600 : 3_350')
    expect(source).toContain('<AnimatePresence mode="wait" initial={false}>')
  })

  it('does not expose the technical eviction ladder or archive dashboard', () => {
    expect(source).not.toContain("from './EvictionLadder'")
    expect(source).not.toContain('src-archive-progress')
    expect(source).not.toContain('src-archive-header')
    expect(source).not.toContain('sceneProgress')
    expect(source).not.toContain('seasonPlacement')
  })

  it('keeps raw approval numbers and record counts out of editorial copy', () => {
    expect(highlights).not.toContain('approval`')
    expect(highlights).not.toContain('competition ${')
    expect(highlights).not.toContain('nomination ${')
    expect(highlights).toContain("stamp: 'The competitor story'")
    expect(highlights).toContain("stamp: 'The survival story'")
  })
})
