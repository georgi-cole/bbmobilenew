import { describe, expect, it, vi } from 'vitest'
import { presentationConsistencyMiddleware } from '../presentationConsistencyMiddleware'

function runMiddleware(action: unknown) {
  const state = {
    game: {
      phase: 'nomination_results',
      week: 4,
      tvFeed: [],
      players: [],
      replacementNeeded: false,
    },
  }
  const next = vi.fn((nextAction) => nextAction)
  const api = {
    getState: () => state,
    dispatch: vi.fn(),
  }

  presentationConsistencyMiddleware(api as never)(next as never)(action)
  return next
}

describe('presentationConsistencyMiddleware important broadcasts', () => {
  it('stamps the Vox secret-ballot unlock with the live phase/day and forces it onto Faux TV', () => {
    const next = runMiddleware({
      type: 'game/addTvEvent',
      payload: {
        text: 'The Big Eye has unsealed today’s secret ballots.',
        type: 'diary',
        meta: { major: 'vox_nomination_reveal_unlocked' },
      },
    })

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          type: 'diary',
          meta: expect.objectContaining({
            major: 'vox_nomination_reveal_unlocked',
            phase: 'nomination_results',
            week: 4,
            forceOnTv: true,
          }),
        }),
      })
    )
  })

  it('leaves ordinary TV events untouched', () => {
    const action = {
      type: 'game/addTvEvent',
      payload: {
        text: 'Ordinary diary note',
        type: 'diary',
        meta: { major: 'something_else' },
      },
    }
    const next = runMiddleware(action)

    expect(next).toHaveBeenCalledWith(action)
  })
})
