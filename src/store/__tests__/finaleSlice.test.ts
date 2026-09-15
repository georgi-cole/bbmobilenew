import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import finaleReducer, {
  finalizeFinale,
  forceJurorVote,
  skipAllJurorsThunk,
  startFinale,
} from '../finaleSlice'

const publicProfiles = {
  'finalist-a': {
    playerId: 'finalist-a',
    approval: 65,
    previousApproval: 62,
    seasonApprovals: [56, 61, 65],
    completedDirectionCount: 2,
    cumulativePositiveDelta: 12,
  },
  'finalist-b': {
    playerId: 'finalist-b',
    approval: 50,
    previousApproval: 52,
    seasonApprovals: [54, 50],
    completedDirectionCount: 1,
    cumulativePositiveDelta: 6,
  },
}

function startPayload(overrides: Partial<Parameters<typeof startFinale>[0]> = {}) {
  return {
    finalistIds: ['finalist-a', 'finalist-b'],
    jurorIds: ['juror-a'],
    preJuryIds: [],
    humanPlayerIds: [],
    seed: 123,
    ...overrides,
  }
}

describe('finaleSlice', () => {
  it('only includes the public ballot when America’s Vote is enabled', () => {
    let state = finaleReducer(
      undefined,
      startFinale(
        startPayload({
          cfg: { americasVoteEnabled: false },
          publicApprovalProfiles: publicProfiles,
        })
      )
    )
    expect(state.publicJurorEnabled).toBe(false)

    state = finaleReducer(
      undefined,
      startFinale(
        startPayload({ cfg: { americasVoteEnabled: true }, publicApprovalProfiles: publicProfiles })
      )
    )
    expect(state.publicJurorEnabled).toBe(true)
  })

  it('recovers a tied legacy ballot with a deterministic tiebreak', () => {
    let state = finaleReducer(
      undefined,
      startFinale(startPayload({ jurorIds: ['juror-a', 'juror-b'] }))
    )
    state = finaleReducer(state, forceJurorVote({ jurorId: 'juror-a', finalistId: 'finalist-a' }))
    state = finaleReducer(state, forceJurorVote({ jurorId: 'juror-b', finalistId: 'finalist-b' }))
    state = finaleReducer(state, finalizeFinale({ seed: 987 }))

    expect(state.isComplete).toBe(true)
    expect(state.tieBreakUsed).toBe(true)
    expect(['finalist-a', 'finalist-b']).toContain(state.winnerId)
  })

  it('stops Skip All at an uncast human ballot', () => {
    const store = configureStore({ reducer: { finale: finaleReducer } })
    store.dispatch(
      startFinale(
        startPayload({
          jurorIds: ['human-juror'],
          humanPlayerIds: ['human-juror'],
        })
      )
    )

    store.dispatch(skipAllJurorsThunk(['human-juror'], 123) as never)

    const finale = store.getState().finale
    expect(finale.awaitingHumanJurorId).toBe('human-juror')
    expect(finale.votes['human-juror']).toBeUndefined()
    expect(finale.isComplete).toBe(false)
  })
})
