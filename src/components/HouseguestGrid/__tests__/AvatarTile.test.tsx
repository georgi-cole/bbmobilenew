import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AvatarTile from '../AvatarTile'

describe('AvatarTile', () => {
  it('renders the original question-mark badge for nominated players', () => {
    render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        statuses="nominated"
      />,
    )

    const badge = screen.getByLabelText('Nominated')

    expect(badge).toHaveTextContent('❓')
    expect(badge.querySelector('img')).toBeNull()
  })
})
