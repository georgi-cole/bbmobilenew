import { normalizeAffinity } from './affinityUtils'
import type { DramaAIMove, DramaAIMoveInput } from './dramaModeEngine'
import { getSocialPersonality } from './socialPersonalityBank'
import { getSocialRuntimeConfig } from './socialRuntimeConfig'

interface DramaCandidate extends DramaAIMove {
  utility: number
  motive:
    | 'survival'
    | 'power'
    | 'loyalty'
    | 'romance'
    | 'conflict'
    | 'intel'
    | 'repair'
    | 'deception'
}

function relation(input: DramaAIMoveInput, sourceId: string, targetId: string): number {
  return normalizeAffinity(input.relationships[sourceId]?.[targetId]?.affinity ?? 0)
}

function hashUnit(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (Math.abs(hash) % 1_000_003) / 1_000_003
}

function repeatedThisWeek(
  input: DramaAIMoveInput,
  actionId: string,
  targetId: string
): number {
  return (input.recentActions ?? []).filter(
    (entry) =>
      entry.actorId === input.actorId &&
      entry.actionId === actionId &&
      entry.targetId === targetId &&
      entry.week === input.week
  ).length
}

function addCandidate(
  candidates: DramaCandidate[],
  input: DramaAIMoveInput,
  candidate: Omit<DramaCandidate, 'utility'> & { utility: number }
): void {
  if (!candidate.targetId || candidate.targetId === input.actorId) return
  const repeats = repeatedThisWeek(input, candidate.actionId, candidate.targetId)
  const repetitionPenalty = getSocialRuntimeConfig().ai.repetitionPenalty
  const noise =
    hashUnit(
      `${input.seed}:${input.week}:${input.phase}:${input.tick}:${input.actorId}:${candidate.actionId}:${candidate.targetId}`
    ) * getSocialRuntimeConfig().ai.noveltyWeight
  candidates.push({
    ...candidate,
    utility: Math.max(0, candidate.utility / (1 + repeats * repetitionPenalty) + noise),
  })
}

function weightedChoice(
  input: DramaAIMoveInput,
  candidates: DramaCandidate[]
): DramaCandidate | null {
  if (candidates.length === 0) return null
  const personality = getSocialPersonality(input.actorId)
  const ordered = [...candidates].sort(
    (left, right) =>
      right.utility - left.utility ||
      left.actionId.localeCompare(right.actionId) ||
      left.targetId.localeCompare(right.targetId)
  )
  const top = ordered.slice(0, 5)
  const maxUtility = top[0]?.utility ?? 0
  // Calculated players choose close to the optimum. Reactive, impulsive players
  // retain more believable variance among several strong motives.
  const temperature = Math.max(
    0.12,
    0.52 - personality.strategicCalculation * 0.3 + personality.emotionalReactivity * 0.12
  )
  const weights = top.map((candidate) =>
    Math.exp((candidate.utility - maxUtility) / temperature)
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll =
    hashUnit(
      `${input.seed}:${input.week}:${input.phase}:${input.tick}:${input.actorId}:drama-choice`
    ) * total
  for (let index = 0; index < top.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return top[index]
  }
  return top[0] ?? null
}

/**
 * Compare every currently plausible Drama motive rather than returning the
 * first active arc or first rumour in array order. The shared execution guard
 * remains authoritative for legality and affordability after selection.
 */
export function chooseUtilityDramaAIMove(input: DramaAIMoveInput): DramaAIMove | null {
  const alive = input.players.filter(
    (player) =>
      player.id !== input.actorId &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  if (alive.length === 0) return null

  const personality = getSocialPersonality(input.actorId)
  const candidates: DramaCandidate[] = []
  const nominees = new Set(input.nomineeIds ?? [])
  const byAffinity = [...alive].sort(
    (left, right) =>
      relation(input, input.actorId, right.id) - relation(input, input.actorId, left.id) ||
      left.id.localeCompare(right.id)
  )
  const closest = byAffinity[0]
  const rival = byAffinity.at(-1) ?? alive[0]

  for (const arc of input.network.arcs.filter(
    (entry) => entry.status === 'active' && entry.participantIds.includes(input.actorId)
  )) {
    const otherId = arc.participantIds.find((id) => id !== input.actorId)
    if (!otherId) continue
    const affinity = relation(input, input.actorId, otherId)
    const intensity = arc.intensity / 100

    if (arc.type === 'rivalry' || arc.type === 'betrayal') {
      if (personality.forgiveness > 0.62 && intensity < 0.72) {
        addCandidate(candidates, input, {
          actionId: 'repair_bond',
          targetId: otherId,
          reason: `repairing a ${arc.type} before it hardens`,
          motive: 'repair',
          utility:
            0.5 +
            personality.forgiveness * 0.65 +
            Math.max(0, affinity) * 0.25 -
            intensity * 0.28,
        })
      }
      const publicConflict =
        arc.intensity >= 80 && personality.publicConflictComfort >= 0.42
      addCandidate(candidates, input, {
        actionId: publicConflict ? 'public_callout' : 'confront',
        targetId: otherId,
        reason: `${arc.type} pressure at ${arc.intensity}`,
        motive: 'conflict',
        utility:
          0.58 +
          intensity * 0.72 +
          personality.assertiveness * 0.28 +
          personality.emotionalReactivity * 0.2 +
          (publicConflict ? personality.publicConflictComfort * 0.2 : 0),
      })
    }

    if (arc.type === 'romance') {
      const actionId =
        arc.stage === 'spark'
          ? 'private_flirt'
          : arc.stage === 'building'
            ? 'late_night_talk'
            : arc.stage === 'climax' && !arc.public && personality.riskTolerance > 0.58
              ? 'go_public'
              : arc.stage === 'climax'
                ? 'spend_night'
                : input.tick % 2 === 0
                  ? 'kiss_under_covers'
                  : 'cuddle'
      addCandidate(candidates, input, {
        actionId,
        targetId: otherId,
        reason: `${arc.stage} romance seeking its next beat`,
        motive: 'romance',
        utility:
          0.52 +
          intensity * 0.52 +
          personality.warmth * 0.28 +
          Math.max(0, affinity) * 0.35 +
          (actionId === 'go_public' ? personality.riskTolerance * 0.22 : 0),
      })
    }

    if (arc.type === 'bromance') {
      addCandidate(candidates, input, {
        actionId: intensity >= 0.62 ? 'trade_secrets' : 'ride_or_die',
        targetId: otherId,
        subjectId: rival.id,
        reason: 'loyal partnership becoming strategically useful',
        motive: 'loyalty',
        utility:
          0.56 +
          intensity * 0.46 +
          personality.loyalty * 0.38 +
          Math.max(0, affinity) * 0.3,
      })
    }
  }

  const knownRumours = input.network.rumours.filter(
    (rumour) =>
      rumour.status === 'circulating' &&
      (rumour.originatorId === input.actorId ||
        rumour.listeners.some((listener) => listener.playerId === input.actorId))
  )
  for (const rumour of knownRumours) {
    const confidentListener = rumour.listeners.find(
      (listener) => listener.playerId === input.actorId
    )
    const confidence = confidentListener?.confidence ?? (rumour.originatorId === input.actorId ? 0.7 : 0.45)
    const expose =
      rumour.listeners.length >= 3 &&
      confidence >= 0.55 &&
      personality.publicConflictComfort + personality.riskTolerance >= 0.9
    addCandidate(candidates, input, {
      actionId: expose ? 'expose_secret' : 'trade_secrets',
      targetId: expose ? rumour.subjectId : closest.id,
      subjectId: rumour.subjectId,
      reason: expose ? 'turning credible intel into a public move' : 'trading known intel privately',
      motive: 'intel',
      utility:
        0.4 +
        confidence * 0.42 +
        personality.gossipPropensity * 0.32 +
        (expose ? personality.publicConflictComfort * 0.24 : personality.strategicCalculation * 0.2),
    })
  }

  if (
    nominees.has(input.actorId) &&
    input.posWinnerId &&
    input.posWinnerId !== input.actorId
  ) {
    addCandidate(candidates, input, {
      actionId: 'ask_use_safety',
      targetId: input.posWinnerId,
      subjectId: input.actorId,
      reason: 'immediate survival lobbying',
      motive: 'survival',
      utility: 1.5 + personality.assertiveness * 0.2 + personality.strategicCalculation * 0.2,
    })
  }

  if (input.lohId === input.actorId) {
    for (const nomineeId of nominees) {
      if (nomineeId === input.actorId) continue
      addCandidate(candidates, input, {
        actionId: 'reassure',
        targetId: nomineeId,
        reason: 'managing nomination fallout while holding power',
        motive: 'power',
        utility:
          0.72 +
          personality.strategicCalculation * 0.36 +
          Math.max(0, relation(input, input.actorId, nomineeId)) * 0.2,
      })
    }
  }

  if (input.posWinnerId === input.actorId && input.lohId && input.lohId !== input.actorId) {
    addCandidate(candidates, input, {
      actionId: 'whisper',
      targetId: input.lohId,
      reason: 'coordinating Safety with the LOH',
      motive: 'power',
      utility: 0.82 + personality.strategicCalculation * 0.38,
    })
  }

  const existingPact = input.network.alliances.some(
    (alliance) =>
      alliance.status === 'active' &&
      alliance.participantIds.includes(input.actorId) &&
      alliance.participantIds.includes(closest.id)
  )
  const closestAffinity = relation(input, input.actorId, closest.id)
  if (input.week >= 2 && !existingPact && closestAffinity > 0.28) {
    addCandidate(candidates, input, {
      actionId: 'proposeAlliance',
      targetId: closest.id,
      reason: 'formalising a strategically valuable relationship',
      motive: 'loyalty',
      utility:
        0.48 +
        closestAffinity * 0.64 +
        personality.loyalty * 0.24 +
        personality.strategicCalculation * 0.28,
    })
  }

  const hiddenArc = input.network.arcs
    .filter(
      (entry) =>
        entry.status === 'active' &&
        !entry.public &&
        !entry.participantIds.includes(input.actorId) &&
        !(entry.discoveredByIds ?? []).includes(input.actorId)
    )
    .sort((left, right) => right.intensity - left.intensity)[0]
  if (hiddenArc) {
    const investigateId = hiddenArc.participantIds
      .map((id) => ({ id, affinity: relation(input, input.actorId, id) }))
      .sort((left, right) => right.affinity - left.affinity)[0]?.id
    if (investigateId) {
      addCandidate(candidates, input, {
        actionId: 'snoop_around',
        targetId: investigateId,
        reason: 'investigating a specific hidden relationship',
        motive: 'intel',
        utility:
          0.36 +
          (hiddenArc.intensity / 100) * 0.35 +
          personality.gossipPropensity * 0.3 +
          personality.strategicCalculation * 0.22,
      })
    }
  }

  const gratitude = input.memory[input.actorId]?.[closest.id]?.gratitude ?? 0
  if (gratitude > 3 || closestAffinity > 0.42) {
    addCandidate(candidates, input, {
      actionId: 'ride_or_die',
      targetId: closest.id,
      reason: 'gratitude and trust becoming durable loyalty',
      motive: 'loyalty',
      utility:
        0.42 +
        Math.min(1, gratitude / 10) * 0.42 +
        closestAffinity * 0.42 +
        personality.loyalty * 0.28,
    })
  }

  const rivalAffinity = relation(input, input.actorId, rival.id)
  if (rivalAffinity < -0.18 && personality.deceptionComfort > 0.3) {
    addCandidate(candidates, input, {
      actionId: 'plant_lie',
      targetId: closest.id,
      subjectId: rival.id,
      reason: 'weaponising resentment through a trusted listener',
      motive: 'deception',
      utility:
        0.28 +
        Math.abs(rivalAffinity) * 0.55 +
        personality.deceptionComfort * 0.4 +
        personality.gossipPropensity * 0.18,
    })
  }

  const selected = weightedChoice(input, candidates)
  return selected
    ? {
        actionId: selected.actionId,
        targetId: selected.targetId,
        subjectId: selected.subjectId,
        reason: `${selected.motive}: ${selected.reason} (utility ${selected.utility.toFixed(2)})`,
      }
    : null
}
