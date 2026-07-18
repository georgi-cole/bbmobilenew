import { describe, expect, it } from 'vitest'
import {
  createInitialBigEyeState,
  generateBigBrotherReply,
  type BigBrotherResponse,
  type BigEyeConversationState,
  type BigEyeHistoryTurn,
  type BigEyeWorldContext,
} from '../bigBrother'
import { resolveBigEyeTurn } from '../../bb/confessionalBigEye'

const world: BigEyeWorldContext = {
  season: 1,
  week: 4,
  phase: 'pre_eviction',
  playerStatus: 'nominated',
  leaderName: 'Jordan',
  nomineeNames: ['Alex', 'Sam'],
  safetyWinnerName: 'Maya',
  remainingHousemates: ['Alex', 'Sam', 'Jordan', 'Maya'],
  playerStats: { leaderWins: 0, safetyWins: 1, timesNominated: 2 },
  closestRelationships: [{ name: 'Maya', affinity: 82, tags: ['ally'] }],
  recentPublicEvents: ['Alex and Sam were nominated.'],
}

describe('free local Big Eye conversation', () => {
  it('handles the reported conversation without generic unknown loops', async () => {
    let state: BigEyeConversationState = createInitialBigEyeState()
    let memorySummary = ''
    const history: BigEyeHistoryTurn[] = []

    async function send(diaryText: string): Promise<BigBrotherResponse> {
      const response = await generateBigBrotherReply({
        diaryText,
        playerName: 'Alex',
        seed: 14,
        state,
        history,
        memorySummary,
        world,
      })
      history.push({ role: 'user', text: diaryText }, { role: 'bb', text: response.text })
      state = response.nextState
      memorySummary = response.memorySummary
      return response
    }

    const wellbeing = await send('How are you?')
    const clarification = await send('I just asked how you were...')
    const overwhelmed = await send('I feel overwhelmed...')
    const repetition = await send('You keep repeating the same...')
    const hesitation = await send('ummm okk...')

    expect(wellbeing.intent).toBe('wellbeing_question')
    expect(wellbeing.text).not.toMatch(/not yet honest|edited out/)
    expect(clarification.intent).toBe('wellbeing_question')
    expect(clarification.text).not.toBe(wellbeing.text)
    expect(overwhelmed.intent).toBe('overwhelmed')
    expect(overwhelmed.text).toMatch(/hear you|smaller|heaviest|manageable/)
    expect(repetition.intent).toBe('repetition_complaint')
    expect(repetition.text).toMatch(/Fair|right|Point taken/)
    expect(hesitation.intent).toBe('hesitation')
    expect(hesitation.text).not.toMatch(/leaving out|Convenient/)
    expect(
      new Set(history.filter((turn) => turn.role === 'bb').map((turn) => turn.text)).size
    ).toBe(5)
  })

  it('answers the vague hint/advice sequence instead of asking the same question again', async () => {
    let state: BigEyeConversationState = createInitialBigEyeState()
    const history: BigEyeHistoryTurn[] = []

    async function send(diaryText: string): Promise<BigBrotherResponse> {
      const response = await generateBigBrotherReply({
        diaryText,
        playerName: 'Alex',
        seed: 21,
        state,
        history,
        memorySummary: '',
        world,
      })
      history.push({ role: 'user', text: diaryText }, { role: 'bb', text: response.text })
      state = response.nextState
      return response
    }

    const hint = await send('Any hints?')
    const advice = await send('Advice please')
    const prediction = await send('Who is going to win?')

    expect(hint.intent).toBe('advice_request')
    expect(hint.text).toMatch(/advice|hint|vote|relationship|promise/i)
    expect(advice.intent).toBe('advice_request')
    expect(advice.text).not.toBe(hint.text)
    expect(advice.text).not.toMatch(/do you want advice|say what you need|enough for now/i)
    expect(prediction.intent).toBe('winner_prediction')
  })

  it('keeps authored easter egg punchlines out of the local director', async () => {
    const phrases = ['are you real', 'who will win', 'help me', 'I love you']

    for (const diaryText of phrases) {
      const state = createInitialBigEyeState()
      const authored = resolveBigEyeTurn(diaryText, { playerName: 'Alex', seed: 7 }, state)
      const response = await generateBigBrotherReply({
        diaryText,
        playerName: 'Alex',
        seed: 7,
        state,
        history: [],
        memorySummary: '',
        world,
      })

      expect(response.intent).toBe(authored.intent)
      expect(response.text).toBe(authored.text)
    }
  })
})
