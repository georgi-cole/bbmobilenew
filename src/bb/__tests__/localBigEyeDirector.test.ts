import { describe, expect, it } from 'vitest'
import { createInitialBigEyeState } from '../confessionalBigEye'
import { directLocalBigEyeReply, updateLocalBigEyeMemory } from '../localBigEyeDirector'

const world = {
  week: 4,
  phase: 'pre_eviction',
  playerStatus: 'nominated',
  leaderName: 'Jordan',
  nomineeNames: ['Alex', 'Sam'],
  safetyWinnerName: 'Maya',
  remainingHousemates: ['Alex', 'Sam', 'Jordan', 'Maya'],
  closestRelationships: [{ name: 'Maya', affinity: 82, tags: ['ally'] }],
}

describe('localBigEyeDirector', () => {
  it('grounds fear replies in the live nomination situation', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'I am scared that I am going home',
      playerName: 'Alex',
      intent: 'fear',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toMatch(/block|Week 4/)
    expect(text).toMatch(/Sam|voting/)
  })

  it('uses named relationship context without inventing another housemate', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'I do not know whether I trust Maya',
      playerName: 'Alex',
      intent: 'alliance',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Maya')
  })

  it('challenges evasive short answers after a direct question', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'maybe later',
      playerName: 'Alex',
      intent: 'unknown',
      state: createInitialBigEyeState(),
      history: [{ role: 'bb', text: 'Who benefits if you panic?' }],
      world,
    })

    expect(text).toContain('change the subject')
    expect(text).not.toContain('Convenient')
  })

  it('stores topic-level memory without persisting the verbatim confession', () => {
    const memory = updateLocalBigEyeMemory({
      diaryText: 'I secretly promised Maya my final vote',
      playerName: 'Alex',
      intent: 'alliance',
      state: createInitialBigEyeState(),
      world,
    })

    expect(memory).toContain('topic: alliance')
    expect(memory).toContain('mentioned Maya')
    expect(memory).not.toContain('secretly promised')
  })
})
