import { describe, expect, it } from 'vitest'
import reducer, {
  addDirection,
  initializeProfiles,
  updateApproval,
  updateMissionProgress,
} from '../publicOpinionSlice'

describe('public opinion editorial pacing', () => {
  it('keeps opening approval stable, reports a whole-day trend, and reserves day one for its biggest moments', () => {
    let state = reducer(undefined, initializeProfiles(['you', 'lia']))

    state = reducer(
      state,
      updateApproval({
        playerId: 'you',
        delta: 2,
        reason: 'positive_social',
        week: 1,
      })
    )
    state = reducer(
      state,
      updateApproval({
        playerId: 'lia',
        delta: 1,
        reason: 'positive_social',
        week: 1,
      })
    )
    state = reducer(
      state,
      updateApproval({
        playerId: 'you',
        delta: 1,
        reason: 'social_warmth',
        week: 1,
      })
    )

    expect(state.profiles.you.approvalAtDayStart).toBe(50)
    expect(state.profiles.you.approvalDay).toBe(1)
    expect(state.feedPostsThisDay).toBe(2)
    expect(state.feed).toHaveLength(2)

    state = reducer(
      state,
      updateApproval({
        playerId: 'lia',
        delta: -3,
        reason: 'eviction_reaction',
        eventType: 'eviction',
        week: 1,
      })
    )

    expect(state.feedPostsThisDay).toBe(2)
    expect(state.feed).toHaveLength(2)
    expect(state.feed.some((entry) => entry.eventType === 'eviction')).toBe(true)
  })

  it('persists request progress history and completes exactly once at 100%', () => {
    let state = reducer(undefined, initializeProfiles(['you']))
    state = reducer(
      state,
      addDirection({
        id: 'closer-rune',
        type: 'get_closer',
        playerId: 'you',
        relatedPlayerId: 'rune',
        description: 'Get closer to Rune',
        status: 'active',
        createdWeek: 4,
        expiresAtWeek: 6,
        approvalDelta: 5,
        progressPercent: 90,
      })
    )
    state = reducer(
      state,
      updateMissionProgress({
        directionId: 'closer-rune',
        progressPercent: 100,
        progressDelta: 10,
        progressKey: 'positive_social:deep_talk:rune',
        eventType: 'positive_social',
        actionId: 'deep_talk',
        targetId: 'rune',
        week: 5,
      })
    )

    expect(state.directions[0].status).toBe('completed')
    expect(state.directions[0].progressHistory).toHaveLength(1)
    expect(state.profiles.you.completedDirectionCount).toBe(1)

    state = reducer(
      state,
      updateMissionProgress({
        directionId: 'closer-rune',
        progressPercent: 100,
        week: 5,
      })
    )
    expect(state.profiles.you.completedDirectionCount).toBe(1)
  })
})
