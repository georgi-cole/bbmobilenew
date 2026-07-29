import type { ProfilesState } from '../store/profilesSlice'

export type RealityModePreset = 'casual' | 'tv' | 'adult'
export type RealityAgeEligibility = 'adult' | 'minor' | 'unknown'

export const DEFAULT_REALITY_MODE_PRESET: RealityModePreset = 'tv'

export const REALITY_MODE_PRESETS: ReadonlyArray<{
  value: RealityModePreset
  label: string
  description: string
  minimumAge?: number
}> = [
  {
    value: 'casual',
    label: 'Casual',
    description: 'A lighter social pace with fewer public blowups and slower story escalation.',
  },
  {
    value: 'tv',
    label: 'TV Grade',
    description:
      'The full strategic reality-show experience with balanced relationships and drama.',
  },
  {
    value: 'adult',
    label: '18+',
    description:
      'The strongest relationship and conflict intensity. Requires a verified adult profile.',
    minimumAge: 18,
  },
]

export const REALITY_PRESET_TUNING = {
  casual: {
    arcIntensityMultiplier: 0.7,
    maxActiveArcs: 3,
    maxRumourHopsPerWeek: 1,
    maxPublicEventsPerWeek: 1,
    publicEventCooldownWeeks: 3,
  },
  tv: {
    arcIntensityMultiplier: 1,
    maxActiveArcs: 5,
    maxRumourHopsPerWeek: 2,
    maxPublicEventsPerWeek: 1,
    publicEventCooldownWeeks: 2,
  },
  adult: {
    arcIntensityMultiplier: 1.2,
    maxActiveArcs: 6,
    maxRumourHopsPerWeek: 3,
    maxPublicEventsPerWeek: 2,
    publicEventCooldownWeeks: 1,
  },
} as const

export function normalizeRealityModePreset(value: unknown): RealityModePreset {
  return value === 'casual' || value === 'tv' || value === 'adult'
    ? value
    : DEFAULT_REALITY_MODE_PRESET
}

/**
 * Profile ages are currently free-form. Use the lowest plausible age so an
 * ambiguous range can never accidentally unlock adult content.
 */
export function getRealityAgeEligibility(age: unknown): RealityAgeEligibility {
  if (typeof age !== 'string' && typeof age !== 'number') return 'unknown'
  const raw = String(age).trim().toLowerCase()
  if (!raw) return 'unknown'

  const numeric = raw
    .match(/\d{1,3}/g)
    ?.map(Number)
    .filter((value) => value > 0 && value <= 120)
  if (!numeric?.length) return 'unknown'
  const youngestPlausibleAge = Math.min(...numeric)
  return youngestPlausibleAge >= 18 ? 'adult' : 'minor'
}

export function getProfileRealityAgeEligibility(
  profiles: Pick<ProfilesState, 'profiles' | 'activeProfileId' | 'isGuest'> | undefined
): RealityAgeEligibility {
  if (!profiles || profiles.isGuest || !profiles.activeProfileId) return 'unknown'
  const profile = profiles.profiles.find((entry) => entry.id === profiles.activeProfileId)
  return getRealityAgeEligibility(profile?.bio?.age)
}

export function resolveRealityModePreset(
  requested: unknown,
  eligibility: RealityAgeEligibility
): RealityModePreset {
  const normalized = normalizeRealityModePreset(requested)
  return normalized === 'adult' && eligibility !== 'adult'
    ? DEFAULT_REALITY_MODE_PRESET
    : normalized
}
