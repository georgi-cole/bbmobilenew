import { describe, expect, it } from 'vitest'
import { normalizeGameCopy, tease } from '../tvLogTemplates'

describe('normalizeGameCopy', () => {
  it('updates sentence-initial Housemates while preserving capitalization', () => {
    expect(normalizeGameCopy('Housemates congratulate Mimi. Alliances are already forming…')).toBe(
      'Players congratulate Mimi. Alliances are already forming…'
    )
  })

  it('updates house terminology in existing saved log messages', () => {
    expect(normalizeGameCopy('The house will vote to eliminate.')).toBe(
      'The hub will vote to eliminate.'
    )
  })

  it('keeps lowercase replacements lowercase when they are mid-sentence', () => {
    expect(normalizeGameCopy('Several housemates are talking.')).toBe(
      'Several players are talking.'
    )
  })

  it('normalizes before truncating teaser copy', () => {
    expect(tease('Housemates make their final pitches before the live vote. 🤝', 80)).toBe(
      'Players make their final pitches before the live vote. 🤝'
    )
  })
})
