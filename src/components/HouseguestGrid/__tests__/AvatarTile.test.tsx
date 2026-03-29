import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AvatarTile from '../AvatarTile'
import styles from '../HouseguestGrid.module.css'

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

  it('renders the glass outline layers inside the avatar frame', () => {
    const { container } = render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
      />,
    )

    const avatarWrap = container.querySelector(`.${styles.avatarWrap}`)
    const glassOutline = container.querySelector(`.${styles.glassOutline}`)
    const glassReflection = container.querySelector(`.${styles.glassReflection}`)

    expect(avatarWrap).not.toBeNull()
    expect(avatarWrap?.contains(glassOutline)).toBe(true)
    expect(avatarWrap?.contains(glassReflection)).toBe(true)
  })
})
