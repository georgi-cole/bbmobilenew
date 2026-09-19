import type { AppDispatch, RootState } from '../../store/store'
import type { ExecuteActionResult } from '../SocialManeuvers'
import { executeAction, executeGroupAction, getActionById } from '../SocialManeuvers'
import { replaceRealityDomain, replaceRealitySimulation, updateRelationship } from '../socialSlice'
import { ALLIANCE_TAG } from '../socialAlliance'
import { getEffectiveSocialMode } from '../socialMode'
import { resolveActionTargetMode } from '../socialActions'
import { normalizeActionCosts } from '../smExecNormalize'
import {
  createInitialRealitySimulationState,
  deriveRealitySimulationSeed,
} from '../realitySimulation'
import { getRealityActionContract, type RealityActorSnapshot } from './actionContract'
import { runRealityOpportunity } from './orchestrator'
import {
  findRealityAllianceForConsultation,
  holdRealityAllianceStrategyMeeting,
} from './relationshipForms'
import type { RealityAlliance } from './types'
import { getRealityModeAdapter } from './modeAdapters'
import { applyRealityRelationshipChange } from './relationships'
import type { RealityContext } from './types'
import { getCupidPartnerId } from '../../features/twists/cupidArrow'
import {
  chooseAiEvictionVote,
  getEligibleNominationTargets,
  getEligibleReplacementNominees,
  getNominationTargetScore,
  getSafetyRelationshipScore,
} from '../../store/gameSlice'
import { shouldDepressionShockRefuseConversation } from '../../features/twists/depressionShock'

export interface HumanRealityActionInput {
  actorId: string
  targetId: string
  targetIds?: string[]
  actionId: string
  subjectId?: string
  costOverride?: { energy: number; influence: number; info: number }
}

const PHASE_REPETITION_SUCCESS_CHANCES = [0.8, 0.5, 0.25] as const
const INFORMATION_REPETITION_SUCCESS_CHANCES = [1, 0.75, 0.3] as const

function getHumanRepetitionSuccessChances(actionId: string): readonly number[] | null {
  const legacyAction = getActionById(actionId)
  if (legacyAction?.kind === 'intel_gain' && legacyAction.targetMode !== 'none') {
    return INFORMATION_REPETITION_SUCCESS_CHANCES
  }
  const contract = getRealityActionContract(actionId)
  if (
    contract?.purposes.includes('BOND') &&
    !contract.purposes.includes('COMMITMENT') &&
    !contract.purposes.includes('ROMANCE')
  ) {
    return PHASE_REPETITION_SUCCESS_CHANCES
  }
  return null
}

function getPhaseRepetitionChance(
  state: RootState,
  input: HumanRealityActionInput
): number | undefined {
  const successChances = getHumanRepetitionSuccessChances(input.actionId)
  if (!successChances) return undefined
  const priorAttempts = (state.social.actionHistory ?? []).filter(
    (entry) =>
      entry.actorId === input.actorId &&
      entry.targetId === input.targetId &&
      entry.actionId === input.actionId &&
      entry.week === state.game.week &&
      entry.phase === state.game.phase
  ).length
  return successChances[priorAttempts] ?? 0.02
}

function isDangerWarningDiscovered(state: RootState, input: HumanRealityActionInput): boolean {
  const source = [
    state.game.seed,
    state.game.week,
    state.game.lohId,
    input.actorId,
    input.targetId,
    input.actionId,
  ].join('|')
  let hash = 0x811c9dc5
  for (const character of source) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000 < 0.35
}

function buildActors(state: RootState): Record<string, RealityActorSnapshot> {
  return Object.fromEntries(
    state.game.players.map((player) => {
      const roles = [player.status]
      if (state.game.lohId === player.id && !roles.includes('loh')) roles.push('loh')
      if (state.game.posWinnerId === player.id && !roles.includes('pos')) roles.push('pos')
      return [
        player.id,
        {
          id: player.id,
          isHuman: player.isUser === true,
          active: player.status !== 'evicted' && player.status !== 'jury',
          roles,
          resources: {
            energy: state.social.energyBank[player.id] ?? 0,
            influence: state.social.influenceBank[player.id] ?? 0,
            info: state.social.infoBank[player.id] ?? 0,
          },
        },
      ]
    })
  )
}

function buildContext(state: RootState): RealityContext {
  const actors = buildActors(state)
  const mode = getRealityModeAdapter(state.game.mode, state.game.publicModeEnabled === true)
  return {
    day: state.game.week ?? 1,
    phase: state.game.phase,
    gameMode: mode.gameMode,
    socialIntensity: getEffectiveSocialMode(state) === 'drama' ? 'REALITY' : 'NORMAL',
    audienceMode: mode.audienceMode,
    feedPerspective: 'PLAYER_LIMITED',
    activeActorIds: Object.values(actors)
      .filter((actor) => actor.active)
      .map((actor) => actor.id),
    rolesByActor: Object.fromEntries(Object.values(actors).map((actor) => [actor.id, actor.roles])),
    atRiskActorIds: [...(state.game.nomineeIds ?? [])],
    powerHolderIds: [state.game.lohId, state.game.posWinnerId].filter((id): id is string =>
      Boolean(id)
    ),
    romanceEnabled: state.settings.gameUX.romanceStorylines,
  }
}

function result(
  success: boolean,
  summary: string,
  newEnergy: number,
  delta = 0,
  label = success ? 'Resolved' : 'Unavailable',
  score = 0
): ExecuteActionResult {
  return { success, summary, newEnergy, delta, label, score }
}

function playerName(state: RootState, playerId: string | null | undefined): string {
  if (!playerId) return 'that nominee'
  return state.game.players.find((player) => player.id === playerId)?.name ?? 'that nominee'
}

interface AllianceConsultationPlan {
  allianceId: string
  attendeeIds: string[]
  targetIds: string[]
  fallbackTargetIds: string[]
  planIds: string[]
  agenda: string
  summary: string
  excusedAbsentIds: string[]
  memberPlanBeliefs: Record<string, string[]>
}

function activeAllianceAdvisors(
  state: RootState,
  alliance: RealityAlliance,
  actorId: string
): string[] {
  const activeIds = new Set(
    state.game.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
  return alliance.memberIds.filter((id) => id !== actorId && activeIds.has(id))
}

function nominationConsultationCandidates(state: RootState, actorId: string) {
  return getEligibleNominationTargets(state.game, actorId)
}

function isAllianceProtectedGameUnit(
  state: RootState,
  alliance: RealityAlliance,
  playerId: string
): boolean {
  if (alliance.memberIds.includes(playerId)) return true
  const cupidPartnerId = getCupidPartnerId(state.game, playerId)
  return cupidPartnerId !== null && alliance.memberIds.includes(cupidPartnerId)
}

function summarizeAlliancePreferences(
  state: RootState,
  preferences: Array<{ advisorId: string; targetId: string; score: number }>,
  label: string,
  excludedPlanTargetIds: ReadonlySet<string> = new Set()
): {
  summary: string
  targetIds: string[]
  fallbackTargetIds: string[]
  hasConsensus: boolean
  preferenceByAdvisor: Record<string, string>
} {
  const counts = new Map<string, { votes: number; score: number }>()
  for (const preference of preferences) {
    if (excludedPlanTargetIds.has(preference.targetId)) continue
    const current = counts.get(preference.targetId) ?? { votes: 0, score: 0 }
    current.votes += 1
    current.score += preference.score
    counts.set(preference.targetId, current)
  }
  const ordered = [...counts.entries()].sort(
    (left, right) =>
      right[1].votes - left[1].votes ||
      right[1].score - left[1].score ||
      left[0].localeCompare(right[0])
  )
  const primary = ordered[0]
  const fallback = ordered[1]
  const primaryId = primary?.[0]
  const topVotes = primary?.[1].votes ?? 0
  const hasConsensus =
    preferences.length >= 2 && topVotes >= 2 && topVotes / Math.max(1, preferences.length) > 0.5
  const fallbackId =
    hasConsensus && fallback && fallback[1].votes >= 2 ? fallback[0] : undefined
  const preferenceByAdvisor = Object.fromEntries(
    preferences.map((preference) => [preference.advisorId, preference.targetId])
  )
  const lines = preferences
    .slice(0, 4)
    .map(
      (preference) =>
        `${playerName(state, preference.advisorId)} → ${playerName(state, preference.targetId)}`
    )
    .join(' · ')
  const consensus = hasConsensus && primaryId
    ? `${label}: ${playerName(state, primaryId)}${
        fallbackId ? ` · backup ${playerName(state, fallbackId)}` : ''
      }`
    : preferences.length === 1 && primaryId
      ? `${label}: ${playerName(state, preferences[0].advisorId)} recommends ${playerName(
          state,
          primaryId
        )}; no group decision`
      : `${label}: split; no alliance decision`
  return {
    summary: lines ? `${lines}. ${consensus}.` : `${consensus}.`,
    targetIds: hasConsensus && primaryId ? [primaryId] : [],
    fallbackTargetIds: fallbackId ? [fallbackId] : [],
    hasConsensus,
    preferenceByAdvisor,
  }
}

function buildConsultationMemberPlanBeliefs(
  attendeeIds: readonly string[],
  actorId: string,
  read: {
    targetIds: string[]
    fallbackTargetIds: string[]
    preferenceByAdvisor: Record<string, string>
  }
): Record<string, string[]> {
  const consensusTarget = read.targetIds[0]
  const fallbackTarget = read.fallbackTargetIds[0]
  return Object.fromEntries(
    attendeeIds.map((memberId) => {
      if (memberId === actorId) {
        return [
          memberId,
          [
            ...(consensusTarget ? [`target:${consensusTarget}`] : []),
            ...(fallbackTarget ? [`fallback:${fallbackTarget}`] : []),
          ],
        ]
      }
      const preference = read.preferenceByAdvisor[memberId]
      if (!preference) return [memberId, []]
      if (preference === consensusTarget) return [memberId, [`target:${preference}`]]
      if (preference === fallbackTarget) return [memberId, [`fallback:${preference}`]]
      return [
        memberId,
        [
          ...(consensusTarget ? [`aware:${consensusTarget}`] : []),
          `preference:${preference}`,
        ],
      ]
    })
  )
}

function getAllianceConsultationAgenda(
  state: RootState,
  actorId: string
): AllianceConsultationPlan['agenda'] {
  const actorIsLoh =
    state.game.lohId === actorId || getCupidPartnerId(state.game, state.game.lohId) === actorId
  const actorHasSafety =
    state.game.posWinnerId === actorId ||
    getCupidPartnerId(state.game, state.game.posWinnerId) === actorId
  const nomineesExist = state.game.nomineeIds.length > 0

  if (actorIsLoh && ['loh_results', 'social_1', 'nominations'].includes(state.game.phase)) {
    return 'nominations'
  }
  if (
    actorHasSafety &&
    ['pos_results', 'pos_ceremony'].includes(state.game.phase) &&
    nomineesExist
  ) {
    return 'safety'
  }
  if (
    state.game.voxPopuli?.status !== 'active' &&
    nomineesExist &&
    ['nomination_results', 'pos_results', 'pos_ceremony'].includes(state.game.phase)
  ) {
    return 'block_strategy'
  }
  if (
    state.game.voxPopuli?.status !== 'active' &&
    nomineesExist &&
    ['pos_ceremony_results', 'social_2', 'live_vote'].includes(state.game.phase)
  ) {
    return 'eviction_vote'
  }
  return 'strategy'
}

function buildAllianceConsultationPlan(
  state: RootState,
  alliance: RealityAlliance,
  actorId: string
): AllianceConsultationPlan | null {
  const advisors = activeAllianceAdvisors(state, alliance, actorId)
  if (advisors.length === 0) return null
  const attendeeIds = [actorId, ...advisors]
  const attendeeSet = new Set(attendeeIds)
  const excusedAbsentIds = alliance.memberIds.filter((id) => !attendeeSet.has(id))
  const agenda = getAllianceConsultationAgenda(state, actorId)
  const nominees = state.game.players.filter((player) => state.game.nomineeIds.includes(player.id))

  if (agenda === 'nominations') {
    const candidates = nominationConsultationCandidates(state, actorId).filter(
      (candidate) => !isAllianceProtectedGameUnit(state, alliance, candidate.id)
    )
    if (candidates.length === 0) return null
    const preferences = advisors
      .map((advisorId) => {
        const ranked = candidates
          .filter((candidate) => candidate.id !== advisorId)
          .map((candidate) => ({
            advisorId,
            targetId: candidate.id,
            score: getNominationTargetScore(state.game, advisorId, candidate),
          }))
          .sort(
            (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
          )
        return ranked[0]
      })
      .filter((entry): entry is { advisorId: string; targetId: string; score: number } =>
        Boolean(entry)
      )
    const read = summarizeAlliancePreferences(
      state,
      preferences,
      'Nomination consensus',
      new Set(alliance.memberIds)
    )
    return {
      allianceId: alliance.id,
      attendeeIds,
      targetIds: read.targetIds,
      fallbackTargetIds: read.fallbackTargetIds,
      planIds: [
        ...read.targetIds.map((id) => `target:${id}`),
        ...read.fallbackTargetIds.map((id) => `fallback:${id}`),
      ],
      agenda: 'nominations',
      summary: `Alliance huddle — ${read.summary}`,
      excusedAbsentIds,
      memberPlanBeliefs: buildConsultationMemberPlanBeliefs(
        attendeeIds,
        actorId,
        read
      ),
    }
  }

  if (agenda === 'safety') {
    const preferences = advisors
      .map((advisorId) => {
        const ranked = nominees
          .map((nominee) => ({
            advisorId,
            targetId: nominee.id,
            score: getSafetyRelationshipScore(state.game, advisorId, nominee),
          }))
          .sort(
            (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
          )
        return ranked[0]
      })
      .filter((entry): entry is { advisorId: string; targetId: string; score: number } =>
        Boolean(entry)
      )
    const read = summarizeAlliancePreferences(state, preferences, 'Safety preference')
    const replacements = getEligibleReplacementNominees(state.game).filter(
      (candidate) => !isAllianceProtectedGameUnit(state, alliance, candidate.id)
    )
    const replacementPreferences = advisors
      .map((advisorId) => {
        const ranked = replacements
          .filter((candidate) => candidate.id !== advisorId)
          .map((candidate) => ({
            advisorId,
            targetId: candidate.id,
            score: getNominationTargetScore(state.game, advisorId, candidate),
          }))
          .sort(
            (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
          )
        return ranked[0]
      })
      .filter((entry): entry is { advisorId: string; targetId: string; score: number } =>
        Boolean(entry)
      )
    const replacementRead = summarizeAlliancePreferences(
      state,
      replacementPreferences,
      'Replacement consensus'
    )
    const replacement = replacementRead.targetIds[0] ?? null
    const fallbackTargetIds = replacement ? [replacement] : [...alliance.fallbackTargetIds]
    const planIds = [
      ...alliance.currentTargetIds.map((id) => `target:${id}`),
      ...fallbackTargetIds.map((id) => `fallback:${id}`),
      ...(read.targetIds[0] ? [`save:${read.targetIds[0]}`] : []),
    ]
    const memberPlanBeliefs = Object.fromEntries(
      attendeeIds.map((memberId) => {
        if (memberId === actorId) {
          return [
            memberId,
            [
              ...(read.targetIds[0] ? [`save:${read.targetIds[0]}`] : []),
              ...(replacement ? [`fallback:${replacement}`] : []),
            ],
          ]
        }
        const savePreference = read.preferenceByAdvisor[memberId]
        const replacementPreference = replacementRead.preferenceByAdvisor[memberId]
        return [
          memberId,
          [
            ...(savePreference ? [`save:${savePreference}`] : []),
            ...(replacementPreference
              ? [
                  replacementPreference === replacement
                    ? `fallback:${replacementPreference}`
                    : `replacement_preference:${replacementPreference}`,
                ]
              : []),
          ],
        ]
      })
    )
    return {
      allianceId: alliance.id,
      attendeeIds,
      targetIds: [...alliance.currentTargetIds],
      fallbackTargetIds,
      planIds,
      agenda: 'safety',
      summary: `Alliance huddle — ${read.summary} ${replacementRead.summary}`,
      excusedAbsentIds,
      memberPlanBeliefs,
    }
  }

  if (agenda === 'block_strategy' || agenda === 'eviction_vote') {
    const nomineeIds = nominees
      .filter((nominee) => !isAllianceProtectedGameUnit(state, alliance, nominee.id))
      .map((nominee) => nominee.id)
    if (nomineeIds.length === 0) return null
    const preferences = advisors.map((advisorId) => {
      const targetId = chooseAiEvictionVote(
        state.game,
        advisorId,
        nomineeIds,
        (state.game.seed ?? 0) ^ state.game.week
      )
      return { advisorId, targetId, score: 1 }
    })
    const read = summarizeAlliancePreferences(
      state,
      preferences,
      agenda === 'eviction_vote' ? 'Vote consensus' : 'Current block',
      new Set(alliance.memberIds)
    )
    return {
      allianceId: alliance.id,
      attendeeIds,
      targetIds: read.targetIds,
      fallbackTargetIds: read.fallbackTargetIds,
      planIds: [
        ...read.targetIds.map((id) => `target:${id}`),
        ...read.fallbackTargetIds.map((id) => `fallback:${id}`),
      ],
      agenda,
      summary: `Alliance huddle — ${read.summary}`,
      excusedAbsentIds,
      memberPlanBeliefs: buildConsultationMemberPlanBeliefs(
        attendeeIds,
        actorId,
        read
      ),
    }
  }

  const candidates = nominationConsultationCandidates(state, actorId).filter(
    (candidate) => !isAllianceProtectedGameUnit(state, alliance, candidate.id)
  )
  if (candidates.length === 0) return null
  const preferences = advisors
    .map((advisorId) => {
      const ranked = candidates
        .filter((candidate) => candidate.id !== advisorId)
        .map((candidate) => ({
          advisorId,
          targetId: candidate.id,
          score: getNominationTargetScore(state.game, advisorId, candidate),
        }))
        .sort(
          (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
        )
      return ranked[0]
    })
    .filter((entry): entry is { advisorId: string; targetId: string; score: number } =>
      Boolean(entry)
    )
  const read = summarizeAlliancePreferences(
    state,
    preferences,
    'Strategic read',
    new Set(alliance.memberIds)
  )
  return {
    allianceId: alliance.id,
    attendeeIds,
    targetIds: read.targetIds,
    fallbackTargetIds: read.fallbackTargetIds,
    planIds: [
      ...read.targetIds.map((id) => `target:${id}`),
      ...read.fallbackTargetIds.map((id) => `fallback:${id}`),
    ],
    agenda: 'strategy',
    summary: `Alliance huddle — ${read.summary}`,
    excusedAbsentIds,
    memberPlanBeliefs: buildConsultationMemberPlanBeliefs(
      attendeeIds,
      actorId,
      read
    ),
  }
}

/**
 * A Cupid pair does not share a single opinion, but they are unusually likely
 * to compare notes.  Let a meaningful one-on-one interaction lightly colour
 * the human's connection with the other half of that pair.
 */
function applyCupidPartnerRipple(
  dispatch: AppDispatch,
  state: RootState,
  actorId: string,
  targetIds: readonly string[],
  targetDeltas: Record<string, number> | undefined,
  fallbackDelta: number
): string | null {
  if (!state.game.cupidArrow || targetIds.length === 0) return null
  const targetSet = new Set(targetIds)
  const echoedPartnerIds = new Set<string>()

  for (const targetId of targetIds) {
    const partnerId = getCupidPartnerId(state.game, targetId)
    if (
      !partnerId ||
      partnerId === actorId ||
      targetSet.has(partnerId) ||
      echoedPartnerIds.has(partnerId)
    ) {
      continue
    }
    const directDelta = targetDeltas?.[targetId] ?? fallbackDelta
    if (!Number.isFinite(directDelta) || Math.abs(directDelta) < 2) continue
    const echoDelta = Math.sign(directDelta) * Math.max(1, Math.round(Math.abs(directDelta) * 0.35))
    dispatch(
      updateRelationship({
        source: actorId,
        target: partnerId,
        delta: echoDelta,
        tags: ['cupid_ripple'],
        actionSource: 'manual',
      })
    )
    dispatch(
      updateRelationship({
        source: partnerId,
        target: actorId,
        delta: Math.sign(echoDelta) * Math.max(1, Math.round(Math.abs(echoDelta) * 0.5)),
        tags: ['cupid_ripple'],
        actionSource: 'manual',
      })
    )
    echoedPartnerIds.add(partnerId)
  }

  if (echoedPartnerIds.size === 0) return null
  const names = [...echoedPartnerIds].map((id) => playerName(state, id))
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * Keep LOH-target dialogue tied to the persisted canonical nomination plan.
 * The legacy social action can still decide whether the LOH discloses anything,
 * but it no longer gets to invent a different target from affinity alone.
 */
function buildLohConsultationSummary(
  state: RootState,
  input: HumanRealityActionInput,
  fallback: string
): string {
  if (input.actionId !== 'ask_loh_target' || state.game.lohId !== input.targetId) return fallback

  const plan =
    state.game.lohSocialPlan?.week === state.game.week &&
    state.game.lohSocialPlan.lohId === state.game.lohId
      ? state.game.lohSocialPlan
      : null
  if (!plan) return fallback

  // Respect genuine refusal/repetition outcomes. Canonical strategy should fix
  // contradictory names, not turn a failed intel action into free information.
  if (
    /shut the conversation down|already answered|kept (?:their|the) plan deliberately vague/i.test(
      fallback
    )
  ) {
    return fallback
  }

  const nominees = state.game.nomineeIds.filter((id) =>
    state.game.players.some(
      (player) => player.id === id && player.status !== 'evicted' && player.status !== 'jury'
    )
  )
  const finalBlockLocked = ['pos_ceremony_results', 'social_2', 'live_vote'].includes(
    state.game.phase
  )
  const actorHoldsSafety =
    state.game.posWinnerId === input.actorId ||
    getCupidPartnerId(state.game, state.game.posWinnerId) === input.actorId
  const safetyDecisionOpen =
    actorHoldsSafety && ['pos_results', 'pos_ceremony'].includes(state.game.phase)

  if (finalBlockLocked && nominees.length > 0) {
    const lockedTargetId =
      (plan.currentTargetId && nominees.includes(plan.currentTargetId)
        ? plan.currentTargetId
        : null) ?? nominees[0]
    const lockedTarget = playerName(state, lockedTargetId)
    return `The block is locked. ${lockedTarget} is my main target, and that is who I want eliminated.`
  }

  if (safetyDecisionOpen && nominees.length > 0) {
    const currentTargetId =
      (plan.currentTargetId && nominees.includes(plan.currentTargetId)
        ? plan.currentTargetId
        : null) ?? nominees[0]
    const backupId =
      plan.backupTargetId && !nominees.includes(plan.backupTargetId) ? plan.backupTargetId : null

    if (backupId) {
      const saveId = nominees.find((id) => id !== currentTargetId) ?? nominees[0]
      return `Use it on ${playerName(state, saveId)}. Let's open the seat and spring an ambush on ${playerName(
        state,
        backupId
      )}.`
    }
    return `No—do not use it. I want the nominations to stay the same, with ${playerName(
      state,
      currentTargetId
    )} as the target.`
  }

  const disclosedTargetId =
    plan.disclosedTargetByPlayerId?.[input.actorId] ?? plan.backupTargetId ?? plan.currentTargetId
  if (!disclosedTargetId) return fallback

  const disclosedName = playerName(state, disclosedTargetId)
  if (nominees.includes(disclosedTargetId)) {
    return `${disclosedName} is my current target. That is who I want the pressure on.`
  }
  if (plan.backupTargetId === disclosedTargetId && disclosedTargetId !== plan.currentTargetId) {
    return `${disclosedName} is my backup plan if Safety opens the block.`
  }
  return `Right now, ${disclosedName} is the person I am watching most closely.`
}

export function executeHumanRealityAction(input: HumanRealityActionInput) {
  return (dispatch: AppDispatch, getState: () => RootState): ExecuteActionResult => {
    const state = getState()
    const action = getActionById(input.actionId)
    const energy = state.social.energyBank[input.actorId] ?? 0
    const targetIds = input.targetIds ?? [input.targetId]
    if (!action) return result(false, 'Unknown action', energy)

    // During Depression Shock, a housemate may simply shut the conversation
    // down. Resolve this before affordability/execution so a refusal costs the
    // human no energy, influence or information.
    if (
      shouldDepressionShockRefuseConversation({
        gameId: state.game.gameId,
        week: state.game.week,
        actorId: input.actorId,
        targetIds,
        actionId: input.actionId,
      })
    ) {
      const targetNames = targetIds
        .filter((targetId) => targetId !== input.actorId)
        .map(
          (targetId) =>
            state.game.players.find((player) => player.id === targetId)?.name ?? targetId
        )
      const subject = targetNames.length === 1 ? targetNames[0] : 'The housemates'
      return result(
        false,
        `${subject} refused to talk right now. The mood in the House is too low.`,
        energy,
        0,
        'Refused'
      )
    }

    // Classic is a complete, independent social ruleset. It must never create
    // premium Reality events, causal memories, or simulation traces.
    if (getEffectiveSocialMode(state) !== 'drama') {
      const mode = resolveActionTargetMode(action, false)
      if (mode === 'multi') {
        return executeGroupAction(input.actorId, targetIds, input.actionId, {
          source: 'manual',
          costOverride: input.costOverride,
        })
      }
      if (targetIds.length > 1) {
        return targetIds
          .map((targetId, index) =>
            executeAction(input.actorId, targetId, input.actionId, {
              source: 'manual',
              subjectId: input.subjectId,
              waiveCosts: index > 0,
              costOverride: index === 0 ? input.costOverride : { energy: 0, influence: 0, info: 0 },
            })
          )
          .reduce<ExecuteActionResult>(
            (combined, entry, index) => ({
              success: combined.success || entry.success,
              summary:
                index === targetIds.length - 1
                  ? `Reached ${targetIds.length} housemates.`
                  : combined.summary,
              newEnergy: entry.newEnergy,
              delta: (combined.delta * index + entry.delta) / Math.max(1, index + 1),
              label: entry.label,
              score: (combined.score * index + entry.score) / Math.max(1, index + 1),
              targetDeltas: {
                ...(combined.targetDeltas ?? {}),
                [targetIds[index]]: entry.delta,
              },
            }),
            result(false, '', energy)
          )
      }
      const classicResult = executeAction(
        input.actorId,
        mode === 'none' ? input.actorId : input.targetId,
        input.actionId,
        {
          source: 'manual',
          subjectId: input.subjectId,
          costOverride: input.costOverride,
        }
      )
      return {
        ...classicResult,
        summary: buildLohConsultationSummary(getState(), input, classicResult.summary),
      }
    }

    const contract = getRealityActionContract(input.actionId)
    if (!contract) return result(false, 'Unknown action', energy)

    const consultationAlliance =
      input.actionId === 'consult_alliance' && input.targetId
        ? findRealityAllianceForConsultation(state.social.reality, input.actorId, input.targetId)
        : null
    if (input.actionId === 'consult_alliance' && !consultationAlliance) {
      return result(false, 'You do not share an active alliance with that housemate.', energy)
    }
    if (consultationAlliance) {
      const agenda = getAllianceConsultationAgenda(state, input.actorId)
      const alreadyMet = state.social.reality.events.some(
        (event) =>
          event.type === 'ALLIANCE_STRATEGY_MEETING' &&
          event.day === state.game.week &&
          event.reason.startsWith(`strategy_meeting:${consultationAlliance.id}:${agenda}:`)
      )
      if (alreadyMet) {
        return result(
          false,
          'You already held an alliance huddle on this decision today.',
          energy,
          0,
          'Already consulted'
        )
      }
    }
    const executionTargetIds = consultationAlliance
      ? activeAllianceAdvisors(state, consultationAlliance, input.actorId)
      : targetIds
    if (consultationAlliance && executionTargetIds.length === 0) {
      return result(false, 'No active alliance member is available for a huddle.', energy)
    }
    const consultationPlan = consultationAlliance
      ? buildAllianceConsultationPlan(state, consultationAlliance, input.actorId)
      : null
    if (consultationAlliance && !consultationPlan) {
      return result(false, 'There is no useful alliance strategy question to resolve right now.', energy)
    }

    // The Reality contract stores a representative one-target price. Dynamic
    // multi-target actions (notably Group Chat) must be checked against their
    // full atomic price before the causal Reality domain is allowed to mutate.
    // Otherwise a large group action could create memories/relationship effects
    // and only discover afterward that the player could not afford it.
    const actionTargetMode = resolveActionTargetMode(action, true)
    const targetCountForCost =
      actionTargetMode === 'multi' ? executionTargetIds.length : actionTargetMode === 'none' ? 0 : 1
    const executionCosts =
      input.costOverride ?? normalizeActionCosts(action, targetCountForCost, true)
    const influence = state.social.influenceBank[input.actorId] ?? 0
    const info = state.social.infoBank[input.actorId] ?? 0
    if (
      energy < executionCosts.energy ||
      influence < executionCosts.influence ||
      info < executionCosts.info
    ) {
      return result(false, 'Insufficient resources. Nothing was spent.', energy, 0, 'Unavailable')
    }

    const direction =
      executionTargetIds.length === 0
        ? 'SELF'
        : executionTargetIds.length > 1
          ? 'GROUP'
          : 'HUMAN_TO_AI'
    let simulation = state.social.realitySimulation
    if (!simulation.rng) {
      simulation = createInitialRealitySimulationState(
        deriveRealitySimulationSeed(state.game.seed ?? 0, state.game.gameId ?? '')
      )
    }
    const context = buildContext(state)
    const orchestration = runRealityOpportunity({
      domain: state.social.reality,
      simulation,
      opportunity: {
        actorId: input.actorId,
        direction,
        context,
        actors: buildActors(state),
        candidates: [
          {
            action: contract,
            targetIds: executionTargetIds,
            subjectId: input.subjectId,
            // An active alliance huddle is a convened group meeting. Disagreement
            // belongs in each member's strategic read, not in a random refusal by
            // whichever member the player tapped to identify the alliance.
            acceptanceChanceOverride: consultationAlliance
              ? 1
              : getPhaseRepetitionChance(state, input),
          },
        ],
      },
    })
    if (!orchestration.event) {
      dispatch(replaceRealityDomain(orchestration.domain))
      dispatch(replaceRealitySimulation(orchestration.simulation))
      const reason =
        orchestration.response?.kind === 'COUNTER'
          ? 'They made a counteroffer.'
          : orchestration.selectedActionId
            ? 'They were not ready to resolve that conversation.'
            : orchestration.simulation.trace.at(-1)?.reason === 'no_eligible_candidate'
              ? 'That action is not valid in this situation.'
              : 'No action was selected.'
      return result(false, reason, energy, 0, orchestration.response?.kind ?? 'Unavailable')
    }
    const resolved = orchestration.event.outcome !== 'FAILURE'
    // Compatibility "success" is intentionally stricter than "the conversation
    // produced a Reality event". COUNTERED and PARTIAL outcomes still cost the
    // action and remain in Reality memory, but they must not receive full legacy
    // success rewards or trigger success-only downstream adapters.
    const resolvedAsSuccess = orchestration.event.outcome === 'SUCCESS'
    let allianceConsultationSummary: string | null = null
    if (resolvedAsSuccess && consultationPlan) {
      holdRealityAllianceStrategyMeeting(orchestration.domain, {
        allianceId: consultationPlan.allianceId,
        callerId: input.actorId,
        attendeeIds: consultationPlan.attendeeIds,
        targetIds: consultationPlan.targetIds,
        fallbackTargetIds: consultationPlan.fallbackTargetIds,
        planIds: consultationPlan.planIds,
        agenda: consultationPlan.agenda,
        at: { day: state.game.week, phase: state.game.phase },
        sourceEventId: orchestration.event.id,
        excusedAbsentIds: consultationPlan.excusedAbsentIds,
        memberPlanBeliefs: consultationPlan.memberPlanBeliefs,
      })
      allianceConsultationSummary = consultationPlan.summary
    }
    const dangerWarningDiscovered =
      resolved &&
      input.actionId === 'warn_about_danger' &&
      Boolean(state.game.lohId) &&
      state.game.lohId !== input.actorId &&
      isDangerWarningDiscovered(state, input)
    if (dangerWarningDiscovered && state.game.lohId) {
      applyRealityRelationshipChange(orchestration.domain, {
        sourceId: state.game.lohId,
        targetId: input.actorId,
        deltas: { trust: -7, warmth: -4, suspicion: 9, resentment: 4, familiarity: 2 },
        day: state.game.week,
        phase: state.game.phase,
        eventId: `warning-discovered:${state.game.week}:${input.actorId}:${input.targetId}`,
        anchor: 'negative',
      })
    }
    const compatibility = consultationAlliance
      ? executeAction(input.actorId, input.targetId, input.actionId, {
          source: 'manual',
          subjectId: input.subjectId,
          outcome: resolvedAsSuccess ? 'success' : 'failure',
          repetitionAlreadyResolved: true,
          costOverride: executionCosts,
        })
      : direction === 'GROUP' && actionTargetMode === 'multi'
        ? executeGroupAction(input.actorId, executionTargetIds, input.actionId, {
            source: 'manual',
            outcome: resolvedAsSuccess ? 'success' : 'failure',
            costOverride: executionCosts,
          })
        : direction === 'GROUP'
          ? executionTargetIds
              .map((targetId, index) =>
                executeAction(input.actorId, targetId, input.actionId, {
                  source: 'manual',
                  subjectId: input.subjectId,
                  outcome: resolvedAsSuccess ? 'success' : 'failure',
                  repetitionAlreadyResolved: true,
                  waiveCosts: index > 0,
                  costOverride:
                    index === 0
                      ? executionCosts
                      : { energy: 0, influence: 0, info: 0 },
                })
              )
              .reduce<ExecuteActionResult>(
                (combined, entry, index) => ({
                  success: combined.success || entry.success,
                  summary:
                    index === executionTargetIds.length - 1
                      ? `Reached ${executionTargetIds.length} housemates.`
                      : combined.summary,
                  newEnergy: entry.newEnergy,
                  delta: (combined.delta * index + entry.delta) / Math.max(1, index + 1),
                  label: orchestration.response?.kind ?? entry.label,
                  score: (combined.score * index + entry.score) / Math.max(1, index + 1),
                  targetDeltas: {
                    ...(combined.targetDeltas ?? {}),
                    [executionTargetIds[index]]: entry.delta,
                  },
                }),
                result(false, '', energy)
              )
          : executeAction(
              input.actorId,
              direction === 'SELF' ? input.actorId : input.targetId,
              input.actionId,
              {
                source: 'manual',
                subjectId: input.subjectId,
                outcome: resolvedAsSuccess ? 'success' : 'failure',
                repetitionAlreadyResolved: true,
                costOverride: executionCosts,
              }
            )
    // Legacy execution preserves specialized ceremony copy and existing game
    // adapters. Restore the causal v3 world afterward so its directed result
    // is not counted a second time by the compatibility relationship write.
    dispatch(replaceRealityDomain(orchestration.domain))
    dispatch(replaceRealitySimulation(orchestration.simulation))
    // An accepted human alliance is authoritative in both relationship models.
    // Projecting the Reality domain can otherwise leave one legacy direction
    // just below the threshold used by badges and action eligibility.
    if (resolvedAsSuccess && input.actionId === 'proposeAlliance' && targetIds.length === 1) {
      dispatch(
        updateRelationship({
          source: input.actorId,
          target: input.targetId,
          delta: 0,
          tags: [ALLIANCE_TAG],
          // The compatibility action already recorded the player-authored
          // alliance transition and its one canonical resource reward. This
          // second write only repairs the post-projection legacy affinity/tag
          // representation, so it must not pay the transition a second time.
          actionSource: 'system',
        })
      )
      dispatch(
        updateRelationship({
          source: input.targetId,
          target: input.actorId,
          delta: 0,
          tags: [ALLIANCE_TAG],
          actionSource: 'system',
        })
      )
    }
    const cupidRipplePartnerNames = resolvedAsSuccess
      ? applyCupidPartnerRipple(
          dispatch,
          state,
          input.actorId,
          executionTargetIds,
          compatibility.targetDeltas,
          compatibility.delta
        )
      : null
    const allianceProposalCountered =
      input.actionId === 'proposeAlliance' && orchestration.response?.kind === 'COUNTER'
    let baseSummary = allianceConsultationSummary ?? compatibility.summary
    if (allianceProposalCountered) {
      const targetName =
        state.game.players.find((player) => player.id === input.targetId)?.name ?? 'They'
      baseSummary = `${targetName} made a counteroffer. No alliance was formed yet.`
    } else if (input.actionId === 'warn_about_danger' && resolved) {
      const targetName =
        state.game.players.find((player) => player.id === input.targetId)?.name ?? 'They'
      baseSummary = dangerWarningDiscovered
        ? `${targetName} appreciated the warning, but the LOH found out you leaked the plan.`
        : `${targetName} appreciated the warning and kept your source private.`
    }
    const latestState = getState()
    return {
      ...compatibility,
      summary: `${buildLohConsultationSummary(latestState, input, baseSummary)}${
        cupidRipplePartnerNames
          ? ` The exchange is likely to travel through the Cupid bond to ${cupidRipplePartnerNames}.`
          : ''
      }`,
      label: orchestration.response?.kind ?? compatibility.label,
      score: orchestration.score?.total ?? compatibility.score,
    }
  }
}
