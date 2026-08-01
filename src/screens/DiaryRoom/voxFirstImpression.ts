export type VoxFirstImpressionTone = 'close' | 'warm' | 'neutral' | 'wary' | 'cold'

export interface VoxFirstImpression {
  tone: VoxFirstImpressionTone
  label: string
}

interface VoxFirstImpressionCandidate {
  id: string
  affinity: number
}

function hashImpressionKey(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function impressionForTone(tone: VoxFirstImpressionTone): VoxFirstImpression {
  switch (tone) {
    case 'close':
      return { tone, label: 'Your first instinct is strong trust' }
    case 'warm':
      return { tone, label: 'Your first instinct is positive' }
    case 'wary':
      return { tone, label: 'Your first instinct is cautious' }
    case 'cold':
      return { tone, label: 'Your first instinct signals tension' }
    default:
      return { tone, label: 'Your first instinct is mixed' }
  }
}

/**
 * A deliberately broad read rather than a numeric strategy leak. Vox players
 * only receive this help for the first two nomination rounds, while they are
 * still learning the cast.
 */
export function getVoxFirstImpression(affinity: number): VoxFirstImpression {
  if (affinity >= 35) return { tone: 'close', label: 'You feel very close' }
  if (affinity >= 12) return { tone: 'warm', label: 'You feel positive' }
  if (affinity <= -35) return { tone: 'cold', label: 'You feel strong tension' }
  if (affinity <= -12) return { tone: 'wary', label: 'You feel wary' }
  return { tone: 'neutral', label: 'Your impression is mixed' }
}

/**
 * Creates a stable, varied early read across the whole cast. The seeded score
 * simulates instinct while real affinity gently nudges the order, so the guide
 * never collapses into an all-neutral board before relationships have formed.
 */
export function buildVoxFirstImpressions(options: {
  seed: number
  week: number
  humanId: string
  candidates: VoxFirstImpressionCandidate[]
}): Record<string, VoxFirstImpression> {
  const { seed, week, humanId, candidates } = options
  if (candidates.length === 0) return {}

  const ranked = [...candidates].sort((left, right) => {
    const score = (candidate: VoxFirstImpressionCandidate) => {
      const random = hashImpressionKey(`${seed}:${week}:${humanId}:${candidate.id}`) / 0xffffffff
      const affinityNudge = Math.max(-18, Math.min(18, candidate.affinity * 0.32))
      return random * 100 + affinityNudge
    }
    const difference = score(right) - score(left)
    return difference !== 0 ? difference : left.id.localeCompare(right.id)
  })

  const total = ranked.length
  return Object.fromEntries(
    ranked.map((candidate, index) => {
      const percentile = (index + 0.5) / total
      const tone: VoxFirstImpressionTone =
        percentile <= 0.14
          ? 'close'
          : percentile <= 0.38
            ? 'warm'
            : percentile <= 0.64
              ? 'neutral'
              : percentile <= 0.88
                ? 'wary'
                : 'cold'
      return [candidate.id, impressionForTone(tone)]
    })
  )
}
