import { describe, expect, it } from 'vitest'
import { selectAdvanceEnabled, selectIsWaitingForInput } from '../selectors'

function stateForPhase(phase: string) {
  return {
    game: { phase },
  } as unknown as Parameters<typeof selectIsWaitingForInput>[0]
}

function voxFinalThreeVerdictState(voteResults: unknown) {
  return {
    game: {
      phase: 'final3_decision',
      pendingEviction: { evicteeId: 'bea' },
      voteResults,
      voxPopuli: {
        status: 'active',
        publicVoteContext: 'final3',
      },
    },
  } as unknown as Parameters<typeof selectIsWaitingForInput>[0]
}

describe('Final 4 input guard', () => {
  it('blocks the Play action while the mandatory Final 4 sequence is active', () => {
    const state = stateForPhase('final4_eviction')

    expect(selectIsWaitingForInput(state)).toBe(true)
    expect(selectAdvanceEnabled(state)).toBe(false)
  })

  it('does not block an ordinary non-interactive phase', () => {
    const state = stateForPhase('week_start')

    expect(selectIsWaitingForInput(state)).toBe(false)
    expect(selectAdvanceEnabled(state)).toBe(true)
  })

  it('keeps Play blocked while the Final 3 audience tally is still visible', () => {
    const state = voxFinalThreeVerdictState([{ playerId: 'bea', votes: 78.2 }])

    expect(selectIsWaitingForInput(state)).toBe(true)
    expect(selectAdvanceEnabled(state)).toBe(false)
  })

  it('re-enables Play for the manual Final 2 reveal after the tally closes', () => {
    const state = voxFinalThreeVerdictState(null)

    expect(selectIsWaitingForInput(state)).toBe(false)
    expect(selectAdvanceEnabled(state)).toBe(true)
  })
})
