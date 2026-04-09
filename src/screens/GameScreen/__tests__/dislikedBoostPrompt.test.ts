import { describe, expect, it } from 'vitest'
import {
  DISLIKED_BOOST_PROMPT_DESCRIPTION,
  shouldShowDislikedBoostPrompt,
} from '../dislikedBoostPrompt'

describe('disliked boost prompt helpers', () => {
  it('uses the trimmed public approval prompt copy', () => {
    expect(DISLIKED_BOOST_PROMPT_DESCRIPTION).toBe(
      'Watch a short ad to boost your public approval.',
    )
    expect(DISLIKED_BOOST_PROMPT_DESCRIPTION).not.toMatch(/4[–-]10%|random/i)
  })

  it('limits the prompt to once per day even if approval later recovers', () => {
    expect(shouldShowDislikedBoostPrompt(35, null, '2026-04-09')).toBe(true)

    expect(shouldShowDislikedBoostPrompt(45, '2026-04-09', '2026-04-09')).toBe(false)

    expect(shouldShowDislikedBoostPrompt(35, '2026-04-09', '2026-04-09')).toBe(false)
  })

  it('allows the prompt to return on a later day when approval is below 40 again', () => {
    expect(shouldShowDislikedBoostPrompt(35, '2026-04-09', '2026-04-10')).toBe(true)
    expect(shouldShowDislikedBoostPrompt(19, '2026-04-09', '2026-04-10')).toBe(true)
  })
})
