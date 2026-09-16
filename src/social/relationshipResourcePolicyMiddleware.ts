import type { Middleware } from '@reduxjs/toolkit'
import { getDepressionShockLifecycleForGame } from '../features/twists/depressionShockLifecycle'
import { hasAllianceBetween } from './socialAlliance'
import { getEffectiveSocialMode } from './socialMode'
import { setEnergyBankEntry, setInfluenceBankEntry, setInfoBankEntry } from './socialSlice'
import {
  SOCIAL_RESOURCE_CALIBRATION as CAL,
  addEarnedEnergy,
  type CalibratedSocialMode,
} from './socialResourceCalibration'
import { shimmerSocialResourceBadge } from './socialResourceShimmer'
import './socialResourceShimmer.css'

type PlayerLike = { id: string; isUser?: boolean; status?: string }
type RelationshipLike = { tags?: string[] }
type RelationshipMapLike = Record<string, Record<string, RelationshipLike>>
type ActionLogLike = {
  actorId: string
  week?: number
  phase?: string
  cost?: number
  costs?: { energy?: number }
  outcome?: 'success' | 'failure'
  score?: number
  yieldsApplied?: { influence?: number; info?: number }
}

type CalibrationState = {
  settings?: unknown
  vip?: unknown
  game?: {
    gameId?: string | null
    week?: number
    phase?: string
    players?: PlayerLike[]
    lohId?: string | null
    coLohIds?: string[] | null
    posWinnerId?: string | null
    nomineeIds?: string[]
    povSavedId?: string | null
    publicSavedNomineeId?: string | null
    voteResults?: Record<string, number> | null
    voteResultsMode?: 'house' | 'public'
    doubleEviction?: {
      weekActive?: boolean
      pendingSecondEviction?: { evicteeId: string } | null
    } | null
    voxPopuli?: {
      status?: 'inactive' | 'scheduled' | 'active' | 'complete'
      nominationVoteCounts?: Record<string, number>
      immunityWinnerId?: string | null
      autoNomineeId?: string | null
      publicVoteContext?: 'eviction' | 'final3' | null
      publicVotePercentages?: Record<string, number> | null
    } | null
    democracia?: { active?: boolean; activatedDay?: number | null } | null
    depressionShock?: { activeDay?: number }
    twinShock?: { status?: string; promptStage?: string | null } | null
    secretMission?: { discoveredEasterEggIds?: string[] } | null
  }
  social?: {
    energyBank?: Record<string, number>
    influenceBank?: Record<string, number>
    infoBank?: Record<string, number>
    relationships?: RelationshipMapLike
    actionHistory?: ActionLogLike[]
  }
}

type GenericAction = { type: string; payload?: unknown; meta?: unknown }

const NO_SHIMMER_ACTIONS = new Set(['game/resetGame', 'game/hydrateGame', 'social/hydrateSocial'])
const podiumRewardedRuns = new Set<string>()
let shimmerSuppressionDepth = 0

function modeFor(state: CalibrationState): CalibratedSocialMode {
  return getEffectiveSocialMode(
    state as Parameters<typeof getEffectiveSocialMode>[0]
  ) as CalibratedSocialMode
}

function bankValue(
  state: CalibrationState,
  playerId: string,
  kind: 'energy' | 'influence' | 'info'
): number {
  if (kind === 'energy') return state.social?.energyBank?.[playerId] ?? 0
  if (kind === 'influence') return state.social?.influenceBank?.[playerId] ?? 0
  return state.social?.infoBank?.[playerId] ?? 0
}

function humanId(state: CalibrationState): string | null {
  return state.game?.players?.find((player) => player.isUser)?.id ?? null
}

function alivePlayers(state: CalibrationState): PlayerLike[] {
  return (state.game?.players ?? []).filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
}

function setEnergy(api: Parameters<Middleware>[0], playerId: string, value: number): void {
  const state = api.getState() as CalibrationState
  const nextValue = Math.max(0, Math.round(value))
  if (bankValue(state, playerId, 'energy') === nextValue) return
  api.dispatch(setEnergyBankEntry({ playerId, value: nextValue }))
}

function setInfluence(api: Parameters<Middleware>[0], playerId: string, value: number): void {
  const state = api.getState() as CalibrationState
  const nextValue = Math.max(0, Math.round(value))
  if (bankValue(state, playerId, 'influence') === nextValue) return
  api.dispatch(setInfluenceBankEntry({ playerId, value: nextValue }))
}

function setInfo(api: Parameters<Middleware>[0], playerId: string, value: number): void {
  const state = api.getState() as CalibrationState
  const nextValue = Math.max(0, Math.round(value))
  if (bankValue(state, playerId, 'info') === nextValue) return
  api.dispatch(setInfoBankEntry({ playerId, value: nextValue }))
}

function addEnergy(
  api: Parameters<Middleware>[0],
  playerId: string,
  amount: number,
  mode = modeFor(api.getState() as CalibrationState)
): void {
  const state = api.getState() as CalibrationState
  setEnergy(api, playerId, addEarnedEnergy(bankValue(state, playerId, 'energy'), amount, mode))
}

function addInfluence(api: Parameters<Middleware>[0], playerId: string, amount: number): void {
  const state = api.getState() as CalibrationState
  setInfluence(api, playerId, bankValue(state, playerId, 'influence') + amount)
}

function addInfo(api: Parameters<Middleware>[0], playerId: string, amount: number): void {
  const state = api.getState() as CalibrationState
  setInfo(api, playerId, bankValue(state, playerId, 'info') + amount)
}

function rewriteLegacyDirectResourceDelta(action: GenericAction): GenericAction {
  if (!action.payload || typeof action.payload !== 'object') return action
  const payload = action.payload as { playerId?: unknown; delta?: unknown }
  if (typeof payload.playerId !== 'string' || typeof payload.delta !== 'number') return action

  if (action.type === 'social/applyInfoDelta' && payload.delta === 1) {
    return { ...action, payload: { ...payload, delta: CAL.incoming.credibleInfo } }
  }

  if (action.type === 'social/applyInfluenceDelta') {
    const translated =
      payload.delta === 100
        ? CAL.relationships.promiseKeptInfluence
        : payload.delta === -150
          ? CAL.relationships.promiseBrokenInfluence
          : payload.delta === 1000
            ? CAL.secretMissionInfluence
            : null
    if (translated !== null) return { ...action, payload: { ...payload, delta: translated } }
  }

  return action
}

function maybeShimmerHumanGain(before: CalibrationState, after: CalibrationState): void {
  if (shimmerSuppressionDepth > 0) return
  const playerId = humanId(after) ?? humanId(before)
  if (!playerId) return
  for (const kind of ['energy', 'influence', 'info'] as const) {
    if (bankValue(after, playerId, kind) > bankValue(before, playerId, kind)) {
      shimmerSocialResourceBadge(kind)
    }
  }
}

function restoreSkippedCompetitionEnergy(
  api: Parameters<Middleware>[0],
  before: CalibrationState
): void {
  for (const player of alivePlayers(before)) {
    setEnergy(api, player.id, bankValue(before, player.id, 'energy'))
  }
}

function calibratePhaseEnergy(
  api: Parameters<Middleware>[0],
  before: CalibrationState,
  after: CalibrationState
): void {
  const previousPhase = before.game?.phase
  const nextPhase = after.game?.phase
  if (previousPhase === nextPhase) return

  const mode = modeFor(after)
  if (nextPhase === 'social_1') {
    const allowance = CAL[mode].dailyEnergy
    for (const player of alivePlayers(after)) {
      const carried = bankValue(before, player.id, 'energy')
      setEnergy(api, player.id, addEarnedEnergy(carried, allowance, mode))
    }
  }

  if (nextPhase === 'social_2') {
    const week = after.game?.week ?? 1
    const threshold = CAL[mode].secondWindSpendThreshold
    const secondWind = CAL[mode].activeSecondWind
    for (const player of alivePlayers(after)) {
      const spent = (after.social?.actionHistory ?? [])
        .filter(
          (entry) =>
            entry.actorId === player.id && entry.week === week && entry.phase === 'social_1'
        )
        .reduce((total, entry) => total + Math.max(0, entry.costs?.energy ?? entry.cost ?? 0), 0)
      if (spent >= threshold) addEnergy(api, player.id, secondWind, mode)
    }
  }

  if (nextPhase === 'live_vote') {
    for (const nomineeId of after.game?.nomineeIds ?? []) {
      setEnergy(api, nomineeId, bankValue(before, nomineeId, 'energy'))
    }
  }
}

function rewardNewPower(
  api: Parameters<Middleware>[0],
  before: CalibrationState,
  after: CalibrationState
): void {
  const oldLoh = before.game?.lohId ?? null
  const newLoh = after.game?.lohId ?? null
  const oldPos = before.game?.posWinnerId ?? null
  const newPos = after.game?.posWinnerId ?? null
  const mode = modeFor(after)
  const democraciaResult =
    after.game?.phase === 'democracia_results' &&
    after.game?.democracia?.active === true &&
    after.game.democracia.activatedDay === after.game.week

  if (newLoh && newLoh !== oldLoh) {
    if (democraciaResult) {
      const coLohIds = after.game?.coLohIds ?? []
      const winners = coLohIds.length > 1 ? coLohIds : [newLoh]
      const reward = coLohIds.length > 1 ? CAL.democracia.coLoh : CAL.democracia.sole
      for (const winnerId of winners) {
        setEnergy(
          api,
          winnerId,
          addEarnedEnergy(bankValue(before, winnerId, 'energy'), reward.energy, mode)
        )
        setInfluence(api, winnerId, bankValue(before, winnerId, 'influence') + reward.influence)
      }
    } else {
      const vox = after.game?.voxPopuli?.status === 'active'
      const finalThree = String(after.game?.phase ?? '').startsWith('final3_')
      const influence =
        finalThree && vox
          ? CAL.competition.voxFinalImmunityInfluence
          : vox
            ? CAL.competition.voxImmunityInfluence
            : CAL.competition.lohInfluence
      setEnergy(
        api,
        newLoh,
        addEarnedEnergy(bankValue(before, newLoh, 'energy'), CAL.competition.winnerEnergy, mode)
      )
      setInfluence(api, newLoh, bankValue(before, newLoh, 'influence') + influence)
    }
  }

  if (newPos && newPos !== oldPos) {
    setEnergy(
      api,
      newPos,
      addEarnedEnergy(bankValue(before, newPos, 'energy'), CAL.competition.winnerEnergy, mode)
    )
    setInfluence(api, newPos, bankValue(before, newPos, 'influence') + CAL.competition.posInfluence)
    if (after.game?.lohId === newPos)
      addInfluence(api, newPos, CAL.competition.allPowerExtraInfluence)
  }
}

function rewardPodium(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  after: CalibrationState
): void {
  if (
    action.type !== 'game/applyMinigameWinner' ||
    !action.payload ||
    typeof action.payload !== 'object'
  ) {
    return
  }
  const payload = action.payload as { placements?: unknown; runId?: unknown; gameKey?: unknown }
  if (!Array.isArray(payload.placements)) return
  const placements = payload.placements.filter((id): id is string => typeof id === 'string')
  if (placements.length < 2) return
  const key =
    typeof payload.runId === 'string'
      ? payload.runId
      : `${after.game?.gameId ?? 'game'}:${after.game?.week ?? 0}:${String(payload.gameKey ?? 'comp')}:${placements[0]}`
  if (podiumRewardedRuns.has(key)) return
  podiumRewardedRuns.add(key)

  const mode = modeFor(after)
  if (placements[1]) addEnergy(api, placements[1], CAL.competition.secondEnergy, mode)
  if (placements[2]) addEnergy(api, placements[2], CAL.competition.thirdEnergy, mode)
}

function rewardNewNominees(
  api: Parameters<Middleware>[0],
  before: CalibrationState,
  after: CalibrationState
): void {
  const prior = new Set(before.game?.nomineeIds ?? [])
  for (const id of after.game?.nomineeIds ?? []) {
    if (!prior.has(id)) addEnergy(api, id, CAL.nomination.campaignEnergy, modeFor(after))
  }
}

function calibrateSafetyUse(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  before: CalibrationState,
  after: CalibrationState
): void {
  const beforeNominees = before.game?.nomineeIds ?? []
  const afterNominees = after.game?.nomineeIds ?? []
  if (beforeNominees.length === 0) return
  const removed = beforeNominees.filter((id) => !afterNominees.includes(id))
  if (removed.length === 0) return

  const isExplicitSave = action.type === 'game/submitPovSaveTarget'
  const isAutoSaveAdvance =
    action.type === 'game/advance' && before.game?.phase === 'pos_ceremony_results'
  if (!isExplicitSave && !isAutoSaveAdvance) return

  const holderId = before.game?.posWinnerId ?? after.game?.posWinnerId ?? null
  for (const savedId of removed) {
    setEnergy(
      api,
      savedId,
      addEarnedEnergy(
        bankValue(before, savedId, 'energy'),
        CAL.nomination.savedEnergy,
        modeFor(after)
      )
    )
    if (holderId && holderId !== savedId)
      addInfluence(api, holderId, CAL.nomination.safetyFavorInfluence)
  }
}

function calibrateRelationshipEvent(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  before: CalibrationState,
  after: CalibrationState
): void {
  if (
    action.type !== 'social/updateRelationship' ||
    !action.payload ||
    typeof action.payload !== 'object'
  ) {
    return
  }
  const payload = action.payload as {
    source?: unknown
    target?: unknown
    tags?: unknown
    actionSource?: unknown
  }
  if (typeof payload.source !== 'string' || typeof payload.target !== 'string') return
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === 'string')
    : []
  if (payload.actionSource === 'system') return

  if (tags.includes('alliance')) {
    const hadAlliance = hasAllianceBetween(
      (before.social?.relationships ?? {}) as Parameters<typeof hasAllianceBetween>[0],
      payload.source,
      payload.target
    )
    const hasAlliance = hasAllianceBetween(
      (after.social?.relationships ?? {}) as Parameters<typeof hasAllianceBetween>[0],
      payload.source,
      payload.target
    )
    if (!hadAlliance && hasAlliance) {
      setEnergy(api, payload.source, bankValue(before, payload.source, 'energy'))
      setEnergy(api, payload.target, bankValue(before, payload.target, 'energy'))
      setInfluence(
        api,
        payload.source,
        bankValue(before, payload.source, 'influence') + CAL.relationships.allianceInfluence
      )
      setInfluence(
        api,
        payload.target,
        bankValue(before, payload.target, 'influence') + CAL.relationships.allianceInfluence
      )
    }
  }

  if (tags.includes('betrayal')) {
    setEnergy(api, payload.source, bankValue(before, payload.source, 'energy'))
  }
}

function rewardPublicSave(
  api: Parameters<Middleware>[0],
  before: CalibrationState,
  after: CalibrationState
): void {
  const savedId = after.game?.publicSavedNomineeId ?? null
  if (
    savedId &&
    savedId !== (before.game?.publicSavedNomineeId ?? null) &&
    after.game?.voxPopuli?.status !== 'active'
  ) {
    addInfluence(api, savedId, CAL.publicSaveInfluence)
  }
}

function rewardVoxUnderTheRadar(
  api: Parameters<Middleware>[0],
  before: CalibrationState,
  after: CalibrationState
): void {
  if (
    before.game?.phase === after.game?.phase ||
    after.game?.phase !== 'nomination_results' ||
    after.game?.voxPopuli?.status !== 'active' ||
    (after.game?.week ?? 1) < 2
  ) {
    return
  }
  const counts = after.game.voxPopuli.nominationVoteCounts ?? {}
  const immunity = after.game.voxPopuli.immunityWinnerId ?? null
  const autoNominee = after.game.voxPopuli.autoNomineeId ?? null
  for (const player of alivePlayers(after)) {
    if (player.id === immunity || player.id === autoNominee) continue
    if ((counts[player.id] ?? 0) === 0) addInfluence(api, player.id, CAL.voxUnderTheRadarInfluence)
  }
}

function rewardEvictionSurvivors(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  before: CalibrationState,
  after: CalibrationState
): void {
  if (action.type !== 'game/finalizePendingEviction') return
  const block = before.game?.nomineeIds ?? []
  if (block.length === 0) return
  const afterAlive = new Set(alivePlayers(after).map((player) => player.id))
  const survivors = block.filter((id) => afterAlive.has(id))
  if (survivors.length === 0) return

  const vox = before.game?.voxPopuli?.status === 'active'
  const wasDouble = before.game?.doubleEviction?.weekActive === true
  const doubleFinished = wasDouble && after.game?.doubleEviction?.weekActive !== true
  if (wasDouble && !doubleFinished) return

  if (doubleFinished) {
    for (const id of survivors) {
      addEnergy(api, id, CAL.survival.doubleEnergy, modeFor(after))
      addInfluence(api, id, CAL.survival.doubleInfluence)
    }
  } else if (vox && before.game?.voxPopuli?.publicVoteContext === 'final3') {
    for (const id of survivors) addInfluence(api, id, CAL.competition.voxFinalImmunityInfluence)
  } else {
    for (const id of survivors) {
      addEnergy(api, id, CAL.survival.normalEnergy, modeFor(after))
      addInfluence(api, id, vox ? CAL.survival.voxInfluence : CAL.survival.normalInfluence)
    }
  }

  if (vox && before.game?.voxPopuli?.publicVoteContext !== 'final3') {
    const percentages =
      before.game?.voxPopuli?.publicVotePercentages ??
      (before.game?.voteResultsMode === 'public' ? before.game?.voteResults : null)
    if (percentages) {
      const scored = survivors
        .map((id) => ({ id, value: percentages[id] }))
        .filter((entry): entry is { id: string; value: number } => typeof entry.value === 'number')
      if (scored.length > 0) {
        const safest = Math.min(...scored.map((entry) => entry.value))
        for (const entry of scored) {
          if (entry.value === safest)
            addInfluence(api, entry.id, CAL.survival.voxPublicDarlingInfluence)
        }
      }
    }
  }
}

function calibrateBattleBack(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  after: CalibrationState
): void {
  if (action.type !== 'game/completeBattleBack' || typeof action.payload !== 'string') return
  const winnerId = action.payload
  const floor = CAL.battleBack[modeFor(after)]
  setEnergy(api, winnerId, Math.max(bankValue(after, winnerId, 'energy'), floor.energy))
  setInfluence(api, winnerId, Math.max(bankValue(after, winnerId, 'influence'), floor.influence))
  setInfo(api, winnerId, Math.max(bankValue(after, winnerId, 'info'), floor.info))
}

function rewardTwinShockDiscovery(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  before: CalibrationState,
  after: CalibrationState
): void {
  if (action.type !== 'game/submitTwinShockAnswer') return
  if (before.game?.twinShock?.status === 'resolved_discovered') return
  if (after.game?.twinShock?.status !== 'resolved_discovered') return
  const userId = humanId(after)
  if (!userId) return
  const reward =
    before.game?.twinShock?.promptStage === 'day5_final' ? CAL.twinShock.late : CAL.twinShock.early
  addEnergy(api, userId, reward.energy, modeFor(after))
  addInfluence(api, userId, reward.influence)
  addInfo(api, userId, reward.info)
}

function rewardEasterEgg(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  before: CalibrationState,
  after: CalibrationState
): void {
  if (
    action.type !== 'game/recordSecretMissionEasterEgg' ||
    !action.payload ||
    typeof action.payload !== 'object'
  ) {
    return
  }
  const eggId = (action.payload as { eggId?: unknown }).eggId
  if (typeof eggId !== 'string') return
  const beforeEggs = new Set(before.game?.secretMission?.discoveredEasterEggIds ?? [])
  const afterEggs = new Set(after.game?.secretMission?.discoveredEasterEggIds ?? [])
  if (beforeEggs.has(eggId) || !afterEggs.has(eggId)) return
  const userId = humanId(after)
  if (userId) addEnergy(api, userId, CAL.ambient.easterEggEnergy, modeFor(after))
}

function rewardAmbientBroadcast(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  after: CalibrationState
): void {
  if (action.type !== 'game/addTvEvent' || !action.payload || typeof action.payload !== 'object')
    return
  const meta = (action.payload as { meta?: Record<string, unknown> }).meta ?? {}
  const userId = humanId(after)
  if (!userId) return

  if (
    meta.major === 'depression_shock_chocolates' ||
    meta.broadcastTemplateId === 'depression-shock.chocolates'
  ) {
    addEnergy(api, userId, CAL.ambient.chocolateEnergy, modeFor(after))
    return
  }

  if (meta.weatherBulletin === true) {
    const gameId = after.game?.gameId
    const week = after.game?.week ?? 1
    const lifecycle = gameId ? getDepressionShockLifecycleForGame(gameId, week) : 'inactive'
    if (lifecycle === 'recovery') {
      addEnergy(api, userId, CAL.ambient.depressionRecoveryEnergy, modeFor(after))
      return
    }
    if (meta.weatherCondition === 'sunny')
      addEnergy(api, userId, CAL.ambient.sunnyEnergy, modeFor(after))
    if (meta.weatherPhenomenon === 'rainbow')
      addEnergy(api, userId, CAL.ambient.rainbowEnergy, modeFor(after))
  }
}

function distortDepressionResourceOutcome(
  api: Parameters<Middleware>[0],
  action: GenericAction,
  after: CalibrationState
): void {
  if (
    action.type !== 'social/recordSocialAction' ||
    (after.game?.depressionShock?.activeDay ?? 0) <= 0 ||
    !action.payload ||
    typeof action.payload !== 'object'
  ) {
    return
  }
  const entry = (action.payload as { entry?: ActionLogLike }).entry
  if (!entry || entry.outcome !== 'success' || (entry.score ?? 0) >= 0) return

  const influenceYield = Math.max(0, entry.yieldsApplied?.influence ?? 0)
  const infoYield = Math.max(0, entry.yieldsApplied?.info ?? 0)
  if (influenceYield > 0) {
    const current = bankValue(after, entry.actorId, 'influence')
    setInfluence(api, entry.actorId, current - influenceYield * 2)
  }
  if (infoYield > 0) {
    const current = bankValue(api.getState() as CalibrationState, entry.actorId, 'info')
    setInfo(api, entry.actorId, current - infoYield)
  }
}

export const relationshipResourcePolicyMiddleware: Middleware = (api) => (next) => (rawAction) => {
  if (typeof rawAction !== 'object' || rawAction === null || !('type' in rawAction)) {
    return next(rawAction)
  }

  const action = rewriteLegacyDirectResourceDelta(rawAction as GenericAction)
  const before = api.getState() as CalibrationState
  const suppress = NO_SHIMMER_ACTIONS.has(action.type)
  if (suppress) shimmerSuppressionDepth += 1

  try {
    const result = next(action)
    let after = api.getState() as CalibrationState

    if (action.type === 'game/skipMinigame') restoreSkippedCompetitionEnergy(api, before)

    calibratePhaseEnergy(api, before, after)
    after = api.getState() as CalibrationState
    rewardNewPower(api, before, after)
    rewardPodium(api, action, after)
    rewardNewNominees(api, before, after)
    calibrateSafetyUse(api, action, before, after)
    calibrateRelationshipEvent(api, action, before, after)
    rewardPublicSave(api, before, after)
    rewardVoxUnderTheRadar(api, before, after)
    rewardEvictionSurvivors(api, action, before, after)

    after = api.getState() as CalibrationState
    calibrateBattleBack(api, action, after)
    rewardTwinShockDiscovery(api, action, before, after)
    rewardEasterEgg(api, action, before, after)
    rewardAmbientBroadcast(api, action, after)

    after = api.getState() as CalibrationState
    distortDepressionResourceOutcome(api, action, after)

    const finalState = api.getState() as CalibrationState
    if (!suppress) maybeShimmerHumanGain(before, finalState)
    return result
  } finally {
    if (suppress) shimmerSuppressionDepth = Math.max(0, shimmerSuppressionDepth - 1)
  }
}
