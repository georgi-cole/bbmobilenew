import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AvatarTile from '../AvatarTile'

describe('AvatarTile', () => {
  it('renders the nomination badge asset for nominated players', () => {
    render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        statuses="nominated"
      />,
    )

    const badge = screen.getByLabelText('Nominated')
    const badgeImage = badge.querySelector('img')

    expect(badge).not.toHaveTextContent('❓')
    expect(badgeImage).not.toBeNull()
    expect(badgeImage?.getAttribute('src')).toContain('/assets/avatar_badges/nomination_badge.png')
  })
})
