import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '../../types'
import gameReducer, {
  advance,
  createInitialGameState,
  submitPosTieBreak,
  submitPovSaveTarget,
} from '../gameSlice'

function makePlayer(id: string, name: string, isUser = false): Player {
  return { id, name, avatar: '', status: 'active', isUser }
}

function coLohFixture(stage: 'replacement' | 'voting' | 'tie'): GameState {
  const state = createInitialGameState({ seed: 7331 })
  const players = state.players.map((player) => ({ ...player, status: 'active' as const }))
  const ensure = (id: string, name: string, isUser = false) => {
    const existing = players.find((player) => player.id === id)
    if (existing) return existing
    const created = makePlayer(id, name, isUser)
    players.push(created)
    return created
  }
  const ivy = ensure('ivy', 'Ivy')
  const blue = ensure('blue', 'Blue')
  const user = players.find((player) => player.isUser) ?? ensure('qa-user', 'You', true)
  const nova = ensure('nova', 'Nova')
  const rae = ensure('rae', 'Rae')
  ivy.status = 'loh'
  blue.status = 'loh'
  user.status = 'pos'
  nova.status = 'nominated'
  rae.status = 'nominated'

  return {
    ...state,
    phase:
      stage === 'voting'
        ? 'social_2'
        : stage === 'tie'
          ? 'eviction_results'
          : 'pos_ceremony_results',
    players,
    lohId: ivy.id,
    coLohIds: [ivy.id, blue.id],
    coLohNomineeByCoLohId: { [ivy.id]: nova.id, [blue.id]: rae.id },
    posWinnerId: user.id,
    nomineeIds: [nova.id, rae.id],
    awaitingPovSaveTarget: stage === 'replacement',
    awaitingTieBreak: stage === 'tie',
    awaitingPosTieBreak: stage === 'tie',
    tiedNomineeIds: stage === 'tie' ? [nova.id, rae.id] : null,
    voteResults: stage === 'tie' ? { [nova.id]: 3, [rae.id]: 3 } : null,
    votes: {},
    pendingEviction: null,
    replacementNeeded: false,
    coLohReplacementOwnerId: null,
  }
}

describe('Democracia co-LOH rules', () => {
  it('assigns replacement responsibility to the co-LOH who owned the saved nominee', () => {
    const state = coLohFixture('replacement')
    const next = gameReducer(state, submitPovSaveTarget('nova'))

    expect(next.phase).toBe('pos_ceremony_results')
    expect(next.nomineeIds).toContain('rae')
    expect(next.coLohNomineeByCoLohId?.blue).toBe('rae')
    expect(next.coLohNomineeByCoLohId?.ivy).not.toBe('nova')
    expect(next.coLohReplacementOwnerId).toBeNull()
  })

  it('excludes both co-LOHs when the live vote opens', () => {
    const state = coLohFixture('voting')
    const next = gameReducer(state, advance())

    expect(next.phase).toBe('live_vote')
    expect(next.votes).not.toHaveProperty('ivy')
    expect(next.votes).not.toHaveProperty('blue')
  })

  it('routes a tied vote to the POS holder', () => {
    const state = coLohFixture('tie')
    const next = gameReducer(state, submitPosTieBreak('nova'))

    expect(next.awaitingTieBreak).toBe(false)
    expect(next.awaitingPosTieBreak).toBe(false)
    expect(next.pendingEviction?.evicteeId).toBe('nova')
    expect(next.pendingEviction?.evictionMessage).toContain('special exception')
  })
})
