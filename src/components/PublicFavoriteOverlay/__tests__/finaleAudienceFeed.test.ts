import { describe, expect, it } from 'vitest'
import {
  buildFinaleAudienceFeed,
  FINALE_AUDIENCE_FEED_TEMPLATES,
} from '../finaleAudienceFeed'

describe('finale audience feed', () => {
  it('provides fifty varied, finalist-aware live messages', () => {
    const feed = buildFinaleAudienceFeed(['Ash', 'Kian'], 22)

    expect(FINALE_AUDIENCE_FEED_TEMPLATES).toHaveLength(50)
    expect(feed).toHaveLength(50)
    expect(new Set(feed.map((item) => item.text)).size).toBe(50)
    expect(feed.every((item) => !item.text.includes('{'))).toBe(true)
    expect(feed.some((item) => item.kind === 'service')).toBe(true)
    expect(feed.some((item) => item.kind === 'comment')).toBe(true)
  })
})
