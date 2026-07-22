import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Rules from '../src/screens/Rules/Rules'

describe('Rules screen', () => {
  it('renders the complete player guide without invalid list-key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      render(
        <MemoryRouter>
          <Rules />
        </MemoryRouter>
      )

      expect(screen.getByRole('heading', { name: 'How to Play' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Finale' })).toBeInTheDocument()
      expect(screen.getAllByRole('article').length).toBeGreaterThan(20)
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain(
        'Each child in a list should have a unique "key" prop'
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
