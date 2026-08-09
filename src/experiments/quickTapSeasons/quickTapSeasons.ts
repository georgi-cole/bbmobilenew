import { mulberry32 } from '../../store/rng'

export const SEASONS_DURATION = 40
export const SEASON_LENGTH = 8
export const SEASON_BOX_TIMES = [6, 18, 30] as const
export type TapSeason = 'winter' | 'summer' | 'autumn' | 'spring'

export const SEASONS: Record<
  TapSeason,
  { label: string; emoji: string; multiplier: number; effect: string }
> = {
  winter: { label: 'Winter', emoji: '❄️', multiplier: -1, effect: 'Slippery · −1×' },
  summer: { label: 'Summer', emoji: '☀️', multiplier: 0.5, effect: 'Too hot · ½×' },
  autumn: { label: 'Autumn', emoji: '🍂', multiplier: 1, effect: 'Leafy · 1×' },
  spring: { label: 'Spring', emoji: '🐦', multiplier: 1.25, effect: 'Chirpy · 1¼×' },
}
const SEASON_KEYS = Object.keys(SEASONS) as TapSeason[]

function pickOther(rng: () => number, current?: TapSeason): TapSeason {
  const choices = current ? SEASON_KEYS.filter((season) => season !== current) : SEASON_KEYS
  return choices[Math.floor(rng() * choices.length)]
}

export function buildSeasonSchedule(seed: number) {
  const rng = mulberry32((seed ^ 0x52ea50a5) >>> 0)
  const result: Array<{ at: number; season: TapSeason }> = []
  let current: TapSeason | undefined
  for (let at = 0; at < SEASONS_DURATION; at += SEASON_LENGTH) {
    current = pickOther(rng, current)
    result.push({ at, season: current })
  }
  return result
}

export function rerollSeason(seed: number, boxIndex: number, current: TapSeason): TapSeason {
  const rng = mulberry32((seed ^ Math.imul(boxIndex + 1, 0x9e3779b9) ^ 0xb07b07) >>> 0)
  return pickOther(rng, current)
}

function hash(value: string): number {
  let result = 0x811c9dc5 >>> 0
  for (const character of value) {
    result ^= character.charCodeAt(0)
    result = Math.imul(result, 0x01000193) >>> 0
  }
  return result
}

export function simulateSeasonsAiField(seed: number) {
  const field = [
    { id: 'nova', name: 'Nova', rate: 7.25, boxChance: 0.55 },
    { id: 'milo', name: 'Milo', rate: 7.65, boxChance: 0.72 },
    { id: 'zara', name: 'Zara', rate: 8.15, boxChance: 0.88 },
  ]
  const schedule = buildSeasonSchedule(seed)

  return field.map((opponent) => {
    const rng = mulberry32((seed ^ hash(opponent.id) ^ 0xa15ea50a) >>> 0)
    let season = schedule[0].season
    let seasonIndex = 1
    let boxIndex = 0
    let rawTaps = 0
    let score = 0
    let winterInertia = season === 'winter' ? 1 + Math.floor(rng() * 3) : 0
    let nextTap = 0.18 + rng() * 0.28

    while (nextTap < SEASONS_DURATION) {
      while (seasonIndex < schedule.length && schedule[seasonIndex].at <= nextTap) {
        season = schedule[seasonIndex++].season
        winterInertia = season === 'winter' ? 1 + Math.floor(rng() * 3) : 0
      }
      while (boxIndex < SEASON_BOX_TIMES.length && SEASON_BOX_TIMES[boxIndex] <= nextTap) {
        if (rng() < opponent.boxChance) {
          season = rerollSeason(seed ^ hash(opponent.id), boxIndex, season)
          winterInertia = season === 'winter' ? 1 + Math.floor(rng() * 3) : 0
        }
        boxIndex += 1
      }
      if (season !== 'winter' || winterInertia > 0) {
        rawTaps += 1
        score += SEASONS[season].multiplier
        if (season === 'winter') winterInertia -= 1
      }
      const fatigue = 1 - (nextTap / SEASONS_DURATION) * (opponent.id === 'nova' ? 0.14 : 0.07)
      nextTap += 1 / Math.max(3, opponent.rate * fatigue * (0.92 + rng() * 0.16))
      if (rng() > 0.965) nextTap += 0.12 + rng() * 0.22
    }
    return {
      id: opponent.id,
      name: opponent.name,
      score: Number(score.toFixed(2)),
      rawTaps,
    }
  })
}
