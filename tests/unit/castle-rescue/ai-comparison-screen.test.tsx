import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FindYourTwin2 from '../../../src/screens/FindYourTwin2/FindYourTwin2'
import FindYourTwinExperiment, {
  buildFindYourTwinStandings,
} from '../../../src/screens/FindYourTwinExperiment/FindYourTwinExperiment'

describe('Find Your Twin AI comparison entry points', () => {
  it('lets the player choose Part 1 or Part 2 before playing against the AIs', () => {
    render(<FindYourTwinExperiment />)

    const gameSelect = screen.getByRole('combobox', { name: 'Game' })
    expect(gameSelect).toHaveValue('classic')
    expect(screen.getByRole('button', { name: 'Play against the AIs' })).toBeInTheDocument()

    fireEvent.change(gameSelect, { target: { value: 'benny-lenny' } })
    expect(gameSelect).toHaveValue('benny-lenny')
  })

  it('ranks the player against scores earned by the AI action traces', () => {
    const standings = buildFindYourTwinStandings(
      { finalScore: 790, rescued: true, elapsedMs: 122_300 },
      [
        {
          id: 'nova',
          name: 'Nova',
          finalScore: 1145,
          rescued: true,
          elapsedMs: 57_600,
        },
        {
          id: 'milo',
          name: 'Milo',
          finalScore: 695,
          rescued: true,
          elapsedMs: 65_400,
        },
        {
          id: 'zara',
          name: 'Zara',
          finalScore: 658,
          rescued: true,
          elapsedMs: 83_300,
        },
      ]
    )

    expect(standings.map(({ name, score }) => [name, score])).toEqual([
      ['Nova', 1145],
      ['You', 790],
      ['Milo', 695],
      ['Zara', 658],
    ])
  })

  it('links the Part 2 preview directly to the AI comparison lab', () => {
    render(<FindYourTwin2 />)

    expect(screen.getByRole('link', { name: 'Play against AIs' })).toHaveAttribute(
      'href',
      '#/find-your-twin-experiment'
    )
  })
})
