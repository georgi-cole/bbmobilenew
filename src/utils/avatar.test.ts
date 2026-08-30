import { describe, expect, it } from 'vitest'
import { resolveAvatarCandidates } from './avatar'

describe('resolveAvatarCandidates', () => {
  it('keeps generated Surveyeval portraits ahead of speculative local files', () => {
    const portrait = 'https://api.dicebear.com/9.x/bottts/svg?seed=Zari'

    expect(
      resolveAvatarCandidates({ id: 'survivor-robo-9', name: 'Zari', avatar: portrait })[0]
    ).toBe(portrait)
  })

  it('uses the dedicated Lia and Ali pair portrait ahead of Lia artwork', () => {
    const candidates = resolveAvatarCandidates({
      id: 'lia',
      name: 'Lia and Ali',
      avatar: 'assets/skins/Ali_lia_avatar.webp',
    })

    expect(candidates[0]).toContain('Ali_lia_avatar.webp')
  })
})
