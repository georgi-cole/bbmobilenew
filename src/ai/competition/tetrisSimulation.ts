import { mulberry32 } from '../../store/rng'

export interface TetrisAiParticipantInput {
  id: string
  baselineScore?: number
}

export interface SimulateTetrisAiScoresArgs {
  seed: number
  participants: ReadonlyArray<TetrisAiParticipantInput>
  minScore: number
  maxScore: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashString(value: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * Generates a seeded Fit Me In field as a group, rather than making unrelated
 * neutral-profile rolls for every AI. The cohort ladder deliberately creates a
 * top tier, competitive middle, and lower outliers in each round.
 */
export function simulateTetrisAiScores({
  seed,
  participants,
  minScore,
  maxScore,
}: SimulateTetrisAiScoresArgs): Record<string, number> {
  if (participants.length === 0) return {}

  const floor = Math.round(Math.min(minScore, maxScore))
  const ceiling = Math.round(Math.max(minScore, maxScore))
  const span = Math.max(1, ceiling - floor)
  const minGap = Math.max(25, Math.round(span * 0.075))
  const ordered = participants
    .map((participant) => {
      const rng = mulberry32(((seed >>> 0) ^ hashString(participant.id) ^ 0x7e7715) >>> 0)
      const baseline = clamp((participant.baselineScore ?? span * 0.5) / Math.max(1, ceiling), 0, 1)
      return { ...participant, form: rng() * 0.75 + baseline * 0.25 }
    })
    .sort((a, b) => b.form - a.form || a.id.localeCompare(b.id))

  const scores: Record<string, number> = {}
  let previousScore = ceiling + minGap

  ordered.forEach((participant, rank) => {
    const position = participants.length === 1 ? 0.5 : (rank + 0.35) / (participants.length - 1 + 0.7)
    // 86% -> 14% of the range, with slightly compressed extremes in small heats.
    const expectedRatio = 0.86 - position * 0.72
    const rng = mulberry32(((seed >>> 0) ^ hashString(participant.id) ^ 0xf17e1e) >>> 0)
    const jitter = (rng() + rng() - 1) * span * 0.035
    const candidate = Math.round((floor + span * expectedRatio + jitter) / 5) * 5
    const score = clamp(Math.min(candidate, previousScore - minGap), floor, ceiling)
    scores[participant.id] = score
    previousScore = score
  })

  return scores
}
