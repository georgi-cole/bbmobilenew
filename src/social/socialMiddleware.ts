/**
 * socialMiddleware — Redux middleware that hooks the SocialEngine into the
 * game phase lifecycle and dispatches social resource deltas for game events.
 *
 * Listens for:
 *   - game/setPhase              (explicit phase override, e.g. from DebugPanel)
 *   - game/forcePhase            (dev-only forced transition)
 *   - game/advance               (normal gameplay phase progression)
 *   - game/completeMinigame      (LOH/POS winner from tap-race; zero-score penalty)
 *   - game/applyMinigameWinner   (LOH/POS winner from challenge flow)
 *   - game/skipMinigame          (competition skipped: -3 energy to all alive)
 *   - game/submitPovSaveTarget   (POS holder saves a nominee: +2 energy to saved player)
 *   - social/updateRelationship  (alliance formed: +2 energy +200 influence;
 *                                 betrayal: -3 energy to actor)
 *
 * Event delta rules:
 *   LOH win               → +5  energy to winner
 *   POS win               → +6  energy to winner
 *   Survived nomination   → +4  energy to remaining nominees (entering live_vote)
 *   New alliance formed   → +2  energy + influence +200 to both parties
 *   Saved by POS          → +2  energy to saved player
 *   Competition skipped   → -3  energy to all alive players
 *   Zero score (minigame) → -2  energy to the scoring player
 *   Broke alliance        → -3  energy to the actor (betrayal tag)
 */

import type { Middleware } from '@reduxjs/toolkit'
import { SocialEngine } from './SocialEngine'
import {
  snapshotWeekRelationships,
  applyEnergyDelta,
  applyInfluenceDelta,
  decaySocialMemory,
  drainEvictedPlayerSocial,
  invalidateIncomingInteractions,
  applyDramaAction,
  replaceDramaNetwork,
  recordRealityActualVote,
  recordRealityCeremony,
  setEnergyBankEntry,
  pushIncomingInteraction,
  updateRelationship,
  initializeRealitySimulation,
  applyRealityAmbientMood,
} from './socialSlice'
import {
  autoResolveExpiredIncomingInteractionsForClock,
  autoResolveExpiredIncomingInteractionsForWeek,
} from './incomingInteractions'
import {
  scheduleIncomingInteractionsForPhase,
  ELIGIBLE_PHASES,
} from './incomingInteractionAutonomy'
import type { AutonomyStore } from './incomingInteractionAutonomy'
import { deliverScheduledIncomingInteractionsForPhase } from './incomingInteractionScheduler'
import { collectInvalidIncomingInteractionIds } from './incomingInteractionValidity'
import type {
  DramaSocialNetwork,
  IncomingInteraction,
  ScheduledIncomingInteraction,
  SocialActionLogEntry,
  SocialMemoryMap,
} from './types'
import { advanceDramaNetwork, normalizeDramaSocialNetwork } from './dramaModeEngine'
import { seedWeekRelationships } from './weekSocialSeed'
import { DEFAULT_ENERGY, HUMAN_SOCIAL_ALLOWANCE } from './constants'
import { getProfileRealityAgeEligibility, resolveRealityModePreset } from '../modes/realityMode'
import { BETRAYAL_TAG, hasAllianceBetween } from './socialAlliance'
import { getEffectiveSocialMode } from './socialMode'
import { getFamilyGroupId } from './socialRuntimeConfig'
import {
  evaluateSocialCommitmentsForAction,
  voidOverdueSocialCommitments,
  type CommitmentStore,
} from './socialCommitments'
import { deriveRealitySimulationSeed, type RealitySimulationState } from './realitySimulation'
import { getRealityModeAdapter, type RealityCeremonyKind } from './reality'
import { createIncomingInteraction } from './incomingInteractionFactory'

const SOCIAL_PHASES = new Set<string>(['social_1', 'social_2'])

const PHASE_SET_ACTIONS = new Set(['game/setPhase', 'game/forcePhase'])
const VOX_SOCIAL_BEAT_PHASES = new Set([
  'loh_results',
  'social_1',
  'nomination_results',
  'pos_results',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
  'final3_comp1',
  'final3_comp2',
  'final3_comp3',
  'final3_decision',
])

interface GameState {
  gameId: string
  seed: number
  phase: string
  week: number
  mode?: 'classic' | 'survival'
  publicModeEnabled?: boolean
  lohId: string | null
  prevHohId: string | null
  posWinnerId: string | null
  povSavedId?: string | null
  nomineeIds: string[]
  awaitingPovDecision?: boolean
  awaitingPovSaveTarget?: boolean
  votes?: Record<string, string>
  pendingEviction?: { evicteeId: string; evictionMessage: string } | null
  doubleEviction?: { weekActive?: boolean }
  specialVeto?: { activeType?: string | null }
  cupidArrow?: {
    status?: 'inactive' | 'scheduled' | 'active' | 'broken'
    pairs?: Array<{ memberIds: [string, string] }>
  }
  voxPopuli?: { status?: 'inactive' | 'scheduled' | 'active' | 'complete' } | null
  dramaSocialMode?: boolean
  tvFeed?: Array<{
    text: string
    meta?: { week?: number; voxSocialBeat?: boolean; pairKey?: string; [key: string]: unknown }
  }>
  players: Array<{ id: string; name?: string; status: string; isUser?: boolean }>
}

interface StateWithGame {
  game: GameState
  settings?: {
    gameUX?: {
      dramaMode?: boolean
      dramaModeAdminOverride?: boolean
      realityModePreset?: import('../modes/realityMode').RealityModePreset
    }
  }
  profiles?: import('../store/profilesSlice').ProfilesState
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
  social?: {
    energyBank?: Record<string, number>
    relationships?: import('./types').RelationshipsMap
    incomingInteractions?: IncomingInteraction[]
    scheduledIncomingInteractions?: ScheduledIncomingInteraction[]
    dramaNetwork?: DramaSocialNetwork
    socialMemory?: SocialMemoryMap
    realitySimulation?: RealitySimulationState
    reality?: import('./reality').RealityDomainState
  }
}

type MiddlewareAPI = { dispatch: (a: unknown) => unknown; getState: () => unknown }

const REALITY_SEEDING_ACTIONS = new Set([
  'game/advance',
  'game/setPhase',
  'game/forcePhase',
  'social/recordSocialAction',
])

function ensureRealitySimulationSeed(api: MiddlewareAPI, force = false): void {
  const state = api.getState() as StateWithGame
  if (
    getEffectiveSocialMode(state) !== 'drama' ||
    !state.game ||
    (!force && state.social?.realitySimulation?.rng)
  )
    return
  api.dispatch(
    initializeRealitySimulation({
      seed: deriveRealitySimulationSeed(state.game.seed ?? 0, state.game.gameId ?? ''),
      force,
    })
  )
}

/** Advance the premium story graph once per phase and feed consequences back into gameplay. */
function runDramaPhase(api: MiddlewareAPI, phase: string): void {
  const state = api.getState() as StateWithGame
  if (getEffectiveSocialMode(state) !== 'drama' || !state.game) return
  const result = advanceDramaNetwork({
    network: normalizeDramaSocialNetwork(state.social?.dramaNetwork),
    players: (state.game.players ?? [])
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => ({
        ...player,
        name: player.name ?? player.id,
      })),
    relationships: state.social?.relationships ?? {},
    week: state.game.week ?? 1,
    phase,
    seed: (state.game as GameState & { seed?: number }).seed ?? 0,
    preset: resolveRealityModePreset(
      state.settings?.gameUX?.realityModePreset,
      getProfileRealityAgeEligibility(state.profiles)
    ),
  })
  api.dispatch(replaceDramaNetwork(result.network))
  result.relationshipEffects.forEach((effect) =>
    api.dispatch(
      updateRelationship({
        ...effect,
        actionSource: 'system',
      })
    )
  )
  if (result.publicAnnouncement) {
    api.dispatch({
      type: 'game/addTvEvent',
      payload: {
        text: result.publicAnnouncement,
        type: 'social',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: { dramaEvent: true, week: state.game.week },
      },
    })
  }
}

function maybeBroadcastVoxSocialBeat(api: MiddlewareAPI, phase: string): void {
  const state = api.getState() as StateWithGame
  if (
    state.game?.voxPopuli?.status !== 'active' ||
    !VOX_SOCIAL_BEAT_PHASES.has(phase)
  ) {
    return
  }
  const priorBeats = (state.game.tvFeed ?? []).filter(
    (event) => event.meta?.voxSocialBeat === true && event.meta?.week === state.game.week
  )
  // Vox is a social game.  Let the house breathe with several distinct,
  // consequential beats, while retaining enough headroom for the ceremony
  // announcements that must always lead the broadcast.
  if (priorBeats.length >= 4) return
  const alive = state.game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const names = Object.fromEntries(alive.map((player) => [player.id, player.name ?? player.id]))
  const relationships = state.social?.relationships ?? {}
  const pairs: Array<{
    leftId: string
    rightId: string
    affinity: number
    romantic: boolean
  }> = []
  for (let leftIndex = 0; leftIndex < alive.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < alive.length; rightIndex += 1) {
      const leftId = alive[leftIndex].id
      const rightId = alive[rightIndex].id
      const outward = relationships[leftId]?.[rightId]?.affinity ?? 0
      const inward = relationships[rightId]?.[leftId]?.affinity ?? 0
      const tags = new Set([
        ...(relationships[leftId]?.[rightId]?.tags ?? []),
        ...(relationships[rightId]?.[leftId]?.tags ?? []),
      ])
      pairs.push({
        leftId,
        rightId,
        affinity: (outward + inward) / 2,
        romantic: tags.has('romance'),
      })
    }
  }
  const recentPairKeys = new Set(
    (state.game.tvFeed ?? [])
      .filter((event) => event.meta?.voxSocialBeat === true)
      .slice(0, 4)
      .map((event) => event.meta?.pairKey)
      .filter((key): key is string => typeof key === 'string')
  )
  const strategicIds = new Set([
    ...state.game.nomineeIds,
    ...(state.game.posWinnerId ? [state.game.posWinnerId] : []),
  ])
  const rankedPairs = [...pairs]
    .map((pair) => {
      const pairKey = [pair.leftId, pair.rightId].sort().join(':')
      const strategicBonus =
        (strategicIds.has(pair.leftId) ? 18 : 0) + (strategicIds.has(pair.rightId) ? 18 : 0)
      const repeatPenalty = recentPairKeys.has(pairKey) ? 80 : 0
      return {
        ...pair,
        pairKey,
        significance:
          Math.abs(pair.affinity) + strategicBonus + (pair.romantic ? 22 : 0) - repeatPenalty,
      }
    })
    .sort((left, right) => right.significance - left.significance)
  const strongest =
    rankedPairs.find((pair) => !recentPairKeys.has(pair.pairKey)) ?? rankedPairs[0]
  const nominees = state.game.nomineeIds
    .map((id) => names[id])
    .filter((name): name is string => Boolean(name))
  let text: string | null = null

  const chooseBeat = (choices: readonly string[], salt: string): string => {
    const input = `${state.game.seed}:${state.game.week}:${phase}:${salt}`
    let hash = 2166136261
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return choices[(hash >>> 0) % choices.length]
  }

  if (strongest && Math.abs(strongest.affinity) >= 24) {
    const left = names[strongest.leftId]
    const right = names[strongest.rightId]
    const close = strongest.affinity > 0
    const positive: Record<string, readonly string[]> = {
      loh_results: [
        `${left} was the first to pull ${right} into a celebratory hug after the immunity result. The room noticed who they reached for.`,
        `${left} and ${right} disappeared into the pantry to compare notes before the congratulations had even ended.`,
        `${right} saved a seat beside ${left} after the competition, turning a small gesture into a very visible alliance signal.`,
      ],
      social_1: state.game.week === 1
        ? [
            `First impressions are taking shape: ${left} and ${right} keep finding their way back to each other, and the house has started to notice.`,
            `${left} and ${right} spent breakfast trading stories while everyone else quietly worked out whether the chemistry was personal or strategic.`,
            `${left} chose ${right} for a long walk around the yard. By lunch, three different housemates had opinions about it.`,
          ]
        : [
            `${left} and ${right} stayed behind at the kitchen island after everyone left, lowering their voices whenever footsteps approached.`,
            `${left} brought ${right} coffee in bed. A sweet gesture—or careful image management, depending on whom you ask.`,
            `${left} and ${right} spent an hour in the hammock, laughing loudly enough to make two alliances nervous.`,
            `${right} helped ${left} rehearse a difficult conversation in the dressing room. Their trust is becoming harder to hide.`,
          ],
      nomination_results: [
        `${left} stayed close to ${right} as the nomination totals landed. Visible loyalty can be both comfort and ammunition.`,
        `${left} squeezed ${right}'s hand under the table when the block was announced. The cameras caught what the room almost missed.`,
        `${left} and ${right} retreated to the bedroom after the totals, then emerged with the same talking points.`,
      ],
      pos_results: [
        `${left} and ${right} immediately compared notes after the Safety result, careful not to let the rest of the room hear.`,
        `${right} celebrated the Safety result with ${left} on the balcony while their rivals watched from the kitchen.`,
        `${left} promised ${right} they would face the next ceremony together. In this house, promises travel fast.`,
      ],
      pos_ceremony_results: [
        `${left} and ${right} shared a long embrace after the block was confirmed. The pressure is testing every promise.`,
        `${left} found ${right} alone by the pool after the ceremony and stayed until the rest of the house came looking.`,
        `${right} made ${left} a late dinner after the Safety ceremony. Nobody believed it was only about the food.`,
      ],
      social_2: [
        `${left} is helping ${right} prepare for the audience-facing part of the night. Their bond is now impossible to miss.`,
        `${left} and ${right} built a blanket fort in the lounge and refused to discuss strategy for one whole hour.`,
        `${right} gave ${left} a pep talk at the bathroom mirror. Even their rivals admitted it felt genuine.`,
      ],
      live_vote: [
        `${left} and ${right} exchanged a final look as the audience vote opened—one quiet moment in a very public night.`,
        `${left} mouthed “I've got you” to ${right} as the live vote began. Whether the audience agrees is another question.`,
        `${left} and ${right} sat shoulder to shoulder for the audience decision, ignoring the empty seats around them.`,
      ],
    }
    const strained: Record<string, readonly string[]> = {
      loh_results: [
        `${left} and ${right} kept their distance after the immunity result. The silence between them said more than congratulations could.`,
        `${right} walked away mid-congratulations when ${left} entered the room. The feud has stopped being subtle.`,
      ],
      social_1: [
        `${left} and ${right} crossed paths twice without speaking. The rest of the house is beginning to read the tension.`,
        `${left} accused ${right} of retelling a private conversation over breakfast. Half the table suddenly found somewhere else to be.`,
        `${left} moved bedrooms rather than share another night beside ${right}. Everyone heard the suitcase wheels.`,
      ],
      nomination_results: [
        `${left} and ${right} reacted very differently to the nomination totals, and neither tried to hide it.`,
        `${right} laughed at the nomination result; ${left} did not. The argument continued behind the closed bedroom door.`,
      ],
      pos_results: [
        `${left} watched ${right}'s reaction to the Safety result closely. Their rivalry is shaping the room.`,
        `${left} called ${right}'s Safety celebration “premature.” The comment reached the other side of the house in minutes.`,
      ],
      pos_ceremony_results: [
        `${left} and ${right} left the Safety ceremony on opposite sides of the room. Whatever trust existed is wearing thin.`,
        `${right} confronted ${left} beside the pool after the ceremony, drawing an audience before either noticed.`,
      ],
      social_2: [
        `${left} and ${right} are both making their case, but every conversation seems to circle back to their feud.`,
        `${left} opened a counter-campaign the moment ${right} left the lounge. The house is choosing sides.`,
      ],
      live_vote: [
        `${left} and ${right} did not acknowledge each other as the public vote opened. The audience has seen the fracture.`,
        `${right} refused ${left}'s last-minute handshake before the audience decision. The cameras stayed on both of them.`,
      ],
    }
    const romanceOptions = [
      `${left} and ${right} filled the jacuzzi with champagne, slipped in after lights-out, and left the rest of the house debating exactly how serious this has become.`,
      `${left} and ${right} shared a kiss on the terrace after midnight. By breakfast, the whole house had reconstructed the moment from whispers.`,
      `${left} and ${right} skinny-dipped after the garden lights went down. Their secret lasted roughly until someone found the abandoned microphones.`,
      `${right} surprised ${left} with a candlelit snack beside the pool. Even the biggest schemers stopped to watch.`,
      `${left} and ${right} fell asleep holding hands on the lounge sofa. The morning camera found them before the other housemates did.`,
    ] as const
    const romanceBeat = strongest.romantic && strongest.affinity >= 35 &&
      ((state.game.seed + state.game.week * 17 + phase.length) % 4 === 0)
    const phaseChoices = (close ? positive : strained)[phase]
    text = romanceBeat
      ? chooseBeat(romanceOptions, `${strongest.pairKey}:romance`)
      : phaseChoices
        ? chooseBeat(phaseChoices, strongest.pairKey)
        : null
  }

  if (!text && nominees.length > 0) {
    const nomineeBeats: Partial<Record<string, readonly string[]>> = {
      nomination_results: [
        `${nominees.join(', ')} split after the nomination totals: one went quiet in the bedroom, while another demanded answers in the kitchen.`,
        `The nominations have exposed old fault lines around ${nominees.join(', ')}. A private promise is suddenly being repeated very loudly.`,
        `${nominees.join(', ')} are on the block, and one of them has hinted there are receipts that could change how the house sees a former ally.`,
      ],
      pos_results: [
        `${nominees.join(', ')} watched the Safety winner celebrate from opposite sides of the garden. Nobody looked comfortable.`,
        `After the Safety result, one nominee demanded a private word and another started taking notes. The house knows a confrontation is coming.`,
        `${nominees.join(', ')} are trying to stay composed, but a sharp exchange in the dressing room has already divided the house into witnesses and deniers.`,
      ],
      pos_ceremony_results: [
        `${nominees.join(', ')} face the audience vote now. One is crying in the bedroom; another is promising that the full story will come out if they stay.`,
        `The confirmed block has pushed ${nominees.join(', ')} into very different moods: apology, anger, and a last attempt to make peace before the public decides.`,
        `${nominees.join(', ')} left the ceremony with cameras following every step. A slammed door in the hallway made it clear the night is far from calm.`,
      ],
      social_2: [
        `${nominees.join(', ')} are making their cases without naming names. The room is listening for every slip.`,
        `A nominee's tearful apology turned into an argument when someone challenged the timing. ${nominees.join(', ')} now have the whole house watching.`,
        `${nominees.join(', ')} have made their final appeals. The house can offer support, but only the audience will decide.`,
      ],
      live_vote: [
        `As the audience vote opens, ${nominees.join(', ')} sit apart in the lounge. One last accusation has left the room completely silent.`,
        `${nominees.join(', ')} are holding it together for the cameras, but the house has already seen the tears, the threats, and the fractures behind the final appeals.`,
      ],
    }
    const choices = nomineeBeats[phase]
    text = choices
      ? chooseBeat(choices, `nominees:${nominees.join(':')}`)
      : `The block has changed the room around ${nominees.join(', ')}. Conversations are getting quieter, closer, and much more consequential.`
  }
  if (!text) return
  const normalizedText = text.trim().toLocaleLowerCase()
  if (
    (state.game.tvFeed ?? []).some(
      (event) => event.text.trim().toLocaleLowerCase() === normalizedText
    )
  ) {
    return
  }
  api.dispatch({
    type: 'game/addTvEvent',
    payload: {
      text,
      type: 'social',
      source: 'system',
      channels: ['tv', 'mainLog'],
      meta: {
        voxSocialBeat: true,
        broadcastTemplateId: text.startsWith("A nominee's tearful apology")
          ? 'vox.social-tearful-apology'
          : text.includes('have made their final appeals')
            ? 'vox.social-final-appeals'
          : undefined,
        broadcastCampaign: 'vox_populi',
        week: state.game.week,
        phase,
        pairKey: strongest?.pairKey,
        broadcastLevel: 'minor',
      },
    },
  })
}

/** A personal save merits a personal reaction before the house moves on. */
function triggerVoxSafetyThankYou(
  api: MiddlewareAPI,
  savedId: string,
  safetyHolderId: string | null
): void {
  const state = api.getState() as StateWithGame
  if (state.game?.voxPopuli?.status !== 'active') return
  const human = state.game.players.find((player) => player.isUser)
  const saved = state.game.players.find((player) => player.id === savedId)
  if (!human || !saved || safetyHolderId !== human.id || savedId === human.id) return

  const interactionId = `vox-safety-thanks:${state.game.week}:${savedId}`
  const alreadyQueued = [
    ...(state.social?.incomingInteractions ?? []),
    ...(state.social?.scheduledIncomingInteractions ?? []).map((entry) => entry.interaction),
  ].some((entry) => entry.id === interactionId)
  if (alreadyQueued) return

  api.dispatch(
    pushIncomingInteraction(
      createIncomingInteraction({
        id: interactionId,
        fromId: savedId,
        type: 'compliment',
        text: `You took my name off the block. I will not forget that when this house gets difficult again.`,
        week: state.game.week,
        phase: state.game.phase,
        mode: 'drama',
        payload: { scenarioKey: 'post_veto_gratitude', savedById: safetyHolderId },
      })
    )
  )
}

/** Seed week-start background affinities, then snapshot relationships as baseline. */
function isDramaModeEnabled(api: MiddlewareAPI): boolean {
  return getEffectiveSocialMode(api.getState() as StateWithGame) === 'drama'
}

function handleWeekStart(api: MiddlewareAPI): void {
  const state = api.getState() as StateWithGame
  const week = state.game?.week ?? 1
  api.dispatch(decaySocialMemory())
  api.dispatch(autoResolveExpiredIncomingInteractionsForWeek(week))
  voidOverdueSocialCommitments(api as unknown as CommitmentStore)
  seedWeekRelationships(api)
  api.dispatch(snapshotWeekRelationships())
  scheduleIncomingInteractionsForPhase('week_start', api as unknown as AutonomyStore, {
    lohId: state.game?.lohId ?? null,
    prevHohId: state.game?.prevHohId ?? null,
    nomineeIds: state.game?.nomineeIds ?? [],
    posWinnerId: state.game?.posWinnerId ?? null,
    povSavedId: state.game?.povSavedId ?? null,
    votes: state.game?.votes ?? {},
    pendingEvictionId: state.game?.pendingEviction?.evicteeId ?? null,
    // eviction_results interactions fire before finalizePendingEviction commits the exit,
    // so the pending evictee is also the best available “recent eviction” context.
    recentEvicteeId: state.game?.pendingEviction?.evicteeId ?? null,
    isDoubleEviction: state.game?.doubleEviction?.weekActive === true,
    specialVeto: state.game?.specialVeto?.activeType ?? null,
  })
  deliverScheduledIncomingInteractionsForPhase('week_start', api as unknown as AutonomyStore, {
    week,
  })
}

/**
 * Schedule incoming interactions for phases that are eligible but not
 * week_start (which is handled by handleWeekStart above).
 */
function handleAutonomyPhase(api: AutonomyStore, phase: string): void {
  const state = api.getState() as StateWithGame
  scheduleIncomingInteractionsForPhase(phase, api, {
    lohId: state.game?.lohId ?? null,
    prevHohId: state.game?.prevHohId ?? null,
    nomineeIds: state.game?.nomineeIds ?? [],
    posWinnerId: state.game?.posWinnerId ?? null,
    povSavedId: state.game?.povSavedId ?? null,
    votes: state.game?.votes ?? {},
    pendingEvictionId: state.game?.pendingEviction?.evicteeId ?? null,
    // eviction_results interactions fire before finalizePendingEviction commits the exit,
    // so the pending evictee is also the best available “recent eviction” context.
    recentEvicteeId: state.game?.pendingEviction?.evicteeId ?? null,
    isDoubleEviction: state.game?.doubleEviction?.weekActive === true,
    specialVeto: state.game?.specialVeto?.activeType ?? null,
  })
  deliverScheduledIncomingInteractionsForPhase(phase, api)
}

/**
 * Dispatch an energy delta to a player, clamped so the result never goes negative.
 * Reads the current bank value from state before dispatching so negative deltas
 * cannot drive energy below zero.
 */
function grantEnergy(api: MiddlewareAPI, playerId: string, delta: number): void {
  if (delta === 0) return
  if (delta < 0) {
    const state = api.getState() as StateWithGame
    const current = state.social?.energyBank?.[playerId] ?? 0
    const clamped = Math.max(delta, -current) // delta that won't push energy below 0
    if (clamped === 0) return
    api.dispatch(applyEnergyDelta({ playerId, delta: clamped }))
  } else {
    api.dispatch(applyEnergyDelta({ playerId, delta }))
  }
}

/** Dispatch influence delta (integer pts ×100) to a player. */
function grantInfluence(api: MiddlewareAPI, playerId: string, delta: number): void {
  api.dispatch(applyInfluenceDelta({ playerId, delta }))
}

function applySafetyRelationshipConsequences(
  api: MiddlewareAPI,
  holderId: string | null,
  savedId: string | null,
  nomineesBefore: string[]
): void {
  if (!holderId || !isDramaModeEnabled(api)) return
  if (savedId && savedId !== holderId) {
    api.dispatch(
      updateRelationship({
        source: savedId,
        target: holderId,
        delta: 15,
        tags: ['protection'],
        actionSource: 'system',
      })
    )
    api.dispatch(
      updateRelationship({
        source: holderId,
        target: savedId,
        delta: 8,
        tags: ['protection'],
        actionSource: 'system',
      })
    )
  }
  const state = api.getState() as StateWithGame
  const relationships = state.social?.relationships ?? {}
  for (const nomineeId of nomineesBefore) {
    if (nomineeId === holderId || nomineeId === savedId) continue
    if (!hasAllianceBetween(relationships, holderId, nomineeId)) continue
    api.dispatch(
      updateRelationship({
        source: nomineeId,
        target: holderId,
        delta: -10,
        tags: [BETRAYAL_TAG],
        actionSource: 'system',
      })
    )
  }
}

function applyReplacementNomineeConsequences(
  api: MiddlewareAPI,
  replacementIds: readonly string[],
  lohId: string | null,
  holderId: string | null
): void {
  if (!isDramaModeEnabled(api) || replacementIds.length === 0) return
  for (const replacementId of replacementIds) {
    if (lohId) {
      recordCeremony(api, 'NOMINATIONS_LOCKED', {
        actorId: lohId,
        targetIds: [replacementId],
        reason: 'A replacement nominee was put on the block after Safety was used.',
        tags: ['replacement_nominee'],
      })
    }
    if (holderId && holderId !== replacementId && holderId !== lohId) {
      api.dispatch(
        updateRelationship({
          source: replacementId,
          target: holderId,
          delta: -4,
          tags: ['safety_fallout'],
          actionSource: 'system',
        })
      )
    }
  }
}

function twinEchoFactor(source: string, target: string, week: number): number {
  const value = `${source}|${target}|${week}`
    .split('')
    .reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 7)
  return 0.55 + (Math.abs(value) % 16) / 100
}

/** Apply LOH-win energy bonus if the LOH changed. */
function applyHohBonus(
  api: MiddlewareAPI,
  prevHohId: string | null,
  newHohId: string | null
): void {
  if (newHohId && newHohId !== prevHohId) {
    grantEnergy(api, newHohId, 5)
  }
}

/** Apply POS-win energy bonus if the POS winner changed. */
function applyPovBonus(
  api: MiddlewareAPI,
  prevPovId: string | null,
  newPovId: string | null
): void {
  if (newPovId && newPovId !== prevPovId) {
    grantEnergy(api, newPovId, 6)
  }
}

/** Grant +4 energy to all players still on the nomination block when entering live_vote. */
function applySurvivedNomBonus(api: MiddlewareAPI, newPhase: string, state: StateWithGame): void {
  if (newPhase === 'live_vote') {
    for (const id of state.game.nomineeIds) {
      grantEnergy(api, id, 4)
    }
  }
}

function syncInvalidIncomingInteractions(api: MiddlewareAPI): void {
  const state = api.getState() as StateWithGame
  if (!state.social || !state.game) return

  const interactionIds = collectInvalidIncomingInteractionIds({
    incomingInteractions: state.social.incomingInteractions ?? [],
    scheduledIncomingInteractions: state.social.scheduledIncomingInteractions ?? [],
    game: state.game,
  })
  if (interactionIds.length === 0) return

  api.dispatch(
    invalidateIncomingInteractions({
      interactionIds,
      resolvedAt: Date.now(),
      resolvedWeek: state.game.week,
    })
  )
}

function activeRealityWitnessIds(state: StateWithGame): string[] {
  return state.game.players
    .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    .map((player) => player.id)
}

function recordCeremony(
  api: MiddlewareAPI,
  kind: RealityCeremonyKind,
  input: {
    actorId?: string | null
    targetIds?: string[]
    reason?: string
    tags?: string[]
  } = {}
): void {
  const state = api.getState() as StateWithGame
  if (getEffectiveSocialMode(state) !== 'drama' || !state.social?.reality) return
  const mode = getRealityModeAdapter(state.game.mode, state.game.publicModeEnabled === true)
  api.dispatch(
    recordRealityCeremony({
      kind,
      day: state.game.week ?? 1,
      phase: state.game.phase,
      actorId: input.actorId ?? undefined,
      targetIds: input.targetIds ?? [],
      witnessIds: activeRealityWitnessIds(state),
      reason: input.reason,
      tags: input.tags,
      publicEligible: mode.publicConsequencesEnabled,
    })
  )
}

function recordActualVotes(api: MiddlewareAPI): void {
  const state = api.getState() as StateWithGame
  if (getEffectiveSocialMode(state) !== 'drama') return
  const votes = state.game.votes ?? {}
  if (!state.social?.reality || Object.keys(votes).length === 0) return
  recordCeremony(api, 'VOTES_REVEALED', {
    targetIds: [...new Set(Object.values(votes))],
    reason: 'The house vote was locked and revealed.',
  })
  const afterCeremony = api.getState() as StateWithGame
  const eventId =
    [...(afterCeremony.social?.reality?.events ?? [])]
      .reverse()
      .find(
        (event) => event.day === afterCeremony.game.week && event.type === 'CEREMONY_VOTES_REVEALED'
      )?.id ?? `vote:${afterCeremony.game.week}`
  for (const [actorId, targetId] of Object.entries(votes)) {
    api.dispatch(
      recordRealityActualVote({
        actorId,
        targetId,
        day: afterCeremony.game.week ?? 1,
        phase: afterCeremony.game.phase,
        eventId,
      })
    )
  }
}

function recordPhaseCeremony(
  api: MiddlewareAPI,
  previousPhase: string | undefined,
  nextPhase: string | undefined
): void {
  if (!nextPhase || previousPhase === nextPhase) return
  const state = api.getState() as StateWithGame
  if (getEffectiveSocialMode(state) !== 'drama') return
  if (nextPhase === 'loh_results' && state.game.lohId) {
    const voxPopuliActive = state.game.voxPopuli?.status === 'active'
    recordCeremony(api, 'POWER_WON', {
      actorId: state.game.lohId,
      reason: voxPopuliActive
        ? 'Daily immunity was won.'
        : 'Leader of the House power was won.',
      tags: [voxPopuliActive ? 'immunity' : 'loh'],
    })
  }
  if (nextPhase === 'pos_results' && state.game.posWinnerId) {
    recordCeremony(api, 'POWER_WON', {
      actorId: state.game.posWinnerId,
      reason: 'Power of Safety was won.',
      tags: ['safety'],
    })
  }
  if (nextPhase === 'nomination_results' && state.game.lohId && state.game.nomineeIds.length > 0) {
    const voxPopuliActive = state.game.voxPopuli?.status === 'active'
    recordCeremony(api, 'NOMINATIONS_LOCKED', {
      actorId: voxPopuliActive ? null : state.game.lohId,
      targetIds: state.game.nomineeIds,
      reason: voxPopuliActive
        ? 'The secret housemate ballots were counted.'
        : 'The nominations were made official.',
      tags: voxPopuliActive ? ['secret_ballot'] : undefined,
    })
  }
  if (previousPhase === 'pos_ceremony_results') {
    const savedId = state.game.povSavedId ?? null
    recordCeremony(api, savedId ? 'SAFETY_USED' : 'SAFETY_DECLINED', {
      actorId: state.game.posWinnerId,
      targetIds: savedId ? [savedId] : state.game.nomineeIds,
      reason: savedId
        ? 'The Power of Safety changed the nominations.'
        : 'The Power of Safety was not used.',
    })
  }
  if (nextPhase === 'eviction_results') recordActualVotes(api)
}

export const socialMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return next(action)
  }

  const { type } = action as { type: string }

  if (type === 'game/resetGame') {
    const result = next(action)
    ensureRealitySimulationSeed(api as unknown as MiddlewareAPI, true)
    return result
  }

  if (REALITY_SEEDING_ACTIONS.has(type)) {
    ensureRealitySimulationSeed(api as unknown as MiddlewareAPI)
  }

  if (type === 'social/recordSocialAction') {
    const result = next(action)
    const state = api.getState() as StateWithGame
    if (getEffectiveSocialMode(state) === 'drama') {
      const entry = (action as unknown as { payload: { entry: SocialActionLogEntry } }).payload
        .entry
      const actorName =
        state.game.players.find((player) => player.id === entry.actorId)?.name ?? entry.actorId
      const targetName =
        state.game.players.find((player) => player.id === entry.targetId)?.name ?? entry.targetId
      api.dispatch(
        applyDramaAction({
          actionId: entry.actionId,
          actorId: entry.actorId,
          targetId: entry.targetId,
          subjectId: entry.subjectId,
          actorName,
          targetName,
          week: entry.week ?? state.game.week ?? 1,
          phase: state.game.phase,
          success: entry.outcome === 'success',
        })
      )
      if (
        entry.source !== 'manual' &&
        entry.outcome === 'success' &&
        (entry.actionId === 'expose_secret' || entry.actionId === 'public_callout')
      ) {
        api.dispatch({
          type: 'game/addTvEvent',
          payload: {
            text:
              entry.actionId === 'expose_secret'
                ? `HOUSE EXPOSED: ${actorName} took a secret involving ${targetName} public.`
                : `HOUSE SHOCK: ${actorName} called out ${targetName} in front of everyone.`,
            type: 'social',
            source: 'system',
            channels: ['tv', 'mainLog'],
            meta: { dramaEvent: true, week: state.game.week },
          },
        })
      }
    }
    return result
  }

  // ── Explicit phase-set actions (payload carries the new phase) ──────────────
  if (PHASE_SET_ACTIONS.has(type)) {
    const prevPhase = (api.getState() as StateWithGame).game?.phase
    const nextPhase = (action as { type: string; payload: string }).payload

    if (SOCIAL_PHASES.has(prevPhase) && prevPhase !== nextPhase) {
      SocialEngine.endPhase(prevPhase)
    }

    const result = next(action)
    if (prevPhase !== nextPhase) {
      const day = (api.getState() as StateWithGame).game?.week ?? 1
      api.dispatch(autoResolveExpiredIncomingInteractionsForClock(day, nextPhase) as never)
      recordPhaseCeremony(api as unknown as MiddlewareAPI, prevPhase, nextPhase)
    }

    if (nextPhase === 'week_start' && prevPhase !== 'week_start') {
      handleWeekStart(api as unknown as MiddlewareAPI)
    }

    if (SOCIAL_PHASES.has(nextPhase) && prevPhase !== nextPhase) {
      SocialEngine.startPhase(nextPhase)
    }

    // Autonomy: schedule incoming interactions only for eligible explicit phase sets.
    if (nextPhase !== 'week_start' && prevPhase !== nextPhase && ELIGIBLE_PHASES.has(nextPhase)) {
      handleAutonomyPhase(api as unknown as AutonomyStore, nextPhase)
    }
    syncInvalidIncomingInteractions(api as unknown as MiddlewareAPI)
    if (prevPhase !== nextPhase) {
      runDramaPhase(api as unknown as MiddlewareAPI, nextPhase)
      maybeBroadcastVoxSocialBeat(api as unknown as MiddlewareAPI, nextPhase)
    }

    return result
  }

  // ── Competition skipped: -3 energy to all alive players ──────────────────
  if (type === 'game/skipMinigame') {
    const state = api.getState() as StateWithGame
    const alivePlayers = (state.game?.players ?? []).filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury'
    )
    const result = next(action)
    for (const p of alivePlayers) {
      grantEnergy(api as unknown as MiddlewareAPI, p.id, -3)
    }
    return result
  }

  // ── completeMinigame: LOH/POS bonus + zero-score penalty ─────────────────
  if (type === 'game/completeMinigame') {
    const prevState = api.getState() as StateWithGame
    const prevHohId = prevState.game?.lohId ?? null
    const prevPovId = prevState.game?.posWinnerId ?? null
    const prevPhase = prevState.game?.phase
    // Identify the human player to apply zero-score penalty if relevant.
    const humanPlayer = (prevState.game?.players ?? []).find((p) => p.isUser)
    const humanScore = (action as unknown as { payload: number }).payload

    const result = next(action)

    const afterState = api.getState() as StateWithGame
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null)
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.posWinnerId ?? null)

    // Zero-score penalty: human player scored 0 in a competition phase.
    if (humanScore === 0 && humanPlayer && (prevPhase === 'loh_comp' || prevPhase === 'pos_comp')) {
      grantEnergy(api as unknown as MiddlewareAPI, humanPlayer.id, -2)
    }

    return result
  }

  // ── applyMinigameWinner: LOH/POS bonus from challenge flow ────────────────
  if (type === 'game/applyMinigameWinner') {
    const prevState = api.getState() as StateWithGame
    const prevHohId = prevState.game?.lohId ?? null
    const prevPovId = prevState.game?.posWinnerId ?? null

    const result = next(action)

    const afterState = api.getState() as StateWithGame
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null)
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.posWinnerId ?? null)

    return result
  }

  // ── applyF3MinigameWinner: Final LOH energy bonus when Part 3 winner is crowned ─
  // Mirrors the applyMinigameWinner handler for LOH/POS comps.
  // Only the Final LOH (Part 3 winner) receives the LOH energy bonus;
  // Parts 1 and 2 are intermediate comps that don't change the lohId.
  if (type === 'game/applyF3MinigameWinner') {
    const prevState = api.getState() as StateWithGame
    const prevHohId = prevState.game?.lohId ?? null

    const result = next(action)

    const afterState = api.getState() as StateWithGame
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null)

    return result
  }

  // ── submitPovSaveTarget: saved-by-POS bonus (+2 energy to the saved player) ─
  // Handles the explicit human-POS-holder saves a nominee case.
  // The auto-save case (nominee wins POS themselves, pos_ceremony_results advance)
  // is handled by comparing nomineeIds before/after in the game/advance handler.
  if (type === 'game/submitPovSaveTarget') {
    const prevState = api.getState() as StateWithGame
    const prevNominees = prevState.game?.nomineeIds ?? []
    const saveId = (action as unknown as { payload: string }).payload

    const result = next(action)

    // Verify the save actually happened (action guard may have rejected it)
    const afterNominees = (api.getState() as StateWithGame).game?.nomineeIds ?? []
    if (!afterNominees.includes(saveId) && prevNominees.includes(saveId)) {
      grantEnergy(api as unknown as MiddlewareAPI, saveId, 2)
      applySafetyRelationshipConsequences(
        api as unknown as MiddlewareAPI,
        prevState.game?.posWinnerId ?? null,
        saveId,
        prevNominees
      )
      triggerVoxSafetyThankYou(
        api as unknown as MiddlewareAPI,
        saveId,
        prevState.game?.posWinnerId ?? null
      )
      recordCeremony(api as unknown as MiddlewareAPI, 'SAFETY_USED', {
        actorId: prevState.game?.posWinnerId ?? null,
        targetIds: [saveId],
        reason: 'The Power of Safety changed the nominations.',
      })
      const replacementIds = afterNominees.filter((id) => !prevNominees.includes(id))
      applyReplacementNomineeConsequences(
        api as unknown as MiddlewareAPI,
        replacementIds,
        prevState.game?.voxPopuli?.status === 'active'
          ? null
          : (prevState.game?.lohId ?? null),
        prevState.game?.posWinnerId ?? null
      )
    }

    evaluateSocialCommitmentsForAction(api as unknown as CommitmentStore, type, saveId)

    syncInvalidIncomingInteractions(api as unknown as MiddlewareAPI)

    return result
  }

  if (type === 'game/setReplacementNominee') {
    const prevState = api.getState() as StateWithGame
    const prevNominees = prevState.game?.nomineeIds ?? []
    const result = next(action)
    const afterState = api.getState() as StateWithGame
    const replacementIds = (afterState.game?.nomineeIds ?? []).filter(
      (id) => !prevNominees.includes(id)
    )
    applyReplacementNomineeConsequences(
      api as unknown as MiddlewareAPI,
      replacementIds,
      afterState.game?.lohId ?? null,
      afterState.game?.posWinnerId ?? null
    )
    syncInvalidIncomingInteractions(api as unknown as MiddlewareAPI)
    return result
  }

  if (type === 'game/submitPovDecision') {
    const prevState = api.getState() as StateWithGame
    const useSafety = (action as unknown as { payload: boolean }).payload
    const result = next(action)
    if (!useSafety) {
      applySafetyRelationshipConsequences(
        api as unknown as MiddlewareAPI,
        prevState.game?.posWinnerId ?? null,
        null,
        prevState.game?.nomineeIds ?? []
      )
      const afterState = api.getState() as StateWithGame
      if (!afterState.game.awaitingPovSaveTarget) {
        recordCeremony(api as unknown as MiddlewareAPI, 'SAFETY_DECLINED', {
          actorId: prevState.game?.posWinnerId ?? null,
          targetIds: prevState.game?.nomineeIds ?? [],
          reason: 'The Power of Safety was not used.',
        })
      }
    }
    evaluateSocialCommitmentsForAction(
      api as unknown as CommitmentStore,
      type,
      (action as unknown as { payload: boolean }).payload
    )
    syncInvalidIncomingInteractions(api as unknown as MiddlewareAPI)
    return result
  }

  if (type === 'game/submitHumanVote' || type === 'game/submitHumanDoubleVote') {
    const before = api.getState() as StateWithGame
    const humanId = before.game.players.find((player) => player.isUser)?.id
    const result = next(action)
    const targetId = (action as unknown as { payload: unknown }).payload
    if (humanId && typeof targetId === 'string') {
      api.dispatch(
        recordRealityActualVote({
          actorId: humanId,
          targetId,
          day: before.game.week ?? 1,
          phase: before.game.phase,
          eventId: `vote:${before.game.week}:${humanId}`,
        })
      )
    }
    evaluateSocialCommitmentsForAction(
      api as unknown as CommitmentStore,
      type,
      (action as unknown as { payload: unknown }).payload
    )
    return result
  }

  // ── Advance action (phase determined by comparing before/after state) ───────
  if (type === 'game/advance') {
    const prevState = api.getState() as StateWithGame
    api.dispatch({
      type: 'game/syncStrategicRelationships',
      payload: prevState.social?.relationships ?? {},
    })
    const prevPhase = prevState.game?.phase
    api.dispatch({
      type: 'game/setDramaSocialMode',
      payload: getEffectiveSocialMode(prevState) === 'drama',
    })
    const prevHohId = prevState.game?.lohId ?? null
    const prevPovId = prevState.game?.posWinnerId ?? null
    // Track POS-auto-save: nominee who wins POS saves themselves in pos_ceremony_results.
    const prevNominees = prevState.game?.nomineeIds ?? []

    const result = next(action)

    const afterState = api.getState() as StateWithGame
    const newPhase = afterState.game?.phase
    if (
      prevState.game.cupidArrow?.status !== 'active' &&
      afterState.game.cupidArrow?.status === 'active'
    ) {
      for (const pair of afterState.game.cupidArrow.pairs ?? []) {
        const [firstId, secondId] = pair.memberIds
        api.dispatch(
          updateRelationship({
            source: firstId,
            target: secondId,
            delta: 55,
            tags: ['cupid_partner', 'alliance', 'protection'],
            actionSource: 'system',
          })
        )
        api.dispatch(
          updateRelationship({
            source: secondId,
            target: firstId,
            delta: 55,
            tags: ['cupid_partner', 'alliance', 'protection'],
            actionSource: 'system',
          })
        )
      }
    }
    recordPhaseCeremony(api as unknown as MiddlewareAPI, prevPhase, newPhase)

    if (
      newPhase === 'nomination_results' &&
      getEffectiveSocialMode(afterState) === 'drama' &&
      afterState.game?.lohId &&
      afterState.game.voxPopuli?.status !== 'active'
    ) {
      const lohId = afterState.game.lohId
      const newNominees = afterState.game.nomineeIds.filter((id) => !prevNominees.includes(id))
      for (const nomineeId of newNominees) {
        const prior = prevState.social?.relationships?.[lohId]?.[nomineeId]
        if (!prior?.tags.some((tag) => ['alliance', 'romance', 'bromance'].includes(tag))) continue
        const lohName = afterState.game.players.find((player) => player.id === lohId)?.name ?? lohId
        const nomineeName =
          afterState.game.players.find((player) => player.id === nomineeId)?.name ?? nomineeId
        api.dispatch(
          updateRelationship({
            source: lohId,
            target: nomineeId,
            delta: -18,
            tags: ['betrayal'],
            actionSource: 'system',
          })
        )
        api.dispatch(
          updateRelationship({
            source: nomineeId,
            target: lohId,
            delta: -24,
            tags: ['betrayal'],
            actionSource: 'system',
          })
        )
        api.dispatch(
          applyDramaAction({
            actionId: 'betray',
            actorId: lohId,
            targetId: nomineeId,
            actorName: lohName,
            targetName: nomineeName,
            week: afterState.game.week,
            phase: newPhase,
            success: true,
          })
        )
        api.dispatch({
          type: 'game/addTvEvent',
          payload: {
            text: `HOUSE SHOCK: ${lohName} nominated ally ${nomineeName}. The pact has become a public betrayal.`,
            type: 'social',
            source: 'system',
            channels: ['tv', 'mainLog'],
            meta: { dramaEvent: true, week: afterState.game.week },
          },
        })
      }
    }

    // Social engine lifecycle
    if (prevPhase !== newPhase) {
      api.dispatch(
        autoResolveExpiredIncomingInteractionsForClock(
          afterState.game?.week ?? 1,
          newPhase
        ) as never
      )
      if (SOCIAL_PHASES.has(prevPhase)) {
        SocialEngine.endPhase(prevPhase)
      }

      if (newPhase === 'week_start') {
        handleWeekStart(api as unknown as MiddlewareAPI)
      }

      if (SOCIAL_PHASES.has(newPhase)) {
        SocialEngine.startPhase(newPhase)
      }

      // Autonomy: schedule incoming interactions on eligible phase transitions.
      if (newPhase !== 'week_start' && ELIGIBLE_PHASES.has(newPhase)) {
        handleAutonomyPhase(api as unknown as AutonomyStore, newPhase)
      }
      if (newPhase) {
        runDramaPhase(api as unknown as MiddlewareAPI, newPhase)
        maybeBroadcastVoxSocialBeat(api as unknown as MiddlewareAPI, newPhase)
      }
    }

    // LOH / POS win bonuses (advance() sets these during loh_results / pos_results)
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null)
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.posWinnerId ?? null)

    // Survived nomination: nominees entering live_vote get +4 energy.
    applySurvivedNomBonus(api as unknown as MiddlewareAPI, newPhase, afterState)

    // POS auto-save: during pos_ceremony_results a nominee who won POS saves themselves.
    // We detect this by checking if a nominee was removed from the block during that
    // specific phase transition only, to avoid false positives during evictions.
    if (prevPhase === 'pos_ceremony_results') {
      const afterNominees = afterState.game?.nomineeIds ?? []
      const autoSaved = prevNominees.filter((id) => !afterNominees.includes(id))
      for (const id of autoSaved) {
        grantEnergy(api as unknown as MiddlewareAPI, id, 2)
      }
      applySafetyRelationshipConsequences(
        api as unknown as MiddlewareAPI,
        prevPovId,
        autoSaved[0] ?? null,
        prevNominees
      )
    }

    syncInvalidIncomingInteractions(api as unknown as MiddlewareAPI)

    return result
  }

  // ── Alliance formed / betrayal: relationship-tag-driven deltas ───────────
  if (type === 'social/updateRelationship') {
    const payload = (
      action as unknown as {
        payload: {
          source: string
          target: string
          delta?: number
          tags?: string[]
          actionSource?: 'manual' | 'system'
          twinPropagation?: boolean
        }
      }
    ).payload
    const stateBeforeRelationshipUpdate = api.getState() as StateWithGame
    const hadAllianceBefore =
      payload.tags?.includes('alliance') === true &&
      hasAllianceBetween(
        stateBeforeRelationshipUpdate.social?.relationships ?? {},
        payload.source,
        payload.target
      )
    const result = next(action)
    const hasAllianceAfter =
      payload.tags?.includes('alliance') === true &&
      hasAllianceBetween(
        (api.getState() as StateWithGame).social?.relationships ?? {},
        payload.source,
        payload.target
      )
    if (
      isDramaModeEnabled(api as unknown as MiddlewareAPI) &&
      !payload.twinPropagation &&
      payload.delta &&
      payload.source !== payload.target
    ) {
      const state = api.getState() as StateWithGame
      const aliveIds = new Set(
        state.game.players
          .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
          .map((player) => player.id)
      )
      const familyMate = (playerId: string) => {
        const groupId = getFamilyGroupId(playerId)
        if (!groupId) return null
        return (
          state.game.players.find(
            (player) =>
              player.id !== playerId &&
              aliveIds.has(player.id) &&
              getFamilyGroupId(player.id) === groupId
          )?.id ?? null
        )
      }
      const sourceTwinId = familyMate(payload.source)
      const targetTwinId = familyMate(payload.target)
      const echoDelta = Math.round(
        payload.delta * twinEchoFactor(payload.source, payload.target, state.game.week)
      )
      if (
        echoDelta !== 0 &&
        sourceTwinId &&
        aliveIds.has(sourceTwinId) &&
        payload.target !== sourceTwinId
      ) {
        api.dispatch({
          type: 'social/updateRelationship',
          payload: {
            source: sourceTwinId,
            target: payload.target,
            delta: echoDelta,
            actionSource: 'system',
            twinPropagation: true,
          },
        })
      }
      if (
        echoDelta !== 0 &&
        targetTwinId &&
        aliveIds.has(targetTwinId) &&
        payload.source !== targetTwinId
      ) {
        api.dispatch({
          type: 'social/updateRelationship',
          payload: {
            source: payload.source,
            target: targetTwinId,
            delta: echoDelta,
            actionSource: 'system',
            twinPropagation: true,
          },
        })
      }
    }
    // Only apply game-event bonuses for manual (human) actions.
    // System/AI actions must not trigger alliance or betrayal resource grants —
    // they are the root cause of influence/energy inflation when many AI players
    // target the human player with 'ally' actions each phase.
    if (payload.tags && payload.actionSource !== 'system') {
      if (payload.tags.includes('alliance') && !hadAllianceBefore && hasAllianceAfter) {
        // Reward only the actual transition into a new alliance.
        grantEnergy(api as unknown as MiddlewareAPI, payload.source, 2)
        grantEnergy(api as unknown as MiddlewareAPI, payload.target, 2)
        grantInfluence(api as unknown as MiddlewareAPI, payload.source, 200)
        grantInfluence(api as unknown as MiddlewareAPI, payload.target, 200)
      } else if (payload.tags.includes('betrayal')) {
        // Broke alliance: actor loses 3 energy.
        grantEnergy(api as unknown as MiddlewareAPI, payload.source, -3)
      }
    }
    return result
  }

  // ── Eviction: drain social resources for the evicted user player ─────────
  // Handles both normal evictions (finalizePendingEviction) and self-evictions.
  if (type === 'game/finalizePendingEviction' || type === 'game/selfEvict') {
    const prevState = api.getState() as StateWithGame
    const evicteeId = (action as unknown as { payload: string }).payload
    const evictee = (prevState.game?.players ?? []).find((p) => p.id === evicteeId)
    const week = prevState.game?.week
    const bondedSurvivors = (prevState.game?.players ?? [])
      .filter(
        (player) =>
          player.id !== evicteeId && player.status !== 'evicted' && player.status !== 'jury'
      )
      .map((player) => {
        const outward = prevState.social?.relationships?.[player.id]?.[evicteeId]
        const inward = prevState.social?.relationships?.[evicteeId]?.[player.id]
        const tags = new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])])
        const bondTag = ['romance', 'bromance', 'alliance'].find((tag) => tags.has(tag))
        return {
          player,
          bondTag,
          affinity: Math.max(outward?.affinity ?? -100, inward?.affinity ?? -100),
        }
      })
      .filter((entry) => Boolean(entry.bondTag) || entry.affinity >= 45)
      .sort((left, right) => right.affinity - left.affinity)

    const result = next(action)
    recordCeremony(api as unknown as MiddlewareAPI, 'EVICTION', {
      targetIds: [evicteeId],
      reason:
        type === 'game/selfEvict'
          ? 'A contestant left the game.'
          : prevState.game?.voxPopuli?.status === 'active'
            ? 'The audience vote resulted in an elimination.'
            : 'The house vote resulted in an eviction.',
      tags:
        type === 'game/selfEvict'
          ? ['self_eviction']
          : prevState.game?.voxPopuli?.status === 'active'
            ? ['public_vote']
            : [],
    })

    // Only drain for the human/user player — AI players manage their own state.
    if (evictee?.isUser) {
      api.dispatch(drainEvictedPlayerSocial({ playerId: evicteeId, week }))
    }

    if (prevState.game?.voxPopuli?.status === 'active' && evictee && bondedSurvivors[0]) {
      const affected = bondedSurvivors[0]
      api.dispatch(
        applyRealityAmbientMood({
          actorId: affected.player.id,
          valenceDelta: -18,
          arousalDelta: -7,
          stressDelta: 14,
          socialEnergyDelta: -12,
        })
      )
      const exposureSeed = `${evicteeId}:${affected.player.id}:${week ?? 0}`
        .split('')
        .reduce((total, character) => Math.imul(total ^ character.charCodeAt(0), 16777619), 2166136261)
      if (affected.bondTag && (exposureSeed >>> 0) % 100 < 34) {
        api.dispatch({
          type: 'game/addTvEvent',
          payload: {
            text: `${affected.player.name}'s reaction to ${evictee.name}'s exit is impossible to hide. Housemates are starting to wonder just how close they really were.`,
            type: 'social',
            source: 'system',
            channels: ['tv', 'mainLog'],
            meta: { dramaEvent: true, week, relationshipExposure: true },
          },
        })
      }
    }

    syncInvalidIncomingInteractions(api as unknown as MiddlewareAPI)

    return result
  }

  if (
    type === 'game/finalizeNominations' ||
    type === 'game/commitNominees' ||
    type === 'game/setReplacementNominee' ||
    type === 'game/hydrateGame' ||
    type === 'social/hydrateSocial'
  ) {
    const result = next(action)
    if (type === 'social/hydrateSocial') {
      ensureRealitySimulationSeed(api as unknown as MiddlewareAPI)
    }
    if (type === 'game/finalizeNominations' || type === 'game/commitNominees') {
      const state = api.getState() as StateWithGame
      if (state.game.voxPopuli?.status !== 'active') {
        evaluateSocialCommitmentsForAction(api as unknown as CommitmentStore, type)
      }
      if (state.game.lohId && state.game.nomineeIds.length > 0) {
        const voxPopuliActive = state.game.voxPopuli?.status === 'active'
        recordCeremony(api as unknown as MiddlewareAPI, 'NOMINATIONS_LOCKED', {
          actorId: voxPopuliActive ? null : state.game.lohId,
          targetIds: state.game.nomineeIds,
          reason: voxPopuliActive
            ? 'The secret housemate ballots were counted.'
            : 'The nominations were made official.',
          tags: voxPopuliActive ? ['secret_ballot'] : undefined,
        })
      }
    }
    syncInvalidIncomingInteractions(api as unknown as MiddlewareAPI)
    return result
  }

  // ── Battle Back win: restore energy for the user player who returns ─────
  // When the user wins the Battle Back, they re-enter the house as an active
  // player. Energy is restored to one full human allowance using a direct set
  // so their return is playable regardless of any stale eliminated-state bank.
  // of any residual energy the player may carry.
  if (type === 'game/completeBattleBack') {
    const prevState = api.getState() as StateWithGame
    const winnerId = (action as unknown as { payload: string }).payload
    const winner = (prevState.game?.players ?? []).find((p) => p.id === winnerId)

    const result = next(action)

    if (winner?.isUser) {
      const restoredEnergy =
        getEffectiveSocialMode(prevState) === 'drama' ? HUMAN_SOCIAL_ALLOWANCE : DEFAULT_ENERGY
      api.dispatch(setEnergyBankEntry({ playerId: winnerId, value: restoredEnergy }))
    }

    return result
  }

  return next(action)
}
