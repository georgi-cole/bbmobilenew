import { describe, expect, it } from 'vitest'
import { assignAiGameIdentities, competitionIdentityMultiplier } from '../aiGameIdentity'

type TestIdentityPlayer = {
  id: string
  isUser?: boolean
  aiGameIdentity?: import('../aiGameIdentity').AiGameIdentity
}

const field: TestIdentityPlayer[] = [
  { id: 'user', isUser: true },
  ...Array.from({ length: 15 }, (_, index) => ({ id: `ai-${index}` })),
]

describe('season AI identities', () => {
  it('assigns a stable, balanced identity to every AI but never the user', () => {
    const first = assignAiGameIdentities(field, 12345, 'classic')
    const second = assignAiGameIdentities(field, 12345, 'classic')

    expect(first[0].aiGameIdentity).toBeUndefined()
    expect(first.slice(1).map((player) => player.aiGameIdentity)).toEqual(
      second.slice(1).map((player) => player.aiGameIdentity)
    )
    expect(
      new Set(first.slice(1).map((player) => player.aiGameIdentity?.archetype)).size
    ).toBeGreaterThan(8)
  })

  it('uses survival-focused identities to shape only competition performance', () => {
    const [identity] = assignAiGameIdentities<TestIdentityPlayer>(
      [{ id: 'robo-1' }],
      77,
      'survival'
    ).map((player) => player.aiGameIdentity)
    expect(
      competitionIdentityMultiplier(identity, 'survival', 77, 'robo-1')
    ).toBeGreaterThanOrEqual(0.8)
    expect(competitionIdentityMultiplier(identity, 'survival', 77, 'robo-1')).toBeLessThanOrEqual(
      1.16
    )
  })
})
