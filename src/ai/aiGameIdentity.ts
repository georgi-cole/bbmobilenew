import { mulberry32 } from '../store/rng'

export type AiIdentityMode = 'classic' | 'cupid' | 'vox_populi' | 'survival'

export type AiArchetype =
  | 'aggressive_competitor'
  | 'clutch_competitor'
  | 'strategic_operator'
  | 'puppet_master'
  | 'social_butterfly'
  | 'jury_artisan'
  | 'loyal_anchor'
  | 'active_floater'
  | 'opportunist'
  | 'lone_wolf'
  | 'double_agent'
  | 'chaos_agent'
  | 'underdog_survivor'
  | 'romantic_loyalist'
  | 'audience_darling'
  | 'media_strategist'
  | 'audience_chameleon'
  | 'antihero'
  | 'public_pleaser'
  | 'endurance_specialist'
  | 'physical_specialist'
  | 'puzzle_specialist'
  | 'adaptive_generalist'
  | 'risk_taker'
  | 'pressure_choker'

export type AiTemperament = 'calm' | 'emotional' | 'paranoid' | 'impulsive' | 'adaptable' | 'secretive'

export interface AiGameIdentity {
  archetype: AiArchetype
  temperament: AiTemperament
  /** Persistent preference strength, not a deterministic instruction. */
  competitionDrive: number
  emotionalVolatility: number
  audienceFocus: number
  survivalFocus: number
}

type IdentityPlayer = { id: string; isUser?: boolean; aiGameIdentity?: AiGameIdentity }

const CLASSIC_CAST: AiArchetype[] = [
  'aggressive_competitor', 'clutch_competitor', 'strategic_operator', 'puppet_master',
  'social_butterfly', 'jury_artisan', 'loyal_anchor', 'loyal_anchor', 'active_floater',
  'active_floater', 'opportunist', 'lone_wolf', 'double_agent', 'chaos_agent', 'underdog_survivor',
]
const CUPID_CAST: AiArchetype[] = [
  'aggressive_competitor', 'clutch_competitor', 'strategic_operator', 'social_butterfly',
  'jury_artisan', 'loyal_anchor', 'loyal_anchor', 'romantic_loyalist', 'romantic_loyalist',
  'active_floater', 'active_floater', 'opportunist', 'double_agent', 'chaos_agent', 'underdog_survivor',
]
const VOX_CAST: AiArchetype[] = [
  'audience_darling', 'audience_darling', 'media_strategist', 'media_strategist',
  'audience_chameleon', 'audience_chameleon', 'public_pleaser', 'public_pleaser',
  'strategic_operator', 'social_butterfly', 'clutch_competitor', 'loyal_anchor',
  'antihero', 'underdog_survivor', 'opportunist',
]
const SURVIVAL_CAST: AiArchetype[] = [
  'endurance_specialist', 'endurance_specialist', 'physical_specialist', 'physical_specialist',
  'puzzle_specialist', 'puzzle_specialist', 'adaptive_generalist', 'adaptive_generalist',
  'risk_taker', 'pressure_choker', 'clutch_competitor', 'underdog_survivor',
  'opportunist', 'lone_wolf', 'chaos_agent',
]
const TEMPERAMENTS: AiTemperament[] = ['calm', 'emotional', 'paranoid', 'impulsive', 'adaptable', 'secretive']

function hash(value: string): number {
  let result = 0x811c9dc5
  for (const char of value) {
    result ^= char.charCodeAt(0)
    result = Math.imul(result, 0x01000193) >>> 0
  }
  return result >>> 0
}

function poolFor(mode: AiIdentityMode): AiArchetype[] {
  if (mode === 'cupid') return CUPID_CAST
  if (mode === 'vox_populi') return VOX_CAST
  if (mode === 'survival') return SURVIVAL_CAST
  return CLASSIC_CAST
}

function shuffle<T>(entries: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const result = [...entries]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function buildIdentity(archetype: AiArchetype, seed: number, playerId: string): AiGameIdentity {
  const rng = mulberry32((seed ^ hash(playerId)) >>> 0)
  const temperament = TEMPERAMENTS[Math.floor(rng() * TEMPERAMENTS.length)]
  const competitionDrive =
    ['aggressive_competitor', 'clutch_competitor', 'physical_specialist', 'endurance_specialist'].includes(archetype)
      ? 0.7 + rng() * 0.25
      : 0.25 + rng() * 0.5
  return {
    archetype,
    temperament,
    competitionDrive,
    emotionalVolatility: temperament === 'emotional' || temperament === 'impulsive' ? 0.65 + rng() * 0.25 : 0.12 + rng() * 0.38,
    audienceFocus: ['audience_darling', 'media_strategist', 'audience_chameleon', 'public_pleaser'].includes(archetype) ? 0.7 + rng() * 0.25 : 0.08 + rng() * 0.45,
    survivalFocus: ['endurance_specialist', 'physical_specialist', 'puzzle_specialist', 'adaptive_generalist'].includes(archetype) ? 0.68 + rng() * 0.27 : 0.15 + rng() * 0.45,
  }
}

/** Assigns a balanced, seed-stable cast at season creation. User players never receive an identity. */
export function assignAiGameIdentities<T extends IdentityPlayer>(players: readonly T[], seed: number, mode: AiIdentityMode): T[] {
  const aiIds = players.filter((player) => !player.isUser).map((player) => player.id).sort()
  const archetypes = shuffle(poolFor(mode), seed).slice(0, aiIds.length)
  const byId = new Map(aiIds.map((id, index) => [id, buildIdentity(archetypes[index] ?? poolFor(mode)[index % poolFor(mode).length], seed, id)]))
  return players.map((player) => player.isUser ? player : { ...player, aiGameIdentity: byId.get(player.id) }) as T[]
}

export function competitionIdentityMultiplier(identity: AiGameIdentity | undefined, mode: AiIdentityMode, seed: number, playerId?: string): number {
  if (!identity) return 1
  const rng = mulberry32((seed ^ hash(`${playerId ?? 'ai'}:${identity.archetype}`)) >>> 0)
  const focus = mode === 'survival' ? identity.survivalFocus : identity.competitionDrive
  const base = 0.9 + focus * 0.18
  const clutch = identity.archetype === 'clutch_competitor' ? 0.035 : 0
  const wobble = (rng() - 0.5) * identity.emotionalVolatility * 0.08
  return Math.max(0.8, Math.min(1.16, base + clutch + wobble))
}

export function nominationIdentityBias(identity: AiGameIdentity | undefined, mode: AiIdentityMode): number {
  if (!identity) return 0
  const archetype = identity.archetype
  if (mode === 'vox_populi') {
    if (['audience_darling', 'public_pleaser'].includes(archetype)) return -8
    if (archetype === 'media_strategist' || archetype === 'audience_chameleon') return 4
  }
  if (archetype === 'aggressive_competitor' || archetype === 'strategic_operator') return 14
  if (archetype === 'puppet_master' || archetype === 'double_agent') return 8
  if (archetype === 'loyal_anchor' || archetype === 'romantic_loyalist') return -8
  if (archetype === 'chaos_agent') return 10
  return 0
}

export function allianceIdentityBias(identity: AiGameIdentity | undefined): number {
  if (!identity) return 0
  if (['loyal_anchor', 'romantic_loyalist', 'social_butterfly'].includes(identity.archetype)) return 22
  if (['active_floater', 'lone_wolf', 'double_agent'].includes(identity.archetype)) return -16
  return 0
}

export function betrayalChanceModifier(identity: AiGameIdentity | undefined): number {
  if (!identity) return 0
  if (identity.archetype === 'double_agent' || identity.archetype === 'puppet_master') return 0.14
  if (identity.archetype === 'loyal_anchor' || identity.archetype === 'romantic_loyalist') return -0.04
  return identity.emotionalVolatility * 0.04
}
