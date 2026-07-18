import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AvatarTile from '../AvatarTile'

describe('AvatarTile', () => {
  it('exposes interaction guidance without an unrelated visual indicator', () => {
    const { container } = render(
      <AvatarTile name="Taylor" onClick={vi.fn()} descriptionId="roster-help" />,
    )
    const tile = screen.getByRole('button', { name: 'Taylor' })
    expect(tile).toHaveAttribute('aria-describedby', 'roster-help')
    expect(tile.className).toContain('interactive')
    expect(container.querySelector('[class*="interactionCue"]')).toBeNull()
  })
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
