import { describe, expect, it } from 'vitest'
import gameReducer, { commitNominees, createInitialGameState } from '../gameSlice'

describe('completed nomination broadcasts', () => {
  it('retires the selection prompt after the human commits nominees', () => {
    const initial = createInitialGameState({ seed: 927 })
    const human = initial.players.find((player) => player.isUser)
    const choices = initial.players.filter((player) => !player.isUser).slice(0, 2)
    if (!human || choices.length < 2) throw new Error('Expected a human and two eligible players')

    initial.phase = 'nomination_results'
    initial.lohId = human.id
    initial.awaitingNominations = true
    const promptId = 'nomination-prompt'
    initial.tvFeed = [
      {
        id: promptId,
        text: `${human.name}, it's time to make your nominations. Choose two players to nominate. 🎯`,
        type: 'game',
        timestamp: 1,
        meta: {
          phase: 'nomination_results',
          week: initial.week,
          broadcastManaged: true,
          broadcastLevel: 'minor',
        },
      },
    ]
    initial.broadcastQueue = [promptId]
    initial.lastPlainBroadcastEventId = promptId

    const result = gameReducer(initial, commitNominees(choices.map((player) => player.id)))
    const prompt = result.tvFeed.find((event) => event.id === promptId)

    expect(result.awaitingNominations).toBe(false)
    expect(prompt?.meta?.broadcastConsumed).toBe(true)
    expect(result.broadcastQueue).not.toContain(promptId)
    expect(result.lastPlainBroadcastEventId).toBeNull()
    expect(result.tvFeed[0].text).toContain('have been nominated for elimination')
  })
})
