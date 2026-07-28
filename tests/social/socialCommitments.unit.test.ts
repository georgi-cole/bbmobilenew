import { describe, expect, it } from 'vitest'
import socialReducer, {
  addSocialCommitment,
  setInfluenceBankEntry,
} from '../../src/social/socialSlice'
import {
  createCommitmentFromInteraction,
  evaluateSocialCommitmentsForAction,
  getSocialCredibility,
  type CommitmentStore,
} from '../../src/social/socialCommitments'
import type { IncomingInteraction, SocialState } from '../../src/social/types'

function interaction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'promise-talk',
    fromId: 'lia',
    type: 'nomination_plea',
    text: 'Please keep me safe.',
    payload: { scenarioKey: 'nominee_hoh_plea' },
    createdAt: 10,
    createdWeek: 2,
    expiresAtWeek: 3,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  }
}

function makeStore(nomineeIds: string[] = []): {
  store: CommitmentStore
  social: () => SocialState
} {
  let social = socialReducer(undefined, { type: 'init' }) as SocialState
  social = socialReducer(
    social,
    setInfluenceBankEntry({ playerId: 'user', value: 200 })
  ) as SocialState
  const game = {
    week: 2,
    nomineeIds,
    povSavedId: null,
    votes: {},
    players: [
      { id: 'user', name: 'You', isUser: true },
      { id: 'lia', name: 'Lia' },
      { id: 'nova', name: 'Nova' },
    ],
  }
  const store: CommitmentStore = {
    getState: () => ({ game, social }),
    dispatch: (action) => {
      if (
        typeof action === 'object' &&
        action &&
        'type' in action &&
        String(action.type).startsWith('social/')
      ) {
        social = socialReducer(social, action as never) as SocialState
      }
      return action
    },
  }
  return { store, social: () => social }
}

describe('social commitments', () => {
  it('creates only concrete promises from affirmative high-stakes replies', () => {
    const accepted = createCommitmentFromInteraction({
      interaction: interaction(),
      responseType: 'positive',
      promisorId: 'user',
      week: 2,
    })
    const vague = createCommitmentFromInteraction({
      interaction: interaction(),
      responseType: 'neutral',
      promisorId: 'user',
      week: 2,
    })

    expect(accepted).toMatchObject({
      kind: 'protect_from_nomination',
      beneficiaryId: 'lia',
      promisorId: 'user',
      status: 'pending',
    })
    expect(vague).toBeNull()
  })

  it('breaks a safety promise when the beneficiary is nominated and applies lasting consequences', () => {
    const { store, social } = makeStore(['lia', 'nova'])
    const commitment = createCommitmentFromInteraction({
      interaction: interaction(),
      responseType: 'positive',
      promisorId: 'user',
      week: 2,
    })!
    store.dispatch(addSocialCommitment(commitment))

    evaluateSocialCommitmentsForAction(store, 'game/commitNominees')

    expect(social().commitments[0]).toMatchObject({
      status: 'broken',
      resolutionReason: 'nominated_after_promise',
    })
    expect(social().relationships.lia?.user?.affinity).toBe(-16)
    expect(social().socialMemory.lia?.user?.resentment).toBe(5)
    expect(social().influenceBank.user).toBe(50)
    expect(getSocialCredibility(social().commitments)).toMatchObject({
      score: 40,
      label: 'Early read',
      broken: 1,
    })
  })

  it('rewards a vote promise that the player actually keeps', () => {
    const { store, social } = makeStore(['lia', 'nova'])
    const voteInteraction = interaction({
      type: 'deal_offer',
      payload: { scenarioKey: 'live_vote_pitch' },
    })
    const commitment = createCommitmentFromInteraction({
      interaction: voteInteraction,
      responseType: 'accept',
      promisorId: 'user',
      week: 2,
    })!
    store.dispatch(addSocialCommitment(commitment))

    evaluateSocialCommitmentsForAction(store, 'game/submitHumanVote', 'nova')

    expect(social().commitments[0]?.status).toBe('kept')
    expect(social().relationships.lia?.user?.affinity).toBe(9)
    expect(social().socialMemory.lia?.user?.gratitude).toBe(4)
    expect(social().influenceBank.user).toBe(300)
    expect(getSocialCredibility(social().commitments)).toMatchObject({
      score: 60,
      label: 'Early read',
      kept: 1,
    })
  })
})
