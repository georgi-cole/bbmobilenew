import { describe, expect, it } from 'vitest'
import { getGame } from '../registry'
import { resolvePremiumGameForAccess } from '../premiumGameAccess'

describe('premium Find Your Twin replacements', () => {
  it.each([['castleRescue'], ['castleRescue2']])('keeps %s without premium access', (key) => {
    const game = getGame(key)!
    expect(resolvePremiumGameForAccess(game, false).key).toBe(key)
  })

  it.each([
    ['castleRescue', 'castleRescueRemastered'],
    ['castleRescue2', 'castleRescue2Remastered'],
  ])('replaces %s for VIP or Premium Challenges access', (key, premiumKey) => {
    const premium = resolvePremiumGameForAccess(getGame(key)!, true)
    expect(premium.key).toBe(premiumKey)
    expect(premium.vipOnly).toBe(true)
    expect(premium.reactComponentKey).toMatch(/Remastered$/)
  })
})
