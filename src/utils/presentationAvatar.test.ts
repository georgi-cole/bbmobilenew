import { describe, expect, it } from 'vitest'
import {
  resolvePresentationAvatar,
  resolvePresentationAvatarCandidates,
} from './presentationAvatar'
import { getPresentationAvatarPreloadUrls } from './avatarPreloadCandidates'

describe('presentation avatar assets', () => {
  it('prefers the grey WebP and exposes the PNG fallback', () => {
    const source = '/assets/skins/Finn_avatar.webp'
    expect(resolvePresentationAvatar(source)).toBe('/assets/skins/backup-grey-lux/Finn_avatar.webp')
    expect(resolvePresentationAvatarCandidates(source)).toEqual([
      '/assets/skins/backup-grey-lux/Finn_avatar.webp',
      '/assets/skins/backup-grey-lux/Finn_avatar.png',
    ])
  })

  it('does not rewrite non-canonical or already-grey assets', () => {
    expect(resolvePresentationAvatar('/assets/skins/Finn_avatar.png')).toBe(
      '/assets/skins/Finn_avatar.png'
    )
    expect(resolvePresentationAvatar('/assets/skins/backup-grey-lux/Finn_avatar.webp')).toBe(
      '/assets/skins/backup-grey-lux/Finn_avatar.webp'
    )
  })

  it('includes grey WebP and PNG candidates in gameplay preload URLs', () => {
    const urls = getPresentationAvatarPreloadUrls([{ id: 'finn', name: 'Finn', avatar: '' }])
    expect(
      urls.some((url) => url.includes('/backup-grey-lux/') && url.endsWith('_avatar.webp'))
    ).toBe(true)
    expect(
      urls.some((url) => url.includes('/backup-grey-lux/') && url.endsWith('_avatar.png'))
    ).toBe(true)
  })
})
