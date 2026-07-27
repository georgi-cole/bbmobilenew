export interface SocialPersonality {
  warmth: number
  loyalty: number
  assertiveness: number
  emotionalReactivity: number
  strategicCalculation: number
  gossipPropensity: number
  riskTolerance: number
  forgiveness: number
  socialEnergy: number
  deceptionComfort: number
  publicConflictComfort: number
}

/**
 * JSON-compatible authored profiles. Missing/custom contestants receive a
 * deterministic profile from their stable ID, so no cast collapses to one
 * generic personality.
 */
export const SOCIAL_PERSONALITY_BANK: Record<string, Partial<SocialPersonality>> = {
  finn: {
    warmth: 0.36,
    loyalty: 0.62,
    assertiveness: 0.45,
    emotionalReactivity: 0.28,
    strategicCalculation: 0.88,
    gossipPropensity: 0.34,
    riskTolerance: 0.44,
    forgiveness: 0.52,
    socialEnergy: 0.42,
    deceptionComfort: 0.57,
    publicConflictComfort: 0.3,
  },
  mimi: {
    warmth: 0.82,
    loyalty: 0.78,
    assertiveness: 0.34,
    emotionalReactivity: 0.62,
    strategicCalculation: 0.48,
    gossipPropensity: 0.38,
    riskTolerance: 0.32,
    forgiveness: 0.75,
    socialEnergy: 0.58,
    deceptionComfort: 0.24,
    publicConflictComfort: 0.2,
  },
  rae: {
    warmth: 0.55,
    loyalty: 0.55,
    assertiveness: 0.86,
    emotionalReactivity: 0.72,
    strategicCalculation: 0.63,
    gossipPropensity: 0.58,
    riskTolerance: 0.74,
    forgiveness: 0.38,
    socialEnergy: 0.82,
    deceptionComfort: 0.52,
    publicConflictComfort: 0.8,
  },
  nova: {
    warmth: 0.74,
    loyalty: 0.57,
    assertiveness: 0.62,
    emotionalReactivity: 0.52,
    strategicCalculation: 0.56,
    gossipPropensity: 0.66,
    riskTolerance: 0.64,
    forgiveness: 0.6,
    socialEnergy: 0.9,
    deceptionComfort: 0.5,
    publicConflictComfort: 0.54,
  },
  leo: {
    warmth: 0.48,
    loyalty: 0.46,
    assertiveness: 0.82,
    emotionalReactivity: 0.45,
    strategicCalculation: 0.84,
    gossipPropensity: 0.54,
    riskTolerance: 0.78,
    forgiveness: 0.35,
    socialEnergy: 0.85,
    deceptionComfort: 0.74,
    publicConflictComfort: 0.67,
  },
}

function hashUnit(seed: string, salt: number): number {
  let hash = 2166136261 ^ salt
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (Math.abs(hash) % 10_001) / 10_000
}

function generatedProfile(playerId: string): SocialPersonality {
  return {
    warmth: 0.25 + hashUnit(playerId, 1) * 0.65,
    loyalty: 0.2 + hashUnit(playerId, 2) * 0.75,
    assertiveness: 0.2 + hashUnit(playerId, 3) * 0.75,
    emotionalReactivity: 0.15 + hashUnit(playerId, 4) * 0.8,
    strategicCalculation: 0.2 + hashUnit(playerId, 5) * 0.75,
    gossipPropensity: 0.1 + hashUnit(playerId, 6) * 0.85,
    riskTolerance: 0.15 + hashUnit(playerId, 7) * 0.8,
    forgiveness: 0.15 + hashUnit(playerId, 8) * 0.8,
    socialEnergy: 0.2 + hashUnit(playerId, 9) * 0.75,
    deceptionComfort: 0.1 + hashUnit(playerId, 10) * 0.85,
    publicConflictComfort: 0.1 + hashUnit(playerId, 11) * 0.85,
  }
}

export function getSocialPersonality(playerId: string): SocialPersonality {
  return { ...generatedProfile(playerId), ...(SOCIAL_PERSONALITY_BANK[playerId] ?? {}) }
}
