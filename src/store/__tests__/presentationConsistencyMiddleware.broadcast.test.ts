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

function createPendingVoxVoteHarness() {
  const state = {
    game: {
      phase: 'live_vote',
      week: 4,
      tvFeed: [],
      players: [],
      replacementNeeded: false,
      voxPopuli: {
        status: 'active',
        awaitingPublicVote: true,
        publicVoteContext: 'eviction',
      },
    },
  }
  const next = vi.fn((nextAction) => nextAction)
  const api = {
    getState: () => state,
    dispatch: vi.fn(),
  }
  const middleware = presentationConsistencyMiddleware(api as never)(next as never)
  return { middleware, next }
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

  it('adds missing live scope to any event explicitly forced onto Faux TV', () => {
    const next = runMiddleware({
      type: 'game/addTvEvent',
      payload: {
        text: 'A high-priority runtime prompt.',
        type: 'game',
        channels: ['tv', 'mainLog'],
        meta: {
          forceOnTv: true,
          broadcastPriority: 'critical',
          major: 'runtime_prompt',
        },
      },
    })

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          meta: expect.objectContaining({
            forceOnTv: true,
            phase: 'nomination_results',
            week: 4,
          }),
        }),
      })
    )
  })

  it('preserves an explicitly authored phase/day on a forced Faux TV event', () => {
    const next = runMiddleware({
      type: 'game/addTvEvent',
      payload: {
        text: 'Already scoped.',
        type: 'game',
        meta: {
          forceOnTv: true,
          phase: 'week_end',
          week: 3,
        },
      },
    })

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          meta: expect.objectContaining({
            forceOnTv: true,
            phase: 'week_end',
            week: 3,
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

  it('relabels the generic LOH competition broadcast as immunity during active Vox', () => {
    let state = {
      game: {
        phase: 'week_start',
        week: 4,
        tvFeed: [] as unknown[],
        players: [],
        replacementNeeded: false,
        voxPopuli: { status: 'active' },
      },
    }
    const next = vi.fn((nextAction) => {
      state = {
        game: {
          ...state.game,
          phase: 'loh_comp',
          tvFeed: [
            {
              id: 'vox-competition-start',
              text: 'The Leader of the Hub competition has begun! 🏆 Who will win power today?',
              type: 'game',
              timestamp: 1,
              meta: {
                week: 4,
                phase: 'loh_comp',
                broadcastTemplateId: 'loh.competition-start',
              },
            },
          ],
        },
      }
      return nextAction
    })
    const api = {
      getState: () => state,
      dispatch: vi.fn(),
    }

    presentationConsistencyMiddleware(api as never)(next as never)({ type: 'game/advance' })

    expect(api.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'game/updateTvEvent',
        payload: expect.objectContaining({
          id: 'vox-competition-start',
          text: 'The Immunity Competition has begun! 🛡️ Who will secure safety today?',
          type: 'game',
        }),
      })
    )
  })
})

describe('presentationConsistencyMiddleware Vox audience-vote Play gate', () => {
  it('rejects an un-authorized normal Vox audience vote commit', () => {
    runMiddleware({ type: 'test/reset-vox-vote-gate' })
    const { middleware, next } = createPendingVoxVoteHarness()
    const commit = {
      type: 'game/commitVoxAudienceVote',
      payload: {
        context: 'eviction',
        percentages: { a: 55, b: 45 },
        rankedIds: ['a', 'b'],
      },
    }

    middleware(commit)

    expect(next).not.toHaveBeenCalled()
  })

  it('allows exactly the next Vox audience vote commit after an explicit Play authorization', () => {
    runMiddleware({ type: 'test/reset-vox-vote-gate' })
    const { middleware, next } = createPendingVoxVoteHarness()
    const authorization = { type: 'presentation/authorizeVoxAudienceVoteResolution' }
    const commit = {
      type: 'game/commitVoxAudienceVote',
      payload: {
        context: 'eviction',
        percentages: { a: 55, b: 45 },
        rankedIds: ['a', 'b'],
      },
    }

    middleware(authorization)
    middleware(commit)

    expect(next).toHaveBeenCalledWith(authorization)
    expect(next).toHaveBeenCalledWith(commit)

    next.mockClear()
    middleware(commit)
    expect(next).not.toHaveBeenCalled()
  })

  it('does not gate Final Three Vox audience commits', () => {
    runMiddleware({ type: 'test/reset-vox-vote-gate' })
    const state = {
      game: {
        phase: 'final3_decision',
        week: 9,
        tvFeed: [],
        players: [],
        replacementNeeded: false,
        voxPopuli: {
          status: 'active',
          awaitingPublicVote: true,
          publicVoteContext: 'final3',
        },
      },
    }
    const next = vi.fn((nextAction) => nextAction)
    const api = { getState: () => state, dispatch: vi.fn() }
    const middleware = presentationConsistencyMiddleware(api as never)(next as never)
    const commit = {
      type: 'game/commitVoxAudienceVote',
      payload: {
        context: 'final3',
        percentages: { a: 55, b: 45 },
        rankedIds: ['a', 'b'],
      },
    }

    middleware(commit)

    expect(next).toHaveBeenCalledWith(commit)
  })
})
