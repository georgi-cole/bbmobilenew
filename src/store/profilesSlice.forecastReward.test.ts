import { describe, expect, it } from 'vitest'
import profilesReducer, {
  awardPublicFavoriteForecast,
  createProfile,
  PUBLIC_FAVORITE_FORECAST_ACHIEVEMENT,
  PUBLIC_FAVORITE_FORECAST_XP,
} from './profilesSlice'

describe('Public Favorite forecast profile reward', () => {
  it('adds permanent XP and the achievement only once for an event', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      awardPublicFavoriteForecast({ eventId: 'season-11-public-favorite' })
    )
    state = profilesReducer(
      state,
      awardPublicFavoriteForecast({ eventId: 'season-11-public-favorite' })
    )

    const profile = state.profiles[0]
    expect(profile.lifetimeXp).toBe(PUBLIC_FAVORITE_FORECAST_XP)
    expect(profile.achievements).toContain(PUBLIC_FAVORITE_FORECAST_ACHIEVEMENT)
    expect(profile.forecastRewardEventIds).toEqual(['season-11-public-favorite'])
  })
})
