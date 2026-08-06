import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResolvedAvatarImage from '../../src/components/ResolvedAvatarImage/ResolvedAvatarImage'
import { imageIdToDataUrl } from '../../src/utils/imageDb'

vi.mock('../../src/utils/imageDb', () => ({
  imageIdToDataUrl: vi.fn(),
}))

const mockedImageIdToDataUrl = vi.mocked(imageIdToDataUrl)

describe('ResolvedAvatarImage', () => {
  beforeEach(() => {
    mockedImageIdToDataUrl.mockReset()
  })

  it('resolves a canonical houseguest identifier to a bundled avatar asset', () => {
    render(<ResolvedAvatarImage id="kian" name="Kian" avatar="kian" alt="Kian" />)

    const image = screen.getByRole('img', { name: 'Kian' })
    expect(image.getAttribute('src')).not.toBe('kian')
    expect(image.getAttribute('src')).toContain('Kian_avatar.webp')
  })

  it('loads profile-photo identifiers through IndexedDB before displaying them', async () => {
    mockedImageIdToDataUrl.mockResolvedValue('data:image/png;base64,profile-photo')

    render(
      <ResolvedAvatarImage
        id="user"
        name="Player"
        avatar="profile-photo:photo-1"
        isUser
        alt="Player"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Player' })).toHaveAttribute(
        'src',
        'data:image/png;base64,profile-photo'
      )
    })
    expect(mockedImageIdToDataUrl).toHaveBeenCalledWith('photo-1')
  })

  it('advances through avatar candidates when an image source fails', () => {
    render(<ResolvedAvatarImage id="kian" name="Kian" avatar="kian" alt="Kian" />)

    const image = screen.getByRole('img', { name: 'Kian' })
    const firstSource = image.getAttribute('src')
    fireEvent.error(image)

    expect(image.getAttribute('src')).not.toBe(firstSource)
  })
})
