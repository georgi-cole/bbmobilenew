import type { Reducer, UnknownAction } from '@reduxjs/toolkit'
import type { GameState, Player, TvEvent } from '../types'
import { TWIN_SHOCK_ALI_ID, TWIN_SHOCK_LIA_ID } from '../bb/twinShock'

export type LohNominationStrategy = 'direct' | 'backdoor'
export type LohNominationPlanStatus =
  | 'planned'
  | 'initial_block_set'
  | 'compromised'
  | 'executed'
  | 'failed'

export interface LohNominationPlan {
  week: number
  lohId: string
  targetId: string
  backupTargetId: string | null
  pawnIds: string[]
  initialNomineeIds: string[]
  strategy: LohNominationStrategy
  status: LohNominationPlanStatus
  selectionBasis: 'strategy' | 'cold_start'
  targetScore: number
  backdoorChance: number
  /** Everyone alive is allowed to play Safety; retained as an audit snapshot. */
  safetyParticipantIds?: string[]
  revealPending?: boolean
  revealed?: boolean
}

declare module '../types' {
  interface GameState {
    /** Canonical AI LOH intent for the current day. Social intel and ceremonies must agree with it. */
    lohNominationPlan?: LohNominationPlan | null
  }
}

type NominationScoreFn = (state: GameState, lohId: string, candidate: Player) => number

const STRATEGIC_TAGS = new Set([
  'alliance',
  'primary_alliance',
  'ride_or_die',
  'romance',
  'bromance',
  'protection',
  'shield',
  'target',
  'rivalry',
  'betrayal',
  'strategic_threat',
  'unreliable',
])
const ALLY_TAGS = new Set([
  'alliance',
  'primary_alliance',
  'ride_or_die',
  'romance',
  'bromance',
  'protection',
  'shield',
])
const HOSTILE_TAGS = new Set(['target', 'rivalry', 'betrayal', 'strategic_threat', 'unreliable'])
const CONCEALMENT_SENSITIVE_ARCHETYPES = new Set([
  'active_floater',
  'strategic_operator',
  'puppet_master',
  'opportunist',
  'double_agent',
])
const ALWAYS_PUSH_ARCHETYPES = new Set(['aggressive_competitor', 'clutch_competitor'])

function hashStringU32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function seededUnit(value: string): number {
  return hashStringU32(value) / 0x1_0000_0000
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function alivePlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
}

function relationshipTags(state: GameState, fromId: string, toId: string): string[] {
  return state.strategicRelationships?.[fromId]?.[toId]?.tags ?? []
}

function affinity(state: GameState, fromId: string, toId: string): number {
  return state.strategicRelationships?.[fromId]?.[toId]?.affinity ?? 0
}

function hasAnyTag(tags: readonly string[], vocabulary: ReadonlySet<string>): boolean {
  return tags.some((tag) => vocabulary.has(tag))
}

function isTwinPartnerPair(state: GameState, firstId: string, secondId: string): boolean {
  if (state.twinShockResolution !== 'mission_success') return false
  return (
    (firstId === TWIN_SHOCK_LIA_ID && secondId === TWIN_SHOCK_ALI_ID) ||
    (firstId === TWIN_SHOCK_ALI_ID && secondId === TWIN_SHOCK_LIA_ID)
  )
}

function canPlanAgainst(state: GameState, lohId: string, candidate: Player): boolean {
  return candidate.id !== lohId && !isTwinPartnerPair(state, lohId, candidate.id)
}

function isCanonicalSingleLohDay(state: GameState): boolean {
  if (state.mode === 'survival') return false
  if (state.voxPopuli?.status === 'active') return false
  if (state.cupidArrow?.status === 'active') return false
  if ((state.coLohIds?.length ?? 0) > 1) return false
  if (state.democracia?.active && state.democracia.activatedDay === state.week) return false
  return true
}

function isCanonicalPlanningDay(state: GameState): boolean {
  if (!isCanonicalSingleLohDay(state)) return false
  if (state.publicModeEnabled) return false
  if (state.doubleEviction?.weekActive) return false
  if ((state.depressionShock?.activeDay ?? 0) > 0) return false
  return true
}

function competitionStrength(player: Player): number {
  const profile = player.competitionProfile
  const base =
    profile?.overall ??
    (profile
      ? (profile.physical + profile.mental + profile.precision + profile.nerve) / 4
      : 50)
  const wins = (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)
  return clamp(base + Math.min(24, wins * 6), 0, 100)
}

function incomingSocialShield(state: GameState, candidateId: string): number {
  const alive = alivePlayers(state).filter((player) => player.id !== candidateId)
  if (alive.length === 0) return 50
  let evidence = 0
  let total = 0
  for (const observer of alive) {
    const entry = state.strategicRelationships?.[observer.id]?.[candidateId]
    if (!entry) continue
    evidence += 1
    const allyBonus = hasAnyTag(entry.tags, ALLY_TAGS) ? 20 : 0
    total += clamp(50 + entry.affinity / 2 + allyBonus, 0, 100)
  }
  return evidence > 0 ? total / evidence : 50
}

function coldStartVulnerability(state: GameState, lohId: string, candidate: Player): number {
  const comp = competitionStrength(candidate)
  const shield = incomingSocialShield(state, candidate.id)
  const retaliationAffinity = affinity(state, candidate.id, lohId)
  const retaliationRisk = Math.max(0, -retaliationAffinity) * 0.12
  const earlyHumanGrace = candidate.isUser ? (state.week <= 1 ? 14 : state.week === 2 ? 8 : 0) : 0
  return (100 - comp) * 0.68 + (100 - shield) * 0.32 - retaliationRisk - earlyHumanGrace
}

function hasStrategicEvidence(state: GameState, lohId: string, candidates: readonly Player[]): boolean {
  if (state.week > 1 && state.lastWeekNominationRecord) return true
  return candidates.some((candidate) => {
    const entry = state.strategicRelationships?.[lohId]?.[candidate.id]
    const wins = (candidate.stats?.lohWins ?? 0) + (candidate.stats?.posWins ?? 0)
    return Boolean(
      wins > 0 ||
        (entry && (Math.abs(entry.affinity) >= 12 || hasAnyTag(entry.tags, STRATEGIC_TAGS)))
    )
  })
}

function choosePawns(
  state: GameState,
  lohId: string,
  candidates: readonly Player[],
  excludedIds: ReadonlySet<string>,
  count: number,
  scoreFn: NominationScoreFn
): Player[] {
  const ranked = candidates
    .filter((candidate) => !excludedIds.has(candidate.id))
    .map((candidate) => {
      const tags = relationshipTags(state, lohId, candidate.id)
      const allyPenalty =
        hasAnyTag(tags, ALLY_TAGS) || affinity(state, lohId, candidate.id) >= 45 ? 80 : 0
      const hostilePenalty = hasAnyTag(tags, HOSTILE_TAGS) ? 18 : 0
      const utility =
        incomingSocialShield(state, candidate.id) * 0.42 -
        scoreFn(state, lohId, candidate) * 0.34 -
        competitionStrength(candidate) * 0.12 -
        allyPenalty -
        hostilePenalty +
        seededUnit(`${state.gameId}:${state.week}:${lohId}:${candidate.id}:pawn`) * 4
      return { candidate, utility }
    })
    .sort((left, right) => right.utility - left.utility)

  const nonAllies = ranked.filter(({ candidate }) => {
    const tags = relationshipTags(state, lohId, candidate.id)
    return !hasAnyTag(tags, ALLY_TAGS) && affinity(state, lohId, candidate.id) < 45
  })
  const ordered = [...nonAllies, ...ranked.filter((entry) => !nonAllies.includes(entry))]
  const result: Player[] = []
  for (const entry of ordered) {
    if (result.some((player) => player.id === entry.candidate.id)) continue
    result.push(entry.candidate)
    if (result.length >= count) break
  }
  return result
}

function calculateBackdoorChance(
  state: GameState,
  lohId: string,
  target: Player,
  targetScore: number,
  secondScore: number
): number {
  const aliveCount = alivePlayers(state).length
  // Final 4 uses a separate Safety/eviction rule and has no normal replacement ceremony.
  if (state.week < 2 || aliveCount <= 4) return 0

  const tags = relationshipTags(state, lohId, target.id)
  const wins = (target.stats?.lohWins ?? 0) + (target.stats?.posWins ?? 0)
  const comp = competitionStrength(target)
  const hostility = hasAnyTag(tags, HOSTILE_TAGS) || affinity(state, lohId, target.id) <= -30
  const seriousThreat = comp >= 64 || wins > 0 || hostility || targetScore - secondScore >= 36
  if (!seriousThreat) return 0

  let chance = 0.16
  if (comp >= 70) chance += 0.12
  if (comp >= 82) chance += 0.08
  chance += Math.min(0.16, wins * 0.06)
  if (hostility) chance += 0.08
  chance += Math.min(0.1, Math.max(0, targetScore - secondScore) / 180)
  chance += Math.min(0.08, Math.max(0, state.week - 2) * 0.02)

  // Everybody plays Safety in this ruleset. The tactical value of concealment is
  // that a non-nominee may conserve or throw, while a nominee always fights for Safety.
  const archetype = target.aiGameIdentity?.archetype
  if (archetype && CONCEALMENT_SENSITIVE_ARCHETYPES.has(archetype)) chance += 0.08
  if (archetype && ALWAYS_PUSH_ARCHETYPES.has(archetype)) chance -= 0.06
  if (state.week === 2) chance -= 0.06

  return clamp(chance, 0, 0.62)
}

export function buildLohNominationPlan(
  state: GameState,
  scoreFn: NominationScoreFn
): LohNominationPlan | null {
  if (!state.lohId || !isCanonicalPlanningDay(state)) return null
  const loh = state.players.find((player) => player.id === state.lohId)
  if (!loh || loh.isUser) return null

  const candidates = alivePlayers(state).filter((candidate) => canPlanAgainst(state, loh.id, candidate))
  if (candidates.length < 2) return null

  const strategic = hasStrategicEvidence(state, loh.id, candidates)
  const ranked = candidates
    .map((candidate) => {
      const strategicScore = scoreFn(state, loh.id, candidate)
      const fallbackScore = coldStartVulnerability(state, loh.id, candidate)
      const jitter =
        seededUnit(`${state.gameId}:${state.week}:${state.seed}:${loh.id}:${candidate.id}:target`) * 3
      return {
        candidate,
        strategicScore,
        selectionScore: (strategic ? strategicScore : fallbackScore) + jitter,
      }
    })
    .sort((left, right) => right.selectionScore - left.selectionScore)

  const target = ranked[0].candidate
  const backupTarget = ranked[1]?.candidate ?? null
  const targetScore = ranked[0].strategicScore
  const secondScore = ranked[1]?.strategicScore ?? targetScore
  const backdoorChance = calculateBackdoorChance(state, loh.id, target, targetScore, secondScore)
  const backdoorRoll = seededUnit(
    `${state.gameId}:${state.week}:${state.seed}:${loh.id}:${target.id}:backdoor`
  )
  const strategy: LohNominationStrategy = backdoorRoll < backdoorChance ? 'backdoor' : 'direct'
  const nomineeCount = Math.min(
    2,
    Math.max(1, candidates.length - (strategy === 'backdoor' ? 1 : 0))
  )
  const pawnCount = strategy === 'backdoor' ? nomineeCount : Math.max(0, nomineeCount - 1)
  const pawns = choosePawns(
    state,
    loh.id,
    candidates,
    new Set([target.id]),
    pawnCount,
    scoreFn
  )

  if (strategy === 'backdoor' && pawns.length < nomineeCount) return null
  if (strategy === 'direct' && pawns.length < pawnCount) return null

  const initialNomineeIds =
    strategy === 'backdoor'
      ? pawns.map((player) => player.id)
      : [target.id, ...pawns.map((player) => player.id)]

  return {
    week: state.week,
    lohId: loh.id,
    targetId: target.id,
    backupTargetId: backupTarget?.id ?? null,
    pawnIds: pawns.map((player) => player.id),
    initialNomineeIds,
    strategy,
    status: 'planned',
    selectionBasis: strategic ? 'strategy' : 'cold_start',
    targetScore,
    backdoorChance,
  }
}

function planMatchesCurrentLoh(state: GameState): boolean {
  return Boolean(
    state.lohNominationPlan &&
      state.lohNominationPlan.week === state.week &&
      state.lohNominationPlan.lohId === state.lohId
  )
}

function canonicalSocialPlan(state: GameState, plan: LohNominationPlan) {
  if (plan.strategy !== 'backdoor') {
    return {
      week: state.week,
      lohId: plan.lohId,
      currentTargetId: plan.targetId,
      backupTargetId: plan.backupTargetId,
      askCountsByPlayerId: state.lohSocialPlan?.askCountsByPlayerId ?? {},
      disclosedTargetByPlayerId: state.lohSocialPlan?.disclosedTargetByPlayerId ?? {},
    }
  }

  if (plan.status === 'executed') {
    return {
      week: state.week,
      lohId: plan.lohId,
      currentTargetId: plan.targetId,
      backupTargetId: plan.backupTargetId,
      askCountsByPlayerId: state.lohSocialPlan?.askCountsByPlayerId ?? {},
      disclosedTargetByPlayerId: state.lohSocialPlan?.disclosedTargetByPlayerId ?? {},
    }
  }

  if (plan.status === 'compromised' || plan.status === 'failed') {
    const liveReplacementId = [...(state.replacementNomineeIds ?? [])]
      .reverse()
      .find((id) => state.nomineeIds.includes(id))
    const fallbackTargetId =
      liveReplacementId ??
      (plan.backupTargetId && state.nomineeIds.includes(plan.backupTargetId)
        ? plan.backupTargetId
        : null) ??
      state.nomineeIds.find((id) => !plan.pawnIds.includes(id)) ??
      state.nomineeIds[0] ??
      null
    return {
      week: state.week,
      lohId: plan.lohId,
      currentTargetId: fallbackTargetId,
      backupTargetId: null,
      askCountsByPlayerId: state.lohSocialPlan?.askCountsByPlayerId ?? {},
      disclosedTargetByPlayerId: state.lohSocialPlan?.disclosedTargetByPlayerId ?? {},
    }
  }

  return {
    week: state.week,
    lohId: plan.lohId,
    currentTargetId: plan.pawnIds[0] ?? null,
    backupTargetId: plan.targetId,
    askCountsByPlayerId: state.lohSocialPlan?.askCountsByPlayerId ?? {},
    disclosedTargetByPlayerId: state.lohSocialPlan?.disclosedTargetByPlayerId ?? {},
  }
}

function cloneForPlayerMutation(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      stats: player.stats ? { ...player.stats } : player.stats,
    })),
    tvFeed: [...state.tvFeed],
    replacementNomineeIds: [...(state.replacementNomineeIds ?? [])],
    povProtectedIds: [...(state.povProtectedIds ?? [])],
    currentWeekNominationRecord: state.currentWeekNominationRecord
      ? {
          ...state.currentWeekNominationRecord,
          nomineeIds: [...state.currentWeekNominationRecord.nomineeIds],
        }
      : state.currentWeekNominationRecord,
    lohSocialPlan: state.lohSocialPlan
      ? {
          ...state.lohSocialPlan,
          askCountsByPlayerId: { ...state.lohSocialPlan.askCountsByPlayerId },
          disclosedTargetByPlayerId: { ...(state.lohSocialPlan.disclosedTargetByPlayerId ?? {}) },
        }
      : state.lohSocialPlan,
    lohNominationPlan: state.lohNominationPlan
      ? { ...state.lohNominationPlan }
      : state.lohNominationPlan,
  }
}

function incrementNominationStat(player: Player, delta: number): void {
  if (!player.stats) player.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
  player.stats.timesNominated = Math.max(0, player.stats.timesNominated + delta)
}

function formatNameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function replaceNominationEventCopy(state: GameState, nomineeIds: readonly string[]): void {
  const names = nomineeIds
    .map((id) => state.players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  if (names.length === 0) return
  const text = `${formatNameList(names)} have been nominated for elimination. 🎯`
  const index = state.tvFeed.findIndex((event) => /have been nominated for elimination/i.test(event.text))
  if (index >= 0) state.tvFeed[index] = { ...state.tvFeed[index], text }
}

function reconcileInitialAiNominations(previous: GameState, state: GameState): GameState {
  const plan = state.lohNominationPlan
  if (!plan || plan.week !== state.week || plan.lohId !== state.lohId) return state
  if (previous.phase !== 'nominations' || state.phase !== 'nomination_results') return state
  if (!isCanonicalPlanningDay(state)) return state
  const loh = state.players.find((player) => player.id === state.lohId)
  if (!loh || loh.isUser) return state

  const baseNominees = [...state.nomineeIds]
  const desired = [...plan.initialNomineeIds]
  if (baseNominees.length !== desired.length || baseNominees.length === 0) return state

  const cloned = cloneForPlayerMutation(state)
  const baseSet = new Set(baseNominees)
  const desiredSet = new Set(desired)
  for (const player of cloned.players) {
    if (baseSet.has(player.id) && !desiredSet.has(player.id)) {
      if (player.status === 'nominated') player.status = 'active'
      incrementNominationStat(player, -1)
    }
    if (desiredSet.has(player.id) && !baseSet.has(player.id)) {
      if (player.status !== 'loh') player.status = 'nominated'
      incrementNominationStat(player, 1)
    }
  }
  cloned.nomineeIds = desired
  cloned.currentWeekNominationRecord = {
    week: cloned.week,
    lohId: plan.lohId,
    nomineeIds: [...desired],
  }
  cloned.lohNominationPlan = { ...plan, status: 'initial_block_set' }
  cloned.lohSocialPlan = canonicalSocialPlan(cloned, cloned.lohNominationPlan)
  replaceNominationEventCopy(cloned, desired)
  return cloned
}

function isReplacementEligible(state: GameState, playerId: string): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player || player.status === 'evicted' || player.status === 'jury') return false
  if (playerId === state.lohId || playerId === state.posWinnerId) return false
  if (state.nomineeIds.includes(playerId)) return false
  if (state.povSavedId === playerId) return false
  if ((state.povProtectedIds ?? []).includes(playerId)) return false
  return true
}

function replaceReplacementEventCopy(state: GameState, replacementId: string): void {
  const loh = state.players.find((player) => player.id === state.lohId)
  const replacement = state.players.find((player) => player.id === replacementId)
  if (!replacement) return
  const index = state.tvFeed.findIndex((event) => /named .+ as the backup nominee/i.test(event.text))
  if (index >= 0) {
    state.tvFeed[index] = {
      ...state.tvFeed[index],
      text: `${loh?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`,
    }
  }
}

function reconcileBackdoorReplacement(previous: GameState, state: GameState): GameState {
  const plan = state.lohNominationPlan
  if (!plan || plan.strategy !== 'backdoor' || plan.week !== state.week || plan.lohId !== state.lohId) {
    return state
  }
  if (plan.status === 'executed' || plan.status === 'failed' || plan.status === 'compromised') {
    return state
  }
  if (state.specialVeto?.activeType) return state
  if (state.phase !== 'pos_ceremony_results' || !state.povSavedId) return state

  const trackedAdded = (state.replacementNomineeIds ?? []).filter(
    (id) => !(previous.replacementNomineeIds ?? []).includes(id)
  )
  const blockAdded = state.nomineeIds.filter((id) => !previous.nomineeIds.includes(id))
  const added = trackedAdded.length > 0 ? trackedAdded : blockAdded
  if (added.length !== 1) return state

  const baseReplacementId = added[0]
  const blockWithoutBase = state.nomineeIds.filter((id) => id !== baseReplacementId)
  const targetEligible = isReplacementEligible({ ...state, nomineeIds: blockWithoutBase }, plan.targetId)
  const backupEligible =
    plan.backupTargetId != null &&
    isReplacementEligible({ ...state, nomineeIds: blockWithoutBase }, plan.backupTargetId)
  const desiredReplacementId = targetEligible
    ? plan.targetId
    : backupEligible && plan.backupTargetId
      ? plan.backupTargetId
      : baseReplacementId

  const cloned = cloneForPlayerMutation(state)
  if (desiredReplacementId !== baseReplacementId) {
    const basePlayer = cloned.players.find((player) => player.id === baseReplacementId)
    const desiredPlayer = cloned.players.find((player) => player.id === desiredReplacementId)
    if (basePlayer) {
      if (basePlayer.status === 'nominated') basePlayer.status = 'active'
      incrementNominationStat(basePlayer, -1)
    }
    if (desiredPlayer) {
      desiredPlayer.status = 'nominated'
      incrementNominationStat(desiredPlayer, 1)
    }
    cloned.nomineeIds = cloned.nomineeIds.map((id) =>
      id === baseReplacementId ? desiredReplacementId : id
    )
    replaceReplacementEventCopy(cloned, desiredReplacementId)
  }

  const tracked = (state.replacementNomineeIds ?? []).filter((id) => id !== baseReplacementId)
  cloned.replacementNomineeIds = Array.from(new Set([...tracked, desiredReplacementId]))

  if (desiredReplacementId === plan.targetId) {
    cloned.lohNominationPlan = {
      ...plan,
      status: 'executed',
      revealPending: true,
    }
    cloned.lohSocialPlan = canonicalSocialPlan(cloned, cloned.lohNominationPlan)
  } else if (state.posWinnerId === plan.targetId || (state.povProtectedIds ?? []).includes(plan.targetId)) {
    // The hidden target earned protection. The LOH must pivot, so the backdoor
    // was genuinely foiled rather than silently rewritten into a success.
    cloned.lohNominationPlan = { ...plan, status: 'compromised', revealPending: false }
    cloned.lohSocialPlan = canonicalSocialPlan(cloned, cloned.lohNominationPlan)
  } else {
    cloned.lohNominationPlan = { ...plan, status: 'failed', revealPending: false }
    cloned.lohSocialPlan = canonicalSocialPlan(cloned, cloned.lohNominationPlan)
  }
  return cloned
}

function buildBackdoorRevealEvent(state: GameState, plan: LohNominationPlan): TvEvent | null {
  const loh = state.players.find((player) => player.id === plan.lohId)
  const target = state.players.find((player) => player.id === plan.targetId)
  if (!target) return null
  const id = `backdoor:${state.gameId}:${state.week}:${plan.targetId}`
  if (state.tvFeed.some((event) => event.id === id)) return null
  return {
    id,
    text: `${loh?.name ?? 'The LOH'} kept ${target.name} off the opening block. Safety is decided, and the ambush is sprung.`,
    type: 'game',
    timestamp: Date.now(),
    meta: {
      major: 'backdoor',
      week: state.week,
      phase: state.phase,
      broadcastPriority: 'major',
      forceOnTv: true,
      announcementTitle: 'AMBUSH',
      announcementSubtitle: `${target.name} was the real target all along. The opening nominations were camouflage.`,
      backdoorTargetId: target.id,
      lohId: plan.lohId,
    },
  }
}

function maybePublishBackdoorReveal(
  previous: GameState,
  state: GameState,
  action: UnknownAction
): GameState {
  const plan = state.lohNominationPlan
  if (action.type !== 'game/advance' || !plan?.revealPending || plan.revealed) return state
  if (previous.phase !== 'pos_ceremony_results') return state
  const event = buildBackdoorRevealEvent(state, plan)
  if (!event) return state
  return {
    ...state,
    tvFeed: [event, ...state.tvFeed],
    lohNominationPlan: { ...plan, revealPending: false, revealed: true },
  }
}

function establishPlan(state: GameState, scoreFn: NominationScoreFn): GameState {
  const planningPhase =
    state.phase === 'loh_results' || state.phase === 'social_1' || state.phase === 'nominations'
  if (!planningPhase || planMatchesCurrentLoh(state)) return state
  const plan = buildLohNominationPlan(state, scoreFn)
  if (!plan) return state
  return {
    ...state,
    lohNominationPlan: plan,
    lohSocialPlan: canonicalSocialPlan(state, plan),
  }
}

function recordSafetyField(previous: GameState, state: GameState): GameState {
  const plan = state.lohNominationPlan
  if (!plan || plan.week !== state.week || plan.lohId !== state.lohId) return state
  if (previous.phase === state.phase || state.phase !== 'pos_comp') return state
  return {
    ...state,
    lohNominationPlan: {
      ...plan,
      safetyParticipantIds: selectSafetyCompetitionParticipants(state),
    },
  }
}

/** The Big Eye ruleset lets every active player participate in Power of Safety. */
export function selectSafetyCompetitionParticipants(state: GameState): string[] {
  return alivePlayers(state).map((player) => player.id)
}

function reconcileCanonicalSocialDisclosure(previous: GameState, state: GameState): GameState {
  const plan = state.lohNominationPlan
  if (!plan || plan.week !== state.week || plan.lohId !== state.lohId) return state

  const canonical = canonicalSocialPlan(state, plan)
  const previousSocialPlan =
    previous.lohSocialPlan?.week === state.week && previous.lohSocialPlan.lohId === plan.lohId
      ? previous.lohSocialPlan
      : null
  const nextCounts = { ...(state.lohSocialPlan?.askCountsByPlayerId ?? {}) }
  const previousCounts = previousSocialPlan?.askCountsByPlayerId ?? {}
  const disclosed = { ...(previousSocialPlan?.disclosedTargetByPlayerId ?? {}) }
  const finalBlockLocked = ['pos_ceremony_results', 'social_2', 'live_vote'].includes(state.phase)

  for (const [actorId, nextCount] of Object.entries(nextCounts)) {
    const priorCount = previousCounts[actorId] ?? 0
    if (nextCount <= priorCount) continue
    const disclosureId = finalBlockLocked
      ? canonical.currentTargetId
      : priorCount % 2 === 1 && canonical.currentTargetId
        ? canonical.currentTargetId
        : (canonical.backupTargetId ?? canonical.currentTargetId)
    if (disclosureId) disclosed[actorId] = disclosureId
  }

  return {
    ...state,
    lohSocialPlan: {
      ...canonical,
      askCountsByPlayerId: nextCounts,
      disclosedTargetByPlayerId: disclosed,
    },
  }
}

export function withLohNominationPlanning(
  baseReducer: Reducer<GameState, UnknownAction>,
  scoreFn: NominationScoreFn
): Reducer<GameState, UnknownAction> {
  return (state, action) => {
    const previous = state
    let next = baseReducer(state, action)
    if (!previous) return next

    if (
      action.type === 'game/resetGame' ||
      (next.phase === 'week_start' && next.week !== previous.week)
    ) {
      if (next.lohNominationPlan != null) next = { ...next, lohNominationPlan: null }
    }

    next = establishPlan(next, scoreFn)
    next = reconcileInitialAiNominations(previous, next)
    next = recordSafetyField(previous, next)
    next = reconcileBackdoorReplacement(previous, next)
    next = maybePublishBackdoorReveal(previous, next, action)

    if (action.type === 'game/setLohSocialPlan') {
      next = reconcileCanonicalSocialDisclosure(previous, next)
    }

    return next
  }
}
