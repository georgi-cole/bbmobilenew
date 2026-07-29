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

  it('uses one automatic full-screen opening slide at a time', () => {
    expect(source).toContain('src-auto-intro__slide')
    expect(source).toContain('AUTOMATIC_INTRO_SLIDES')
    expect(source).toContain('<AnimatePresence mode="wait" initial={false}>')
  })

  it('replaces the technical ladder with the interactive honors and season calendar', () => {
    expect(source).not.toContain("from './EvictionLadder'")
    expect(source).toContain('src-recap-hub__awards')
    expect(source).toContain('src-recap-hub__journey')
    expect(source).toContain('src-awards__list')
    expect(source).toContain('src-finale-calendar')
  })

  it('keeps raw approval numbers and record counts out of editorial copy', () => {
    expect(highlights).not.toContain('approval`')
    expect(highlights).not.toContain('competition ${')
    expect(highlights).not.toContain('nomination ${')
    expect(highlights).toContain("stamp: 'The competitor story'")
    expect(highlights).toContain("stamp: 'The survival story'")
  })
})
