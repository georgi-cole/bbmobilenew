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
      { id: 'user', name: 'You', isUser: true, status: 'active' },
      { id: 'lia', name: 'Lia', status: 'active' },
      { id: 'nova', name: 'Nova', status: 'active' },
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

  it('breaks a safety promise, applies lasting consequences, and queues a reaction', () => {
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
    expect(social().incomingInteractions).toContainEqual(
      expect.objectContaining({
        id: `broken-promise-reaction-${commitment.id}`,
        fromId: 'lia',
        type: 'warning',
        requiresResponse: true,
        resolved: false,
      })
    )
    expect(getSocialCredibility(social().commitments)).toMatchObject({
      score: 40,
      label: 'Early read',
      broken: 1,
    })
  })

  it('keeps a private vote promise out of house relationships', () => {
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
    expect(social().relationships.lia?.user?.affinity ?? 0).toBe(0)
    expect(social().socialMemory.lia?.user?.gratitude ?? 0).toBe(0)
    expect(social().influenceBank.user).toBe(200)
    expect(social().incomingInteractions).toHaveLength(0)
    expect(getSocialCredibility(social().commitments)).toMatchObject({
      score: 50,
      label: 'Unproven',
      kept: 0,
      broken: 0,
    })
  })
})
