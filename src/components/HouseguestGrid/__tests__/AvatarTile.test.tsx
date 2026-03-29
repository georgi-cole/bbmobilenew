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

  it('renders the layered glass shell inside the avatar frame', () => {
    const { container } = render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
      />,
    )

    const avatarWrap = container.querySelector(`.${styles.avatarWrap}`)
    const glassShell = container.querySelector(`.${styles.glassShell}`)
    const glassShellBorder = container.querySelector(`.${styles.glassShellBorder}`)
    const glassShellBands = container.querySelector(`.${styles.glassShellBands}`)
    const glassShellTopShine = container.querySelector(`.${styles.glassShellTopShine}`)
    const glassShellBlobPink = container.querySelector(`.${styles.glassShellBlobPink}`)
    const glassShellBlobCyan = container.querySelector(`.${styles.glassShellBlobCyan}`)
    const glassShellBottomCurve = container.querySelector(`.${styles.glassShellBottomCurve}`)

    expect(avatarWrap).not.toBeNull()
    expect(avatarWrap?.contains(glassShell)).toBe(true)
    expect(glassShell?.contains(glassShellBorder)).toBe(true)
    expect(glassShell?.contains(glassShellBands)).toBe(true)
    expect(glassShell?.contains(glassShellTopShine)).toBe(true)
    expect(glassShell?.contains(glassShellBlobPink)).toBe(true)
    expect(glassShell?.contains(glassShellBlobCyan)).toBe(true)
    expect(glassShell?.contains(glassShellBottomCurve)).toBe(true)
  })

  it('supports compact avatar shell radius hooks', () => {
    const { container } = render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        compact
      />,
    )

    expect(container.querySelector(`.${styles.compactTile}`)).not.toBeNull()
  })
})
