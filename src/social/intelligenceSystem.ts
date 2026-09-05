import type { AiGameIdentity, AiIdentityMode } from '../ai/aiGameIdentity'
import type { MinigameAiModel } from '../ai/competition/types'
import type { Player } from '../types'
import type { SocialActionLogEntry } from './types'
import type {
  RealityBelief,
  RealityDomainState,
  RealityFact,
  RealityMemory,
  RealityMemorySource,
} from './reality/types'

export type CompetitionIntent = 'compete' | 'conserve' | 'throw'
export type { IntelligenceDelivery } from './types'

export interface IntelLeadView {
  factId: string
  propositionType: string
  text: string
  source: string
  confidence: 'Unverified' | 'Credible' | 'Confirmed'
  confidenceValue: number
  day: number
  subjectIds: string[]
}

type CompetitionIntentContext = {
  mode: AiIdentityMode
  day: number
  phase: string
  prizeType?: string
  playerStatus?: string
  forcedWinner?: boolean
}

const SUPPORTED_INTEL_PROPOSITIONS = new Set([
  'COMPETITION_THROW_SUSPICION',
  'SECRET_MEETING',
  'ROMANTIC_MOMENT',
  'SECRET_ALLIANCE',
  'TARGETING',
  'ALLIANCE_FRACTURE',
])

function hash(source: string): number {
  let value = 2166136261
  for (const character of source) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function seededUnit(seed: number, salt: string): number {
  let value = (seed ^ hash(salt)) >>> 0
  value += 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function throwChance(identity?: AiGameIdentity): number {
  if (!identity) return 0.035
  const byArchetype: Partial<Record<AiGameIdentity['archetype'], number>> = {
    active_floater: 0.2,
    strategic_operator: 0.12,
    puppet_master: 0.14,
    opportunist: 0.1,
    double_agent: 0.11,
    underdog_survivor: 0.07,
    social_butterfly: 0.06,
    romantic_loyalist: 0.07,
    aggressive_competitor: 0.005,
    clutch_competitor: 0.01,
  }
  let chance = byArchetype[identity.archetype] ?? 0.04
  if (identity.temperament === 'impulsive') chance += 0.035
  if (identity.temperament === 'secretive') chance += 0.02
  if (identity.temperament === 'paranoid') chance -= 0.02
  return Math.max(0, Math.min(0.24, chance))
}

/** Decide a hidden competition intention without touching Surveyeval. */
export function decideCompetitionIntent(
  seed: number,
  playerId: string,
  identity: AiGameIdentity | undefined,
  context: CompetitionIntentContext
): CompetitionIntent {
  if (context.mode === 'survival' || context.forcedWinner || context.day < 3) return 'compete'
  if (context.playerStatus?.includes('nominated') && context.prizeType === 'POS') return 'compete'
  // Vox makes last place dangerous, so deliberately tanking its immunity contest is irrational.
  if (context.mode === 'vox_populi' && context.prizeType === 'LOH') return 'compete'

  const draw = seededUnit(seed, `${playerId}:${context.day}:${context.phase}:competition-intent`)
  const chance = throwChance(identity) * (context.mode === 'vox_populi' ? 0.22 : 1)
  if (draw < chance) return 'throw'
  if (
    draw < chance + 0.08 &&
    identity &&
    ['active_floater', 'strategic_operator', 'puppet_master', 'opportunist'].includes(
      identity.archetype
    )
  ) {
    return 'conserve'
  }
  return 'compete'
}

/** Apply an intention to a simulated score while respecting score direction and model bounds. */
export function applyCompetitionIntentToScore(
  score: number,
  model: MinigameAiModel,
  intent: CompetitionIntent,
  seed: number,
  playerId: string
): number {
  if (intent === 'compete' || !Number.isFinite(score)) return score
  const draw = seededUnit(seed, `${playerId}:${model.key}:${intent}:performance`)
  const factor =
    intent === 'throw' ? 0.24 + draw * 0.24 : 0.78 + draw * 0.14
  const minimum = model.minScore ?? 0
  const maximum = model.maxScore
  if (model.scoreDirection === 'lower-is-better') {
    const ceiling = maximum ?? Math.max(minimum + 1, Math.abs(score) * 2.2)
    return Math.round(Math.max(minimum, Math.min(ceiling, ceiling - (ceiling - score) * factor)))
  }
  const adjusted = minimum + (score - minimum) * factor
  return Math.round(
    typeof maximum === 'number'
      ? Math.max(minimum, Math.min(maximum, adjusted))
      : Math.max(minimum, adjusted)
  )
}

function playerName(players: readonly Pick<Player, 'id' | 'name'>[], id: string | undefined) {
  return players.find((player) => player.id === id)?.name ?? id ?? 'someone'
}

function namesForPair(fact: RealityFact, players: readonly Pick<Player, 'id' | 'name'>[]) {
  return fact.subjectIds.slice(0, 2).map((id) => playerName(players, id))
}

function leadText(fact: RealityFact, players: readonly Pick<Player, 'id' | 'name'>[]): string {
  const subject = playerName(players, fact.subjectIds[0])
  const [first, second] = namesForPair(fact, players)
  switch (fact.propositionType) {
    case 'COMPETITION_THROW_SUSPICION':
      return `${subject} may be deliberately hiding their competition strength.`
    case 'SECRET_MEETING':
      return `${first} and ${second} were seen having a private conversation.`
    case 'ROMANTIC_MOMENT':
      return `${first} and ${second} shared a moment that looked more than strategic.`
    case 'SECRET_ALLIANCE':
      return `${first} and ${second} may have made a private agreement.`
    case 'TARGETING':
      return `${subject} may be targeting ${playerName(players, fact.objectId)}.`
    case 'ALLIANCE_FRACTURE':
      return `${first} and ${second}'s working relationship may be breaking down.`
    default:
      return 'A new lead is circulating in the hub.'
  }
}

export function formatFauxTvWhisper(
  fact: RealityFact,
  players: readonly Pick<Player, 'id' | 'name'>[]
): string {
  const subject = playerName(players, fact.subjectIds[0])
  const [first, second] = namesForPair(fact, players)
  switch (fact.propositionType) {
    case 'COMPETITION_THROW_SUSPICION':
      return `HOUSE WHISPERS — After another unusually quiet competition from ${subject}, players are wondering whether they are hiding their strength.`
    case 'SECRET_MEETING':
      return `HOUSE WHISPERS — ${first} and ${second} have been finding reasons to speak away from the group.`
    case 'ROMANTIC_MOMENT':
      return `HOUSE WHISPERS — A private moment between ${first} and ${second} did not go unnoticed.`
    case 'SECRET_ALLIANCE':
      return `HOUSE WHISPERS — The growing closeness between ${first} and ${second} is beginning to attract attention.`
    case 'TARGETING':
      return `HOUSE WHISPERS — ${subject}'s name has been linked to a quiet campaign against ${playerName(players, fact.objectId)}.`
    case 'ALLIANCE_FRACTURE':
      return `HOUSE WHISPERS — The trust between ${first} and ${second} may be starting to crack.`
    default:
      return `HOUSE WHISPERS — ${leadText(fact, players)}`
  }
}

export function formatIncomingIntel(
  fact: RealityFact,
  players: readonly Pick<Player, 'id' | 'name'>[],
  humanId: string
): string {
  const subject = playerName(players, fact.subjectIds[0])
  if (fact.propositionType === 'TARGETING' && fact.objectId === humanId) {
    return `I keep hearing your name in ${subject}'s plans. I cannot prove it yet, but I thought you should know.`
  }
  if (fact.propositionType === 'COMPETITION_THROW_SUSPICION') {
    return `People are starting to compare notes about ${subject}'s competition performances. Some think they are deliberately holding back.`
  }
  return `I heard something you may want to know: ${leadText(fact, players)}`
}

function confidenceLabel(value: number): IntelLeadView['confidence'] {
  if (value >= 0.88) return 'Confirmed'
  if (value >= 0.64) return 'Credible'
  return 'Unverified'
}

function sourceLabel(memory: RealityMemory | undefined): string {
  switch (memory?.sourceType) {
    case 'DIRECT':
      return 'Direct conversation'
    case 'WITNESSED':
      return 'You witnessed it'
    case 'OFFICIAL':
      return 'Official'
    case 'INFERRED':
      return 'Pattern noticed'
    case 'HEARSAY':
    default:
      return 'House rumour'
  }
}

export function getIntelLeadViews(
  domain: RealityDomainState,
  ownerId: string,
  players: readonly Pick<Player, 'id' | 'name'>[],
  currentDay: number
): IntelLeadView[] {
  return Object.values(domain.beliefsByOwner[ownerId] ?? {})
    .filter(
      (belief) =>
        belief.status !== 'DISPROVEN' &&
        belief.status !== 'STALE' &&
        currentDay - belief.lastUpdatedDay <= 4
    )
    .map((belief) => ({ belief, fact: domain.facts[belief.id.replace(`belief:${ownerId}:`, '')] }))
    .filter(
      (entry): entry is { belief: RealityBelief; fact: RealityFact } =>
        Boolean(entry.fact && SUPPORTED_INTEL_PROPOSITIONS.has(entry.fact.propositionType))
    )
    .map(({ belief, fact }) => {
      const memory = (domain.memoriesByOwner[ownerId] ?? []).find((entry) =>
        belief.supportingMemoryIds.includes(entry.id)
      )
      return {
        factId: fact.id,
        propositionType: fact.propositionType,
        text: leadText(fact, players),
        source: sourceLabel(memory),
        confidence: confidenceLabel(belief.confidence),
        confidenceValue: belief.confidence,
        day: fact.day,
        subjectIds: [...fact.subjectIds],
      }
    })
    .sort(
      (left, right) =>
        right.confidenceValue - left.confidenceValue || right.day - left.day
    )
}

export function makeIntelMemory(input: {
  ownerId: string
  fact: RealityFact
  sourceType: RealityMemorySource
  sourceChain: string[]
  confidence: number
  day: number
  phase: string
}): RealityMemory {
  return {
    id: `memory:intel:${input.ownerId}:${input.fact.id}:${input.day}:${hash(input.sourceChain.join('|'))}`,
    ownerId: input.ownerId,
    eventId: input.fact.sourceEventId,
    day: input.day,
    phase: input.phase,
    participantIds: [...input.fact.participantIds],
    sourceType: input.sourceType,
    sourceChain: [...new Set(input.sourceChain)],
    confidence: Math.max(0.05, Math.min(1, input.confidence)),
    importance: 0.72,
    surprise: 0.62,
    emotionalValence: input.fact.propositionType === 'ROMANTIC_MOMENT' ? 0.2 : -0.12,
    emotionalIntensity: 0.48,
    secrecy: input.fact.visibility === 'PAIR_ONLY' || input.fact.visibility === 'PRIVATE' ? 0.84 : 0.4,
    strategicRelevance: input.fact.propositionType === 'ROMANTIC_MOMENT' ? 0.48 : 0.82,
    visibility: input.fact.visibility,
    tags: ['intel', input.fact.propositionType.toLowerCase()],
    relatedPromiseIds: [],
    relatedSecretIds: [],
    recallStrength: 0.86,
  }
}

export function selectIntelFactForActor(
  domain: RealityDomainState,
  actorId: string,
  recipientId: string,
  currentDay: number
): { fact: RealityFact; belief: RealityBelief } | null {
  const recipientBeliefs = domain.beliefsByOwner[recipientId] ?? {}
  const candidates = Object.values(domain.beliefsByOwner[actorId] ?? {})
    .map((belief) => ({
      belief,
      fact: domain.facts[belief.id.replace(`belief:${actorId}:`, '')],
    }))
    .filter(
      (entry): entry is { belief: RealityBelief; fact: RealityFact } =>
        Boolean(
          entry.fact &&
            SUPPORTED_INTEL_PROPOSITIONS.has(entry.fact.propositionType) &&
            entry.belief.status === 'ACTIVE' &&
            currentDay - entry.belief.lastUpdatedDay <= 3 &&
            !entry.fact.subjectIds.includes(actorId) &&
            entry.fact.objectId !== actorId
        )
    )
    .filter(({ fact, belief }) => {
      const recipientBelief = recipientBeliefs[`belief:${recipientId}:${fact.id}`]
      return !recipientBelief || recipientBelief.confidence + 0.08 < belief.confidence
    })
    .sort((left, right) => {
      const leftRelevant = left.fact.objectId === recipientId || left.fact.subjectIds.includes(recipientId)
      const rightRelevant =
        right.fact.objectId === recipientId || right.fact.subjectIds.includes(recipientId)
      return Number(rightRelevant) - Number(leftRelevant) || right.belief.confidence - left.belief.confidence
    })
  return candidates[0] ?? null
}

export function selectDiscoverableFact(
  domain: RealityDomainState,
  actorId: string,
  currentDay: number,
  deliveredFactIds: ReadonlySet<string>,
  observableOnly = false
): RealityFact | null {
  return Object.values(domain.facts)
    .filter(
      (fact) =>
        SUPPORTED_INTEL_PROPOSITIONS.has(fact.propositionType) &&
        currentDay - fact.day <= 4 &&
        !deliveredFactIds.has(fact.id) &&
        !fact.subjectIds.includes(actorId) &&
        (!observableOnly ||
          fact.witnessIds.length > 0 ||
          fact.visibility === 'GROUP_VISIBLE' ||
          fact.visibility === 'HOUSE_PUBLIC')
    )
    .sort((left, right) => right.day - left.day || left.id.localeCompare(right.id))[0] ?? null
}

export function selectFauxTvFact(
  domain: RealityDomainState,
  currentDay: number,
  deliveredFactIds: ReadonlySet<string>
): RealityFact | null {
  return Object.values(domain.facts)
    .filter(
      (fact) =>
        SUPPORTED_INTEL_PROPOSITIONS.has(fact.propositionType) &&
        fact.witnessIds.length > 0 &&
        currentDay - fact.day <= 3 &&
        !deliveredFactIds.has(fact.id)
    )
    .sort((left, right) => right.day - left.day || left.id.localeCompare(right.id))[0] ?? null
}

function pickWitnesses(
  entry: SocialActionLogEntry,
  players: readonly Player[],
  maximum: number
): string[] {
  const actor = players.find((player) => player.id === entry.actorId)
  const secrecyPenalty = actor?.aiGameIdentity?.temperament === 'secretive' ? 0.28 : 0
  const chance = Math.max(0.12, 0.56 - secrecyPenalty)
  const candidates = players
    .filter(
      (player) =>
        player.status !== 'evicted' &&
        player.status !== 'jury' &&
        player.id !== entry.actorId &&
        player.id !== entry.targetId &&
        player.id !== entry.subjectId
    )
    .sort((left, right) => left.id.localeCompare(right.id))
  return candidates
    .filter(
      (player) =>
        seededUnit(entry.timestamp, `${entry.actionId}:${entry.actorId}:${player.id}`) < chance
    )
    .slice(0, maximum)
    .map((player) => player.id)
}

export function buildIntelFactFromSocialAction(
  entry: SocialActionLogEntry,
  players: readonly Player[],
  phase: string
): RealityFact | null {
  if (entry.outcome !== 'success' || entry.actorId === entry.targetId) return null
  let propositionType: string | null = null
  let subjectIds: string[] = [entry.actorId, entry.targetId]
  let objectId: string | undefined
  let witnessMaximum = 1

  if (['proposeAlliance', 'ride_or_die'].includes(entry.actionId)) {
    propositionType = 'SECRET_ALLIANCE'
  } else if (
    ['flirt', 'private_flirt', 'late_night_talk', 'cuddle', 'kiss_under_covers', 'pool_makeout', 'spend_night'].includes(
      entry.actionId
    )
  ) {
    propositionType = 'ROMANTIC_MOMENT'
    witnessMaximum = 2
  } else if (['whisper', 'share_intel', 'trade_secrets'].includes(entry.actionId)) {
    propositionType = 'SECRET_MEETING'
  } else if (entry.actionId === 'pitch_target' && entry.subjectId) {
    propositionType = 'TARGETING'
    subjectIds = [entry.actorId]
    objectId = entry.subjectId
    witnessMaximum = 2
  } else if (['betray', 'break_alliance', 'break_bromance'].includes(entry.actionId)) {
    propositionType = 'ALLIANCE_FRACTURE'
    witnessMaximum = 2
  }
  if (!propositionType) return null

  const witnesses = pickWitnesses(entry, players, witnessMaximum)
  const factId = `fact:intel:${entry.week ?? 1}:${entry.actionId}:${entry.actorId}:${entry.targetId}:${entry.timestamp}`
  return {
    id: factId,
    propositionType,
    subjectIds,
    ...(objectId ? { objectId } : {}),
    value: true,
    day: entry.week ?? 1,
    phase: entry.phase ?? phase,
    visibility: propositionType === 'TARGETING' ? 'PRIVATE' : 'PAIR_ONLY',
    participantIds: [...new Set([entry.actorId, entry.targetId])],
    witnessIds: witnesses,
    viewerVisible: false,
    publicVisible: false,
    juryVisible: false,
    sourceEventId: `social:${entry.timestamp}:${entry.actorId}:${entry.actionId}`,
  }
}
