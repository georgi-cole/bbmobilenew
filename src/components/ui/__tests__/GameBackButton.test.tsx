import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GameBackButton from '../GameBackButton/GameBackButton'

describe('GameBackButton', () => {
  it('uses the shared vector icon without rendering a platform glyph', () => {
    render(<GameBackButton />)

    const button = screen.getByRole('button', { name: 'Go back' })
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toBe('')
  })

  it('keeps the supplied accessible label while remaining icon-only', () => {
    render(<GameBackButton label="Return to the House" />)

    expect(screen.getByRole('button', { name: 'Return to the House' })).toBeDefined()
  })
})
