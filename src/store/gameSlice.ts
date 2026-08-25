import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState, AppDispatch } from './store'
import type {
  DemocraciaResultDisplay,
  DayStartShockState,
  GameState,
  Player,
  Phase,
  TvEvent,
  MinigameResult,
  MinigameSession,
  CompleteMinigamePayload,
  BattleBackState,
  SpectatorActiveState,
  SeasonFinaleState,
  SpecialVetoType,
  ForcedShockType,
  BroadcastOverride,
  BroadcastCampaign,
  BroadcastLevel,
  CustomBroadcastMessage,
} from '../types'
import type { IncomingInteraction, SocialActionLogEntry } from '../social/types'
import { mulberry32, seededPick, seededPickN } from './rng'
import {
  getCompetitionSeasonState,
  getDefaultCompetitionProfile,
  getDefaultCompetitionSeasonState,
  getMinigameAiModel,
  simulateMinigameAiScore,
  updateCompetitionSeasonStateByPlayerId,
  type CompetitionSeasonUpdateInput,
} from '../ai/competition'
import { isHybridScoredGame, resolveHybridAiScores } from '../ai/competition/hybridScoreResolver'
import { simulateSnakeAiScore } from '../ai/competition/snakeAiSimulator'
import { rankPressurePlankResults } from '../components/PressurePlank/pressurePlankLogic'
import HOUSEGUESTS from '../data/houseguests'
import { loadActiveProfile, archiveKeyForActiveProfile, loadProfilesState } from './profilesSlice'
import { loadSettings } from './settingsSlice'
import { getConfiguredCastSize, DEFAULT_ROSTER_SIZE } from './settingsHelpers'
import { hasCachedStoreAccess } from '../vip/vipStorage'
import { canAccessSpecialSettings } from '../utils/debugMode'
import { pickPhrase, NOMINEE_PLEA_TEMPLATES } from '../utils/juryUtils'
import { profilePhotoAvatar, resolveAvatar } from '../utils/avatar'
import type { SeasonArchive } from './seasonArchive'
import { loadSeasonArchives } from './archivePersistence'
import { resolveSkinAssetPathWithFallback } from '../utils/skinAssets'
import { resolvePublicSaveNominee } from '../publicOpinion/PublicSaveService'
import { resolvePublicModeRuntimeEnabled } from '../publicOpinion/publicModeAccess'
import {
  addDirection,
  resetDailyFeedBudget,
  updateApproval,
} from '../publicOpinion/publicOpinionSlice'
import {
  decaySocialMemory,
  pushIncomingInteraction,
  recordSocialAction,
  snapshotWeekRelationships,
  updateRelationship,
  updateSocialMemory,
} from '../social/socialSlice'
import {
  createSecretMissionState,
  buildMissionTasks,
  checkSecretMissionTrigger,
  createMissionReward,
  createImmunityReward,
  MISSION_TEMPLATES,
  canUseDoubleVote,
  canOfferMissionImmunity,
  canUseVoteDeduction,
  isSecretMissionSuccessful,
  getMissionTaskSetSignature,
  pickMissionImmunityDuration,
  type MissionTask,
  type LegacyMissionRewardType,
} from '../bb/secretMission'
import {
  buildDoubleEvictionTieResolutionMessage,
  calculateRequiredDoubleEvictionSlots,
} from '../features/twists/doubleEvictionTieUtils'
import { buildDayStartShockSelection } from '../features/twists/dayStartShock'
import {
  areDistinctCupidPairs,
  createCupidArrowPairs,
  CUPID_ARROW_BREAK_AFTER_PAIRS,
  expandCupidIds,
  getCupidPair,
  getCupidPartnerId,
  isCupidArrowActive,
  isCupidArrowTwistLocked,
  isSameCupidPair,
  shouldScheduleCupidArrowSeason,
} from '../features/twists/cupidArrow'
import {
  createInitialTwinShockState,
  resolveTwinShockTurn,
  TWIN_SHOCK_ALI_ID,
  TWIN_SHOCK_LIA_ID,
  type TwinShockTurnResult,
} from '../bb/twinShock'
import { LIVE_VOTE_PITCHES_EVENT_KEY, LIVE_VOTE_PITCHES_TEXT } from '../constants/tvEvents'
import {
  createInitialVoxPopuliState,
  isVoxPopuliActive,
  isVoxPopuliTwistLocked,
  resolveVoxAudienceEviction,
  resolveVoxAudiencePreview,
  reconcileVoxAudienceResultWithPreview,
  resolveVoxNominations,
  resolveVoxReplacementNominees,
  shouldScheduleVoxPopuliSeason,
} from '../features/twists/voxPopuli'
import {
  getDefaultBroadcastOrder,
  getBroadcastTemplate,
  getPhaseCardTemplate,
  matchBroadcastTemplate,
  renderBroadcastTemplate,
} from '../broadcasting/broadcastTemplateCatalog'
import { loadBroadcastConfig } from '../broadcasting/broadcastConfigPersistence'

// ─── Canonical phase order ────────────────────────────────────────────────────
const PHASE_ORDER: Phase[] = [
  'week_start',
  'loh_comp_announcement',
  'loh_comp',
  'loh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pre_veto_public_save',
  'pos_comp_announcement',
  'pos_comp',
  'pos_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
]

const IMMUNITY_REPLACEMENT_SEED_MODIFIER = 0x51c4f1d3
const DAY_START_SHOCK_MIN_WEEK = 3
const DAY_START_SHOCK_RNG_SALT = 0x7c2f5d19
const AI_LOH_REVENGE_THREAT_WEIGHT = 6
const AI_LOH_BASE_THREAT_WEIGHT = 2
const AI_LOH_WIN_THREAT_WEIGHT = 4
const AI_POS_WIN_THREAT_WEIGHT = 3
const AI_NEVER_NOMINATED_THREAT_WEIGHT = 1
const AI_CURRENT_LOH_POWER_THREAT_WEIGHT = 2
const EARLY_HUMAN_GRACE_BY_WEEK = [0, 16, 12, 6] as const

function getPhaseOrderIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase)
}

function getForcedShockActivationWeek(
  state: Pick<
    GameState,
    'phase' | 'week' | 'twistActivatedThisWeek' | 'doubleEviction' | 'specialVeto' | 'democracia'
  >,
  safePhase: Phase
): number {
  const currentIndex = getPhaseOrderIndex(state.phase)
  const safeIndex = getPhaseOrderIndex(safePhase)
  const phaseWindowPassed = currentIndex === -1 || safeIndex === -1 || currentIndex > safeIndex
  const currentWeekBlocked =
    state.twistActivatedThisWeek === true ||
    state.doubleEviction?.weekActive === true ||
    state.specialVeto?.activeType != null ||
    state.democracia?.active === true
  const earliestWeek = phaseWindowPassed || currentWeekBlocked ? state.week + 1 : state.week
  return safePhase === 'week_start'
    ? Math.max(DAY_START_SHOCK_MIN_WEEK, earliestWeek)
    : earliestWeek
}

function formatForcedShockLabel(type: ForcedShockType): string {
  switch (type) {
    case 'doubleEviction':
      return 'Double Elimination'
    case 'battleBack':
      return 'Back 2 the Game'
    case 'vip':
      return 'Double Trouble'
    case 'diamond':
      return 'Halo Exchange'
    case 'coup':
      return 'Detox'
    case 'spotlight':
      return 'Force Majeure'
    case 'democracia':
      return 'Democracia'
    case 'dayStartShock':
      return 'Morning Shock'
    case 'twinShock':
      return 'Twin Shock'
    default:
      return type
  }
}

function isSpecialVetoType(type: ForcedShockType): type is SpecialVetoType {
  return type === 'vip' || type === 'diamond' || type === 'coup' || type === 'spotlight'
}

function formatDemocraciaResultNames(state: GameState, candidateIds: string[]): string {
  return candidateIds
    .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
    .join(candidateIds.length === 2 ? ' and ' : ', ')
}

function buildDemocraciaResultDisplay(
  mode: DemocraciaResultDisplay['mode'],
  participantIds: string[],
  voteCountsByCandidateId: Record<string, number>,
  title: string,
  subtitle: string
): DemocraciaResultDisplay {
  return {
    mode,
    participantIds,
    voteCountsByCandidateId,
    title,
    subtitle,
  }
}

function getForcedShockSafePhase(type: ForcedShockType): Phase {
  switch (type) {
    case 'doubleEviction':
      return 'nominations'
    case 'battleBack':
      return 'eviction_results'
    case 'twinShock':
      return 'eviction_results'
    case 'democracia':
      return 'loh_comp_announcement'
    case 'dayStartShock':
      return 'week_start'
    default:
      return 'pos_results'
  }
}

// ─── Houseguest pool ─────────────────────────────────────────────────────────
// All 22 houseguests in src/data/houseguests.ts have matching avatar images in
// public/avatars/. This pool is the source for AI opponents each game.
const HOUSEGUEST_POOL = HOUSEGUESTS.map((hg) => ({
  id: hg.id,
  name: hg.name,
  avatar: hg.sex === 'Female' ? '👩' : '🧑',
  sex: hg.sex,
}))

type SecretMissionTaskBuildResult = {
  templateId: string
  tasks: MissionTask[]
}

const TWIN_SHOCK_RESERVED_IDS = new Set([TWIN_SHOCK_LIA_ID, TWIN_SHOCK_ALI_ID, 'lia_ali'])
const TWIN_SHOCK_LIA_AVATAR = 'assets/skins/Lia_avatar.webp'
const TWIN_SHOCK_ALI_AVATAR = 'assets/skins/Ali_avatar.webp'
const TWIN_SHOCK_LIA_FLIP_AVATAR = resolveSkinAssetPathWithFallback(
  'Lia_flip_avatar.webp',
  'Lia_avatar.webp'
)
const TWIN_SHOCK_COMBINED_AVATAR = resolveSkinAssetPathWithFallback(
  'Ali_lia_avatar.webp',
  'Ali_avatar.webp'
)
const TWIN_SHOCK_LIA_POOL_ENTRY = {
  id: TWIN_SHOCK_LIA_ID,
  name: 'Lia',
  avatar: TWIN_SHOCK_LIA_AVATAR,
}

function buildSecretMissionTargetCandidates(state: GameState): string[] {
  const humanId = state.players.find((player) => player.isUser)?.id
  return state.players
    .filter(
      (player) => player.id !== humanId && player.status !== 'evicted' && player.status !== 'jury'
    )
    .map((player) => player.id)
}

function buildSecretMissionTasksForTemplate(
  state: GameState,
  templateId: string,
  triggeredDay: number
): SecretMissionTaskBuildResult {
  const template = MISSION_TEMPLATES.find((t) => t.id === templateId) ?? MISSION_TEMPLATES[0]
  return {
    templateId: template.id,
    tasks: buildMissionTasks(template, triggeredDay, {
      targetCandidateIds: buildSecretMissionTargetCandidates(state),
      missionNumber: state.secretMission?.missionNumber,
      excludedTaskSetSignatures: state.secretMissionTaskSetHistory ?? [],
    }),
  }
}

const GAME_ROSTER_SIZE = DEFAULT_ROSTER_SIZE

/**
 * Build the human player from the stored profile.
 * Falls back to name='You' and the You.png silhouette when no profile exists.
 * The avatar resolver finds avatars/You.png via the name-based candidate
 * capitalize('You') = 'You' → avatars/You.png.
 */
function buildUserPlayer(): Player {
  const profile = loadActiveProfile()
  return {
    id: 'user',
    name: profile.name,
    avatar: profile.photoId ? profilePhotoAvatar(profile.photoId) : profile.avatar,
    status: 'active',
    isUser: true,
  }
}

function getE2ENewSeasonFixture(): Window['__bbE2ENewSeason'] {
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.__E2E__ === true) {
    return window.__bbE2ENewSeason
  }
  return undefined
}

/**
 * Pick (rosterSize - 1) houseguests at random from the full pool.
 * Uses Math.random() to seed the pick so each new game has a fresh roster.
 * rosterSize is read from persisted settings (gameUX.castSize) with a
 * fallback to the GAME_ROSTER_SIZE constant.
 */
function pickHouseguests(rosterSize = GAME_ROSTER_SIZE, twinShockConsumed = false): Player[] {
  const seed = getE2ENewSeasonFixture()?.rosterSeed ?? Math.floor(Math.random() * 0x100000000) >>> 0
  const rng = mulberry32(seed)
  const lia = {
    ...(HOUSEGUEST_POOL.find((houseguest) => houseguest.id === TWIN_SHOCK_LIA_ID) ??
      TWIN_SHOCK_LIA_POOL_ENTRY),
    avatar: TWIN_SHOCK_LIA_AVATAR,
  }
  const eligiblePool = HOUSEGUEST_POOL.filter((houseguest) =>
    twinShockConsumed
      ? !TWIN_SHOCK_RESERVED_IDS.has(houseguest.id)
      : houseguest.id !== TWIN_SHOCK_LIA_ID && houseguest.id !== TWIN_SHOCK_ALI_ID
  )
  const pickCount = twinShockConsumed ? rosterSize - 1 : Math.max(0, rosterSize - 2)
  const picked = seededPickN(rng, eligiblePool, pickCount)
  const roster = !twinShockConsumed && lia ? [lia, ...picked] : picked
  return roster.map((hg) => ({
    ...hg,
    status: 'active' as const,
  }))
}

function buildInitialPlayers(twinShockConsumed = false): Player[] {
  const rosterSize = getConfiguredCastSize()
  return [buildUserPlayer(), ...pickHouseguests(rosterSize, twinShockConsumed)]
}

function buildInitialCompetitionSeasonState(
  players: Player[]
): Record<string, ReturnType<typeof getDefaultCompetitionSeasonState>> {
  return Object.fromEntries(
    players.map((player) => [player.id, getDefaultCompetitionSeasonState()])
  )
}

export const FINALE_INTERVIEW_VARIANT_COUNT = 3

/**
 * Derive the next season number from an array of season archives.
 * Uses the maximum archived `seasonIndex` rather than array length so the
 * result remains correct after the 50-entry archive cap truncates history
 * or if entries are ever non-contiguous / out of order.
 *
 * Returns 1 when no archives exist yet.
 */
function nextSeasonNumber(archives: SeasonArchive[]): number {
  if (archives.length === 0) return 1
  const maxIndex = archives.reduce((max, a) => Math.max(max, a.seasonIndex ?? 0), 0)
  return maxIndex + 1
}

/**
 * Build a fresh initial game state from the current settings and profile.
 * Called both at store initialization and on every manual game reset, so that
 * each new season always uses the latest persisted configuration rather than
 * stale module-scope values.
 */
export function createInitialGameState(options?: {
  twinShockConsumed?: boolean
  seed?: number
}): GameState {
  const twinShockConsumed = options?.twinShockConsumed === true
  const seed = options?.seed ?? 42
  const freshPlayers = buildInitialPlayers(twinShockConsumed)
  const freshSettings = loadSettings()
  const broadcastConfig = loadBroadcastConfig()
  // Guest mode never persists archives — treat as an empty history so guest
  // sessions always start at Season 1 regardless of any logged-in user data.
  const isGuest = loadProfilesState().isGuest
  const seasonArchives: SeasonArchive[] = isGuest
    ? []
    : (loadSeasonArchives(archiveKeyForActiveProfile()) ?? [])
  const season = nextSeasonNumber(seasonArchives)
  const expansionDebugAccess = import.meta.env.DEV || canAccessSpecialSettings()
  const forceClassicLocal = import.meta.env.DEV && import.meta.env.VITE_FORCE_CLASSIC === 'true'
  const cupidScheduleOptions = {
    season,
    seasonArchives,
    seed,
    seasonOverride: freshSettings.sim.cupidArrowSeasonOverride,
  }
  // Cupid may organically enter a Classic season only for an owner. An explicit
  // debug season override remains available for testing, but DEV alone is not ownership.
  const cupidArrowIsScheduled =
    !forceClassicLocal &&
    ((hasCachedStoreAccess('cupidArrow') && shouldScheduleCupidArrowSeason(cupidScheduleOptions)) ||
      (expansionDebugAccess &&
        freshSettings.sim.cupidArrowSeasonOverride === season &&
        shouldScheduleCupidArrowSeason(cupidScheduleOptions)))
  // Vox Populi is a separately launched expansion. It never enters Classic just
  // because the product is owned; only the explicit debug override can pre-schedule it.
  const voxPopuliIsScheduled =
    !forceClassicLocal &&
    expansionDebugAccess &&
    freshSettings.sim.voxPopuliSeasonOverride === season &&
    shouldScheduleVoxPopuliSeason({
      season,
      seasonArchives,
      seed,
      seasonOverride: freshSettings.sim.voxPopuliSeasonOverride,
      cupidScheduled: cupidArrowIsScheduled,
    })
  const initialVoxPopuli = createInitialVoxPopuliState(voxPopuliIsScheduled ? season : null)
  if (voxPopuliIsScheduled) {
    initialVoxPopuli.status = 'active'
    initialVoxPopuli.activatedSeason = season
    initialVoxPopuli.activatedWeek = 1
  }
  const publicModeEnabled = resolvePublicModeRuntimeEnabled(freshSettings.sim.publicMode === true, {
    hasStoreAccess: hasCachedStoreAccess('publicMode'),
    adminOverride: freshSettings.sim.publicModeAdminOverride === true,
    isDev: import.meta.env.DEV,
    hasSpecialAccess: canAccessSpecialSettings(),
  })
  const initialBroadcastCampaign: BroadcastCampaign = cupidArrowIsScheduled
    ? 'cupid'
    : voxPopuliIsScheduled
      ? 'vox_populi'
      : 'classic'

  // Season-opening broadcasts are built from the same persistent registry as
  // every later phase. This makes edits, disabling, and mixed built-in/custom
  // ordering effective before the first Play press as well.
  const seasonStartBuiltIns = [
    { id: 'season.welcome', variables: [String(season)], include: true },
    { id: 'season.public-mode-rule', variables: [publicModeEnabled ? 'ON' : 'OFF'], include: true },
    { id: 'season.vox-populi-intro', variables: [], include: voxPopuliIsScheduled },
  ].flatMap(({ id, variables, include }) => {
    const template = getBroadcastTemplate(id)
    if (!include || !template) return []
    const override = broadcastConfig.overrides[id]
    if (override?.disabled) return []
    const level = override?.level ?? template.level
    const forceOnTv = override?.forceOnTv ?? template.forceOnTv ?? false
    const defaultMajor = template.major
    const selectedMajor = override?.major === null ? undefined : (override?.major ?? defaultMajor)
    const major =
      level === 'critical'
        ? (selectedMajor ?? 'custom_critical')
        : level === 'major'
          ? (selectedMajor ?? 'custom_major')
          : undefined
    return [
      {
        id,
        order: override?.order ?? getDefaultBroadcastOrder(template),
        text: renderBroadcastTemplate(override?.text ?? template.text, variables),
        type: override?.type ?? template.type,
        level,
        major,
        forceOnTv,
        title: override?.title,
        customId: undefined as string | undefined,
        templateId: id,
        variables,
      },
    ]
  })
  const seasonStartCustom = broadcastConfig.customMessages
    .filter(
      (message) =>
        message.enabled &&
        message.phase === 'season_start' &&
        (!message.campaign || message.campaign === initialBroadcastCampaign) &&
        message.text.trim()
    )
    .map((message) => ({
      id: message.id,
      order: message.order ?? 10000,
      text: message.text,
      type: message.type,
      level: message.level,
      major:
        message.level === 'critical'
          ? (message.major ?? 'custom_critical')
          : message.level === 'major'
            ? (message.major ?? 'custom_major')
            : undefined,
      forceOnTv: message.forceOnTv !== false,
      title: message.title,
      customId: message.id,
      templateId: message.key ?? message.id,
      variables: [] as string[],
    }))
  const seasonStartTime = Date.now()
  const seasonStartItems = [...seasonStartBuiltIns, ...seasonStartCustom].sort(
    (left, right) => left.order - right.order
  )
  const initialTvFeed: TvEvent[] = seasonStartItems.map((item, index) => ({
    id: `season-start-${item.id}-${index}`,
    text: item.text,
    type: item.type,
    timestamp: seasonStartTime + index,
    ...(item.major ? { major: item.major } : {}),
    meta: {
      phase: 'season_start',
      week: 1,
      broadcastTemplateId: item.templateId,
      broadcastOrder: item.order,
      broadcastLevel: item.level,
      broadcastManaged: true,
      broadcastVariables: item.variables,
      ...(item.customId ? { customBroadcastId: item.customId } : {}),
      ...(item.major ? { major: item.major } : {}),
      ...(item.level === 'critical' ? { broadcastPriority: 'critical' } : {}),
      ...(item.forceOnTv ? { forceOnTv: true } : {}),
      ...(item.level !== 'minor' ? { announcementSubtitle: item.text } : {}),
      ...(item.level !== 'minor' && item.title ? { announcementTitle: item.title } : {}),
    },
  }))
  const initialBroadcastQueue = initialTvFeed
    .filter((event) => event.meta?.forceOnTv === true)
    .map((event) => event.id)
  return {
    gameId: crypto.randomUUID(),
    expansionMode: null,
    season,
    week: 1,
    phase: 'season_start',
    seed,
    lohId: null,
    lohSocialPlan: null,
    currentWeekNominationRecord: null,
    lastWeekNominationRecord: null,
    lohSafetyAdvice: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled,
    posWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    povProtectedIds: [],
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    lastHohCompFinisherId: null,
    lastHohCompFinisherType: null,
    publicSavedNomineeId: null,
    nominationContext: null,
    awaitingPublicSave: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingMissionImmunityOffer: false,
    secretMissionCount: 0,
    secretMissionTaskSetHistory: [],
    secretMissionSecondChanceResolved: false,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    aiReplacementStep: 0,
    aiReplacementWaiting: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    voteResultsMode: 'house',
    evictionSplashId: null,
    pendingEviction: null,
    players: freshPlayers,
    competitionSeasonStateByPlayerId: buildInitialCompetitionSeasonState(freshPlayers),
    tvFeed: initialTvFeed,
    broadcastQueue: initialBroadcastQueue,
    lastPlainBroadcastEventId: null,
    broadcastOverrides: broadcastConfig.overrides,
    customBroadcasts: broadcastConfig.customMessages,
    isLive: false,
    hasSeenConfessionalSpotlight: false,
    seasonArchives,
    spectatorActive: null,
    seasonFinale: null,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    twistActivatedThisWeek: false,
    specialVeto: {
      seasonUsed: false,
      activeType: null,
      activatedWeek: null,
      vipUseStage: 0,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    },
    pendingForcedShock: null,
    dayStartShock: null,
    dayStartShockUsedThisSeason: false,
    tribunalPhaseAnnounced: false,
    twinShock: createInitialTwinShockState(),
    twinShockConsumed,
    twinShockActivatedSeason: null,
    twinShockResolution: null,
    twinShockResolvedDay: null,
    twinShockDiscoveredByUser: false,
    liaForcedUntilTwinShockResolved: !twinShockConsumed,
    democracia: {
      usedThisSeason: false,
      active: false,
      activatedDay: null,
      round: 0,
      candidateIds: [],
      eligibleVoterIds: [],
      votesByVoterId: {},
      awaitingHumanVote: false,
      awaitingPublicBreaker: false,
      resultDisplay: null,
    },
    cupidArrow: {
      scheduledSeason: cupidArrowIsScheduled ? season : null,
      status: cupidArrowIsScheduled ? 'scheduled' : 'inactive',
      activatedSeason: null,
      activatedWeek: null,
      pairs: [],
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
    },
    voxPopuli: initialVoxPopuli,
    coLohIds: null,
    awaitingCoLohNomination: false,
    coLohNomineeByCoLohId: null,
    awaitingPosTieBreak: false,
  }
}

const initialState: GameState = createInitialGameState()

// ─── Helper ──────────────────────────────────────────────────────────────────
/** Monotonic counter to guarantee unique event IDs within the same millisecond. */
let _pushEventCounter = 0
let _activeBroadcastPhase: Phase | null = null
let _pendingPhaseCustoms: CustomBroadcastMessage[] | null = null
let _flushingPhaseCustom = false
const MAX_GAME_HISTORY_EVENTS = 1000

function inferObservedBroadcastSource(state: GameState, phase: Phase, text: string) {
  const playerNames = [...new Set(state.players.map((player) => player.name).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const tokenPattern =
    playerNames.length > 0 ? new RegExp(`${playerNames.join('|')}|\\b\\d+\\b`, 'g') : /\b\d+\b/g
  const variables: string[] = []
  const sourceText = text.replace(tokenPattern, (value) => {
    variables.push(value)
    return '{value}'
  })
  const sourceHash = (hashString(`${phase}|${sourceText}`) >>> 0).toString(36)
  return { id: `observed.${phase}.${sourceHash}`, sourceText, variables }
}

function currentBroadcastCampaign(state: GameState): BroadcastCampaign {
  if (state.mode === 'survival') return 'survival'
  if (
    state.cupidArrow?.status === 'scheduled' ||
    state.cupidArrow?.status === 'active' ||
    state.expansionMode === 'cupidArrow'
  )
    return 'cupid'
  if (
    state.voxPopuli?.status === 'scheduled' ||
    state.voxPopuli?.status === 'active' ||
    state.expansionMode === 'voxPopuli'
  )
    return 'vox_populi'
  return 'classic'
}

function buildTvMeta(
  state: Pick<GameState, 'phase' | 'week'>,
  meta?: TvEvent['meta']
): NonNullable<TvEvent['meta']> {
  return {
    phase: state.phase,
    week: state.week,
    ...(meta ?? {}),
  }
}

/**
 * A reducer transition can occasionally be resumed after an overlay or an
 * automatic callback. Do not add the same broadcast line twice on the same
 * in-game day; distinct wording and every other event remain intact.
 */
function findDuplicateDayBroadcast(state: GameState, text: string): TvEvent | undefined {
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  return state.tvFeed.find(
    (event) =>
      event.meta?.week === state.week && event.text.replace(/\s+/g, ' ').trim() === normalizedText
  )
}

function managedBroadcastOrder(state: GameState, event: TvEvent): number {
  const templateId = event.meta?.broadcastTemplateId
  if (typeof templateId === 'string') {
    const overrideOrder = state.broadcastOverrides?.[templateId]?.order
    if (typeof overrideOrder === 'number') return overrideOrder
  }
  const customId = event.meta?.customBroadcastId
  if (typeof customId === 'string') {
    const customOrder = state.customBroadcasts?.find((message) => message.id === customId)?.order
    if (typeof customOrder === 'number') return customOrder
  }
  return typeof event.meta?.broadcastOrder === 'number' ? event.meta.broadcastOrder : 10000
}

function enqueueManagedBroadcast(state: GameState, event: TvEvent) {
  const shouldShow = event.meta?.forceOnTv === true
  if (!shouldShow || event.meta?.broadcastConsumed === true) return
  const activeEventsById = new Map(
    state.tvFeed
      .filter((candidate) => candidate.meta?.broadcastConsumed !== true)
      .map((candidate) => [candidate.id, candidate] as const)
  )
  const queue = [...(state.broadcastQueue ?? [])].filter((id) => activeEventsById.has(id))
  if (!queue.includes(event.id)) queue.push(event.id)
  const orderFor = (id: string) => {
    const candidate = activeEventsById.get(id)
    return candidate ? managedBroadcastOrder(state, candidate) : 10000
  }
  queue.sort((left, right) => orderFor(left) - orderFor(right))
  state.broadcastQueue = queue
}

function rebuildManagedBroadcastQueue(state: GameState, phase: Phase) {
  const retainedPlainEvent = state.lastPlainBroadcastEventId
    ? state.tvFeed.find((event) => event.id === state.lastPlainBroadcastEventId)
    : undefined
  if (
    state.lastPlainBroadcastEventId &&
    (retainedPlainEvent?.meta?.phase !== phase || retainedPlainEvent?.meta?.week !== state.week)
  ) {
    state.lastPlainBroadcastEventId = null
  }

  const eligible = state.tvFeed.filter((event) => {
    if (event.meta?.phase !== phase || event.meta?.week !== state.week) return false
    if (event.meta?.broadcastManaged !== true || event.meta?.broadcastConsumed === true)
      return false
    if (event.meta?.forceOnTv !== true) return false
    const templateId = event.meta?.broadcastTemplateId
    if (typeof templateId === 'string' && state.broadcastOverrides?.[templateId]?.disabled)
      return false
    const customId = event.meta?.customBroadcastId
    if (typeof customId === 'string') {
      const custom = state.customBroadcasts?.find((message) => message.id === customId)
      if (!custom?.enabled) return false
    }
    return true
  })
  eligible.sort(
    (left, right) =>
      managedBroadcastOrder(state, left) - managedBroadcastOrder(state, right) ||
      left.timestamp - right.timestamp ||
      left.id.localeCompare(right.id)
  )
  state.broadcastQueue = eligible.map((event) => event.id)
}

function refreshManagedBroadcastDefinition(state: GameState, event: TvEvent) {
  if (event.meta?.broadcastManaged !== true || event.meta?.broadcastConsumed === true) return
  const customId = event.meta?.customBroadcastId
  const custom =
    typeof customId === 'string'
      ? state.customBroadcasts?.find((message) => message.id === customId)
      : undefined
  let templateId = event.meta?.broadcastTemplateId
  const eventMajor = event.meta?.major ?? event.major
  if (
    event.meta?.phase === 'season_start' &&
    eventMajor === 'vox_populi' &&
    templateId !== 'season.vox-populi-intro'
  ) {
    templateId = 'season.vox-populi-intro'
    event.meta = {
      ...(event.meta ?? {}),
      broadcastTemplateId: templateId,
      broadcastVariables: [],
    }
    delete event.meta.broadcastSourceText
  }
  const template = typeof templateId === 'string' ? getBroadcastTemplate(templateId) : undefined
  const override =
    typeof templateId === 'string' ? state.broadcastOverrides?.[templateId] : undefined
  const variables = Array.isArray(event.meta?.broadcastVariables)
    ? event.meta.broadcastVariables.filter((value): value is string => typeof value === 'string')
    : []
  const level =
    custom?.level ??
    override?.level ??
    template?.level ??
    (event.meta?.broadcastLevel as BroadcastLevel | undefined) ??
    'minor'
  const forceOnTv = custom
    ? custom.forceOnTv !== false
    : (override?.forceOnTv ?? template?.forceOnTv ?? event.meta?.forceOnTv === true)
  const configuredMajor =
    custom?.major ?? (override?.major === null ? undefined : (override?.major ?? template?.major))
  const major =
    level === 'critical'
      ? (configuredMajor ?? 'custom_critical')
      : level === 'major'
        ? (configuredMajor ?? 'custom_major')
        : undefined

  if (custom) {
    event.text = custom.text
    event.type = custom.type
  } else if (template) {
    event.text = renderBroadcastTemplate(override?.text ?? template.text, variables)
    event.type = override?.type ?? template.type
  }
  event.major = major
  const meta: NonNullable<TvEvent['meta']> = {
    ...(event.meta ?? {}),
    broadcastLevel: level,
  }
  if (major) meta.major = major
  else delete meta.major
  if (forceOnTv) meta.forceOnTv = true
  else delete meta.forceOnTv
  if (level === 'critical') meta.broadcastPriority = 'critical'
  else delete meta.broadcastPriority
  if (level !== 'minor') {
    meta.announcementTitle = custom?.title ?? override?.title ?? template?.title
    meta.announcementSubtitle = event.text
  } else {
    delete meta.announcementTitle
    delete meta.announcementSubtitle
  }
  event.meta = meta
}

function pushEvent(
  state: GameState,
  text: string,
  type: TvEvent['type'],
  meta?: TvEvent['meta']
): TvEvent | undefined {
  const legacyVoxIntro =
    (meta?.phase ?? _activeBroadcastPhase ?? state.phase) === 'season_start' &&
    (meta?.major === 'vox_populi' || meta?.announcementKey === 'vox_populi')
  const explicitTemplateId =
    meta?.broadcastTemplateId ??
    meta?.templateId ??
    (legacyVoxIntro ? 'season.vox-populi-intro' : undefined)
  const hintedPhase =
    typeof meta?.phase === 'string' ? (meta.phase as Phase) : (_activeBroadcastPhase ?? state.phase)
  const matched = matchBroadcastTemplate(text, hintedPhase, explicitTemplateId)
  const template = matched?.template
  const authoredTemplateId = typeof explicitTemplateId === 'string' ? explicitTemplateId : null
  const observed =
    template || authoredTemplateId ? null : inferObservedBroadcastSource(state, hintedPhase, text)
  const templateId = template?.id ?? authoredTemplateId ?? observed?.id
  const isDeclaredSource = Boolean(template || authoredTemplateId || meta?.customBroadcastId)
  const variables = matched?.variables ?? observed?.variables ?? []
  const override = templateId ? state.broadcastOverrides?.[templateId] : undefined
  if (override?.disabled) return undefined

  const finalText = override?.text ? renderBroadcastTemplate(override.text, variables) : text
  const finalType = override?.type ?? type
  const authoredLevel = meta?.broadcastLevel as BroadcastLevel | undefined
  const defaultMajor = template?.major ?? (typeof meta?.major === 'string' ? meta.major : undefined)
  const finalLevel =
    override?.level ??
    (isDeclaredSource
      ? (template?.level ??
        authoredLevel ??
        (meta?.broadcastPriority === 'critical' ? 'critical' : defaultMajor ? 'major' : 'minor'))
      : 'minor')
  const selectedMajor = override?.major === null ? undefined : (override?.major ?? defaultMajor)
  const forceOnTv =
    override?.forceOnTv ??
    (isDeclaredSource
      ? ((typeof meta?.forceOnTv === 'boolean' ? meta.forceOnTv : undefined) ??
        template?.forceOnTv ??
        true)
      : false)
  const finalMajor =
    finalLevel === 'critical'
      ? (selectedMajor ?? 'custom_critical')
      : finalLevel === 'major'
        ? (selectedMajor ?? 'custom_major')
        : undefined
  const intendedPhase = template?.phase ?? hintedPhase
  const broadcastOrder =
    override?.order ??
    (template
      ? getDefaultBroadcastOrder(template)
      : typeof meta?.broadcastOrder === 'number'
        ? meta.broadcastOrder
        : 10000)
  if (
    !_flushingPhaseCustom &&
    !meta?.customBroadcastId &&
    _pendingPhaseCustoms &&
    intendedPhase === _activeBroadcastPhase
  ) {
    flushPhaseCustomsBefore(state, broadcastOrder)
  }
  const finalMeta: TvEvent['meta'] = {
    ...meta,
    phase: intendedPhase,
    broadcastCampaign: template?.campaign ?? currentBroadcastCampaign(state),
    ...(templateId ? { broadcastTemplateId: templateId } : {}),
    ...(observed ? { broadcastSourceText: observed.sourceText } : {}),
    broadcastVariables: variables,
    broadcastOrder,
    broadcastLevel: finalLevel,
    broadcastManaged: true,
    ...(forceOnTv ? { forceOnTv: true } : {}),
    ...(finalLevel !== 'minor' && override?.title ? { announcementTitle: override.title } : {}),
    ...(finalLevel !== 'minor' ? { announcementSubtitle: finalText } : {}),
  }
  if (!forceOnTv) delete finalMeta.forceOnTv
  if (finalLevel === 'minor' || !finalMajor) delete finalMeta.major
  else finalMeta.major = finalMajor
  if (finalLevel === 'critical') finalMeta.broadcastPriority = 'critical'
  else if (override?.level) delete finalMeta.broadcastPriority

  const duplicate = findDuplicateDayBroadcast(state, finalText)
  if (duplicate) return duplicate

  const ts = Date.now()
  const event: TvEvent = {
    id: `${state.phase}-w${state.week}-${ts}-${++_pushEventCounter}`,
    text: finalText,
    type: finalType,
    timestamp: ts,
    major: finalMajor,
    meta: buildTvMeta(state, finalMeta),
  }
  state.tvFeed = [event, ...state.tvFeed].slice(0, MAX_GAME_HISTORY_EVENTS)
  enqueueManagedBroadcast(state, event)
  return event
}

function pushDetoxEvent(state: GameState, text: string) {
  pushEvent(state, text, 'game', { sequence: 'detox_safety' })
}

function refreshSecretMissionCompletion(secretMission: GameState['secretMission']) {
  if (!secretMission || secretMission.status !== 'accepted') return
  const allDone = isSecretMissionSuccessful(secretMission.tasks)
  if (allDone) {
    secretMission.status = 'rewardPending'
  }
}

const MIN_SECRET_MISSION_DAY_SPAN = Math.min(
  ...MISSION_TEMPLATES.map((template) => template.daySpan)
)

function canReplaceSecretMissionSlot(secretMission: GameState['secretMission']): boolean {
  if (!secretMission) return true
  if (secretMission.status === 'declined' || secretMission.status === 'expired') return true
  if (secretMission.status !== 'rewardClaimed') return false
  const reward = secretMission.reward
  if (!reward) return true
  return (
    reward.consumed || reward.expired || !reward.eligible || reward.type === 'plus1000Influence'
  )
}

function getSeasonSecretMissionCount(
  game: Pick<GameState, 'secretMission' | 'secretMissionCount'>
): number {
  if (typeof game.secretMissionCount === 'number') return game.secretMissionCount
  if (typeof game.secretMission?.missionNumber === 'number') return game.secretMission.missionNumber
  return game.secretMission ? 1 : 0
}

function formatNameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return names.join(', ')
}

function getPovProtectedIds(state: GameState): string[] {
  const ids = new Set<string>(state.povProtectedIds ?? [])
  if (state.povSavedId) ids.add(state.povSavedId)
  return [...ids]
}

function addPovProtectedId(state: GameState, playerId: string | null | undefined) {
  if (!playerId) return
  const ids = new Set(getPovProtectedIds(state))
  ids.add(playerId)
  state.povProtectedIds = [...ids]
}

function getCupidRoleIds(state: GameState, playerId: string | null | undefined): string[] {
  if (!playerId) return []
  return expandCupidIds(state, [playerId]).filter((id) => {
    const player = state.players.find((candidate) => candidate.id === id)
    return player != null && player.status !== 'evicted' && player.status !== 'jury'
  })
}

function getCupidHumanCoholder(
  state: GameState,
  holderId: string | null | undefined
): Player | undefined {
  const roleIds = new Set(getCupidRoleIds(state, holderId))
  return state.players.find((player) => player.isUser && roleIds.has(player.id))
}

function syncCupidRoleStatuses(state: GameState) {
  if (!isCupidArrowActive(state)) return
  const lohIds = new Set(getCupidRoleIds(state, state.lohId))
  const posIds = new Set(getCupidRoleIds(state, state.posWinnerId))
  const nomineeIds = new Set(state.nomineeIds)
  state.players.forEach((player) => {
    if (player.status === 'evicted' || player.status === 'jury') return
    const isLoh = lohIds.has(player.id)
    const isPos = posIds.has(player.id)
    const isNominee = nomineeIds.has(player.id)
    if (isNominee && isPos) player.status = 'nominated+pos'
    else if (isNominee) player.status = 'nominated'
    else if (isLoh && isPos) player.status = 'loh+pos'
    else if (isLoh) player.status = 'loh'
    else if (isPos) player.status = 'pos'
    else player.status = 'active'
  })
}

function expandCupidNominees(state: GameState) {
  if (!isCupidArrowActive(state)) return
  const before = new Set(state.nomineeIds)
  const expanded = expandCupidIds(state, state.nomineeIds)
  state.nomineeIds = expanded
  expanded.forEach((id) => {
    if (!before.has(id)) incrementTimesNominated(state, id)
  })
  syncCupidRoleStatuses(state)
}

function removeCupidNomineeUnit(state: GameState, saveId: string): string[] {
  const removedIds = expandCupidIds(state, [saveId]).filter((id) => state.nomineeIds.includes(id))
  state.nomineeIds = state.nomineeIds.filter((id) => !removedIds.includes(id))
  syncCupidRoleStatuses(state)
  return removedIds
}

function collapseCupidCandidates(state: GameState, players: Player[]): Player[] {
  if (!isCupidArrowActive(state)) return players
  const seen = new Set<string>()
  return players.filter((player) => {
    const key = getCupidPair(state, player.id)?.id ?? `solo:${player.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function activateCupidArrowForSeason(state: GameState) {
  if (isVoxPopuliTwistLocked(state)) return
  if (state.cupidArrow?.status !== 'scheduled' || state.season !== state.cupidArrow.scheduledSeason)
    return
  const pairs = createCupidArrowPairs(state.players, state.seed)
  if (pairs.length < 2) {
    state.cupidArrow.status = 'inactive'
    return
  }
  state.cupidArrow.status = 'active'
  state.cupidArrow.activatedSeason = state.season
  state.cupidArrow.activatedWeek = state.week
  state.cupidArrow.pairs = pairs
  state.cupidArrow.eliminatedPairCount = 0
  state.cupidArrow.pendingPartnerEvictionId = null
  // Cupid's Arrow is a full-season expansion format, not a temporary shock.
  state.twistActive = false
  state.twistActivatedThisWeek = false
  state.history = [
    ...(state.history ?? []),
    {
      type: 'cupidArrow',
      week: state.week,
      data: { pairs: pairs.map((pair) => pair.memberIds) },
      timestamp: Date.now(),
    },
  ]
  const pairNames = pairs
    .map((pair) =>
      pair.memberIds
        .map((id) => state.players.find((player) => player.id === id)?.name ?? id)
        .join(' & ')
    )
    .join(' · ')
  pushEvent(
    state,
    `🏹 The lights soften. A golden arrow crosses the house, splitting into eight trails of light. Cupid has chosen: ${pairNames}. From this moment, every victory, every danger, every vote, and every exit belongs to the pair. 💘`,
    'twist',
    {
      major: 'cupid_arrow',
      broadcastTemplateId: 'cupid.activation',
      phase: 'loh_comp_announcement',
    }
  )
}

function activateVoxPopuliForSeason(state: GameState) {
  if (state.voxPopuli?.status !== 'scheduled' || state.season !== state.voxPopuli.scheduledSeason) {
    return
  }
  state.voxPopuli.status = 'active'
  state.voxPopuli.activatedSeason = state.season
  state.voxPopuli.activatedWeek = state.week
  state.voxPopuli.nominationBallots = {}
  state.voxPopuli.nominationVoteCounts = {}
  state.voxPopuli.nominationDaysByPlayerId = {}
  state.voxPopuli.safetySaveCounts = {}
  state.voxPopuli.finalThreePacingSeen = []
  state.voxPopuli.lastReplacementNomineeIds = []
  state.voxPopuli.immunityWinnerId = null
  state.voxPopuli.autoNomineeId = null
  // Vox Populi is a full-season expansion format, not a temporary shock.
  state.twistActive = false
  state.twistActivatedThisWeek = false
  state.history = [
    ...(state.history ?? []),
    {
      type: 'voxPopuli',
      week: state.week,
      data: { format: 'audience_led' },
      timestamp: Date.now(),
    },
  ]
  const intro = getBroadcastTemplate('season.vox-populi-intro')
  if (intro) {
    pushEvent(state, intro.text, intro.type, {
      broadcastTemplateId: intro.id,
      phase: intro.phase,
    })
  }
}

function breakCupidArrowSpell(state: GameState) {
  if (!isCupidArrowActive(state) || !state.cupidArrow) return
  state.cupidArrow.status = 'broken'
  state.cupidArrow.pendingPartnerEvictionId = null
  state.twistActive = false
  pushEvent(
    state,
    `💔 Four pairs have fallen. Cracks race through Cupid's hearts, the final arrow dissolves into light, and Cupid takes flight from The Big Eye house. The rose glow fades: every survivor now plays alone. What the pairs felt—and what they did to each other—remains.`,
    'twist',
    {
      major: 'cupid_arrow_broken',
      broadcastTemplateId: 'cupid.spell-broken',
      phase: 'eviction_results',
    }
  )
}

function resolvePairAwarePublicSave(rootState: RootState) {
  const { game } = rootState
  const profiles = rootState.publicOpinion?.profiles ?? {}
  if (!isCupidArrowActive(game)) {
    return resolvePublicSaveNominee({ nomineeIds: game.nomineeIds, profiles })
  }

  const adjustedProfiles: typeof profiles = { ...profiles }
  game.nomineeIds.forEach((id) => {
    const partnerId = getCupidPartnerId(game, id)
    const base = profiles[id]
    const ownApproval = base?.approval ?? 50
    const partnerApproval = partnerId ? (profiles[partnerId]?.approval ?? 50) : ownApproval
    const pairApproval = Math.round((ownApproval + partnerApproval) / 2)
    adjustedProfiles[id] = {
      playerId: id,
      approval: pairApproval,
      previousApproval: base?.previousApproval ?? pairApproval,
      seasonApprovals: base?.seasonApprovals ?? [],
      completedDirectionCount: base?.completedDirectionCount ?? 0,
      cumulativePositiveDelta: base?.cumulativePositiveDelta ?? 0,
    }
  })
  return resolvePublicSaveNominee({
    nomineeIds: game.nomineeIds,
    profiles: adjustedProfiles,
  })
}

function resolveCupidPairEviction(state: GameState): boolean {
  if (!isCupidArrowActive(state)) return false
  const units = new Map<string, string[]>()
  state.nomineeIds.forEach((id) => {
    const pair = getCupidPair(state, id)
    const key = pair?.id ?? `solo:${id}`
    const current = units.get(key) ?? []
    if (!current.includes(id)) current.push(id)
    units.set(key, current)
  })
  if (units.size === 0) return true

  const directCounts: Record<string, number> = Object.fromEntries(
    state.nomineeIds.map((id) => [id, 0])
  )
  Object.values(state.votes ?? {}).forEach((id) => {
    if (id in directCounts) directCounts[id] += 1
  })
  const unitTotals = [...units.entries()].map(([key, memberIds]) => ({
    key,
    memberIds,
    total: memberIds.reduce((sum, id) => sum + (directCounts[id] ?? 0), 0),
  }))
  const maxVotes = Math.max(...unitTotals.map((unit) => unit.total))
  const topUnits = unitTotals.filter((unit) => unit.total === maxVotes)
  state.voteResults = Object.fromEntries(
    unitTotals.flatMap((unit) => unit.memberIds.map((id) => [id, unit.total]))
  )

  const queueUnit = (unit: (typeof unitTotals)[number], prefix = '') => {
    const primaryId =
      [...unit.memberIds].sort((a, b) => (directCounts[b] ?? 0) - (directCounts[a] ?? 0))[0] ??
      unit.memberIds[0]
    const names = formatNameList(
      unit.memberIds.map((id) => state.players.find((player) => player.id === id)?.name ?? id)
    )
    state.pendingEviction = {
      evicteeId: primaryId,
      evictionMessage: `${prefix}${names}, Cupid's Arrow means you are eliminated together. 💔`,
    }
  }

  if (topUnits.length === 1) {
    queueUnit(topUnits[0])
    return true
  }

  const tiedRepresentativeIds = topUnits.map((unit) => unit.memberIds[0])
  const tieBreaker =
    getCupidHumanCoholder(state, state.lohId) ??
    state.players.find((player) => player.id === state.lohId)
  if (tieBreaker?.isUser) {
    state.awaitingTieBreak = true
    state.tiedNomineeIds = tiedRepresentativeIds
    pushEvent(
      state,
      `The nominated pairs are tied. ${tieBreaker.name}, your LOH pair must decide which pair leaves. 🗳️`,
      'game',
      { broadcastTemplateId: 'cupid.pair-tiebreak-prompt', phase: 'eviction_results' }
    )
    return true
  }

  const rng = mulberry32((state.seed ^ 0xc0a1d71e) >>> 0)
  const chosen = topUnits[Math.floor(rng() * topUnits.length)]
  queueUnit(chosen, `${tieBreaker?.name ?? 'The LOH'} breaks the tie. `)
  return true
}

function getReplacementEligiblePlayers(
  state: GameState,
  alivePlayers: Player[],
  neededCount = 1,
  options: { allowLoh?: boolean; actorId?: string | null } = {}
): Player[] {
  const actorId = options.actorId === undefined ? state.lohId : options.actorId
  const lohRoleIds = new Set(getCupidRoleIds(state, state.lohId))
  const posRoleIds = new Set(getCupidRoleIds(state, state.posWinnerId))
  const baseEligible = collapseCupidCandidates(
    state,
    alivePlayers.filter((pl) => {
      const unitIds = expandCupidIds(state, [pl.id])
      return (
        (options.allowLoh === true || unitIds.every((id) => !lohRoleIds.has(id))) &&
        unitIds.every((id) => !posRoleIds.has(id)) &&
        unitIds.every((id) => !state.nomineeIds.includes(id)) &&
        canPlayerTargetPlayer(state, actorId, pl.id)
      )
    })
  )
  const protectedIds = new Set(getPovProtectedIds(state))
  const nonProtected = baseEligible.filter((player) =>
    expandCupidIds(state, [player.id]).every((id) => !protectedIds.has(id))
  )
  return nonProtected.length >= neededCount ? nonProtected : baseEligible
}

function isEligibleReplacementNominee(
  state: GameState,
  playerId: string,
  neededCount = 1,
  options: { allowLoh?: boolean; actorId?: string | null } = {}
): boolean {
  const alivePlayers = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
  return getReplacementEligiblePlayers(state, alivePlayers, neededCount, options).some(
    (player) => player.id === playerId
  )
}

function appendNominee(state: GameState, playerId: string) {
  const nomineeIds = expandCupidIds(state, [playerId])
  nomineeIds.forEach((id) => {
    if (state.nomineeIds.includes(id)) return
    state.nomineeIds.push(id)
    incrementTimesNominated(state, id)
  })
  syncCupidRoleStatuses(state)
  if (!isCupidArrowActive(state)) {
    const player = state.players.find((candidate) => candidate.id === playerId)
    if (player) {
      if (player.id === state.lohId) player.status = 'loh'
      else if (player.id === state.posWinnerId) player.status = 'nominated+pos'
      else player.status = 'nominated'
    }
  }
}

function getAiThreatScore(
  state: GameState,
  player: Player,
  options: { preferLoh?: boolean } = {}
): number {
  const lohWins = player.stats?.lohWins ?? 0
  const posWins = player.stats?.posWins ?? 0
  const timesNominated = player.stats?.timesNominated ?? 0
  let score = 0
  if (player.id === state.lohId) {
    score += options.preferLoh === true ? AI_LOH_REVENGE_THREAT_WEIGHT : AI_LOH_BASE_THREAT_WEIGHT
  }
  if (player.status === 'loh' || player.status === 'loh+pos') {
    score += AI_CURRENT_LOH_POWER_THREAT_WEIGHT
  }
  score += lohWins * AI_LOH_WIN_THREAT_WEIGHT
  score += posWins * AI_POS_WIN_THREAT_WEIGHT
  score += timesNominated === 0 ? AI_NEVER_NOMINATED_THREAT_WEIGHT : 0
  return score
}

function getStrategicRelationship(state: GameState, actorId: string, targetId: string) {
  return state.strategicRelationships?.[actorId]?.[targetId] ?? null
}

function getEarlyHumanGrace(
  state: GameState,
  candidate: Player | undefined,
  affinity: number,
  tags: ReadonlySet<string>
): number {
  if (!candidate?.isUser || state.week < 1 || state.week > 3 || affinity < -15) return 0
  if (tags.has('target') || tags.has('betrayal') || tags.has('rivalry')) return 0
  return EARLY_HUMAN_GRACE_BY_WEEK[state.week] ?? 0
}

function getVoxNominationMomentumScore(state: GameState, candidate: Player): number {
  if (!isVoxPopuliActive(state) || !state.voxPopuli) return 0
  const nominationDays = state.voxPopuli.nominationDaysByPlayerId?.[candidate.id] ?? []
  const recentNominations = nominationDays.filter(
    (day) => day < state.week && day >= state.week - 3
  ).length
  const totalSurvivals = nominationDays.filter((day) => day < state.week).length
  const repeatSaves = state.voxPopuli.safetySaveCounts?.[candidate.id] ?? 0

  // A recent name is easier to write down again, but repeated audience survival
  // eventually turns that familiarity into fear of sitting beside them.
  let score = recentNominations === 1 ? 12 : recentNominations === 2 ? 18 : 0
  if (totalSurvivals >= 3) score -= 22 + Math.min(12, (totalSurvivals - 3) * 4)
  if (repeatSaves >= 2) score -= Math.min(12, repeatSaves * 3)
  return score
}

function getSafetyRelationshipScore(state: GameState, holderId: string, nominee: Player): number {
  const relationship = getStrategicRelationship(state, holderId, nominee.id)
  if (!relationship) return -getAiThreatScore(state, nominee) * 3
  let score = relationship.affinity - getAiThreatScore(state, nominee) * 3
  if (!state.dramaSocialMode) {
    if (relationship.tags.includes('alliance')) score += 55
    if (relationship.tags.includes('protection') || relationship.tags.includes('shield'))
      score += 25
    if (relationship.tags.includes('betrayal')) score -= 35
    return score
  }
  const tags = new Set(relationship.tags)
  if (tags.has('betrayal')) score -= 140
  else {
    if (tags.has('alliance')) score += 65
    if (tags.has('romance') || tags.has('bromance')) score += 45
    if (tags.has('protection') || tags.has('shield')) score += 35
    if (tags.has('safety_promise')) score += 100
  }
  if (tags.has('target') || tags.has('rivalry')) score -= 45
  return score
}

export function getNominationTargetScore(
  state: GameState,
  lohId: string,
  candidate: Player
): number {
  const relationship = getStrategicRelationship(state, lohId, candidate.id)
  const tags = new Set(relationship?.tags ?? [])
  const affinity = relationship?.affinity ?? 0
  let score =
    getAiThreatScore(state, candidate) * 4 -
    affinity -
    getEarlyHumanGrace(state, candidate, affinity, tags)
  if (tags.has('betrayal')) score += 125
  else {
    if (tags.has('alliance')) score -= 110
    if (tags.has('romance') || tags.has('bromance')) score -= 80
    if (tags.has('protection') || tags.has('shield')) score -= 45
  }
  if (tags.has('target')) score += 55
  if (tags.has('rivalry')) score += 45
  if (tags.has('suspicious') || tags.has('unreliable')) score += 18
  score += getVoxNominationMomentumScore(state, candidate)
  const priorNominations = state.lastWeekNominationRecord
  if (priorNominations?.lohId === candidate.id && priorNominations.nomineeIds.includes(lohId)) {
    // Revenge matters, but alliances and stronger strategic reasons can still outweigh it.
    score += 32
  }
  return score
}

function rememberOriginalNominations(state: GameState): void {
  if (!state.lohId || state.nomineeIds.length === 0) return
  if (state.currentWeekNominationRecord?.week === state.week) return
  state.currentWeekNominationRecord = {
    week: state.week,
    lohId: state.lohId,
    nomineeIds: [...new Set(state.nomineeIds)],
  }
}

function pickStrategicNominationTargets(
  state: GameState,
  lohId: string,
  candidates: Player[],
  count: number,
  rng: () => number
): Player[] {
  return candidates
    .map((player) => ({
      player,
      score: getNominationTargetScore(state, lohId, player) + rng() * 8,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.player)
}

function isVoxFinalFour(state: GameState): boolean {
  return isVoxPopuliActive(state) && getAlivePlayers(state).length === 4
}

function getVoxNominationImmunityId(state: GameState): string | null {
  if (isVoxFinalFour(state)) return null
  return state.voxPopuli?.immunityWinnerId ?? state.lohId ?? null
}

function getVoxBallotSize(state: GameState): number {
  return isVoxFinalFour(state) ? 1 : 2
}

function castVoxAiNominationBallots(state: GameState, rng: () => number) {
  if (!state.voxPopuli) return
  const alive = getAlivePlayers(state)
  const immunityWinnerId = getVoxNominationImmunityId(state)
  const autoNomineeId = state.voxPopuli.autoNomineeId ?? state.lastHohCompFinisherId ?? null
  for (const voter of alive) {
    if (voter.isUser) continue
    if (isVoxFinalFour(state) && voter.id === autoNomineeId) continue
    const candidates = alive.filter(
      (candidate) =>
        candidate.id !== voter.id &&
        candidate.id !== immunityWinnerId &&
        candidate.id !== autoNomineeId &&
        canPlayerTargetPlayer(state, voter.id, candidate.id)
    )
    state.voxPopuli.nominationBallots[voter.id] = pickStrategicNominationTargets(
      state,
      voter.id,
      candidates,
      Math.min(getVoxBallotSize(state), candidates.length),
      rng
    ).map((player) => player.id)
  }
}

function finalizeVoxNominations(state: GameState) {
  if (!state.voxPopuli) return
  const alive = getAlivePlayers(state)
  const resolution = resolveVoxNominations({
    activeIds: alive.map((player) => player.id),
    immunityWinnerId: getVoxNominationImmunityId(state),
    autoNomineeId: state.voxPopuli.autoNomineeId ?? state.lastHohCompFinisherId ?? null,
    ballots: state.voxPopuli.nominationBallots,
    ballotNomineeCount: getVoxBallotSize(state),
    seed: state.seed,
  })

  state.voxPopuli.nominationVoteCounts = resolution.voteCounts
  state.nomineeIds = resolution.nomineeIds
  state.voxPopuli.nominationDaysByPlayerId ??= {}
  resolution.nomineeIds.forEach((id) => {
    const days = state.voxPopuli!.nominationDaysByPlayerId![id] ?? []
    if (!days.includes(state.week)) days.push(state.week)
    state.voxPopuli!.nominationDaysByPlayerId![id] = days.slice(-6)
  })
  state.players.forEach((player) => {
    if (!state.nomineeIds.includes(player.id)) return
    if (player.status !== 'nominated' && player.status !== 'nominated+pos') {
      player.status = 'nominated'
      incrementTimesNominated(state, player.id)
    }
  })
  state.awaitingNominations = false
  state.pendingNominee1Id = null
  state.nominationContext = null
  // There is no nominating leader to attribute this block to. Keeping a
  // classic LOH nomination record would create false revenge logic next day.
  state.currentWeekNominationRecord = null

  // The Confessional instruction is actionable only while the human ballot is
  // outstanding. Retire it before queuing the result so returning from the
  // Confessional immediately hands the faux TV to the completed ballot.
  const ballotPrompt = state.tvFeed.find(
    (event) =>
      event.meta?.week === state.week &&
      event.meta?.broadcastTemplateId === 'nominations.vox-ballot' &&
      event.meta?.broadcastConsumed !== true
  )
  if (ballotPrompt) {
    ballotPrompt.meta = { ...(ballotPrompt.meta ?? {}), broadcastConsumed: true }
    state.broadcastQueue = (state.broadcastQueue ?? []).filter((id) => id !== ballotPrompt.id)
    if (state.lastPlainBroadcastEventId === ballotPrompt.id) state.lastPlainBroadcastEventId = null
  }

  const automaticNomineeId = state.voxPopuli.autoNomineeId ?? state.lastHohCompFinisherId ?? null
  const automaticNominee = automaticNomineeId
    ? state.players.find((candidate) => candidate.id === automaticNomineeId)
    : null
  const ballotNominees = resolution.nomineeIds
    .filter((id) => id !== automaticNomineeId)
    .map((id) => {
      const player = state.players.find((candidate) => candidate.id === id)
      const votes = resolution.voteCounts[id] ?? 0
      return {
        name: player?.name ?? id,
        votes,
      }
    })
  const ballotSummary = ballotNominees
    .map(({ name, votes }) => `${name} received ${votes} vote${votes === 1 ? '' : 's'}`)
    .join(', ')
  const ballotNames = formatNameList(ballotNominees.map(({ name }) => name))
  const resultCopy = automaticNominee
    ? ballotNominees.length > 0
      ? `The secret ballot is complete: ${ballotSummary}. ${ballotNames} ${
          ballotNominees.length === 1 ? 'joins' : 'join'
        } ${automaticNominee.name} on the block. They will face the audience vote.`
      : `${automaticNominee.name} remains on the block for the audience vote.`
    : ballotNominees.length > 0
      ? `The secret ballot is complete: ${ballotSummary}. ${ballotNames} ${
          ballotNominees.length === 1 ? 'is' : 'are'
        } nominated for the audience vote.`
      : 'The secret ballot is complete.'
  pushEvent(state, resultCopy, 'game', {
    broadcastTemplateId: automaticNominee
      ? ballotNominees.length > 0
        ? 'nominations.vox-result-with-auto'
        : 'nominations.vox-auto-remains'
      : ballotNominees.length > 0
        ? 'nominations.vox-result'
        : 'nominations.vox-ballot-complete',
  })
}

function pickStrategicAiPlayer(
  state: GameState,
  candidates: Player[],
  rng: () => number,
  mode: 'highest' | 'lowest',
  options: { preferLoh?: boolean } = {}
): Player | null {
  if (candidates.length === 0) return null
  const scored = candidates.map((player) => ({
    player,
    score: getAiThreatScore(state, player, options),
  }))
  const targetScore =
    mode === 'highest'
      ? Math.max(...scored.map((entry) => entry.score))
      : Math.min(...scored.map((entry) => entry.score))
  const tied = scored.filter((entry) => entry.score === targetScore).map((entry) => entry.player)
  return seededPick(rng, tied)
}

function pickStrategicAiPlayers(
  state: GameState,
  candidates: Player[],
  count: number,
  rng: () => number,
  options: { preferLoh?: boolean } = {}
): Player[] {
  const remaining = [...candidates]
  const picks: Player[] = []
  while (picks.length < count && remaining.length > 0) {
    const pick = pickStrategicAiPlayer(state, remaining, rng, 'highest', options)
    if (!pick) break
    picks.push(pick)
    const idx = remaining.findIndex((player) => player.id === pick.id)
    if (idx >= 0) remaining.splice(idx, 1)
  }
  return picks
}

function shouldAiUseTargetedSafetyPower(
  state: GameState,
  holderId: string | null | undefined,
  currentNominees: Player[],
  eligibleReplacements: Player[],
  options: { replacementCount?: number; preferLoh?: boolean } = {}
): boolean {
  if (!holderId) return false
  const replacementCount = Math.max(1, options.replacementCount ?? 1)
  if (eligibleReplacements.length === 0 || currentNominees.length === 0) return false
  const bestRelationship = Math.max(
    ...currentNominees.map((nominee) => getSafetyRelationshipScore(state, holderId, nominee))
  )

  // Vox Populi makes Safety an explicitly personal decision: an AI holder will
  // only intervene for somebody with whom they have a meaningful connection.
  if (isVoxPopuliActive(state)) {
    if (bestRelationship < 60) return false
    return true
  }

  // Preserve the established Classic campaign strategy. Classic holders may
  // make a calculated block swap even without a close personal bond.
  const currentScores = currentNominees
    .map((player) => getAiThreatScore(state, player, options))
    .sort((a, b) => a - b)
  const replacementScores = eligibleReplacements
    .map((player) => getAiThreatScore(state, player, options))
    .sort((a, b) => b - a)
  const currentValue = currentScores
    .slice(0, Math.min(replacementCount, currentScores.length))
    .reduce((sum, score) => sum + score, 0)
  const replacementValue = replacementScores
    .slice(0, Math.min(replacementCount, replacementScores.length))
    .reduce((sum, score) => sum + score, 0)
  const strategicUpgrade = replacementValue > currentValue
  let useChance = strategicUpgrade ? 0.35 : 0.05
  if (bestRelationship >= 75) useChance += 0.5
  else if (bestRelationship >= 45) useChance += 0.35
  else if (bestRelationship >= 20) useChance += 0.18
  const lohAdvice = state.lohSafetyAdvice
  if (
    lohAdvice?.week === state.week &&
    lohAdvice.lohId === state.lohId &&
    lohAdvice.holderId === holderId
  ) {
    if (lohAdvice.advice === 'use') useChance += 0.38
    if (lohAdvice.advice === 'hold') useChance -= 0.38
  }
  useChance = Math.max(0.03, Math.min(0.92, useChance))
  const rng = mulberry32(
    (state.seed ^
      hashString(
        `safety:${state.week}:${holderId}:${currentNominees.map((player) => player.id).join('|')}`
      )) >>>
      0
  )
  return rng() < useChance
}

function ensureMinimumNominees(
  state: GameState,
  alivePlayers: Player[],
  minRequired: number,
  rng: () => number
): boolean {
  while (state.nomineeIds.length < minRequired) {
    const eligible = getReplacementEligiblePlayers(
      state,
      alivePlayers,
      minRequired - state.nomineeIds.length
    )
    if (eligible.length === 0) {
      pushEvent(
        state,
        'There were no eligible replacement nominees available, so the ceremony proceeds with a short block.',
        'game'
      )
      return false
    }

    const lohPlayer = state.players.find((player) => player.id === state.lohId)
    if (lohPlayer?.isUser) {
      state.replacementNeeded = true
      pushEvent(
        state,
        `${lohPlayer.name} must name a replacement nominee to restore the block. 🎯`,
        'game'
      )
      return false
    }

    const replacement = seededPick(rng, eligible)
    appendNominee(state, replacement.id)
    pushEvent(
      state,
      `${lohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the replacement nominee. 🎯`,
      'game'
    )
  }

  return true
}

function restoreVoxNomineeMinimum(state: GameState): string[] {
  if (!isVoxPopuliActive(state) || !state.voxPopuli) return []
  const requiredNomineeCount = state.doubleEviction?.weekActive ? 3 : 2
  state.voxPopuli.lastReplacementNomineeIds = []
  if (state.nomineeIds.length >= requiredNomineeCount) return []
  const alive = getAlivePlayers(state)
  const replacements = resolveVoxReplacementNominees({
    activeIds: alive.map((player) => player.id),
    currentNomineeIds: state.nomineeIds,
    protectedIds: getPovProtectedIds(state),
    immunityWinnerId: getVoxNominationImmunityId(state),
    nominationVoteCounts: state.voxPopuli.nominationVoteCounts,
    requiredNomineeCount,
    seed: state.seed,
  })
  replacements.forEach((id) => appendNominee(state, id))
  state.voxPopuli.lastReplacementNomineeIds = [...replacements]
  if (replacements.length > 0) {
    const rankedNames = replacements.map((id) => {
      const name = state.players.find((player) => player.id === id)?.name ?? id
      const votes = state.voxPopuli?.nominationVoteCounts[id] ?? 0
      return `${name} (${votes} vote${votes === 1 ? '' : 's'})`
    })
    pushEvent(
      state,
      `${formatNameList(rankedNames)} ${
        replacements.length === 1 ? 'joins' : 'join'
      } the block from the next-highest secret-ballot rank.`,
      'game',
      { major: 'vox_populi_replacement', broadcastPriority: 'critical' }
    )
  }
  state.replacementNeeded = false
  state.aiReplacementStep = 0
  return replacements
}

function pushVoxSafetyOutcome(state: GameState, holderId: string | null, savedId: string): void {
  const holder = holderId ? state.players.find((player) => player.id === holderId) : null
  const saved = state.players.find((player) => player.id === savedId)
  const savedName = saved?.name ?? 'A nominee'
  if (state.voxPopuli) {
    state.voxPopuli.safetySaveCounts ??= {}
    state.voxPopuli.safetySaveCounts[savedId] = (state.voxPopuli.safetySaveCounts[savedId] ?? 0) + 1
  }
  const saveLine =
    holder?.id === savedId
      ? `${savedName} has saved ${getPlayerReflexive(saved)} from the block.`
      : `${holder?.name ?? 'The Safety holder'} has saved ${savedName} from the block.`
  const nomineeNames = state.nomineeIds.map(
    (id) => state.players.find((player) => player.id === id)?.name ?? id
  )
  const publicLine =
    state.doubleEviction?.weekActive && nomineeNames.length >= 3
      ? `${formatNameList(nomineeNames)} will now face the audience, and two of them will leave tonight.`
      : `${formatNameList(nomineeNames)} will now face the audience, who will decide whose game ends tonight.`
  const isSelfSave = holder?.id === savedId
  const isDouble = Boolean(state.doubleEviction?.weekActive && nomineeNames.length >= 3)
  pushEvent(state, `${saveLine} ${publicLine}`, 'game', {
    broadcastTemplateId: isSelfSave
      ? isDouble
        ? 'safety.vox-self-save-double'
        : 'safety.vox-self-save'
      : isDouble
        ? 'safety.vox-save-double'
        : 'safety.vox-save',
    savedId,
    nomineeIds: [...state.nomineeIds],
  })
}

function pushVoxSafetyStandPat(state: GameState, holderId: string | null): void {
  const holder = holderId ? state.players.find((player) => player.id === holderId) : null
  const nomineeNames = state.nomineeIds.map(
    (id) => state.players.find((player) => player.id === id)?.name ?? id
  )
  const nominees = formatNameList(nomineeNames)
  pushEvent(
    state,
    `${holder?.name ?? 'The Safety holder'} has chosen not to use the Power of Safety. ${nominees} ${
      nomineeNames.length === 1 ? 'remains' : 'remain'
    } on the block and will face the audience.`,
    'game',
    {
      broadcastTemplateId: 'safety.vox-hold',
      nomineeIds: [...state.nomineeIds],
    }
  )
}

function holdVoxFinalThreePrelude(
  state: GameState,
  key: string,
  title: string,
  text: string
): boolean {
  if (!isVoxPopuliActive(state) || !state.voxPopuli) return false
  state.voxPopuli.finalThreePacingSeen ??= []
  if (state.voxPopuli.finalThreePacingSeen.includes(key)) return false
  state.voxPopuli.finalThreePacingSeen.push(key)
  pushEvent(state, text, 'social', {
    major: 'vox_final3_interlude',
    broadcastPriority: 'critical',
    finalThreePacingKey: key,
    announcementTitle: title,
    announcementSubtitle: text,
  })
  return true
}

/**
 * Final Three is a self-contained Vox Populi ceremony.  Never allow a
 * lingering Final Four nomination, safety, or competition result to leak into
 * the next day: it reads as a broken story and can also make Play target the
 * wrong blocker.
 */
function resetVoxFinalThreeRound(state: GameState): void {
  state.lohId = null
  state.prevHohId = null
  state.nomineeIds = []
  state.posWinnerId = null
  state.replacementNeeded = false
  state.povSavedId = null
  state.povProtectedIds = []
  state.lastHohCompFinisherId = null
  state.lastHohCompFinisherType = null
  state.publicSavedNomineeId = null
  state.nominationContext = null
  state.awaitingPublicSave = false
  state.awaitingNominations = false
  state.pendingNominee1Id = null
  state.awaitingPovDecision = false
  state.awaitingPovSaveTarget = false
  state.awaitingHumanVote = false
  state.awaitingTieBreak = false
  state.tiedNomineeIds = null
  state.awaitingFinal3Eviction = false
  state.awaitingFinal3Plea = false
  state.votes = {}
  state.voteResults = null
  state.voteResultsMode = undefined
  state.pendingEviction = null
  state.pendingExitContext = null
  state.minigameContext = null
  state.f3Part1WinnerId = null
  state.f3Part2WinnerId = null
  state.players.forEach((player) => {
    if (['loh', 'nominated', 'pos', 'loh+pos', 'nominated+pos'].includes(player.status)) {
      player.status = 'active'
    }
  })
  if (state.voxPopuli) {
    state.voxPopuli.immunityWinnerId = null
    state.voxPopuli.autoNomineeId = null
    state.voxPopuli.lastReplacementNomineeIds = []
    state.voxPopuli.awaitingPublicVote = false
    state.voxPopuli.publicVoteContext = null
    state.voxPopuli.publicVotePercentages = null
    state.voxPopuli.finalThreePacingSeen = []
  }
}

function pushVoxFinalThreeResult(state: GameState, title: string, subtitle: string): void {
  pushEvent(state, subtitle, 'game', {
    major: 'vox_final3_result',
    broadcastPriority: 'critical',
    announcementTitle: title,
    announcementSubtitle: subtitle,
  })
}

function pushVoxPostEvictionReaction(state: GameState, evictee: Player): void {
  if (!isVoxPopuliActive(state)) return
  const survivors = getAlivePlayers(state)
  if (survivors.length <= 3 || survivors.length === 0) return
  const affinityWithEvictee = (playerId: string): number => {
    const outward = state.strategicRelationships?.[playerId]?.[evictee.id]?.affinity ?? 0
    const inward = state.strategicRelationships?.[evictee.id]?.[playerId]?.affinity ?? 0
    return (outward + inward) / 2
  }
  const ranked = survivors
    .map((player) => ({ player, affinity: affinityWithEvictee(player.id) }))
    .sort((left, right) => right.affinity - left.affinity)
  const closest = ranked[0]
  const rival = ranked[ranked.length - 1]
  const seedOffset = [...evictee.id].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  const rng = mulberry32((state.seed ^ Math.imul(state.week + 1, 0x9e3779b1) ^ seedOffset) >>> 0)
  const closeScenes = [
    (name: string) => `${name} is crying quietly in the bedroom after ${evictee.name}'s exit.`,
    (name: string) =>
      `${name} has slipped into the yard to sob alone after saying goodbye to ${evictee.name}.`,
    (name: string) =>
      `${name} is clutching ${evictee.name}'s empty pillow, trying to hold it together.`,
    (name: string) =>
      `${name} is sitting silently by the pool, still shaken by ${evictee.name}'s elimination.`,
    (name: string) =>
      `${name} broke down in the dressing room once ${evictee.name}'s suitcase disappeared.`,
    (name: string) => `${name} is being comforted in the bedroom after losing ${evictee.name}.`,
  ]
  const rivalScenes = [
    (name: string) =>
      `${name} has opened the sparkling cider. Their biggest rival, ${evictee.name}, is gone.`,
    (name: string) =>
      `${name} is already calling ${evictee.name}'s exit the turning point of the season.`,
    (name: string) =>
      `${name} cannot hide a relieved smile now that rival ${evictee.name} has left the house.`,
    (name: string) => `${name} has quietly begun a victory lap after outlasting ${evictee.name}.`,
    (name: string) =>
      `${name} is telling allies that ${evictee.name}'s exit has opened the road to the finale.`,
    (name: string) =>
      `${name} raised a private toast in the kitchen after rival ${evictee.name} walked out.`,
  ]
  const useCloseScene = Boolean(closest && closest.affinity >= 25)
  const useRivalScene = Boolean(!useCloseScene && rival && rival.affinity <= -25)
  if (!useCloseScene && !useRivalScene) return
  const subject = useCloseScene ? closest.player : rival.player
  const pool = useCloseScene ? closeScenes : rivalScenes
  const text = pool[Math.floor(rng() * pool.length)](subject.name)
  pushEvent(state, text, 'social', {
    voxPostEvictionReaction: true,
    broadcastPriority: 'critical',
  })
}

function emitCustomBroadcast(state: GameState, custom: CustomBroadcastMessage, phase: Phase) {
  _flushingPhaseCustom = true
  pushEvent(state, custom.text, custom.type, {
    phase,
    customBroadcastId: custom.id,
    broadcastTemplateId: custom.key ?? custom.id,
    broadcastOrder: custom.order ?? 10000,
    broadcastLevel: custom.level,
    forceOnTv: custom.forceOnTv !== false,
    ...(custom.level !== 'minor' && custom.major ? { major: custom.major } : {}),
    ...(custom.level === 'critical' ? { broadcastPriority: 'critical' } : {}),
    ...(custom.title ? { announcementTitle: custom.title } : {}),
    ...(custom.level !== 'minor' ? { announcementSubtitle: custom.text } : {}),
  })
  _flushingPhaseCustom = false
}

function beginPhaseBroadcastSequence(state: GameState, phase: Phase) {
  _activeBroadcastPhase = phase
  _pendingPhaseCustoms = (state.customBroadcasts ?? [])
    .filter(
      (custom) =>
        custom.enabled &&
        custom.phase === phase &&
        (!custom.campaign || custom.campaign === currentBroadcastCampaign(state)) &&
        custom.text.trim() &&
        !state.tvFeed.some(
          (event) => event.meta?.week === state.week && event.meta?.customBroadcastId === custom.id
        )
    )
    .sort((a, b) => (a.order ?? 10000) - (b.order ?? 10000))
}

function flushPhaseCustomsBefore(state: GameState, order: number) {
  while (_pendingPhaseCustoms?.length && (_pendingPhaseCustoms[0].order ?? 10000) < order) {
    const custom = _pendingPhaseCustoms.shift()!
    emitCustomBroadcast(state, custom, _activeBroadcastPhase ?? custom.phase)
  }
}

function finishPhaseBroadcastSequence(state: GameState) {
  flushPhaseCustomsBefore(state, Number.POSITIVE_INFINITY)
  _pendingPhaseCustoms = null
  _activeBroadcastPhase = null
}

type CommitPublicSavePayload =
  | string
  | {
      savedId: string
    }

/**
 * Determine whether the next evicted player should become a juror ('jury')
 * or simply go home ('evicted'), based on the configured jury size.
 *
 * Formula (default jurySize = 7 for a 12-player season):
 *   nonJuryEvictions = totalPlayers - 2 - jurySize
 * The first `nonJuryEvictions` players evicted go home; the rest become jury.
 */
function evictedStatus(state: GameState): 'evicted' | 'jury' {
  if (isVoxPopuliActive(state)) return 'evicted'
  const totalPlayers = state.players.length
  const jurySize = state.cfg?.jurySize ?? 7
  const nonJuryEvictions = totalPlayers - 2 - jurySize
  const evictedSoFar = state.players.filter((p) => p.status === 'evicted').length
  return evictedSoFar < nonJuryEvictions ? 'evicted' : 'jury'
}

function archiveSeasonExitContext(state: GameState, playerId: string) {
  const alreadyArchived = (state.history ?? []).some(
    (event) =>
      event.type === 'seasonExit' && event.week === state.week && event.data.playerId === playerId
  )
  if (alreadyArchived) return

  const roundSnapshot =
    state.pendingExitContext?.week === state.week ? state.pendingExitContext : null
  const aliveCount = state.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  ).length
  const isFinalThreeDecision =
    aliveCount === 3 && state.nomineeIds.length === 2 && Boolean(state.lohId)
  const decisionMakerId = isVoxPopuliActive(state)
    ? null
    : state.phase === 'final4_eviction'
      ? state.posWinnerId
      : state.phase === 'final3_decision' || isFinalThreeDecision
        ? state.lohId
        : null
  const leaderIds = isVoxPopuliActive(state)
    ? []
    : (roundSnapshot?.leaderIds ??
      (state.coLohIds?.length ? [...state.coLohIds] : state.lohId ? [state.lohId] : []))
  const exitMethod =
    state.dayStartShock?.targetId === playerId
      ? 'shock'
      : isCupidArrowActive(state) && state.cupidArrow?.pendingPartnerEvictionId === playerId
        ? 'linkedExit'
        : decisionMakerId
          ? 'directDecision'
          : state.doubleEviction?.weekActive
            ? 'doubleExit'
            : 'vote'

  state.history = [
    ...(state.history ?? []),
    {
      type: 'seasonExit',
      week: state.week,
      data: {
        playerId,
        leaderIds,
        nomineeIds: roundSnapshot?.nomineeIds ?? [...state.nomineeIds],
        votesByVoterId: roundSnapshot?.votesByVoterId ?? { ...(state.votes ?? {}) },
        voteCounts: roundSnapshot?.voteCounts ?? { ...(state.voteResults ?? {}) },
        decisionMakerId,
        exitMethod,
        voxPopuli: isVoxPopuliActive(state),
        nominationVoteCounts: isVoxPopuliActive(state)
          ? { ...(state.voxPopuli?.nominationVoteCounts ?? {}) }
          : undefined,
        publicVotePercentages: isVoxPopuliActive(state)
          ? { ...(state.voxPopuli?.publicVotePercentages ?? {}) }
          : undefined,
        automaticNomineeId: isVoxPopuliActive(state)
          ? (state.voxPopuli?.autoNomineeId ?? state.lastHohCompFinisherId ?? null)
          : undefined,
      },
      timestamp: Date.now(),
    },
  ]
}

/**
 * Stamp the explicit season placement for a player at the moment they leave
 * the house. This gives finale recap / archive views a reliable ordering
 * source instead of inferring placement from the current array order.
 * Also records the game week at eviction time so buildSummaries can derive
 * how long each player survived (weeksAlive).
 */
function assignSeasonPlacementOnExit(state: GameState, playerId: string) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return

  archiveSeasonExitContext(state, playerId)

  // Always stamp the eviction week (even for Battle Back returnees evicted a
  // second time — their evictedAtWeek is cleared in completeBattleBack so this
  // captures the second eviction's actual week).
  player.evictedAtWeek = state.week

  // Only assign seasonPlacement once; a player who won a Battle Back and was
  // later evicted a second time keeps their original placement order.
  if (typeof player.seasonPlacement === 'number') return

  // Count houseguests still in the game at the moment the player leaves.
  // Callers invoke this *before* mutating the player's status, so the exiting
  // player is included in the count: 6 alive → evicted player finishes 6th.
  const aliveCount = state.players.filter(
    (p) => p.status !== 'evicted' && p.status !== 'jury'
  ).length
  player.seasonPlacement = aliveCount
}

/**
 * Guarantee that `player.stats` is initialised and return it.
 * All callers that need to write to `player.stats` should go through this
 * helper to avoid duplicating the default-object creation inline.
 */
function ensurePlayerStats(player: Player): NonNullable<Player['stats']> {
  if (!player.stats) player.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
  return player.stats
}

/**
 * Increment timesNominated for a player by ID.
 * Initializes stats if not already present.
 */
function incrementTimesNominated(state: GameState, playerId: string) {
  const p = state.players.find((pl) => pl.id === playerId)
  if (p) {
    ensurePlayerStats(p).timesNominated += 1
  }
}

type CompetitionSeasonUpdatePayload = Omit<CompetitionSeasonUpdateInput, 'playerIds'>
type ApplyMinigameWinnerPayload = {
  winnerId: string
  participants?: string[]
  scores?: Record<string, number>
  includePlacementBonuses?: boolean
  skipSeasonUpdate?: boolean
  /**
   * Explicitly identify the last-place finisher for this LOH competition.
   * When provided (and valid), this takes precedence over score-based derivation
   * and the arbitrary nonWinners[0] fallback, ensuring the nomination auto-nominee
   * matches the result shown on the competition scoreboard.
   *
   * For last-player-standing comps, pass the first-eliminated player.
   * For scored comps, pass the lowest-scoring player.
   */
  lastPlaceId?: string | null
  /**
   * Competition type for the LOH comp. Stored in state.lastHohCompFinisherType and
   * used to pick the compact disabled-option label in the nomination UI:
   *   'scored'   → "Lowest Score"
   *   'survival' → "First out"
   * When omitted, defaults to 'scored' when scores are provided; when no scores
   * are provided, the stored value will be null and the UI may apply its own default.
   */
  lastPlaceType?: 'scored' | 'survival'
}

function applyCompetitionSeasonUpdateToState(
  state: GameState,
  payload: CompetitionSeasonUpdatePayload
) {
  const playerIds = state.players.map((player) => player.id)
  state.competitionSeasonStateByPlayerId = updateCompetitionSeasonStateByPlayerId(
    state.competitionSeasonStateByPlayerId,
    { playerIds, ...payload }
  )
}

function getAlivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
}

function isPlayerActiveInHouse(state: GameState, playerId: string): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId)
  return Boolean(player && player.status !== 'evicted' && player.status !== 'jury')
}

function isTwinShockActivePair(state: GameState): boolean {
  return (
    state.twinShockResolution === 'mission_success' &&
    isPlayerActiveInHouse(state, TWIN_SHOCK_LIA_ID) &&
    isPlayerActiveInHouse(state, TWIN_SHOCK_ALI_ID)
  )
}

function isTwinAlliancePair(
  state: GameState,
  firstId: string | null | undefined,
  secondId: string | null | undefined
): boolean {
  if (!firstId || !secondId || firstId === secondId || !isTwinShockActivePair(state)) return false
  return (
    (firstId === TWIN_SHOCK_LIA_ID && secondId === TWIN_SHOCK_ALI_ID) ||
    (firstId === TWIN_SHOCK_ALI_ID && secondId === TWIN_SHOCK_LIA_ID)
  )
}

function canPlayerTargetPlayer(
  state: GameState,
  actorId: string | null | undefined,
  targetId: string
): boolean {
  return !isTwinAlliancePair(state, actorId, targetId) && !isSameCupidPair(state, actorId, targetId)
}

function usesPluralPlayerGrammar(
  player: (Pick<Player, 'name'> & Partial<Pick<Player, 'twinMode'>>) | null | undefined
): boolean {
  if (!player) return false
  return player.twinMode === 'combined' || player.name.includes('&')
}

function getPlayerBeVerb(
  player: (Pick<Player, 'name'> & Partial<Pick<Player, 'twinMode'>>) | null | undefined,
  singular: string,
  plural: string
): string {
  return usesPluralPlayerGrammar(player) ? plural : singular
}

function getPlayerReflexive(
  player: (Pick<Player, 'name'> & Partial<Pick<Player, 'twinMode'>>) | null | undefined
): string {
  return usesPluralPlayerGrammar(player) ? 'themselves' : 'themself'
}

function getTwinNomineeToSave(
  state: GameState,
  holderId: string | null | undefined,
  nominees?: Player[]
): Player | null {
  if (!holderId || !isTwinShockActivePair(state)) return null
  const nomineePool =
    nominees ?? state.players.filter((player) => state.nomineeIds.includes(player.id))
  return nomineePool.find((nominee) => isTwinAlliancePair(state, holderId, nominee.id)) ?? null
}

function pickSafetySaveTarget(
  state: GameState,
  holderId: string | null | undefined,
  nominees: Player[],
  rng: () => number
): Player | null {
  const twin = getTwinNomineeToSave(state, holderId, nominees)
  if (twin) return twin
  if (!holderId || nominees.length === 0) return null
  const scored = nominees.map((nominee) => ({
    nominee,
    score: getSafetyRelationshipScore(state, holderId, nominee),
  }))
  const bestScore = Math.max(...scored.map((entry) => entry.score))
  return seededPick(
    rng,
    scored.filter((entry) => entry.score === bestScore).map((entry) => entry.nominee)
  )
}

function shouldUseSafetyForTwin(
  state: GameState,
  holderId: string | null | undefined,
  nominees: Player[]
): boolean {
  return getTwinNomineeToSave(state, holderId, nominees) !== null
}

function getHumanPlayer(state: GameState): Player | undefined {
  return state.players.find((player) => player.isUser)
}

function canHumanReceiveTwinShockConfessional(state: GameState): boolean {
  const human = getHumanPlayer(state)
  return Boolean(human && human.status !== 'evicted' && human.status !== 'jury')
}

function queueTwinShockConfessional(
  state: GameState,
  stage: NonNullable<GameState['twinShock']>['promptStage']
) {
  const twinShock = state.twinShock ?? createInitialTwinShockState()
  twinShock.promptStage = stage
  twinShock.queuedDay = state.week
  twinShock.retryCount = 0
  if (stage === 'day4_initial') {
    twinShock.status = 'day4_pending'
    state.twinShockConsumed = true
    state.twinShockActivatedSeason = state.season
    state.liaForcedUntilTwinShockResolved = true
  }
  state.twinShock = twinShock
  state.twistActivatedThisWeek = true
  pushEvent(state, 'The Big Eye wants you in the Confessional.', 'diary', {
    major: 'twin_shock_confessional',
  })
}

function shouldQueueTwinShockBeforeDayEnd(state: GameState): boolean {
  if (isCupidArrowActive(state)) return false
  if (!canHumanReceiveTwinShockConfessional(state)) return false
  const twinShock = state.twinShock ?? createInitialTwinShockState()
  const forcedTwinShock =
    state.pendingForcedShock?.type === 'twinShock' &&
    state.week >= state.pendingForcedShock.earliestWeek &&
    twinShock.promptStage === null

  if (
    forcedTwinShock &&
    twinShock.status !== 'resolved_discovered' &&
    twinShock.status !== 'resolved_mission_success'
  ) {
    if (!isPlayerActiveInHouse(state, TWIN_SHOCK_LIA_ID)) {
      state.pendingForcedShock = null
      return false
    }
    queueTwinShockConfessional(state, 'day4_initial')
    state.pendingForcedShock = null
    return true
  }

  if (
    !state.twinShockConsumed &&
    twinShock.status === 'inactive' &&
    state.week === 4 &&
    isPlayerActiveInHouse(state, TWIN_SHOCK_LIA_ID)
  ) {
    queueTwinShockConfessional(state, 'day4_initial')
    return true
  }

  if (
    state.week === (twinShock.queuedDay ?? 4) + 1 &&
    twinShock.status === 'day4_asked_no_correct_guess' &&
    twinShock.promptStage === null
  ) {
    queueTwinShockConfessional(
      state,
      isPlayerActiveInHouse(state, TWIN_SHOCK_LIA_ID) ? 'day5_final' : 'secret_lost'
    )
    return true
  }

  return false
}

function pushTwinShockAnnouncement(state: GameState, text: string, major: string) {
  pushEvent(state, text, 'twist', { major })
}

function ensureCompetitionStateForPlayer(state: GameState, playerId: string) {
  if (!state.competitionSeasonStateByPlayerId) state.competitionSeasonStateByPlayerId = {}
  if (!state.competitionSeasonStateByPlayerId[playerId]) {
    state.competitionSeasonStateByPlayerId[playerId] = getDefaultCompetitionSeasonState()
  }
}

function applyTwinShockFlipHint(state: GameState) {
  const lia = state.players.find((player) => player.id === TWIN_SHOCK_LIA_ID)
  if (!lia || lia.twinMode === 'combined') return
  lia.avatar = TWIN_SHOCK_LIA_FLIP_AVATAR
}

function resolveTwinShockDiscovered(state: GameState) {
  const lia = state.players.find((player) => player.id === TWIN_SHOCK_LIA_ID)
  const humanName = getHumanPlayer(state)?.name ?? 'The player'
  const fromName = lia?.name ?? 'Lia'
  const fromAvatar = lia ? resolveAvatar(lia) : TWIN_SHOCK_LIA_AVATAR
  if (lia) {
    lia.name = 'Lia & Ali'
    lia.avatar = TWIN_SHOCK_COMBINED_AVATAR
    lia.twinMode = 'combined'
    if (lia.status === 'evicted' || lia.status === 'jury') lia.status = 'active'
  }
  state.twinShockConsumed = true
  state.twinShockResolution = 'discovered'
  state.twinShockResolvedDay = state.week
  state.twinShockDiscoveredByUser = true
  state.liaForcedUntilTwinShockResolved = false
  if (state.twinShock) {
    state.twinShock.status = 'resolved_discovered'
    state.twinShock.promptStage = null
    state.twinShock.queuedDay = null
    state.twinShock.retryCount = 0
    state.twinShock.pendingRevealAnimation = {
      type: 'combined',
      playerId: TWIN_SHOCK_LIA_ID,
      fromName,
      fromAvatar,
      toName: 'Lia & Ali',
      toAvatar: TWIN_SHOCK_COMBINED_AVATAR,
    }
  }
  pushTwinShockAnnouncement(
    state,
    `TWIN SHOCK! ${humanName} exposed that Lia had a twin. Lia has been secretly switching places with her twin sister, Ali. What a shock! Welcome Ali to the House. From now on, Lia & Ali will play as one contestant.`,
    'twin_shock_discovered'
  )
}

function resolveTwinShockMissionSuccess(state: GameState) {
  const lia = state.players.find((player) => player.id === TWIN_SHOCK_LIA_ID)
  const replacement =
    state.players
      .filter(
        (player) =>
          !player.isUser &&
          player.id !== TWIN_SHOCK_LIA_ID &&
          player.id !== TWIN_SHOCK_ALI_ID &&
          (player.status === 'evicted' || player.status === 'jury')
      )
      .sort((a, b) => {
        const placementDiff = (b.seasonPlacement ?? -1) - (a.seasonPlacement ?? -1)
        if (placementDiff !== 0) return placementDiff
        return (
          (a.evictedAtWeek ?? Number.MAX_SAFE_INTEGER) -
          (b.evictedAtWeek ?? Number.MAX_SAFE_INTEGER)
        )
      })[0] ?? null
  const replacedPlayerId = replacement?.id ?? TWIN_SHOCK_ALI_ID
  const replacedPlayerName = replacement?.name ?? 'an empty house slot'
  const replacedPlayerAvatar = replacement ? resolveAvatar(replacement) : TWIN_SHOCK_ALI_AVATAR

  if (lia) {
    lia.name = 'Lia'
    lia.avatar = TWIN_SHOCK_LIA_AVATAR
    delete lia.twinMode
  }

  if (replacement) {
    replacement.id = TWIN_SHOCK_ALI_ID
    replacement.name = 'Ali'
    replacement.avatar = TWIN_SHOCK_ALI_AVATAR
    replacement.status = 'active'
    replacement.lateEntrant = true
    replacement.evictedAtWeek = undefined
    replacement.seasonPlacement = undefined
    replacement.finalRank = undefined
    replacement.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
  } else if (!state.players.some((player) => player.id === TWIN_SHOCK_ALI_ID)) {
    state.players.push({
      id: TWIN_SHOCK_ALI_ID,
      name: 'Ali',
      avatar: TWIN_SHOCK_ALI_AVATAR,
      status: 'active',
      lateEntrant: true,
      stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
    })
  }
  ensureCompetitionStateForPlayer(state, TWIN_SHOCK_ALI_ID)
  state.twinShockConsumed = true
  state.twinShockResolution = 'mission_success'
  state.twinShockResolvedDay = state.week
  state.twinShockDiscoveredByUser = false
  state.liaForcedUntilTwinShockResolved = false
  if (state.twinShock) {
    state.twinShock.status = 'resolved_mission_success'
    state.twinShock.promptStage = null
    state.twinShock.queuedDay = null
    state.twinShock.retryCount = 0
    state.twinShock.pendingRevealAnimation = {
      type: 'ali_enters',
      replacedPlayerId,
      replacedPlayerName,
      replacedPlayerAvatar,
      incomingPlayerId: TWIN_SHOCK_ALI_ID,
      incomingName: 'Ali',
      incomingAvatar: TWIN_SHOCK_ALI_AVATAR,
    }
  }
  pushTwinShockAnnouncement(
    state,
    replacement
      ? `TWIN SHOCK REVEALED! Lia has been secretly switching places with her twin sister, Ali, all along. Because the secret mission was successful, Ali takes over ${replacedPlayerName}'s empty spot as a full contestant. Welcome Ali to the House!`
      : 'TWIN SHOCK REVEALED! Lia has been secretly switching places with her twin sister, Ali, all along. Because the secret mission was successful, Ali has earned her place as a full contestant. Welcome Ali to the House!',
    'twin_shock_mission_success'
  )
  if (lia) {
    pushEvent(state, 'Lia and Ali share a powerful bond after the reveal.', 'social', {
      major: 'twin_shock_bond',
    })
  }
}

function resolveTwinShockSecretLost(state: GameState) {
  state.twinShockConsumed = true
  state.twinShockResolution = 'secret_lost'
  state.twinShockResolvedDay = state.week
  state.twinShockDiscoveredByUser = false
  state.liaForcedUntilTwinShockResolved = false
  if (state.twinShock) {
    state.twinShock.status = 'resolved_secret_lost'
    state.twinShock.promptStage = null
    state.twinShock.queuedDay = null
    state.twinShock.retryCount = 0
    state.twinShock.pendingRevealAnimation = null
  }
  state.history = [
    ...(state.history ?? []),
    {
      type: 'twinShock',
      week: state.week,
      data: { resolution: 'secret_lost' },
      timestamp: Date.now(),
    },
  ]
}

function applyTwinShockTurnResult(state: GameState, result: TwinShockTurnResult) {
  const previousQueuedDay = state.twinShock?.queuedDay ?? null
  const twinShock = state.twinShock ?? createInitialTwinShockState()
  twinShock.status = result.status
  twinShock.promptStage = result.promptStage
  twinShock.retryCount = result.retryCount
  if (result.promptStage === null && result.status !== 'day4_asked_no_correct_guess') {
    twinShock.queuedDay = null
  } else if (result.status === 'day4_asked_no_correct_guess' && previousQueuedDay !== null) {
    twinShock.queuedDay = previousQueuedDay
  }
  state.twinShock = twinShock

  if (result.status === 'day4_asked_no_correct_guess' && result.promptStage === null) {
    applyTwinShockFlipHint(state)
  }

  if (result.resolution === 'resolved_discovered') resolveTwinShockDiscovered(state)
  if (result.resolution === 'resolved_mission_success') resolveTwinShockMissionSuccess(state)
  if (result.resolution === 'resolved_secret_lost') resolveTwinShockSecretLost(state)
}

function maybePushTwinShockClue(state: GameState) {
  if (state.twinShockConsumed || !isPlayerActiveInHouse(state, TWIN_SHOCK_LIA_ID)) return
  if (state.week < 2 || state.week > 4) return
  const twinShock = state.twinShock ?? createInitialTwinShockState()
  if (twinShock.cluesShownDays.includes(state.week) || twinShock.cluesShownDays.length >= 2) return

  const clues = [
    'Lia seemed unusually quiet this morning, then suddenly full of energy by lunch.',
    'Lia laughed at a joke she claimed not to understand yesterday.',
    'Someone mentioned that Lia looked different in the garden, but nobody pushed it further.',
    'Lia forgot a conversation she had only a day ago.',
  ]
  const clue = clues[(state.week + twinShock.cluesShownDays.length) % clues.length]
  twinShock.cluesShownDays = [...twinShock.cluesShownDays, state.week]
  state.twinShock = twinShock
  pushEvent(state, clue, 'social', { major: 'twin_shock_clue' })
}

function resolveCompetitionParticipants(state: GameState): string[] {
  const alive = getAlivePlayers(state)
  const aliveIds = alive.map((p) => p.id)
  if (state.phase === 'loh_comp' && state.prevHohId && !isVoxPopuliActive(state)) {
    const outgoingLohIds = new Set(getCupidRoleIds(state, state.prevHohId))
    const eligible = alive.filter((p) => !outgoingLohIds.has(p.id))
    if (eligible.length > 0) {
      return eligible.map((p) => p.id)
    }
    // Edge case: only the outgoing LOH remains alive; allow them for updates.
    return aliveIds
  }
  return aliveIds
}

function buildFallbackScores(participants: string[], winnerId: string): Record<string, number> {
  // Assumes winnerId is one of the participants; otherwise all scores stay at 0.
  return Object.fromEntries(participants.map((id) => [id, id === winnerId ? 1 : 0]))
}

/**
 * Mark a player as the Final LOH winner (Part 3 of Final 3).
 * Sets the wonFinalHoh flag on their stats so it can be archived.
 */
function markFinalHohWinner(state: GameState, winnerId: string) {
  const p = state.players.find((pl) => pl.id === winnerId)
  if (p) {
    if (!p.stats) p.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
    p.stats.wonFinalHoh = true
  }
}

/**
 * Apply an LOH winner to state.  Used by both advance() and completeMinigame().
 */
function applyLohWinner(state: GameState, winnerId: string, source?: string) {
  if (import.meta.env.DEV) {
    console.log('[applyLohWinner]', {
      source: source ?? 'unknown',
      previousHohId: state.lohId,
      nextHohId: winnerId,
      currentPhase: state.phase,
    })
  }
  const voxPopuliActive = isVoxPopuliActive(state)
  const voxFinalFour = voxPopuliActive && getAlivePlayers(state).length === 4
  state.lohId = winnerId
  if (voxPopuliActive && state.voxPopuli) {
    state.voxPopuli.immunityWinnerId = voxFinalFour ? null : winnerId
  }
  const lohIds = new Set(getCupidRoleIds(state, winnerId))
  state.players.forEach((p) => {
    if (lohIds.has(p.id)) p.status = voxFinalFour ? 'active' : 'loh'
    else if (p.status === 'loh') p.status = 'active'
  })
  const winner = state.players.find((p) => p.id === winnerId)
  if (winner) {
    if (!winner.stats) winner.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
    winner.stats.lohWins += 1
  }
  const partnerId = getCupidPartnerId(state, winnerId)
  const partner = state.players.find((player) => player.id === partnerId)
  if (voxPopuliActive) {
    const finalFour = voxFinalFour
    pushEvent(
      state,
      finalFour
        ? `${winner?.name ?? winnerId} wins the Final 4 competition, but there is no immunity today. Last place will begin on the block, and the other three housemates will each cast one secret nomination vote.`
        : `${winner?.name ?? winnerId} won today's competition and is immune from nomination and the audience vote.`,
      'game',
      finalFour
        ? {
            major: 'vox_final4_immunity_comp',
            broadcastPriority: 'critical',
            announcementTitle: `${winner?.name ?? winnerId} Wins the Final 4 Competition`,
            announcementSubtitle:
              'There is no immunity today. Last place begins on the block, and the other three housemates will each cast one secret vote.',
          }
        : undefined
    )
    return
  }
  pushEvent(
    state,
    partner
      ? `${winner?.name ?? winnerId} won Leader of the House, making ${partner.name} co-LOH under Cupid's Arrow! 👑💘`
      : `${winner?.name ?? winnerId} has won Leader of the House! 👑`,
    'game',
    {
      phase: 'loh_results',
      broadcastTemplateId: partner ? 'loh.cupid-winners' : 'loh.winner',
    }
  )
}

function announceVoxLastPlaceNominee(state: GameState): void {
  if (!isVoxPopuliActive(state) || !state.voxPopuli || !state.lastHohCompFinisherId) {
    return
  }
  state.voxPopuli.autoNomineeId = state.lastHohCompFinisherId
  const lastPlaceName =
    state.players.find((player) => player.id === state.lastHohCompFinisherId)?.name ??
    state.lastHohCompFinisherId
  pushEvent(
    state,
    `${lastPlaceName} finished in last place in the immunity competition and is now on the block for today's audience vote.`,
    'game',
    {
      broadcastTemplateId: 'loh.vox-last-place',
      playerId: state.lastHohCompFinisherId,
    }
  )
}

/**
 * Apply a POS winner to state.  Handles Final-4 bypass logic.
 * Returns the resolved next phase ('pos_results' or 'final4_eviction').
 */
function applyPosWinner(state: GameState, winnerId: string, alive: Player[]): Phase {
  state.posWinnerId = winnerId
  const posIds = new Set(getCupidRoleIds(state, winnerId))
  const p = state.players.find((pl) => pl.id === winnerId)
  state.players.forEach((player) => {
    if (!posIds.has(player.id)) return
    if (player.status === 'loh') player.status = 'loh+pos'
    else if (player.status === 'nominated') player.status = 'nominated+pos'
    else player.status = 'pos'
  })
  if (p) {
    if (!p.stats) p.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
    p.stats.posWins += 1
  }
  const partnerId = getCupidPartnerId(state, winnerId)
  const partner = state.players.find((player) => player.id === partnerId)
  if (partnerId) addPovProtectedId(state, partnerId)
  pushEvent(
    state,
    partner
      ? `${p?.name ?? winnerId} won the Power of Safety. ${partner.name} also receives the immunity badge and cannot be named as a replacement! 🎭💘`
      : `${p?.name ?? winnerId} has won the Power of Safety! 🎭`,
    'game'
  )

  // ── Final 4 bypass (skip ceremony; POS holder has sole eviction vote) ──
  // This rule always applies at Final 4 regardless of any config flags.
  if (alive.length === 4 && !isVoxPopuliActive(state)) {
    let f4Nominees = alive.filter((pl) => pl.id !== state.lohId && pl.id !== state.posWinnerId)
    // Edge case: LOH wins POS → same ID excluded twice, leaving 3 candidates.
    // Fall back to the original nominees from the nominations phase.
    if (f4Nominees.length !== 2 && state.nomineeIds.length === 2) {
      f4Nominees = alive.filter((pl) => state.nomineeIds.includes(pl.id))
    }
    if (f4Nominees.length === 2) {
      const f4Names = f4Nominees.map((pl) => pl.name).join(' and ')
      state.nomineeIds = f4Nominees.map((pl) => pl.id)
      f4Nominees.forEach((pl) => {
        const fp = state.players.find((x) => x.id === pl.id)
        if (fp) {
          if (fp.status === 'pos' || fp.status === 'loh+pos') {
            fp.status = 'nominated+pos'
          } else if (fp.status !== 'nominated' && fp.status !== 'nominated+pos') {
            fp.status = 'nominated'
          }
        }
      })
      pushEvent(
        state,
        `Final 4! ${f4Names} are nominated. The POS holder has the sole vote to eliminate. 🏆`,
        'game'
      )
      return 'final4_eviction'
    } else {
      pushEvent(
        state,
        `[Warning] Final 4 bypass skipped — unexpected eligible nominee count (${f4Nominees.length}).`,
        'game'
      )
    }
  }
  return 'pos_results'
}

/** Remove the temporary Safety role badge once its ceremony is complete. */
function clearExpiredSafetyStatuses(state: GameState) {
  state.players.forEach((player) => {
    if (player.status === 'pos') player.status = 'active'
    else if (player.status === 'loh+pos') player.status = 'loh'
    else if (player.status === 'nominated+pos') {
      player.status = state.nomineeIds.includes(player.id) ? 'nominated' : 'active'
    }
  })
}

/** Clear nomination and Safety state as soon as the eviction cycle is resolved. */
function clearResolvedEvictionRoles(state: GameState) {
  state.players.forEach((player) => {
    if (
      player.status === 'nominated' ||
      player.status === 'pos' ||
      player.status === 'nominated+pos'
    ) {
      player.status = 'active'
    } else if (player.status === 'loh+pos') {
      player.status = 'loh'
    }
  })
  state.nomineeIds = []
  state.posWinnerId = null
  state.povSavedId = null
  state.povProtectedIds = []
}

/**
 * Pick the winner from a set of participants and their scores.
 * Returns the participant ID with the highest score.
 *
 * Ties are broken deterministically using an FNV-1a hash of the sorted tied
 * IDs + high score, so equal tap counts never bias toward earlier IDs.
 *
 * Guard: participants with score <= 0 are excluded from winning unless all
 * participants have score <= 0 (fallback to the full list).
 */
function determineWinner(participants: string[], scores: Record<string, number>): string {
  if (participants.length === 0) {
    throw new Error('determineWinner called with no participants')
  }

  // Prefer participants with a positive score; fall back to all if none qualify.
  const positivePool = participants.filter((id) => (scores[id] ?? 0) > 0)
  const pool = positivePool.length > 0 ? positivePool : participants

  // Find the highest score within the eligible pool.
  let highScore = -1
  for (const id of pool) {
    const score = scores[id] ?? 0
    if (score > highScore) highScore = score
  }

  // Collect all pool participants that share the top score.
  const topIds = pool.filter((id) => (scores[id] ?? 0) === highScore)

  // Single winner — return directly.
  if (topIds.length === 1) return topIds[0]

  // Tie-break deterministically: hash sorted IDs + high score via FNV-1a.
  const tieKey = `${[...topIds].sort().join('|')}:${highScore}`
  let hash = 0x811c9dc5 >>> 0 // FNV-1a 32-bit offset basis
  for (let i = 0; i < tieKey.length; i++) {
    hash ^= tieKey.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0 // FNV-1a 32-bit prime
  }
  const rng = mulberry32(hash >>> 0)
  return topIds[Math.floor(rng() * topIds.length)]
}

/**
 * FNV-1a 32-bit hash for a string.
 * Used to derive independent, deterministic per-voter RNG seeds from a
 * voter's string ID, ensuring each AI voter produces a stable and distinct
 * vote without needing a separate stored seed.
 */
function hashString(s: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * Relationship-aware AI voting logic. Allies are normally protected, while
 * threat, explicit targets, betrayal history, and rare backstabs can override.
 *
 * @param voterId     ID of the AI voter casting their vote
 * @param nomineeIds  IDs of eligible nominees (must have ≥1 entry)
 * @param gameSeed    Current game seed (keeps results varied across weeks)
 * @returns           The nominee ID that this AI voter chooses to evict
 */
export function chooseAiEvictionVote(
  state: GameState,
  voterId: string,
  nomineeIds: string[],
  gameSeed: number
): string {
  if (nomineeIds.length <= 1) return nomineeIds[0]

  const scored = nomineeIds.map((nomineeId) => {
    const nominee = state.players.find((player) => player.id === nomineeId)
    const relationship = getStrategicRelationship(state, voterId, nomineeId)
    const tags = new Set(relationship?.tags ?? [])
    const affinity = relationship?.affinity ?? 0
    const threat = nominee ? getAiThreatScore(state, nominee) : 0
    const rng = mulberry32(
      (gameSeed ^ hashString(`vote:${state.week}:${voterId}:${nomineeId}`)) >>> 0
    )

    let score =
      threat * 8 - affinity + rng() * 4 - getEarlyHumanGrace(state, nominee, affinity, tags) * 1.35
    if (tags.has('target')) score += 25
    if (tags.has('betrayal')) score += 35
    if (tags.has('protection') || tags.has('shield')) score -= 20
    if (tags.has('alliance')) {
      const backstabChance = Math.min(0.22, 0.05 + threat * 0.015)
      if (rng() < backstabChance) score += 95
      else score -= 90
    }

    return { nomineeId, score }
  })

  scored.sort((a, b) => b.score - a.score || a.nomineeId.localeCompare(b.nomineeId))
  return scored[0].nomineeId
}

function chooseCupidPairEvictionVote(
  state: GameState,
  voterIds: string[],
  nomineeIds: string[],
  gameSeed: number
): string {
  const candidatePlayers = collapseCupidCandidates(
    state,
    nomineeIds
      .map((id) => state.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player))
  )
  const candidateIds = candidatePlayers.map((player) => player.id)
  const effectiveCandidateIds = candidateIds.length > 0 ? candidateIds : nomineeIds
  const preferences = voterIds.map((voterId) =>
    chooseAiEvictionVote(state, voterId, effectiveCandidateIds, gameSeed)
  )
  const preferredPairIds = preferences.map(
    (targetId) => getCupidPair(state, targetId)?.id ?? `solo:${targetId}`
  )
  if (preferredPairIds.every((pairId) => pairId === preferredPairIds[0])) return preferences[0]

  const consensusRng = mulberry32(
    (gameSeed ^
      hashString(
        `pair-vote:${state.week}:${[...voterIds].sort().join('|')}:${preferences.join('|')}`
      )) >>>
      0
  )
  return preferences[Math.floor(consensusRng() * preferences.length)]
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setPhase(state, action: PayloadAction<Phase>) {
      state.phase = action.payload
    },
    advanceWeek(state) {
      state.week += 1
      state.phase = 'week_start'
    },
    updatePlayer(state, action: PayloadAction<Player>) {
      const idx = state.players.findIndex((p) => p.id === action.payload.id)
      if (idx !== -1) state.players[idx] = action.payload
    },
    syncStrategicRelationships(
      state,
      action: PayloadAction<NonNullable<GameState['strategicRelationships']>>
    ) {
      state.strategicRelationships = action.payload
    },
    setDramaSocialMode(state, action: PayloadAction<boolean>) {
      state.dramaSocialMode = action.payload
    },
    setLohSocialPlan(state, action: PayloadAction<NonNullable<GameState['lohSocialPlan']>>) {
      state.lohSocialPlan = action.payload
    },
    setLohSafetyAdvice(state, action: PayloadAction<NonNullable<GameState['lohSafetyAdvice']>>) {
      state.lohSafetyAdvice = action.payload
    },
    addTvEvent(state, action: PayloadAction<Omit<TvEvent, 'id' | 'timestamp'>>) {
      const event = pushEvent(state, action.payload.text, action.payload.type, {
        ...(action.payload.meta ?? {}),
        ...(action.payload.major ? { major: action.payload.major } : {}),
      })
      if (event) {
        event.channels = action.payload.channels
        event.source = action.payload.source
      }
    },
    /** Update one existing broadcast without replacing its identity or position in the timeline. */
    updateTvEvent(
      state,
      action: PayloadAction<{
        id: string
        text: string
        type: TvEvent['type']
        major?: string | null
        broadcastPriority?: 'critical' | null
        phase?: Phase
        forceOnTv?: boolean
        announcementTitle?: string
      }>
    ) {
      const event = state.tvFeed.find((entry) => entry.id === action.payload.id)
      if (!event) return

      event.text = action.payload.text
      event.type = action.payload.type
      const meta = { ...(event.meta ?? {}) }
      if (action.payload.phase) meta.phase = action.payload.phase

      if (action.payload.major) {
        event.major = action.payload.major
        meta.major = action.payload.major
      } else {
        delete event.major
        delete meta.major
      }

      if (action.payload.broadcastPriority === 'critical') {
        meta.broadcastPriority = 'critical'
      } else {
        delete meta.broadcastPriority
      }
      meta.broadcastLevel =
        action.payload.broadcastPriority === 'critical'
          ? 'critical'
          : action.payload.major
            ? 'major'
            : 'minor'
      meta.broadcastManaged = true
      if (action.payload.forceOnTv) {
        meta.forceOnTv = true
      } else {
        delete meta.forceOnTv
      }
      if (meta.broadcastLevel !== 'minor') {
        meta.announcementSubtitle = action.payload.text
        if (action.payload.announcementTitle)
          meta.announcementTitle = action.payload.announcementTitle
      } else {
        delete meta.announcementTitle
        delete meta.announcementSubtitle
      }
      event.meta = meta
      enqueueManagedBroadcast(state, event)
    },
    /** Remove one broadcast event from the current run. */
    removeTvEvent(state, action: PayloadAction<string>) {
      state.tvFeed = state.tvFeed.filter((event) => event.id !== action.payload)
      state.broadcastQueue = (state.broadcastQueue ?? []).filter((id) => id !== action.payload)
      if (state.lastPlainBroadcastEventId === action.payload) {
        state.lastPlainBroadcastEventId = null
      }
    },
    /** Change the source definition used by future Play-driven broadcasts. */
    setBroadcastOverride(state, action: PayloadAction<{ id: string; changes: BroadcastOverride }>) {
      state.broadcastOverrides ??= {}
      state.broadcastOverrides[action.payload.id] = {
        ...(state.broadcastOverrides[action.payload.id] ?? {}),
        ...action.payload.changes,
      }
      state.tvFeed.forEach((event) => {
        const isLegacyVoxIntro =
          action.payload.id === 'season.vox-populi-intro' &&
          event.meta?.phase === 'season_start' &&
          (event.meta?.major ?? event.major) === 'vox_populi'
        if (event.meta?.broadcastTemplateId === action.payload.id || isLegacyVoxIntro) {
          refreshManagedBroadcastDefinition(state, event)
        }
      })
      rebuildManagedBroadcastQueue(state, state.phase)
    },
    /** Restore a built-in message to its source copy and classification. */
    resetBroadcastOverride(state, action: PayloadAction<string>) {
      if (!state.broadcastOverrides) return
      delete state.broadcastOverrides[action.payload]
      state.tvFeed.forEach((event) => {
        if (event.meta?.broadcastTemplateId === action.payload) {
          refreshManagedBroadcastDefinition(state, event)
        }
      })
      rebuildManagedBroadcastQueue(state, state.phase)
    },
    /**
     * Apply authoring changes saved by another browser tab. The storage event
     * is the bridge between a manager tab and a running game tab; rebuilding
     * here makes those changes effective without restarting the season.
     */
    replaceBroadcastConfig(
      state,
      action: PayloadAction<{
        overrides: Record<string, BroadcastOverride>
        customMessages: CustomBroadcastMessage[]
      }>
    ) {
      state.broadcastOverrides = action.payload.overrides
      state.customBroadcasts = action.payload.customMessages
      beginPhaseBroadcastSequence(state, state.phase)
      finishPhaseBroadcastSequence(state)
      for (const event of state.tvFeed) {
        if (event.meta?.phase === state.phase && event.meta?.week === state.week) {
          refreshManagedBroadcastDefinition(state, event)
        }
      }
      rebuildManagedBroadcastQueue(state, state.phase)
    },
    /**
     * Materialize and order every manager-controlled broadcast for the active
     * phase. TvZone calls this on mount/phase entry so special phases and
     * messages authored while the manager was open use the same runtime queue.
     */
    syncPhaseBroadcasts(state, action: PayloadAction<{ phase: Phase; cardMajor?: string | null }>) {
      if (state.phase !== action.payload.phase) return
      beginPhaseBroadcastSequence(state, action.payload.phase)
      const cardMajor = action.payload.cardMajor ?? null
      const activeCardTemplate = cardMajor
        ? getPhaseCardTemplate(action.payload.phase, cardMajor)
        : undefined

      // A phase can change its branch without changing the phase name (for
      // example, the ordinary LOH card becoming Democracia). Keep the old
      // card in history, but never leave it eligible in the live queue beside
      // the newly selected card.
      for (const event of state.tvFeed) {
        if (event.meta?.phase !== action.payload.phase || event.meta?.week !== state.week) continue
        const templateId = event.meta?.broadcastTemplateId
        const template =
          typeof templateId === 'string' ? getBroadcastTemplate(templateId) : undefined
        if (template?.kind === 'phase_card' && template.id !== activeCardTemplate?.id) {
          event.meta = { ...(event.meta ?? {}), broadcastConsumed: true }
        }
      }

      if (cardMajor) {
        const template = activeCardTemplate
        if (template) {
          pushEvent(state, template.text, template.type, {
            phase: action.payload.phase,
            broadcastTemplateId: template.id,
            broadcastLevel: 'major',
            forceOnTv: true,
            major: template.major,
            announcementTitle: template.title,
            announcementSubtitle: template.text,
          })
        }
      }
      finishPhaseBroadcastSequence(state)

      for (const event of state.tvFeed) {
        if (event.meta?.phase === action.payload.phase && event.meta?.week === state.week) {
          refreshManagedBroadcastDefinition(state, event)
        }
      }

      rebuildManagedBroadcastQueue(state, action.payload.phase)
    },
    /** Consume exactly one faux-TV item; Play cannot advance while another remains. */
    consumeBroadcastEvent(state, action: PayloadAction<string>) {
      const event = state.tvFeed.find((candidate) => candidate.id === action.payload)
      if (event) {
        event.meta = { ...(event.meta ?? {}), broadcastConsumed: true }
        if (event.meta.broadcastLevel === 'minor') {
          state.lastPlainBroadcastEventId = event.id
        }
      }
      state.broadcastQueue = (state.broadcastQueue ?? []).filter((id) => id !== action.payload)
    },
    addCustomBroadcast(
      state,
      action: PayloadAction<Omit<CustomBroadcastMessage, 'id'> & { id?: string }>
    ) {
      state.customBroadcasts ??= []
      state.customBroadcasts.push({
        ...action.payload,
        id: action.payload.id ?? crypto.randomUUID(),
      })
    },
    updateCustomBroadcast(state, action: PayloadAction<CustomBroadcastMessage>) {
      state.customBroadcasts ??= []
      const index = state.customBroadcasts.findIndex((message) => message.id === action.payload.id)
      if (index !== -1) state.customBroadcasts[index] = action.payload
    },
    reorderCustomBroadcasts(state, action: PayloadAction<{ phase: Phase; orderedIds: string[] }>) {
      const orderById = new Map(
        action.payload.orderedIds.map((id, index) => [id, (index + 1) * 10])
      )
      for (const message of state.customBroadcasts ?? []) {
        if (message.phase !== action.payload.phase) continue
        const order = orderById.get(message.id)
        if (order != null) message.order = order
      }
    },
    reorderPhaseBroadcasts(
      state,
      action: PayloadAction<{
        phase: Phase
        items: Array<{ id: string; kind: 'source' | 'custom' }>
      }>
    ) {
      state.broadcastOverrides ??= {}
      action.payload.items.forEach((item, index) => {
        const order = (index + 1) * 100
        if (item.kind === 'custom') {
          const message = (state.customBroadcasts ?? []).find(
            (candidate) => candidate.id === item.id && candidate.phase === action.payload.phase
          )
          if (message) message.order = order
        } else {
          state.broadcastOverrides![item.id] = {
            ...(state.broadcastOverrides![item.id] ?? {}),
            order,
          }
        }
      })
    },
    removeCustomBroadcast(state, action: PayloadAction<string>) {
      state.customBroadcasts = (state.customBroadcasts ?? []).filter(
        (message) => message.id !== action.payload
      )
    },
    /** Persist a social phase summary to the Diary Room log (not the TV feed). */
    addSocialSummary(state, action: PayloadAction<{ summary: string; week: number }>) {
      // Route ONLY to the DR channel so the summary never appears in the main-screen
      // TVLog strip. isVisibleInMainLog() returns false for events with channels=['dr'].
      // source: 'manual' is required for isVisibleInDr() to return true.
      const now = Date.now()
      const event: TvEvent = {
        id: crypto.randomUUID(),
        text: `📊 Social Summary (Day ${action.payload.week}): ${action.payload.summary}`,
        type: 'diary',
        timestamp: now,
        channels: ['dr'],
        source: 'manual',
        meta: buildTvMeta(state, { week: action.payload.week }),
      }
      state.tvFeed = [event, ...state.tvFeed].slice(0, MAX_GAME_HISTORY_EVENTS)
    },
    setLive(state, action: PayloadAction<boolean>) {
      state.isLive = action.payload
    },

    /**
     * Set up a pending TapRace session with pre-computed AI scores.
     * Called by the startMinigame thunk; the GameScreen reacts by showing the
     * TapRace overlay.
     */
    launchMinigame(state, action: PayloadAction<MinigameSession>) {
      state.pendingMinigame = action.payload
    },

    /**
     * Record the human player's final tap score, compute all participant scores,
     * determine the winner, update personal records, and advance the phase.
     *
     * Called by the QuickTapRace component when the timer expires and the player
     * presses the "Done" / "Continue ▶" button.
     *
     * Accepts either a legacy numeric payload (backward-compat) or a rich
     * `CompleteMinigamePayload` with `humanScore` and optional canonical
     * `winnerId` / `lastPlaceId` values. When supplied, those IDs are used
     * directly rather than re-deriving from scores, ensuring the results UI
     * and the applied state transition read from the same authoritative data.
     */
    completeMinigame(state, action: PayloadAction<number | CompleteMinigamePayload>) {
      const session = state.pendingMinigame
      if (!session) return

      // Normalise legacy number payload → rich payload
      const payload: CompleteMinigamePayload =
        typeof action.payload === 'number' ? { humanScore: action.payload } : action.payload

      const humanPlayer = state.players.find((p) => p.isUser)

      if (import.meta.env.DEV) {
        console.log('[completeMinigame] received', {
          payload,
          sessionKey: session.key,
          sessionParticipants: session.participants,
          hybridResolveOnComplete: session.hybridResolveOnComplete,
          currentPhase: state.phase,
          precomputedAiScores: session.aiScores,
          humanPlayerId: humanPlayer?.id,
        })
      }

      let scores: Record<string, number>

      if (session.hybridResolveOnComplete) {
        // ── Hybrid resolver path (score-based games) ─────────────────────────
        // AI scores are computed NOW, after the human score is known.
        let resolvedAiScores: Record<string, number>

        if (session.key === 'snake') {
          // Snake uses the headless simulator so the authoritative Redux scores
          // match exactly what the SnakeGame UI displays.
          resolvedAiScores = {}
          for (const id of session.participants) {
            if (id === humanPlayer?.id) continue
            const p = state.players.find((pl) => pl.id === id)
            resolvedAiScores[id] = simulateSnakeAiScore({
              sessionSeed: session.seed,
              playerId: id,
              profile: p?.competitionProfile ?? getDefaultCompetitionProfile(),
            }).score
          }
        } else {
          // Generic hybrid resolver for all other score-based games.
          // This prevents precomputed scores from collapsing near a very low human score.
          const aiParticipants = session.participants
            .filter((id) => id !== humanPlayer?.id)
            .map((id) => {
              const p = state.players.find((pl) => pl.id === id)
              return { id, profile: p?.competitionProfile }
            })

          resolvedAiScores = resolveHybridAiScores({
            gameKey: session.key,
            humanScore: payload.humanScore,
            aiParticipants,
            seed: session.seed,
          })
        }

        scores = { ...resolvedAiScores }
        if (humanPlayer && session.participants.includes(humanPlayer.id)) {
          scores[humanPlayer.id] = payload.humanScore
        }
      } else {
        // ── Legacy / precomputed path (endurance, special games, test fixtures) ──
        scores = { ...session.aiScores }
        if (humanPlayer && session.participants.includes(humanPlayer.id)) {
          scores[humanPlayer.id] = payload.humanScore
        }
      }

      // Prefer a canonical winner supplied by the UI component so the
      // displayed leaderboard and the applied state transition stay aligned.
      // When using the hybrid resolver the component also calls it with the
      // same inputs, so the winnerId it supplies will be consistent.
      const pressurePlankRanking =
        session.key === 'pressurePlank'
          ? rankPressurePlankResults(session.participants, scores, session.seed)
          : null
      const derivedWinnerId =
        pressurePlankRanking?.[0]?.playerId ?? determineWinner(session.participants, scores)
      const winnerId =
        session.key === 'pressurePlank' ? derivedWinnerId : (payload.winnerId ?? derivedWinnerId)

      if (import.meta.env.DEV) {
        console.log('[completeMinigame] winner resolution', {
          sessionKey: session.key,
          resolvedScores: scores,
          payloadWinnerId: payload.winnerId,
          derivedWinnerId,
          chosenWinnerId: winnerId,
          usedExplicit: payload.winnerId != null,
          currentPhase: state.phase,
          payloadLastPlaceId: payload.lastPlaceId,
        })
      }

      // Update personal records for every participant
      const personalRecords: Record<string, number> = {}
      for (const id of session.participants) {
        const p = state.players.find((pl) => pl.id === id)
        if (!p) continue
        const score = scores[id] ?? 0
        if (!p.stats) p.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
        // tapRacePR is specific to the Quick Tap Race minigame — only update it
        // for that key so that TravelingDots (and other games sharing this reducer
        // path) don't corrupt Quick Tap personal-record data.
        if (session.key === 'quickTap') {
          if (p.stats.tapRacePR == null || score > p.stats.tapRacePR) {
            p.stats.tapRacePR = score
            personalRecords[id] = score
          }
        }
      }

      applyCompetitionSeasonUpdateToState(state, {
        participants: session.participants,
        scores,
        winnerId,
      })

      state.pendingMinigame = null

      // ── Auto-advance phase based on context ──────────────────────────────
      // Apply the winner inline so minigameResult is never left set in state,
      // which would risk being consumed by a later advance() call.
      const alive = getAlivePlayers(state)
      if (state.phase === 'loh_comp') {
        applyLohWinner(state, winnerId, '[completeMinigame]')
        state.phase = 'loh_results'
        // Track the last-place LOH competition finisher for the third-nominee rule.
        // Priority:
        //   1. lastPlaceId explicitly supplied by the game component (authoritative)
        //   2. Score-based derivation (fallback)
        const winnerUnitIds = new Set(getCupidRoleIds(state, winnerId))
        const nonWinners = session.participants.filter((id) => !winnerUnitIds.has(id))
        if (nonWinners.length > 0) {
          const explicitLastPlace =
            payload.lastPlaceId != null && nonWinners.includes(payload.lastPlaceId)
              ? payload.lastPlaceId
              : null
          const canonicalPressurePlankLast = pressurePlankRanking
            ? [...pressurePlankRanking]
                .reverse()
                .find((result) => nonWinners.includes(result.playerId))?.playerId
            : null
          state.lastHohCompFinisherId =
            canonicalPressurePlankLast ??
            explicitLastPlace ??
            nonWinners.reduce(
              (worst, id) => ((scores[id] ?? 0) < (scores[worst] ?? 0) ? id : worst),
              nonWinners[0]
            )
        }
        announceVoxLastPlaceNominee(state)
      } else if (state.phase === 'pos_comp') {
        state.phase = applyPosWinner(state, winnerId, alive)
      }
      // Always keep minigameResult null. The winner was applied inline above for
      // competition phases; for non-competition phases (e.g., debug Test TapRace)
      // there is nothing to apply and we must not leave stale data that could be
      // consumed by a future loh_results / pos_results advance() call.
      state.minigameResult = null
    },

    /**
     * Discard the active minigame session without completing it.
     * Useful for debug bypasses; a subsequent advance() will pick randomly.
     */
    skipMinigame(state) {
      state.pendingMinigame = null
      pushEvent(state, `[DEBUG] Minigame skipped — winner will be picked randomly. 🔧`, 'game')
    },

    /**
     * Apply a minigame winner determined by the challenge flow (MinigameHost).
     * Advances the phase (loh_comp → loh_results, pos_comp → pos_results) and
     * applies the appropriate winner effects without relying on pendingMinigame.
     *
     * This action is idempotent: if the winner for the current phase has already
     * been applied (lohId or posWinnerId already set and phase has advanced), a
     * second call is silently ignored.
     */
    applyMinigameWinner(state, action: PayloadAction<ApplyMinigameWinnerPayload>) {
      const {
        winnerId,
        participants,
        scores,
        includePlacementBonuses,
        skipSeasonUpdate,
        lastPlaceId,
        lastPlaceType,
      } = action.payload
      const alive = getAlivePlayers(state)
      const resolvedParticipants = participants ?? resolveCompetitionParticipants(state)
      const hasScores = scores !== undefined
      const resolvedScores = scores ?? buildFallbackScores(resolvedParticipants, winnerId)
      // includePlacementBonuses takes precedence; scores imply we have ranking info.
      const usePlacementBonuses = includePlacementBonuses ?? hasScores

      if (import.meta.env.DEV) {
        console.log('[applyMinigameWinner] entry', {
          incomingWinnerId: winnerId,
          incomingParticipants: participants,
          resolvedParticipants,
          incomingScores: scores,
          resolvedScores,
          lastPlaceId,
          lastPlaceType,
          currentPhase: state.phase,
          currentHohId: state.lohId,
        })
      }

      let winnerWasApplied = false
      if (state.phase === 'loh_comp') {
        // Idempotency: if lohId already set the winner was already applied.
        if (state.lohId) {
          if (import.meta.env.DEV) {
            console.log('[applyMinigameWinner] LOH already applied, skipping.', {
              existingHohId: state.lohId,
              incomingWinnerId: winnerId,
            })
          }
          return
        }
        if (import.meta.env.DEV) {
          console.log('[applyMinigameWinner] applying LOH winner', {
            winnerId,
            currentPhase: state.phase,
          })
        }
        applyLohWinner(state, winnerId, '[applyMinigameWinner]')
        state.phase = 'loh_results'
        winnerWasApplied = true
        // Track the last-place LOH competition finisher for the third-nominee rule.
        // Priority order:
        //   1. lastPlaceId if explicitly provided by the caller (authoritative — from
        //      elimination order or actual scores in the feature slice).
        //   2. Score-based derivation when scores are available.
        //   3. nonWinners[0] fallback (arbitrary, kept for backward compat).
        const winnerUnitIds = new Set(getCupidRoleIds(state, winnerId))
        const nonWinners = resolvedParticipants.filter((id) => !winnerUnitIds.has(id))
        if (nonWinners.length > 0) {
          const validLastPlace =
            lastPlaceId != null && nonWinners.includes(lastPlaceId) ? lastPlaceId : null
          state.lastHohCompFinisherId =
            validLastPlace ??
            (hasScores
              ? nonWinners.reduce(
                  (worst, id) =>
                    (resolvedScores[id] ?? 0) < (resolvedScores[worst] ?? 0) ? id : worst,
                  nonWinners[0]
                )
              : nonWinners[0])
          // Persist competition type for compact nomination-UI label selection.
          // Explicit lastPlaceType wins; otherwise derive from whether scores were provided.
          state.lastHohCompFinisherType = lastPlaceType ?? (hasScores ? 'scored' : null)
        }
        announceVoxLastPlaceNominee(state)
      } else if (state.phase === 'pos_comp') {
        // Idempotency: if posWinnerId already set the winner was already applied.
        if (state.posWinnerId) {
          if (import.meta.env.DEV) {
            console.log('[applyMinigameWinner] POS already applied, skipping.', {
              existingPovWinnerId: state.posWinnerId,
              incomingWinnerId: winnerId,
            })
          }
          return
        }
        if (import.meta.env.DEV) {
          console.log('[applyMinigameWinner] applying POS winner', {
            winnerId,
            currentPhase: state.phase,
          })
        }
        state.phase = applyPosWinner(state, winnerId, alive)
        winnerWasApplied = true
      }

      if (!skipSeasonUpdate && winnerWasApplied && resolvedParticipants.length > 0) {
        applyCompetitionSeasonUpdateToState(state, {
          participants: resolvedParticipants,
          scores: resolvedScores,
          winnerId,
          includePlacementBonuses: usePlacementBonuses,
        })
      }
    },

    /**
     * Apply competition season-state updates after a deterministic competition result.
     * Used by the challenge flow to keep modifiers in sync with minigame outcomes.
     */
    applyCompetitionSeasonUpdate(state, action: PayloadAction<CompetitionSeasonUpdatePayload>) {
      applyCompetitionSeasonUpdateToState(state, action.payload)
    },

    /**
     * Apply the result of a Final 3 part minigame.
     *
     * Called by the GameScreen after the MinigameHost completes in a
     * final3_comp*_minigame phase.  Sets the part winner, clears
     * minigameContext, pushes result TV events, and advances to the
     * next Final 3 phase (same logic as the deterministic AI-only path).
     */
    applyF3MinigameWinner(state, action: PayloadAction<string>) {
      const winnerId = action.payload
      const winner = state.players.find((p) => p.id === winnerId)

      if (state.phase === 'final3_comp1_minigame') {
        state.f3Part1WinnerId = winnerId
        if (isVoxPopuliActive(state)) {
          pushVoxFinalThreeResult(
            state,
            `PART 1: ${(winner?.name ?? winnerId).toUpperCase()} ADVANCES`,
            `${winner?.name ?? winnerId} advances to Part 3. The other two finalists now fight for the remaining place.`
          )
        } else {
          pushEvent(
            state,
            `Final 3 Part 1 result: ${winner?.name ?? winnerId} wins and advances directly to Part 3! The other two players will compete in Part 2. 🏆`,
            'game'
          )
        }
        state.minigameContext = null
        state.phase = 'final3_comp2'
      } else if (state.phase === 'final3_comp2_minigame') {
        state.f3Part2WinnerId = winnerId
        const partOneWinnerName = state.players.find(
          (player) => player.id === state.f3Part1WinnerId
        )?.name
        if (isVoxPopuliActive(state)) {
          pushVoxFinalThreeResult(
            state,
            `PART 2: ${(winner?.name ?? winnerId).toUpperCase()} ADVANCES`,
            `${winner?.name ?? winnerId} joins ${partOneWinnerName ?? 'the Part 1 winner'} in Part 3. The Part 2 loser now waits on the block.`
          )
        } else {
          pushEvent(
            state,
            `Final 3 Part 2 result: ${winner?.name ?? winnerId} wins and advances to face the Part 1 winner in Part 3! 🏆`,
            'game'
          )
        }
        state.minigameContext = null
        state.phase = 'final3_comp3'
      } else if (state.phase === 'final3_comp3_minigame') {
        // Crown the Final LOH (mirrors the deterministic path in advance() for final3_comp3).
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
        if (import.meta.env.DEV) {
          console.log('[applyLohWinner]', {
            source: '[applyF3MinigameWinner/final3_comp3_minigame]',
            previousHohId: state.lohId,
            nextHohId: winnerId,
            currentPhase: state.phase,
          })
        }
        state.lohId = winnerId
        markFinalHohWinner(state, winnerId)
        state.players.forEach((p) => {
          if (p.status === 'loh') p.status = 'active'
        })
        const lohPlayer = state.players.find((p) => p.id === winnerId)
        if (lohPlayer) lohPlayer.status = 'loh'

        const nominees = alive.filter((p) => p.id !== winnerId)
        state.nomineeIds = nominees.map((p) => p.id)
        nominees.forEach((p) => {
          const np = state.players.find((x) => x.id === p.id)
          if (np && np.status !== 'nominated') np.status = 'nominated'
        })

        if (isVoxPopuliActive(state)) {
          pushVoxFinalThreeResult(
            state,
            `FINAL IMMUNITY: ${(winner?.name ?? winnerId).toUpperCase()}`,
            `${winner?.name ?? winnerId} has won immunity. The other two finalists now face the audience for the final place in the Final 2.`
          )
        } else {
          pushEvent(
            state,
            `Final 3 Part 3: ${winner?.name ?? winnerId} wins and is crowned the Final Leader of the House! 👑`,
            'game'
          )
        }

        state.minigameContext = null

        if (isVoxPopuliActive(state) && state.voxPopuli) {
          state.voxPopuli.immunityWinnerId = winnerId
          state.voxPopuli.awaitingPublicVote = false
          state.voxPopuli.publicVoteContext = null
          state.voxPopuli.publicVotePercentages = null
          state.awaitingFinal3Eviction = false
          state.awaitingFinal3Plea = false
          state.phase = 'final3_decision'
          return
        }

        if (lohPlayer?.isUser) {
          state.awaitingFinal3Eviction = true
          const nomineeNames = state.nomineeIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ')
          pushEvent(
            state,
            `${winner?.name ?? winnerId}, you must now eliminate either ${nomineeNames} to set the Final 2. 🎯`,
            'game'
          )
          state.phase = 'final3_decision'
        } else {
          // AI Final LOH: deterministically evict (same as advance() AI path).
          const aiRng = mulberry32(state.seed + 1)
          const evictee = seededPick(aiRng, nominees)
          const evicteePlayer = state.players.find((p) => p.id === evictee.id)
          if (evicteePlayer) {
            assignSeasonPlacementOnExit(state, evictee.id)
            evicteePlayer.status = evictedStatus(state)
            state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id)
          }
          pushEvent(
            state,
            `${winner?.name ?? winnerId} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
            'game'
          )
          pushEvent(
            state,
            `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`,
            'game'
          )
          state.phase = 'week_end'
        }
      }
    },

    /**
     * Record per-game personal-record scores for all participants after a
     * challenge completes.  Only updates a player's PR if the new score beats
     * their previous best.  `lowerIsBetter` controls comparison direction.
     */
    updateGamePRs(
      state,
      action: PayloadAction<{
        gameKey: string
        scores: Record<string, number>
        lowerIsBetter?: boolean
      }>
    ) {
      const { gameKey, scores, lowerIsBetter = false } = action.payload
      for (const [id, score] of Object.entries(scores)) {
        const player = state.players.find((p) => p.id === id)
        if (!player) continue
        if (!player.stats) player.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
        if (!player.stats.gamePRs) player.stats.gamePRs = {}
        const prev = player.stats.gamePRs[gameKey]
        const isBetter = prev === undefined || (lowerIsBetter ? score < prev : score > prev)
        if (isBetter) {
          player.stats.gamePRs[gameKey] = score
        }
      }
    },

    /**
     * Human LOH picks a replacement nominee after a POS auto-save.
     * Clears replacementNeeded so the Continue button reappears.
     * Validates that the selected player is eligible (not LOH, not POS holder,
     * and not already a nominee) to guard against invalid dispatches.
     */
    setReplacementNominee(state, action: PayloadAction<string>) {
      // Vox Populi replacements come only from the original secret-ballot
      // ranking; immunity never grants anyone the power to name a backup.
      if (isVoxPopuliActive(state)) return
      const id = action.payload
      // Eligibility guard: reject LOH, POS holder, already-nominated players, or the player saved by the veto
      if (
        id === state.lohId ||
        id === state.posWinnerId ||
        state.nomineeIds.includes(id) ||
        !isEligibleReplacementNominee(state, id)
      ) {
        return
      }
      const player = state.players.find((p) => p.id === id)
      const lohPlayer = state.players.find((p) => p.id === state.lohId)
      if (!player || !lohPlayer) return

      appendNominee(state, id)
      state.replacementNeeded = false
      state.povSavedId = null
      // VIP: advance stage after first replacement (stage 1 → 2) or second replacement (stage 3 → -1)
      if (state.specialVeto?.activeType === 'vip') {
        if (state.specialVeto.vipUseStage === 1) {
          state.specialVeto.vipUseStage = 2
        } else if (state.specialVeto.vipUseStage === 3) {
          state.specialVeto.vipUseStage = -1
        }
      }
      pushEvent(state, `${lohPlayer.name} named ${player.name} as the backup nominee. 🎯`, 'game')
    },

    /**
     * Human LOH selects their first nominee during the two-step nomination flow.
     * Sets `pendingNominee1Id` so the UI can move on to step 2.
     * Eligibility: alive, not LOH. Guards: awaitingNominations must be true and
     * phase must be nomination_results.
     */
    selectNominee1(state, action: PayloadAction<string>) {
      if (!state.awaitingNominations || state.phase !== 'nomination_results') return
      const id = action.payload
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      const eligible = alive.filter(
        (p) => p.id !== state.lohId && canPlayerTargetPlayer(state, state.lohId, p.id)
      )
      if (!eligible.some((p) => p.id === id)) return
      state.pendingNominee1Id = id
    },

    /**
     * Human LOH selects their second nominee, finalizing nominations.
     * Validates: alive, not LOH, not equal to nominee 1.
     * Guards: awaitingNominations must be true, phase must be nomination_results,
     * and pendingNominee1Id must be set.
     * Clears `awaitingNominations` and `pendingNominee1Id`.
     */
    finalizeNominations(state, action: PayloadAction<string>) {
      if (!state.awaitingNominations || state.phase !== 'nomination_results') return
      const id2 = action.payload
      const id1 = state.pendingNominee1Id
      if (!id1 || id2 === id1 || !areDistinctCupidPairs(state, [id1, id2])) return
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      const eligible = alive.filter(
        (p) => p.id !== state.lohId && canPlayerTargetPlayer(state, state.lohId, p.id)
      )
      if (!eligible.some((p) => p.id === id2)) return
      if (!eligible.some((p) => p.id === id1)) return

      const p1 = state.players.find((p) => p.id === id1)
      const p2 = state.players.find((p) => p.id === id2)
      const lohPlayer = state.players.find((p) => p.id === state.lohId)
      if (!p1 || !p2) return

      state.nomineeIds = [id1, id2]
      p1.status = 'nominated'
      p2.status = 'nominated'
      incrementTimesNominated(state, id1)
      incrementTimesNominated(state, id2)
      expandCupidNominees(state)
      state.awaitingNominations = false
      state.pendingNominee1Id = null
      rememberOriginalNominations(state)
      pushEvent(
        state,
        `${p1.name} and ${p2.name} have been nominated for elimination by ${lohPlayer?.name ?? 'the LOH'}. 🎯`,
        'game'
      )
    },

    /**
     * Human LOH commits nominees in a single action (multi-select flow).
     * Accepts 2 nominees normally; accepts 3 nominees during a Double Eviction week.
     * Replaces the two-step `selectNominee1` / `finalizeNominations` pattern
     * when TvMultiSelectModal is used. Validates all IDs are eligible.
     */
    commitNominees(state, action: PayloadAction<string[]>) {
      if (!state.awaitingNominations || state.phase !== 'nomination_results') return
      if (isVoxPopuliActive(state) && state.voxPopuli) {
        const human = state.players.find(
          (player) => player.isUser && player.status !== 'evicted' && player.status !== 'jury'
        )
        if (!human) return
        const immunityWinnerId = getVoxNominationImmunityId(state)
        const autoNomineeId = state.voxPopuli.autoNomineeId ?? state.lastHohCompFinisherId ?? null
        const eligible = state.players.filter(
          (candidate) =>
            candidate.status !== 'evicted' &&
            candidate.status !== 'jury' &&
            candidate.id !== human.id &&
            candidate.id !== immunityWinnerId &&
            candidate.id !== autoNomineeId &&
            canPlayerTargetPlayer(state, human.id, candidate.id)
        )
        const expectedCount = Math.min(getVoxBallotSize(state), eligible.length)
        const ids = [...new Set(action.payload)]
        if (
          ids.length !== expectedCount ||
          !ids.every((id) => eligible.some((candidate) => candidate.id === id))
        ) {
          return
        }
        state.voxPopuli.nominationBallots[human.id] = ids
        finalizeVoxNominations(state)
        return
      }
      const isDoubleEviction = state.doubleEviction?.weekActive === true
      const publicModeEnabled = state.publicModeEnabled === true
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      const canUsePublicNomineeRule = publicModeEnabled && !isDoubleEviction

      // Defensive: in public mode non-DE weeks, strip the forced auto-nominee from the
      // submitted IDs before validating count. The UI disables that option, but if it
      // somehow appears in the payload it must not reduce the total to only 2 nominees.
      const autoNomineeUnitIds =
        canUsePublicNomineeRule && state.lastHohCompFinisherId
          ? new Set(expandCupidIds(state, [state.lastHohCompFinisherId]))
          : null
      const ids = autoNomineeUnitIds
        ? action.payload.filter((id) => !autoNomineeUnitIds.has(id))
        : action.payload

      // Human always picks 2 in normal weeks (3rd is auto-appended); picks 3 in DE.
      const expectedCount = isDoubleEviction ? 3 : 2
      if (ids.length !== expectedCount) return
      if (new Set(ids).size !== ids.length) return // duplicates check
      if (!areDistinctCupidPairs(state, ids)) return
      const eligible = alive.filter(
        (p) => p.id !== state.lohId && canPlayerTargetPlayer(state, state.lohId, p.id)
      )
      if (!ids.every((id) => eligible.some((p) => p.id === id))) return

      const nominees = ids.map((id) => state.players.find((p) => p.id === id)!).filter(Boolean)
      const lohPlayer = state.players.find((p) => p.id === state.lohId)
      if (nominees.length !== expectedCount) return

      // Keep the submitted choices separate from the draft nominee list.
      // appendNominee mutates nomineeIds below; assigning the payload array
      // directly would also mutate `ids` and incorrectly attribute the forced
      // public nominee to the LOH in nominationContext.
      state.nomineeIds = [...ids]
      nominees.forEach((n) => {
        n.status = 'nominated'
        incrementTimesNominated(state, n.id)
      })
      expandCupidNominees(state)

      // In eligible weeks (including Final 4), auto-append the last-place LOH comp finisher.
      if (canUsePublicNomineeRule && state.lastHohCompFinisherId) {
        const autoId = state.lastHohCompFinisherId
        let autoNomineeId: string | null = null
        const autoPairAlreadyNominated = expandCupidIds(state, [autoId]).some((id) =>
          state.nomineeIds.includes(id)
        )
        if (!autoPairAlreadyNominated) {
          const autoPlayer = eligible.find((p) => p.id === autoId)
          if (autoPlayer) {
            appendNominee(state, autoId)
            autoNomineeId = autoId
          }
        }
        state.nominationContext = {
          hohNomineeIds: expandCupidIds(state, ids),
          autoNomineeId,
          publicSaveApplied: false,
        }
      }

      state.awaitingNominations = false
      state.pendingNominee1Id = null
      rememberOriginalNominations(state)
      const allNomineePlayers = state.nomineeIds
        .map((id) => state.players.find((p) => p.id === id))
        .filter(Boolean)
      const nameList = formatNameList(allNomineePlayers.map((n) => n!.name))
      const autoNomineePlayer = state.nominationContext?.autoNomineeId
        ? allNomineePlayers.find((player) => player?.id === state.nominationContext?.autoNomineeId)
        : null
      const hohName = lohPlayer?.name ?? 'the LOH'
      const hohNomineeNames = formatNameList(nominees.map((n) => n.name))
      const autoNomineeReason = autoNomineePlayer
        ? isVoxPopuliActive(state)
          ? `${autoNomineePlayer.name} finished last in the immunity competition and takes the first place on the block`
          : `${autoNomineePlayer.name} was automatically nominated for finishing last in the LOH competition`
        : null
      const autoNomineeClause = autoNomineePlayer
        ? `${hohName} nominated ${hohNomineeNames}, and ${autoNomineeReason}`
        : null
      const eventText = autoNomineeClause
        ? `${nameList} have been nominated for elimination. ${autoNomineeClause}. 🎯`
        : `${nameList} have been nominated for elimination by ${hohName}. 🎯`
      pushEvent(state, eventText, 'game')
    },

    /**
     * Resolve the pre-veto public save phase (normal weeks only).
     * The UI calls this with the ID of the nominee to save (highest approval).
     * Removes the saved player from nomineeIds, records publicSavedNomineeId,
     * clears awaitingPublicSave, and advances the phase to pos_comp_announcement.
     */
    commitPublicSave(state, action: PayloadAction<CommitPublicSavePayload>) {
      if (!state.awaitingPublicSave || state.phase !== 'pre_veto_public_save') return
      const cupidActive = isCupidArrowActive(state)
      const expectedBefore = cupidActive ? 6 : 3
      const expectedAfter = cupidActive ? 4 : 2
      if (state.nomineeIds.length !== expectedBefore) return
      const savedId = typeof action.payload === 'string' ? action.payload : action.payload.savedId
      if (!state.nomineeIds.includes(savedId)) return

      const savedPlayer = state.players.find((p) => p.id === savedId)
      if (!savedPlayer) return

      const savedUnitIds = expandCupidIds(state, [savedId]).filter((id) =>
        state.nomineeIds.includes(id)
      )
      const remainingNomineeIds = state.nomineeIds.filter((id) => !savedUnitIds.includes(id))
      if (remainingNomineeIds.length !== expectedAfter) return

      // Remove from active nominee block
      state.nomineeIds = remainingNomineeIds
      savedUnitIds.forEach((id) => {
        const player = state.players.find((candidate) => candidate.id === id)
        if (player) player.status = 'active'
      })
      syncCupidRoleStatuses(state)

      // Record metadata
      state.publicSavedNomineeId = savedId
      if (state.nominationContext) {
        state.nominationContext.publicSaveApplied = true
      }

      state.awaitingPublicSave = false
      // Advance directly to pos_comp_announcement so veto starts with 2 nominees
      state.phase = 'pos_comp_announcement'
    },

    /**
     * Human POS holder decides whether to use or not use the veto.
     * - `false`: the veto is not used; log the event and clear the flag.
     * - `true`: set `awaitingPovSaveTarget` so the player can pick who to save.
     */
    submitPovDecision(state, action: PayloadAction<boolean>) {
      if (!state.awaitingPovDecision) return
      state.awaitingPovDecision = false
      const posWinner = state.players.find((p) => p.id === state.posWinnerId)
      const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
      const willUsePower = action.payload || shouldUseSafetyForTwin(state, posWinner?.id, nominees)
      if (willUsePower) {
        const svType = state.specialVeto?.activeType
        if (svType === 'coup') {
          // Detox: remove both nominees, await holder replacement picks
          const oldNominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
          oldNominees.forEach((n) => {
            n.status = 'active'
          })
          const removedNames = oldNominees.map((n) => n.name).join(' and ')
          state.nomineeIds = []
          state.povSavedId = null
          state.povProtectedIds = oldNominees.map((nominee) => nominee.id)
          pushDetoxEvent(
            state,
            `${posWinner?.name ?? 'The Detox holder'} ${getPlayerBeVerb(posWinner, 'has', 'have')} decided to use Detox. ⚡`
          )
          pushDetoxEvent(
            state,
            `${posWinner?.name ?? 'The Detox holder'} used Detox! ${removedNames} are cleared from the block! ⚡`
          )
          pushDetoxEvent(
            state,
            `${posWinner?.name ?? 'The Detox holder'}, name your two backup nominees. ⚡`
          )
          state.specialVeto!.awaitingCoupReplacement1 = true
        } else {
          // Standard / VIP / Diamond / Spotlight: set awaitingPovSaveTarget
          state.awaitingPovSaveTarget = true
        }
      } else {
        // not using veto
        if (state.specialVeto?.activeType === 'vip') {
          state.specialVeto.vipUseStage = -1
        }
        if (isVoxPopuliActive(state)) {
          pushVoxSafetyStandPat(state, posWinner?.id ?? null)
        } else {
          pushEvent(
            state,
            `${posWinner?.name ?? 'The holder'} ${getPlayerBeVerb(posWinner, 'has', 'have')} decided NOT to use the power. The nominations remain the same. ⚡`,
            'game'
          )
        }
      }
    },

    /**
     * Human POS holder picks which nominee to save with the veto.
     * After saving, triggers the replacement nominee flow (human LOH → modal;
     * AI LOH → deterministic pick).
     */
    submitPovSaveTarget(state, action: PayloadAction<string>) {
      const saveId = action.payload
      if (!state.awaitingPovSaveTarget) return
      if (!state.nomineeIds.includes(saveId)) return

      const savedPlayer = state.players.find((p) => p.id === saveId)
      const posWinner = state.players.find((p) => p.id === state.posWinnerId)
      let lohPlayer = state.players.find((p) => p.id === state.lohId)
      if (!savedPlayer || !posWinner) return
      const twinSaveTarget = getTwinNomineeToSave(state, posWinner.id)
      if (twinSaveTarget && twinSaveTarget.id !== saveId) return

      // Save the selected nominee
      const savedUnitIds = removeCupidNomineeUnit(state, saveId)
      savedPlayer.status = 'active'
      state.awaitingPovSaveTarget = false
      // Track the saved player so they cannot be immediately re-nominated as the replacement
      state.povSavedId = saveId
      savedUnitIds.forEach((id) => addPovProtectedId(state, id))
      if (isVoxPopuliActive(state)) {
        restoreVoxNomineeMinimum(state)
        pushVoxSafetyOutcome(state, posWinner.id, saveId)
        return
      }
      pushEvent(
        state,
        `${posWinner.name} used the power on ${formatNameList(
          savedUnitIds.map((id) => state.players.find((player) => player.id === id)?.name ?? id)
        )}! 🛡️`,
        'game'
      )

      // Diamond: holder names replacement (not LOH)
      if (state.specialVeto?.activeType === 'diamond') {
        const posDecisionPlayer = getCupidHumanCoholder(state, posWinner.id) ?? posWinner
        if (posDecisionPlayer.isUser) {
          state.specialVeto.awaitingHolderReplacement = true
          pushEvent(
            state,
            `${posWinner.name}, as the Halo Exchange holder, you must name the backup nominee. 😇`,
            'game'
          )
        } else {
          // AI holder names replacement
          const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
          const eligible = getReplacementEligiblePlayers(state, alive, 1, { actorId: posWinner.id })
          if (eligible.length > 0) {
            const rng = mulberry32(state.seed)
            const replacement = seededPick(rng, eligible)
            state.nomineeIds.push(replacement.id)
            const rp = state.players.find((pl) => pl.id === replacement.id)
            if (rp) rp.status = 'nominated'
            incrementTimesNominated(state, replacement.id)
            pushEvent(
              state,
              `${posWinner.name} named ${replacement.name} as the Halo Exchange backup nominee. 😇`,
              'game'
            )
          }
        }
        return
      }

      // LOH must name a replacement. During Cupid's Arrow, a human coholder
      // represents the whole LOH pair even when their AI partner won the comp.
      const lohDecisionPlayer = getCupidHumanCoholder(state, state.lohId) ?? lohPlayer
      lohPlayer = lohDecisionPlayer
      if (lohDecisionPlayer?.isUser) {
        if (!lohPlayer) return
        state.replacementNeeded = true
        // VIP: track first use stage
        if (state.specialVeto?.activeType === 'vip') {
          state.specialVeto.vipUseStage = 1
        }
        pushEvent(state, `${lohPlayer.name} must now name a backup nominee. 🎯`, 'game')
      } else {
        // AI LOH: deterministically pick replacement
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
        const eligible = getReplacementEligiblePlayers(state, alive)
        if (eligible.length > 0) {
          const rng = mulberry32(state.seed)
          const replacement = seededPick(rng, eligible)
          state.nomineeIds.push(replacement.id)
          const rp = state.players.find((pl) => pl.id === replacement.id)
          if (rp) rp.status = 'nominated'
          incrementTimesNominated(state, replacement.id)
          // Keep povSavedId set so the UI can detect "veto was used" and show
          // the AI replacement animation. Cleared at week_start.
          pushEvent(
            state,
            `${lohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`,
            'game'
          )
          // VIP: after AI LOH replacement is done inline, stage is immediately 2
          if (state.specialVeto?.activeType === 'vip') {
            state.specialVeto.vipUseStage = 2
          }
        }
      }
    },

    /**
     * Human eligible voter casts their eviction vote during `live_vote`.
     * Adds the vote to `state.votes` and clears `awaitingHumanVote`.
     */
    submitHumanVote(state, action: PayloadAction<string>) {
      const nomineeId = action.payload
      if (!state.awaitingHumanVote) return
      if (!state.nomineeIds.includes(nomineeId)) return
      const humanPlayer = state.players.find((p) => p.isUser)
      if (!humanPlayer) return
      if (!canPlayerTargetPlayer(state, humanPlayer.id, nomineeId)) return
      if (!state.votes) state.votes = {}
      const voteMap = state.votes
      const jointVoterIds = getCupidRoleIds(state, humanPlayer.id)
      jointVoterIds.forEach((voterId) => {
        const voter = state.players.find((player) => player.id === voterId)
        if (voter && voter.status !== 'evicted' && voter.status !== 'jury') {
          voteMap[voterId] = nomineeId
        }
      })
      state.awaitingHumanVote = false
    },

    /**
     * Human LOH breaks a tied eviction vote by selecting the evictee.
     * Clears the tie state and queues the same deferred eviction cinematic used
     * by a clear house vote. The phase advances only after the cinematic commits.
     */
    submitTieBreak(state, action: PayloadAction<string>) {
      const nomineeId = action.payload
      if (!state.awaitingTieBreak) return
      const tied = state.tiedNomineeIds ?? state.nomineeIds
      if (!tied.includes(nomineeId)) return

      const evictee = state.players.find((p) => p.id === nomineeId)
      const lohPlayer = state.players.find((p) => p.id === state.lohId)
      if (!evictee) return
      if (!canPlayerTargetPlayer(state, lohPlayer?.id, nomineeId)) return

      state.awaitingTieBreak = false
      state.tiedNomineeIds = null
      state.votes = {}

      const tiedNames = tied
        .map((id) => state.players.find((player) => player.id === id)?.name)
        .filter((name): name is string => Boolean(name))
      const tieBreakMessage = buildDoubleEvictionTieResolutionMessage({
        deciderName: lohPlayer?.name ?? 'The LOH',
        tiedNames,
        selectedNames: [evictee.name],
        publicModeEnabled: state.publicModeEnabled,
        secondEvictionOnly: true,
        includeEliminationClause: true,
      })

      if (
        state.doubleEviction?.weekActive &&
        state.pendingEviction &&
        !state.doubleEviction.pendingSecondEviction
      ) {
        state.doubleEviction.pendingSecondEviction = {
          evicteeId: nomineeId,
          evictionMessage: tieBreakMessage,
        }
        return
      }

      // voteResults was already shown before the tie-break prompt; clear it now.
      state.voteResults = null
      // Defer the eviction commit until the cinematic overlay completes.
      state.pendingEviction = {
        evicteeId: nomineeId,
        evictionMessage: `${lohPlayer?.name ?? 'The LOH'} breaks the tie, voting to eliminate ${evictee.name}. ${evictee.name} has been eliminated from The Big Eye house. 🗳️`,
      }
      // Keep the phase at eviction_results. GameScreen commits the eviction after
      // the cinematic, then advances exactly once into week_end.
    },

    submitDoubleEvictionTieBreak(state, action: PayloadAction<string[]>) {
      if (!state.doubleEviction?.weekActive || !state.awaitingTieBreak) return

      const tied = state.tiedNomineeIds ?? state.nomineeIds
      const selectedIds = [...new Set(action.payload)].filter((id) => tied.includes(id))
      const slotsRequired = calculateRequiredDoubleEvictionSlots(
        tied.length,
        Boolean(state.pendingEviction)
      )
      if (selectedIds.length !== slotsRequired) return

      const lohPlayer = state.players.find((p) => p.id === state.lohId)
      const selectedPlayers = selectedIds
        .map((id) => state.players.find((player) => player.id === id))
        .filter((player): player is Player => Boolean(player))

      if (selectedPlayers.length !== selectedIds.length) return

      state.awaitingTieBreak = false
      state.tiedNomineeIds = null
      state.votes = {}

      const tiedNames = tied
        .map((id) => state.players.find((player) => player.id === id)?.name)
        .filter((name): name is string => Boolean(name))
      const selectedNames = selectedPlayers.map((player) => player.name)
      const tieResolutionMessage = buildDoubleEvictionTieResolutionMessage({
        deciderName: lohPlayer?.name ?? 'The LOH',
        tiedNames,
        selectedNames,
        publicModeEnabled: state.publicModeEnabled,
        secondEvictionOnly: Boolean(state.pendingEviction),
        includeEliminationClause: true,
      })
      const buildFollowUpMessage = (player: Player) =>
        state.publicModeEnabled
          ? `${player.name} had the lower public approval and has been eliminated from The Big Eye house. 📉`
          : `Following the tie-break, ${player.name} has also been eliminated from The Big Eye house. 🗳️`

      if (state.pendingEviction && !state.doubleEviction.pendingSecondEviction) {
        state.doubleEviction.pendingSecondEviction = {
          evicteeId: selectedPlayers[0].id,
          evictionMessage: tieResolutionMessage,
        }
        return
      }

      state.pendingEviction = {
        evicteeId: selectedPlayers[0].id,
        evictionMessage: tieResolutionMessage,
      }

      if (selectedPlayers[1]) {
        state.doubleEviction.pendingSecondEviction = {
          evicteeId: selectedPlayers[1].id,
          evictionMessage: buildFollowUpMessage(selectedPlayers[1]),
        }
      }
    },

    // ── Democracia twist reducers ─────────────────────────────────────────────

    /**
     * Activate the Democracia twist for the current day.
     * Sets the Democracia state to active and pushes the TV announcement.
     * Called by tryActivateDemocracia / tryActivatePendingForcedDemocracia thunks.
     */
    activateDemocracia(state) {
      if (isVoxPopuliTwistLocked(state)) return
      if (!state.democracia) {
        state.democracia = {
          usedThisSeason: false,
          active: false,
          activatedDay: null,
          round: 0,
          candidateIds: [],
          eligibleVoterIds: [],
          votesByVoterId: {},
          awaitingHumanVote: false,
          awaitingPublicBreaker: false,
          resultDisplay: null,
        }
      }
      state.democracia.usedThisSeason = true
      state.democracia.active = true
      state.democracia.activatedDay = state.week
      state.democracia.round = 0
      state.democracia.candidateIds = []
      state.democracia.eligibleVoterIds = []
      state.democracia.votesByVoterId = {}
      state.democracia.awaitingHumanVote = false
      state.democracia.awaitingPublicBreaker = false
      state.democracia.resultDisplay = null
      state.twistActive = true
      state.twistActivatedThisWeek = true
      pushEvent(
        state,
        `🗳️ DEMOCRACIA! Today, instead of a Leader of the House competition, the house will elect its leader by popular vote!`,
        'twist',
        { major: 'democracia' }
      )
    },

    /**
     * Human player casts their Democracia vote.
     * Validates: voter is eligible, target is a candidate, no self-vote.
     * Clears awaitingHumanVote when accepted.
     */
    submitDemocraciaVote(state, action: PayloadAction<string>) {
      const dem = state.democracia
      if (!dem?.awaitingHumanVote) return
      const targetId = action.payload
      const humanPlayer = state.players.find((p) => p.isUser)
      if (!humanPlayer) return
      if (targetId === humanPlayer.id) return // no self-vote
      if (!canPlayerTargetPlayer(state, humanPlayer.id, targetId)) return
      if (!dem.candidateIds.includes(targetId)) return // must be a candidate
      if (!dem.eligibleVoterIds.includes(humanPlayer.id)) return // must be eligible voter
      dem.votesByVoterId[humanPlayer.id] = targetId
      dem.awaitingHumanVote = false
    },

    dismissDemocraciaResultDisplay(state) {
      if (!state.democracia) return
      state.democracia.resultDisplay = null
    },

    /**
     * Resolve the Democracia ballotage final tie when public mode is ON.
     * The UI picks the tied candidate with higher public approval and dispatches this action.
     * Applies the winner as LOH and advances to democracia_results.
     */
    resolveDemocraciaPublicBreaker(state, action: PayloadAction<{ winnerId: string }>) {
      const dem = state.democracia
      if (!dem?.awaitingPublicBreaker) return
      const { winnerId } = action.payload
      if (!dem.candidateIds.includes(winnerId)) return
      const winnerName = state.players.find((p) => p.id === winnerId)?.name ?? winnerId
      pushEvent(
        state,
        `🗳️ The public has spoken! ${winnerName} wins the tie-break with higher approval! 👑`,
        'game'
      )
      applyLohWinner(state, winnerId, '[democracia/public_breaker]')
      dem.awaitingPublicBreaker = false
      dem.active = false
      state.phase = 'democracia_results'
    },

    /**
     * Human co-LOH submits their nomination on a Democracia co-LOH day.
     * Validates eligibility (not self, not other co-LOH, not already nominated, must be alive).
     * Clears awaitingCoLohNomination when accepted.
     */
    submitCoLohNomination(state, action: PayloadAction<{ coLohId: string; nomineeId: string }>) {
      const { coLohId, nomineeId } = action.payload
      if (!state.awaitingCoLohNomination) return
      if (!state.coLohIds?.includes(coLohId)) return
      const coLoh = state.players.find((p) => p.id === coLohId)
      if (!coLoh?.isUser) return // only human co-LOH submits via this action
      // Validate the nominated player
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      if (!alive.some((p) => p.id === nomineeId)) return
      if (nomineeId === coLohId) return // no self-nomination
      const otherCoLohIds = state.coLohIds.filter((id) => id !== coLohId)
      if (otherCoLohIds.includes(nomineeId)) return // can't nominate other co-LOH
      if (state.nomineeIds.includes(nomineeId)) return // already nominated
      // Apply nomination
      state.nomineeIds.push(nomineeId)
      const np = state.players.find((pl) => pl.id === nomineeId)
      if (np) np.status = 'nominated'
      incrementTimesNominated(state, nomineeId)
      if (!state.coLohNomineeByCoLohId) state.coLohNomineeByCoLohId = {}
      state.coLohNomineeByCoLohId[coLohId] = nomineeId
      state.awaitingCoLohNomination = false
      const allNomineeNames = state.nomineeIds
        .map((id) => state.players.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(' and ')
      pushEvent(state, `${allNomineeNames} have been nominated for elimination. 🎯`, 'game')
    },

    /**
     * Human POS holder breaks an eviction tie on a co-LOH Democracia day.
     * On co-LOH days, the POS holder acts as tiebreaker instead of the LOH.
     * Clears awaitingTieBreak and awaitingPosTieBreak, queues the eviction.
     */
    submitPosTieBreak(state, action: PayloadAction<string>) {
      const nomineeId = action.payload
      if (!state.awaitingPosTieBreak || !state.awaitingTieBreak) return
      const tied = state.tiedNomineeIds ?? state.nomineeIds
      if (!tied.includes(nomineeId)) return
      const evictee = state.players.find((p) => p.id === nomineeId)
      const posHolder = state.players.find((p) => p.id === state.posWinnerId)
      if (!evictee) return
      state.awaitingTieBreak = false
      state.awaitingPosTieBreak = false
      state.tiedNomineeIds = null
      state.votes = {}
      // voteResults was already shown before the tie-break prompt; clear it now.
      state.voteResults = null
      // Defer the eviction commit until the cinematic overlay completes.
      state.pendingEviction = {
        evicteeId: nomineeId,
        evictionMessage: `${posHolder?.name ?? 'The POS holder'} breaks the tie as a special exception, voting to eliminate ${evictee.name}. ${evictee.name} has been eliminated from The Big Eye house. 🗳️`,
      }
      // Keep the phase at eviction_results. The shared cinematic completion
      // handler finalizes the eviction and advances to week_end.
    },

    /**
     * Dismiss the vote results popup after the player has viewed it.
     * Clears `voteResults`; the eviction cinematic is driven separately
     * by `pendingEviction` and GameScreen logic.
     */
    commitVoxAudienceVote(
      state,
      action: PayloadAction<{
        context: 'eviction' | 'final3'
        percentages: Record<string, number>
        rankedIds: string[]
      }>
    ) {
      if (
        !isVoxPopuliActive(state) ||
        !state.voxPopuli?.awaitingPublicVote ||
        state.voxPopuli.publicVoteContext !== action.payload.context
      ) {
        return
      }
      const rankedIds = action.payload.rankedIds.filter((id) => state.nomineeIds.includes(id))
      if (rankedIds.length === 0) return

      state.voxPopuli.awaitingPublicVote = false
      // Vox does not use the classic Final-LOH ceremony. A stale classic flag
      // here used to disable Play after the Final 3 public verdict.
      if (action.payload.context === 'final3') {
        state.awaitingFinal3Eviction = false
        state.awaitingFinal3Plea = false
      }
      state.voxPopuli.publicVotePercentages = { ...action.payload.percentages }
      state.voteResultsMode = 'public'
      state.voteResults = { ...action.payload.percentages }
      state.votes = {}
      state.pendingExitContext = {
        week: state.week,
        leaderIds: [],
        nomineeIds: [...state.nomineeIds],
        votesByVoterId: {},
        voteCounts: { ...action.payload.percentages },
      }

      const firstId = rankedIds[0]
      const first = state.players.find((player) => player.id === firstId)
      if (!first) return
      const firstPercent = action.payload.percentages[firstId] ?? 0
      state.pendingEviction = {
        evicteeId: firstId,
        evictionMessage:
          action.payload.context === 'final3'
            ? `${first.name} receives ${firstPercent.toFixed(1)}% of the audience vote to eliminate and finishes in 3rd place.`
            : `${first.name} receives the highest audience vote to eliminate at ${firstPercent.toFixed(1)}% and leaves The Big Eye house.`,
      }

      if (
        action.payload.context === 'eviction' &&
        state.doubleEviction?.weekActive &&
        state.nomineeIds.length >= 3 &&
        rankedIds.length >= 3
      ) {
        const secondId = rankedIds[1]
        const second = state.players.find((player) => player.id === secondId)
        if (second) {
          const secondPercent = action.payload.percentages[secondId] ?? 0
          state.doubleEviction.pendingSecondEviction = {
            evicteeId: secondId,
            evictionMessage: `${second.name} receives the second-highest audience vote to eliminate at ${secondPercent.toFixed(1)}% and also leaves in tonight's Double Elimination.`,
          }
        }
      }
      if (action.payload.context === 'eviction') {
        state.phase = 'eviction_results'
      }
      pushEvent(state, `The audience vote is closed. The result is final.`, 'vote', {
        major: 'vox_populi_public_vote_closed',
      })
    },

    commitVoxAudiencePreview(
      state,
      action: PayloadAction<{
        week: number
        nomineeIds: string[]
        percentages: Record<string, number>
      }>
    ) {
      if (!isVoxPopuliActive(state) || !state.voxPopuli) return
      if (state.voxPopuli.audiencePreviewWeek === action.payload.week) return
      const eligibleIds = action.payload.nomineeIds.filter((id) => state.nomineeIds.includes(id))
      if (eligibleIds.length < 2) return
      state.voxPopuli.audiencePreviewWeek = action.payload.week
      state.voxPopuli.audiencePreviewNomineeIds = [...eligibleIds]
      state.voxPopuli.audiencePreviewPercentages = Object.fromEntries(
        eligibleIds.map((id) => [id, action.payload.percentages[id] ?? 0])
      )
    },

    dismissVoteResults(state) {
      state.voteResults = null
    },

    /**
     * Dismiss the eviction splash animation after the player has viewed it.
     * Clears the eviction splash ID.
     */
    dismissEvictionSplash(state) {
      state.evictionSplashId = null
    },

    /**
     * Set or clear the player currently shown in a fullscreen eviction overlay.
     * Pass the player's id to mark overlay active; pass null to clear.
     * Used by SpotlightEvictionOverlay (on mount/unmount) and Final3Ceremony
     * (on eviction_splash enter/exit) so AvatarTile can hide itself (isEvicting)
     * during the match-cut, preventing the duplicated fullscreen avatar start.
     */
    setEvictionOverlay(state, action: PayloadAction<string | null>) {
      state.evictionOverlayPlayerId = action.payload
    },

    /**
     * Clear the eviction overlay flag only if it still refers to the given player.
     * Safe to call from unmount cleanup: if a new overlay has already mounted for
     * a different player, this action is a no-op and does not disturb that overlay.
     */
    clearEvictionOverlay(state, action: PayloadAction<string>) {
      if (state.evictionOverlayPlayerId === action.payload) {
        state.evictionOverlayPlayerId = null
      }
    },

    /**
     * Commit the deferred eviction after the cinematic overlay completes.
     *
     * Sets the evictee's status to 'evicted' or 'jury', removes them from
     * nomineeIds, pushes the eviction event, and clears pendingEviction.
     * For Final-4 evictions (phase === 'final4_eviction') also transitions
     * the phase to 'final3' and pushes the "Final 3!" event.
     * For Double Eviction weeks, promotes the pending second eviction to
     * `pendingEviction` after the first resolves; clears `doubleEviction.weekActive`
     * once both evictions have been committed.
     */
    finalizePendingEviction(state, action: PayloadAction<string>) {
      const evicteeId = action.payload
      if (!state.pendingEviction || state.pendingEviction.evicteeId !== evicteeId) return

      const evictee = state.players.find((p) => p.id === evicteeId)
      if (!evictee) return

      const msg = state.pendingEviction.evictionMessage
      const isFinal4 = state.phase === 'final4_eviction'
      const isVoxFinal3 =
        isVoxPopuliActive(state) &&
        state.voxPopuli?.publicVoteContext === 'final3' &&
        state.phase === 'final3_decision'
      const wasCupidPartnerFollowup =
        isCupidArrowActive(state) && state.cupidArrow?.pendingPartnerEvictionId === evicteeId
      const cupidPartnerId =
        isCupidArrowActive(state) && !wasCupidPartnerFollowup
          ? getCupidPartnerId(state, evicteeId)
          : null
      const cupidPartner = cupidPartnerId
        ? state.players.find((player) => player.id === cupidPartnerId)
        : null

      assignSeasonPlacementOnExit(state, evicteeId)
      evictee.status = evictedStatus(state)
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId)
      state.pendingEviction = null
      state.dayStartShock = null

      const cupidEvictionTemplateId = msg.includes(
        "Cupid's Arrow means you are eliminated together"
      )
        ? msg.includes(' breaks the tie. ')
          ? 'cupid.pair-tiebreak-eviction'
          : 'cupid.pair-eviction'
        : wasCupidPartnerFollowup
          ? 'cupid.partner-eviction'
          : undefined
      pushEvent(
        state,
        msg,
        'game',
        cupidEvictionTemplateId
          ? { broadcastTemplateId: cupidEvictionTemplateId, phase: 'eviction_results' }
          : undefined
      )

      if (
        cupidPartner &&
        cupidPartner.status !== 'evicted' &&
        cupidPartner.status !== 'jury' &&
        state.cupidArrow
      ) {
        state.cupidArrow.pendingPartnerEvictionId = cupidPartner.id
        state.pendingEviction = {
          evicteeId: cupidPartner.id,
          evictionMessage: `${cupidPartner.name} is bound to ${evictee.name} by Cupid's Arrow and is eliminated too. 💔`,
        }
      } else if (wasCupidPartnerFollowup && state.cupidArrow) {
        state.cupidArrow.pendingPartnerEvictionId = null
        state.cupidArrow.eliminatedPairCount += 1
        if (state.cupidArrow.eliminatedPairCount >= CUPID_ARROW_BREAK_AFTER_PAIRS) {
          breakCupidArrowSpell(state)
        }
      } else if (isVoxFinal3 && state.voxPopuli) {
        state.voxPopuli.publicVoteContext = null
        state.voxPopuli.finalistIds = getAlivePlayers(state).map((player) => player.id)
        state.phase = 'week_end'
        pushEvent(
          state,
          `The Final 2 is set. One last audience vote will crown the winner; the complete season story will follow.`,
          'game',
          { major: 'vox_populi_final_two', broadcastPriority: 'critical' }
        )
      } else if (isFinal4) {
        state.phase = 'final3'
      } else if (state.doubleEviction?.pendingSecondEviction) {
        // Double Eviction: promote the second eviction to the main pending slot.
        state.pendingEviction = state.doubleEviction.pendingSecondEviction
        state.doubleEviction.pendingSecondEviction = null
      } else if (state.doubleEviction?.weekActive) {
        // Both double eviction evictions are done — reset the weekly flag.
        state.doubleEviction.weekActive = false
        state.twistActive = false
        // Mark all surviving players so buildSummaries can set survivedDoubleEviction.
        state.players.forEach((p) => {
          if (p.status !== 'evicted' && p.status !== 'jury') {
            ensurePlayerStats(p).survivedDoubleEviction = true
          }
        })
      }

      if (!state.pendingEviction) {
        if (state.phase === 'eviction_results') {
          pushVoxPostEvictionReaction(state, evictee)
        }
        state.pendingExitContext = null
        clearResolvedEvictionRoles(state)
        if (
          isVoxPopuliActive(state) &&
          state.phase === 'eviction_results' &&
          getAlivePlayers(state).length === 3
        ) {
          state.phase = 'final3'
          pushEvent(
            state,
            `Final 3! The remaining housemates will compete for immunity before the audience decides third place.`,
            'game',
            { major: 'vox_populi_final_three' }
          )
        }
      }
    },

    /**
     * Player voluntarily self-evicts from the Diary Room.
     * Always sets the player's status to 'evicted' (never jury, regardless of jury
     * threshold — self-eviction is not a normal eviction path).
     * Clears any authoritative fields that reference the self-evicting player and
     * resets all human-decision blocking flags so the store is in a clean state
     * if the user navigates back (e.g., via the browser history).
     * The caller should navigate to /self-evicted after dispatching this action.
     */
    selfEvict(state, action: PayloadAction<string>) {
      const playerId = action.payload
      const player = state.players.find((p) => p.id === playerId)
      if (!player) return

      // Always 'evicted', never 'jury', for self-evictions. Cupid's active
      // contract applies here too: voluntarily leaving takes the partner out.
      const cupidWasActive = isCupidArrowActive(state)
      const selfEvictionIds = expandCupidIds(state, [playerId]).filter((id) => {
        const candidate = state.players.find((entry) => entry.id === id)
        return candidate?.status !== 'evicted' && candidate?.status !== 'jury'
      })
      const selfEvictionSet = new Set(selfEvictionIds)
      selfEvictionIds.forEach((id) => {
        const exitingPlayer = state.players.find((candidate) => candidate.id === id)
        if (!exitingPlayer) return
        assignSeasonPlacementOnExit(state, id)
        exitingPlayer.status = 'evicted'
      })
      state.nomineeIds = state.nomineeIds.filter((id) => !selfEvictionSet.has(id))

      // Clear fields that directly reference this player to avoid dangling IDs.
      if (state.lohId && selfEvictionSet.has(state.lohId)) state.lohId = null
      if (state.posWinnerId && selfEvictionSet.has(state.posWinnerId)) state.posWinnerId = null
      if (state.povSavedId && selfEvictionSet.has(state.povSavedId)) state.povSavedId = null
      if (state.povProtectedIds?.some((id) => selfEvictionSet.has(id))) {
        state.povProtectedIds = state.povProtectedIds.filter((id) => !selfEvictionSet.has(id))
      }
      if (state.pendingNominee1Id && selfEvictionSet.has(state.pendingNominee1Id)) {
        state.pendingNominee1Id = null
      }
      if (state.pendingEviction && selfEvictionSet.has(state.pendingEviction.evicteeId)) {
        state.pendingEviction = null
      }

      // Clear human-decision blocking flags so advance() can run cleanly.
      state.replacementNeeded = false
      state.awaitingNominations = false
      state.awaitingPovDecision = false
      state.awaitingPovSaveTarget = false
      state.awaitingHumanVote = false
      state.awaitingTieBreak = false
      state.awaitingMissionImmunityOffer = false
      state.tiedNomineeIds = null
      state.awaitingFinal3Eviction = false
      state.awaitingFinal3Plea = false
      state.evictionSplashId = null
      state.votes = {}
      state.voteResults = null

      if (cupidWasActive && selfEvictionIds.length > 1 && state.cupidArrow) {
        state.cupidArrow.eliminatedPairCount += 1
        if (state.cupidArrow.eliminatedPairCount >= CUPID_ARROW_BREAK_AFTER_PAIRS) {
          breakCupidArrowSpell(state)
        }
      }

      const partner = selfEvictionIds
        .filter((id) => id !== playerId)
        .map((id) => state.players.find((candidate) => candidate.id === id)?.name)
        .filter(Boolean)
        .join(' and ')
      pushEvent(
        state,
        partner
          ? `${player.name} has chosen to self-evict. Cupid's Arrow also eliminates ${partner}. 🚪💔`
          : `${player.name} has chosen to self-evict from The Big Eye house. 🚪`,
        'game',
        partner
          ? { broadcastTemplateId: 'cupid.self-eviction-pair', phase: 'eviction_results' }
          : undefined
      )
    },

    /**
     * Called by the UI when it starts rendering the step-1 "LOH must name a
     * replacement nominee" announcement during the AI replacement ceremony.
     * Clears the aiReplacementWaiting flag so advance() can proceed to step 2.
     */
    aiReplacementRendered(state) {
      state.aiReplacementWaiting = false
    },

    /**
     * Finalize the Final 4 eviction — used when the human POS holder casts their vote.
     * For AI, advance() handles the eviction automatically.
     * Validates that the evictee is a current nominee before proceeding.
     */
    finalizeFinal4Eviction(state, action: PayloadAction<string>) {
      const evicteeId = action.payload
      // Validate the evictee is a current nominee
      if (!state.nomineeIds.includes(evicteeId)) return
      const evictee = state.players.find((p) => p.id === evicteeId)
      const povHolder = state.players.find((p) => p.id === state.posWinnerId)
      if (!evictee || !povHolder) return

      // Defer the eviction commit until the cinematic overlay completes.
      // finalizePendingEviction will set evictee.status and transition to final3.
      state.awaitingPovDecision = false
      state.pendingEviction = {
        evicteeId,
        evictionMessage: `${povHolder.name} has chosen to eliminate ${evictee.name}. ${evictee.name} has been eliminated from The Big Eye house. 🚪`,
      }
    },

    /**
     * Finalize the Final 3 eviction — used when the human Final LOH directly evicts
     * one of the 2 remaining houseguests in the `final3_decision` phase.
     * For AI Final LOH, advance() handles the eviction automatically.
     * Validates that the evictee is a current nominee before proceeding.
     */
    finalizeFinal3Eviction(state, action: PayloadAction<string>) {
      const evicteeId = action.payload
      // Validate the evictee is a current nominee
      if (!state.nomineeIds.includes(evicteeId)) return
      const evictee = state.players.find((p) => p.id === evicteeId)
      const finalHoh = state.players.find((p) => p.id === state.lohId)
      if (!evictee || !finalHoh) return

      assignSeasonPlacementOnExit(state, evicteeId)
      evictee.status = evictedStatus(state)
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId)
      state.awaitingFinal3Eviction = false
      pushEvent(
        state,
        `${finalHoh.name} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
        'game'
      )
      state.phase = 'week_end'
      pushEvent(
        state,
        `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`,
        'game'
      )
    },

    // ─── Battle Back / Jury Return twist actions ──────────────────────────────

    /**
     * Activate the Battle Back twist after an eligible eviction.
     * Sets `battleBack.active = true` (blocks advance()) and pushes a TV event
     * with `major: 'battle_back'` so the TV filler shows an announcement.
     * The full-screen competition overlay is NOT shown yet — it only opens after
     * `openBattleBackCompetition` is dispatched (triggered by GameScreen once the
     * TV announcement has been seen, ~5 s after activation).
     * Called by the `tryActivateBattleBack` thunk when the probability roll passes.
     */
    activateBattleBack(state, action: PayloadAction<{ candidates: string[]; week: number }>) {
      if (isVoxPopuliTwistLocked(state)) return
      const bb: BattleBackState = {
        used: false,
        active: true,
        competitionActive: false,
        weekDecided: action.payload.week,
        candidates: action.payload.candidates,
        winnerId: null,
      }
      state.battleBack = bb
      state.twistActive = true
      // Push event WITH major: 'battle_back' so TvZone shows the TvAnnouncementOverlay.
      pushEvent(
        state,
        `🔥 SHOCK: Back 2 the Game is here! Tribunal members will compete for a chance to return! 🏆`,
        'twist',
        { major: 'battle_back' }
      )
    },

    /**
     * Open the full-screen Battle Back competition overlay.
     * Called by GameScreen ~5 s after `activateBattleBack`, once the TV
     * filler announcement has had time to be seen.
     */
    openBattleBackCompetition(state) {
      if (state.battleBack && state.battleBack.active) {
        state.battleBack.competitionActive = true
      }
    },

    /**
     * Complete the Battle Back twist — the winning juror returns to the house.
     * Changes their status from 'jury' to 'active', pushes a TV event,
     * marks the twist as used, and clears the active overlay flag.
     */
    completeBattleBack(state, action: PayloadAction<string>) {
      const winnerId = action.payload
      const bb = state.battleBack

      // Validate that the Battle Back is active and the winnerId is a valid jury candidate.
      if (!bb || !bb.active) {
        return
      }

      const isCandidate = bb.candidates.includes(winnerId)
      const winner = state.players.find((p) => p.id === winnerId)

      // Require the winner to be an exited stored candidate. Older/edge flows can
      // carry a valid Battle Back candidate as 'evicted' instead of 'jury'.
      if (!isCandidate || !winner || (winner.status !== 'jury' && winner.status !== 'evicted')) {
        return
      }

      winner.status = 'active'
      ensurePlayerStats(winner).battleBackWins = (winner.stats!.battleBackWins ?? 0) + 1
      // Clear evictedAtWeek so if this player is evicted again, assignSeasonPlacementOnExit
      // will stamp the correct week of their second eviction.
      winner.evictedAtWeek = undefined
      pushEvent(
        state,
        `🔥 ${winner.name} has survived Back 2 the Game and RETURNS to The Big Eye house! 🏠✨`,
        'twist'
      )

      bb.active = false
      bb.used = true
      bb.winnerId = winnerId
      state.twistActive = false
    },

    /**
     * Dismiss the Battle Back overlay without a winner (e.g., cancelled or
     * all candidates were eliminated with no result). Marks the twist as used
     * so it does not fire again this season.
     */
    dismissBattleBack(state) {
      if (state.battleBack) {
        state.battleBack.active = false
        state.battleBack.used = true
      }
      state.twistActive = false
    },

    // ─── Double Eviction twist actions ───────────────────────────────────────

    /**
     * Activate the Double Eviction twist for the current week.
     * Sets `doubleEviction.weekActive = true`, increments `usedCount`, sets
     * `twistActive`, and pushes a TV event with `major: 'double_eviction'` so
     * TvZone shows the announcement overlay.
     * Called by the `tryActivateDoubleEviction` thunk when the probability roll passes.
     */
    activateDoubleEviction(state) {
      if (!state.doubleEviction) {
        state.doubleEviction = { usedCount: 0, weekActive: false, pendingSecondEviction: null }
      }
      state.doubleEviction.weekActive = true
      state.doubleEviction.usedCount += 1
      state.doubleEviction.pendingSecondEviction = null
      state.twistActive = true
      state.twistActivatedThisWeek = true
      // Push event WITH major: 'double_eviction' so TvZone shows the overlay.
      const voxDoubleEvictionText = isVoxPopuliActive(state)
        ? `DOUBLE ELIMINATION! The last-place nominee joins the secret ballot's top two and any cutoff ties. At least three nominees must remain after Safety before the audience can eliminate the two highest public vote-getters.`
        : null
      const announcementKey = voxDoubleEvictionText ? 'vox_double_eviction' : 'double_eviction'
      pushEvent(
        state,
        voxDoubleEvictionText ??
          `⚡ DOUBLE ELIMINATION! Tonight the LOH must nominate THREE players. TWO will be eliminated live! ⚡`,
        'twist',
        { major: announcementKey }
      )
    },

    /**
     * Activate a special veto twist for the current week.
     * Called by the `tryActivateSpecialVeto` thunk when the probability roll passes.
     */
    activateSpecialVeto(state, action: PayloadAction<{ type: SpecialVetoType; week: number }>) {
      if (isVoxPopuliTwistLocked(state)) return
      const { type, week } = action.payload
      if (!state.specialVeto) {
        state.specialVeto = {
          seasonUsed: false,
          activeType: null,
          activatedWeek: null,
          vipUseStage: 0,
          awaitingHolderReplacement: false,
          awaitingCoupReplacement1: false,
          awaitingCoupReplacement2: false,
          coupReplacement1Id: null,
          awaitingVipSecondUseDecision: false,
          awaitingVipSecondSaveTarget: false,
        }
      }
      state.specialVeto.seasonUsed = true
      state.specialVeto.activeType = type
      state.specialVeto.activatedWeek = week
      state.specialVeto.vipUseStage = 0
      state.twistActive = true
      state.twistActivatedThisWeek = true

      const typeLabels: Record<SpecialVetoType, string> = {
        vip: 'DOUBLE TROUBLE! This week, the holder may use the power TWICE! 👑',
        diamond: 'HALO EXCHANGE! This week, the holder may name the backup nominee. 😇',
        coup: 'DETOX! This week, the holder may clear both nominees and name two replacements! ⚡',
        spotlight: 'FORCE MAJEURE! This week, the holder is forced to use the power. ✨',
      }
      const majorKeys: Record<SpecialVetoType, string> = {
        vip: 'vip_veto',
        diamond: 'diamond_pov',
        coup: 'coup_detat',
        spotlight: 'spotlight_veto',
      }
      pushEvent(state, typeLabels[type], 'twist', {
        major: majorKeys[type],
        week,
      })
    },

    setCupidArrowSchedule(state, action: PayloadAction<number | null>) {
      if (state.mode === 'survival') return
      const scheduledSeason = action.payload
      state.cupidArrow ??= {
        scheduledSeason,
        status: 'inactive',
        activatedSeason: null,
        activatedWeek: null,
        pairs: [],
        eliminatedPairCount: 0,
        pendingPartnerEvictionId: null,
      }
      state.cupidArrow.scheduledSeason = scheduledSeason
      if (state.cupidArrow.status === 'active' || state.cupidArrow.status === 'broken') return
      state.cupidArrow.status =
        scheduledSeason === state.season && state.week === 1 && state.phase === 'week_start'
          ? 'scheduled'
          : 'inactive'
    },

    activateCupidArrowNow(state) {
      if (state.mode === 'survival') return
      state.cupidArrow ??= {
        scheduledSeason: state.season,
        status: 'scheduled',
        activatedSeason: null,
        activatedWeek: null,
        pairs: [],
        eliminatedPairCount: 0,
        pendingPartnerEvictionId: null,
      }
      state.cupidArrow.scheduledSeason = state.season
      state.cupidArrow.status = 'scheduled'
      activateCupidArrowForSeason(state)
    },

    breakCupidArrowNow(state) {
      breakCupidArrowSpell(state)
    },

    setVoxPopuliSchedule(state, action: PayloadAction<number | null>) {
      if (state.mode === 'survival') return
      const scheduledSeason = action.payload
      state.voxPopuli ??= createInitialVoxPopuliState(scheduledSeason)
      state.voxPopuli.scheduledSeason = scheduledSeason
      if (state.voxPopuli.status === 'active' || state.voxPopuli.status === 'complete') return
      state.voxPopuli.status =
        scheduledSeason === state.season && state.week === 1 && state.phase === 'week_start'
          ? 'scheduled'
          : 'inactive'
    },

    activateVoxPopuliNow(state) {
      if (state.mode === 'survival') return
      if (isCupidArrowTwistLocked(state)) return
      state.voxPopuli ??= createInitialVoxPopuliState(state.season)
      state.voxPopuli.scheduledSeason = state.season
      state.voxPopuli.status = 'scheduled'
      activateVoxPopuliForSeason(state)
    },

    setSeasonExpansion(state, action: PayloadAction<'cupidArrow' | 'voxPopuli' | null>) {
      if (state.mode === 'survival') {
        state.expansionMode = null
        return
      }
      state.expansionMode = action.payload
    },

    queueForcedShock(state, action: PayloadAction<ForcedShockType>) {
      const type = action.payload
      if (
        isVoxPopuliActive(state) &&
        !['doubleEviction', 'dayStartShock', 'twinShock'].includes(type)
      ) {
        pushEvent(
          state,
          `[DEBUG] ${formatForcedShockLabel(type)} is unavailable during Vox Populi.`,
          'game'
        )
        return
      }
      const earliestWeek = getForcedShockActivationWeek(state, getForcedShockSafePhase(type))
      state.pendingForcedShock = {
        type,
        requestedWeek: state.week,
        earliestWeek,
      }
      pushEvent(
        state,
        `[DEBUG] ${formatForcedShockLabel(type)} queued for the next safe shock window (earliest Day ${earliestWeek}). ⚡`,
        'game'
      )
    },

    clearForcedShock(state) {
      if (!state.pendingForcedShock) return
      pushEvent(
        state,
        `[DEBUG] Cleared queued ${formatForcedShockLabel(state.pendingForcedShock.type)} shock. ⚡`,
        'game'
      )
      state.pendingForcedShock = null
    },

    /** Clear a queued debug shock after it has been successfully consumed. */
    consumeForcedShock(state) {
      state.pendingForcedShock = null
    },

    /**
     * Activate the day-start shock popup.
     * The popup stays visible until the player confirms the elimination.
     */
    activateDayStartShock(state, action: PayloadAction<DayStartShockState>) {
      state.dayStartShock = action.payload
      state.dayStartShockUsedThisSeason = true
      state.twistActivatedThisWeek = true
    },

    /**
     * Confirm the day-start shock and hand the chosen housemate off to the
     * standard eviction splash.
     */
    confirmDayStartShock(state) {
      if (!state.dayStartShock) return
      const { targetId, reason } = state.dayStartShock
      state.pendingEviction = {
        evicteeId: targetId,
        evictionMessage: reason,
      }
      state.dayStartShock = null
    },

    /**
     * Human Halo Exchange holder picks the replacement nominee.
     */
    submitDiamondReplacement(state, action: PayloadAction<string>) {
      if (!state.specialVeto?.awaitingHolderReplacement) return
      if (state.specialVeto.activeType !== 'diamond') return
      const id = action.payload
      if (
        id === state.lohId ||
        id === state.posWinnerId ||
        state.nomineeIds.includes(id) ||
        !isEligibleReplacementNominee(state, id)
      )
        return
      const player = state.players.find((p) => p.id === id)
      const povHolder = state.players.find((p) => p.id === state.posWinnerId)
      if (!player) return
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      if (!alive.some((p) => p.id === id)) return

      state.nomineeIds.push(id)
      if (player.id === state.lohId) player.status = 'loh'
      else if (player.id === state.posWinnerId) player.status = 'nominated+pos'
      else player.status = 'nominated'
      incrementTimesNominated(state, id)
      state.specialVeto.awaitingHolderReplacement = false
      pushEvent(
        state,
        `${povHolder?.name ?? 'The Halo Exchange holder'} named ${player.name} as the backup nominee. 😇`,
        'game'
      )
    },

    /**
     * Human Detox holder picks replacement nominees (called twice: first and second pick).
     */
    submitCoupReplacement(state, action: PayloadAction<string>) {
      if (
        !state.specialVeto?.awaitingCoupReplacement1 &&
        !state.specialVeto?.awaitingCoupReplacement2
      )
        return
      if (state.specialVeto.activeType !== 'coup') return
      const id = action.payload
      const povHolder = state.players.find((p) => p.id === state.posWinnerId)
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')

      if (state.specialVeto.awaitingCoupReplacement1) {
        if (id === state.posWinnerId || state.nomineeIds.includes(id)) return
        if (!isEligibleReplacementNominee(state, id, 2, { allowLoh: true, actorId: povHolder?.id }))
          return
        state.specialVeto.coupReplacement1Id = id
        state.specialVeto.awaitingCoupReplacement1 = false
        state.specialVeto.awaitingCoupReplacement2 = true
        const player = state.players.find((p) => p.id === id)
        pushDetoxEvent(
          state,
          `${povHolder?.name ?? 'The Detox holder'} selects ${player?.name ?? id} as the first replacement. Choose a second. ⚡`
        )
      } else if (state.specialVeto.awaitingCoupReplacement2) {
        const rep1Id = state.specialVeto.coupReplacement1Id
        if (id === state.posWinnerId || id === rep1Id || state.nomineeIds.includes(id)) return
        if (!alive.some((p) => p.id === id)) return
        const availableSecondChoices = getReplacementEligiblePlayers(state, alive, 2, {
          allowLoh: true,
          actorId: povHolder?.id,
        }).filter((player) => player.id !== rep1Id)
        if (!availableSecondChoices.some((player) => player.id === id)) return

        const rep1 = state.players.find((p) => p.id === rep1Id)
        const rep2 = state.players.find((p) => p.id === id)
        if (!rep1 || !rep2) return

        appendNominee(state, rep1.id)
        appendNominee(state, rep2.id)
        state.specialVeto.awaitingCoupReplacement2 = false
        state.specialVeto.coupReplacement1Id = null
        pushDetoxEvent(
          state,
          `${povHolder?.name ?? 'The Detox holder'} named ${rep1.name} and ${rep2.name} as the new nominees. ⚡`
        )
      }
    },

    /**
     * Human Double Trouble holder decides whether to use the power a second time.
     */
    submitVipSecondUseDecision(state, action: PayloadAction<boolean>) {
      if (!state.specialVeto?.awaitingVipSecondUseDecision) return
      state.specialVeto.awaitingVipSecondUseDecision = false
      const povHolder = state.players.find((p) => p.id === state.posWinnerId)
      const nominees = state.players.filter((player) => state.nomineeIds.includes(player.id))
      const willUseSecond = action.payload || shouldUseSafetyForTwin(state, povHolder?.id, nominees)
      if (willUseSecond) {
        state.specialVeto.awaitingVipSecondSaveTarget = true
        pushEvent(
          state,
          `${povHolder?.name ?? 'The Double Trouble holder'} will use Double Trouble a second time! Choose a nominee to save. 👑`,
          'game'
        )
      } else {
        state.specialVeto.vipUseStage = -1
        pushEvent(
          state,
          `${povHolder?.name ?? 'The Double Trouble holder'} chose not to use Double Trouble a second time. 👑`,
          'game'
        )
      }
    },

    /**
     * Human Double Trouble holder picks which nominee to save on the second use.
     */
    submitVipSecondSaveTarget(state, action: PayloadAction<string>) {
      if (!state.specialVeto?.awaitingVipSecondSaveTarget) return
      if (state.specialVeto.activeType !== 'vip') return
      const saveId = action.payload
      if (!state.nomineeIds.includes(saveId)) return

      const savedPlayer = state.players.find((p) => p.id === saveId)
      const povHolder = state.players.find((p) => p.id === state.posWinnerId)
      const lohPlayer = state.players.find((p) => p.id === state.lohId)
      if (!savedPlayer || !povHolder) return
      const twinSaveTarget = getTwinNomineeToSave(state, povHolder.id)
      if (twinSaveTarget && twinSaveTarget.id !== saveId) return

      state.nomineeIds = state.nomineeIds.filter((id) => id !== saveId)
      savedPlayer.status = 'active'
      state.specialVeto.awaitingVipSecondSaveTarget = false
      state.specialVeto.vipUseStage = 3
      state.povSavedId = saveId
      addPovProtectedId(state, saveId)
      pushEvent(
        state,
        `${povHolder.name} used Double Trouble a second time, saving ${savedPlayer.name}! 👑`,
        'game'
      )
      if (lohPlayer?.isUser) {
        state.replacementNeeded = true
        pushEvent(state, `${lohPlayer.name} must now name another backup nominee. 🎯`, 'game')
      } else {
        const aliveNow = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
        const eligible = getReplacementEligiblePlayers(state, aliveNow)
        if (eligible.length > 0) {
          const rng = mulberry32(state.seed)
          const replacement = seededPick(rng, eligible)
          state.nomineeIds.push(replacement.id)
          const rp = state.players.find((pl) => pl.id === replacement.id)
          if (rp) rp.status = 'nominated'
          incrementTimesNominated(state, replacement.id)
          pushEvent(
            state,
            `${lohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`,
            'game'
          )
          state.specialVeto.vipUseStage = -1
        } else {
          state.specialVeto.vipUseStage = -1
        }
      }
    },

    // ─── Public's Favorite Player twist actions ───────────────────────────────

    /**
     * Begin the Public's Favorite Player voting phase.
     * Shows full-screen voting overlay after the finale winner reveal.
     * Feature-gated via settings.sim.enableFavoritePlayer.
     */
    startFavoritePlayerPhase(
      state,
      action: PayloadAction<{ candidates: string[]; awardAmount: number }>
    ) {
      state.favoritePlayer = {
        active: true,
        votingStarted: false,
        candidates: action.payload.candidates,
        eliminated: [],
        votes: {},
        winnerId: null,
        awardAmount: action.payload.awardAmount,
      }
      state.twistActive = true
      // Push a TV event WITH major: 'twist' so the TV filler shows the announcement
      // while the voting overlay waits for openFavoritePlayerVoting.
      pushEvent(
        state,
        `⭐ THE PUBLIC DECIDES: Vote for your Public's Favorite Player! 🏆`,
        'twist',
        { major: 'twist' }
      )
      // Append a start event to game history
      if (!state.history) state.history = []
      state.history.push({
        type: 'favoritePlayer:start',
        week: state.week,
        data: { candidates: action.payload.candidates, awardAmount: action.payload.awardAmount },
        timestamp: Date.now(),
      })
    },

    /**
     * Open the full-screen Public's Favorite voting overlay.
     * Called by GameScreen ~5 s after `startFavoritePlayerPhase`, once the TV
     * filler announcement has had time to be seen.
     */
    openFavoritePlayerVoting(state) {
      if (state.favoritePlayer && state.favoritePlayer.active) {
        state.favoritePlayer.votingStarted = true
      }
    },

    /**
     * Eliminate a candidate from the Public's Favorite voting.
     * Called each time the lowest-voted candidate is removed.
     */
    eliminateFavoriteCandidate(state, action: PayloadAction<string>) {
      const fp = state.favoritePlayer
      if (!fp || !fp.active) return
      const elimId = action.payload
      if (!fp.eliminated.includes(elimId)) {
        fp.eliminated.push(elimId)
      }
    },

    /**
     * Resolve the Public's Favorite Player vote with a winner.
     * Closes the overlay and records the winner in state and history.
     */
    resolveFavoritePlayerWinner(state, action: PayloadAction<string>) {
      const fp = state.favoritePlayer
      if (!fp || !fp.active) return
      fp.winnerId = action.payload
      fp.active = false
      state.twistActive = false
      // Append a winner event to game history (append-only — do not mutate existing entry)
      if (!state.history) state.history = []
      state.history.push({
        type: 'favoritePlayer:winner',
        week: state.week,
        data: { winnerId: action.payload, awardAmount: fp.awardAmount },
        timestamp: Date.now(),
      })
    },

    /**
     * Award hook for the Public's Favorite Player prize.
     * Currently a no-op that records intent in history.
     * Future integrations can attach to this action to update player balances.
     */
    awardFavoritePrize(state) {
      const fp = state.favoritePlayer
      if (!fp || !fp.winnerId) return
      // Append an award event to game history (balance update is left to future integration)
      if (!state.history) state.history = []
      state.history.push({
        type: 'favoritePlayer:award',
        week: state.week,
        data: { winnerId: fp.winnerId, awardAmount: fp.awardAmount },
        timestamp: Date.now(),
      })
    },

    // ─── Spectator overlay ────────────────────────────────────────────────────

    /**
     * Open the SpectatorView overlay.  Sets spectatorActive with metadata so
     * advance() blocks until closeSpectator is dispatched.
     * No-op if spectatorActive is already set (deduplication guard).
     */
    openSpectator(state, action: PayloadAction<SpectatorActiveState>) {
      if (state.spectatorActive) {
        // Already open — prevent duplicate overlays and race conditions.
        if (import.meta.env.DEV) {
          console.log('[gameSlice] openSpectator: no-op (already active)', state.spectatorActive)
        }
        return
      }
      if (import.meta.env.DEV) {
        console.log('[gameSlice] openSpectator', action.payload)
      }
      state.spectatorActive = action.payload
    },

    /**
     * Close the SpectatorView overlay.  Clears spectatorActive so advance()
     * can proceed again.
     */
    closeSpectator(state) {
      if (import.meta.env.DEV) {
        console.log('[gameSlice] closeSpectator')
      }
      state.spectatorActive = null
    },

    /**
     * Set or clear the awaitingFinal3Plea flag.
     * When true, the Final-3 ceremony overlay is shown (coronation → pleas →
     * LOH decision → eviction).  advance() blocks while this is true.
     */
    setAwaitingFinal3Plea(state, action: PayloadAction<boolean>) {
      state.awaitingFinal3Plea = action.payload
      if (import.meta.env.DEV) {
        console.log('[gameSlice] awaitingFinal3Plea set to', action.payload)
      }
    },

    /**
     * Finalize the Final-3 ceremony: evict the chosen player, crown the Final
     * LOH, clear awaitingFinal3Plea, and advance to week_end.
     * Called by Final3Ceremony when the ceremony completes.
     */
    finalizeFinal3Decision(
      state,
      action: PayloadAction<{ hohWinnerId: string; evicteeId: string }>
    ) {
      const { hohWinnerId, evicteeId } = action.payload

      // Validate evictee is a current nominee.
      if (!state.nomineeIds.includes(evicteeId)) return

      const hoh = state.players.find((p) => p.id === hohWinnerId)
      const evictee = state.players.find((p) => p.id === evicteeId)
      if (!evictee) return

      // Crown LOH (may already be set from advance(); idempotent).
      if (hoh && state.lohId !== hohWinnerId) {
        if (import.meta.env.DEV) {
          console.log('[applyLohWinner]', {
            source: '[finalizeFinal3Decision]',
            previousHohId: state.lohId,
            nextHohId: hohWinnerId,
            currentPhase: state.phase,
          })
        }
        state.lohId = hohWinnerId
        state.players.forEach((p) => {
          if (p.status === 'loh') p.status = 'active'
        })
        hoh.status = 'loh'
      }

      // Evict the chosen player.
      assignSeasonPlacementOnExit(state, evicteeId)
      evictee.status = evictedStatus(state)
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId)

      pushEvent(
        state,
        `${hoh?.name ?? hohWinnerId} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
        'game'
      )
      pushEvent(
        state,
        `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`,
        'game'
      )

      state.awaitingFinal3Plea = false
      state.phase = 'week_end'

      if (import.meta.env.DEV) {
        console.log('[gameSlice] finalizeFinal3Decision: evicted', evicteeId, 'loh', hohWinnerId)
      }
    },

    // ─── Debug-only actions ───────────────────────────────────────────────────
    /** Force a specific player to be LOH (debug only). */
    forceHoH(state, action: PayloadAction<string>) {
      const id = action.payload
      state.players.forEach((p) => {
        if (p.status === 'loh') p.status = 'active'
        if (p.status === 'loh+pos') p.status = 'pos'
      })
      state.lohId = id
      const player = state.players.find((p) => p.id === id)
      if (player) {
        player.status = player.status === 'pos' ? 'loh+pos' : 'loh'
        syncCupidRoleStatuses(state)
        pushEvent(state, `[DEBUG] ${player.name} forced as Leader of the House. 👑`, 'game')
      }
    },
    /** Force specific players as nominees (debug only). */
    forceNominees(state, action: PayloadAction<string[]>) {
      const ids = action.payload
      state.players.forEach((p) => {
        if (p.status === 'nominated') p.status = 'active'
        if (p.status === 'nominated+pos') p.status = 'pos'
      })
      state.nomineeIds = expandCupidIds(state, ids)
      const names: string[] = []
      ids.forEach((id) => {
        const p = state.players.find((pl) => pl.id === id)
        if (p) {
          p.status = p.status === 'pos' ? 'nominated+pos' : 'nominated'
          names.push(p.name)
        }
      })
      syncCupidRoleStatuses(state)
      pushEvent(state, `[DEBUG] ${names.join(' and ')} forced as nominees. 🎯`, 'game')
    },
    /** Force a specific player as POS winner (debug only). */
    forcePovWinner(state, action: PayloadAction<string>) {
      const id = action.payload
      state.players.forEach((p) => {
        if (p.status === 'pos') p.status = 'active'
        if (p.status === 'loh+pos') p.status = 'loh'
        if (p.status === 'nominated+pos') p.status = 'nominated'
      })
      state.posWinnerId = id
      const player = state.players.find((p) => p.id === id)
      if (player) {
        if (player.status === 'loh') player.status = 'loh+pos'
        else if (player.status === 'nominated') player.status = 'nominated+pos'
        else player.status = 'pos'
        const partnerId = getCupidPartnerId(state, id)
        if (partnerId) addPovProtectedId(state, partnerId)
        syncCupidRoleStatuses(state)
        pushEvent(state, `[DEBUG] ${player.name} forced as POS winner. 🎭`, 'game')
      }
    },
    /** Force a player's house status without leaving stale competition roles (debug only). */
    forcePlayerStatus(
      state,
      action: PayloadAction<{ playerId: string; status: 'active' | 'jury' | 'evicted' }>
    ) {
      const { playerId, status } = action.payload
      const player = state.players.find((candidate) => candidate.id === playerId)
      if (!player) return
      if (status !== 'active') {
        state.nomineeIds = state.nomineeIds.filter((id) => id !== playerId)
        state.povProtectedIds = (state.povProtectedIds ?? []).filter((id) => id !== playerId)
        if (state.lohId === playerId) state.lohId = null
        if (state.posWinnerId === playerId) state.posWinnerId = null
        player.evictedAtWeek = player.evictedAtWeek ?? state.week
      } else {
        player.evictedAtWeek = undefined
        player.finalRank = undefined
        player.seasonPlacement = undefined
        player.isWinner = false
      }
      player.status = status
      pushEvent(state, `[DEBUG] ${player.name} forced to ${status} status.`, 'game')
    },
    /**
     * Debug-only, fully valid Vox Populi Final Three entry point. Unlike
     * forcing a phase, it clears every preceding ceremony role and creates the
     * same clean state produced after a real Final Four eviction.
     */
    prepareVoxFinalThreeTest(state) {
      if (!isVoxPopuliActive(state) || !state.voxPopuli) return
      const human = state.players.find((player) => player.isUser)
      const finalists = [
        ...(human ? [human] : []),
        ...state.players.filter((player) => !player.isUser).slice(0, human ? 2 : 3),
      ].slice(0, 3)
      if (finalists.length !== 3) return

      const finalistIds = new Set(finalists.map((player) => player.id))
      state.players.forEach((player) => {
        player.status = finalistIds.has(player.id) ? 'active' : 'evicted'
        if (!finalistIds.has(player.id)) player.evictedAtWeek = player.evictedAtWeek ?? state.week
      })
      resetVoxFinalThreeRound(state)
      state.voxPopuli.finalistIds = []
      state.voxPopuli.finaleStage = null
      state.voxPopuli.winnerId = null
      state.tvFeed = []
      state.phase = 'final3'
      pushEvent(
        state,
        `Final 3! ${formatNameList(finalists.map((player) => player.name))} remain. The final immunity journey begins now.`,
        'game',
        { major: 'vox_final3', broadcastPriority: 'critical' }
      )
    },
    /** Force entry into Final 4 eviction phase (debug only). */
    forcePhase(state, action: PayloadAction<Phase>) {
      state.phase = action.payload
      pushEvent(state, `[DEBUG] Phase forced to ${action.payload}. 🔧`, 'game')
    },
    /**
     * Mark the winner and runner-up in player data after the finale.
     * Called by the FinalFaceoff component once the winner is declared.
     */
    finalizeGame(state, action: PayloadAction<{ winnerId: string; runnerUpId: string }>) {
      const { winnerId, runnerUpId } = action.payload
      state.players.forEach((p) => {
        if (p.id === winnerId) {
          p.isWinner = true
          p.finalRank = 1
        } else if (p.id === runnerUpId) {
          p.finalRank = 2
        }
      })
      pushEvent(
        state,
        `🏆 ${state.players.find((p) => p.id === winnerId)?.name ?? 'The winner'} has won The Big Eye – AI Edition! Congratulations! 🎉`,
        'game'
      )
    },
    completeVoxFinalistShowcase(state) {
      if (!isVoxPopuliActive(state) || state.voxPopuli?.finaleStage !== 'showcase') return
      state.voxPopuli.finaleStage = 'ready'
      pushEvent(state, `Ready for the Finale? Make your move.`, 'game', {
        major: 'vox_populi_finale_ready',
        broadcastPriority: 'critical',
      })
    },
    startVoxFinalVote(state) {
      if (
        !isVoxPopuliActive(state) ||
        !state.voxPopuli ||
        !['ready', 'recap'].includes(state.voxPopuli.finaleStage ?? '')
      ) {
        return
      }
      state.voxPopuli.finaleStage = 'final_vote'
      pushEvent(
        state,
        `The final audience vote is open. The public is choosing the winner of the season.`,
        'vote',
        { major: 'vox_populi_final_vote' }
      )
    },
    resolveVoxSeasonWinner(state, action: PayloadAction<string>) {
      if (!isVoxPopuliActive(state) || state.voxPopuli?.finaleStage !== 'final_vote') return
      const winnerId = action.payload
      const finalistIds = state.voxPopuli.finalistIds
      if (!finalistIds.includes(winnerId)) return
      const runnerUpId = finalistIds.find((id) => id !== winnerId)
      state.players.forEach((player) => {
        if (player.id === winnerId) {
          player.isWinner = true
          player.finalRank = 1
          player.seasonPlacement = 1
        } else if (player.id === runnerUpId) {
          player.finalRank = 2
          player.seasonPlacement = 2
        }
      })
      state.voxPopuli.winnerId = winnerId
      // The public-vote overlay has announced the champion. Build the recap
      // with final winner data before continuing to the interview and close.
      state.voxPopuli.finaleStage = 'recap'
      state.history = [
        ...(state.history ?? []),
        {
          type: 'voxPopuli:winner',
          week: state.week,
          data: { winnerId, runnerUpId, decidedBy: 'audience' },
          timestamp: Date.now(),
        },
      ]
      pushEvent(
        state,
        `${state.players.find((player) => player.id === winnerId)?.name ?? 'The winner'} receives the most public support and wins The Big Eye!`,
        'game',
        { major: 'vox_populi_winner' }
      )
    },
    completeVoxSeasonRecap(state) {
      if (
        !state.voxPopuli ||
        state.voxPopuli.finaleStage !== 'recap' ||
        !state.voxPopuli.winnerId
      ) {
        return
      }
      state.voxPopuli.finaleStage = null
      state.voxPopuli.status = 'complete'
      state.twistActive = false
      state.seasonFinale = {
        phase: 'winnerInterview',
        winnerId: state.voxPopuli.winnerId,
        interviewIndex: state.seed % FINALE_INTERVIEW_VARIANT_COUNT,
        goodbyeIndex: 0,
        isChatOpen: true,
        isLightsOffAnimating: false,
        publicFavoriteEnabled: false,
      }
    },
    startWinnerCinematic(
      state,
      action: PayloadAction<{
        winnerId: string
        seed: number
        publicFavoriteEnabled: boolean
      }>
    ) {
      const { winnerId, seed, publicFavoriteEnabled } = action.payload
      const interviewIndex = seed % FINALE_INTERVIEW_VARIANT_COUNT
      const nextFinaleState: SeasonFinaleState = {
        phase: 'winnerCinematic',
        winnerId,
        interviewIndex,
        goodbyeIndex: 0,
        isChatOpen: false,
        isLightsOffAnimating: false,
        publicFavoriteEnabled,
      }
      state.seasonFinale = nextFinaleState
    },
    startWinnerInterview(state) {
      if (state.seasonFinale?.phase !== 'winnerCinematic') return
      state.seasonFinale.phase = 'winnerInterview'
      state.seasonFinale.isChatOpen = true
    },
    advanceInterview(state) {
      if (state.seasonFinale?.phase !== 'winnerInterview') return
      if (state.seasonFinale.publicFavoriteEnabled) {
        state.seasonFinale.phase = 'publicFavoriteSetup'
        state.seasonFinale.isChatOpen = true
        return
      }
      state.seasonFinale.phase = 'goodbyeSequence'
      state.seasonFinale.goodbyeIndex = 0
      state.seasonFinale.isChatOpen = true
    },
    startPublicFavorite(state) {
      if (state.seasonFinale?.phase !== 'publicFavoriteSetup') return
      state.seasonFinale.phase = 'publicFavoriteFlow'
      state.seasonFinale.isChatOpen = false
    },
    resumeAfterPublicFavorite(state, action: PayloadAction<{ winnerId?: string }>) {
      if (state.seasonFinale?.phase !== 'publicFavoriteFlow') return
      state.seasonFinale.phase = 'goodbyeSequence'
      state.seasonFinale.publicFavoriteWinnerId = action.payload.winnerId
      state.seasonFinale.goodbyeIndex = 0
      state.seasonFinale.isChatOpen = true
    },
    startGoodbyeSequence(state) {
      if (
        state.seasonFinale?.phase !== 'winnerInterview' &&
        state.seasonFinale?.phase !== 'publicFavoriteFlow' &&
        state.seasonFinale?.phase !== 'publicFavoriteSetup'
      ) {
        return
      }
      state.seasonFinale.phase = 'goodbyeSequence'
      state.seasonFinale.goodbyeIndex = 0
      state.seasonFinale.isChatOpen = true
    },
    advanceGoodbyeSequence(state, action: PayloadAction<number>) {
      if (state.seasonFinale?.phase !== 'goodbyeSequence') return
      state.seasonFinale.goodbyeIndex = Math.max(state.seasonFinale.goodbyeIndex, action.payload)
    },
    startLightsOff(state) {
      if (state.seasonFinale?.phase !== 'goodbyeSequence') return
      state.seasonFinale.phase = 'lightsOffTransition'
      state.seasonFinale.isChatOpen = false
      state.seasonFinale.isLightsOffAnimating = true
    },
    completeFinale(state) {
      if (state.seasonFinale?.phase !== 'lightsOffTransition') return
      state.seasonFinale.phase = 'seasonComplete'
      state.seasonFinale.isLightsOffAnimating = false
      state.seasonFinale.isChatOpen = false
    },

    /** Clear any blocking human-decision flags (replacementNeeded, awaitingFinal3Eviction, etc.)
     * that could prevent the Continue button from appearing (debug only).
     */
    clearBlockingFlags(state) {
      state.replacementNeeded = false
      state.awaitingNominations = false
      state.pendingNominee1Id = null
      state.awaitingPublicSave = false
      state.awaitingPovDecision = false
      state.awaitingPovSaveTarget = false
      state.awaitingHumanVote = false
      state.awaitingTieBreak = false
      state.tiedNomineeIds = null
      state.awaitingFinal3Eviction = false
      state.awaitingFinal3Plea = false
      state.votes = {}
      state.voteResults = null
      state.evictionSplashId = null
      state.pendingEviction = null
      state.dayStartShock = null
      pushEvent(state, `[DEBUG] Blocking flags cleared — Continue button restored. 🔧`, 'game')
    },
    submitTwinShockAnswer(state, action: PayloadAction<string>) {
      const twinShock = state.twinShock
      if (!twinShock) return
      const canProcessUnpromptedFollowUpGuess =
        twinShock.promptStage == null && twinShock.status === 'day4_asked_no_correct_guess'
      if (!twinShock.promptStage && !canProcessUnpromptedFollowUpGuess) return
      const human = getHumanPlayer(state)
      if (!human || human.status === 'evicted' || human.status === 'jury') {
        twinShock.promptStage = null
        twinShock.queuedDay = null
        return
      }
      const result = resolveTwinShockTurn(twinShock, action.payload, {
        playerName: human.name,
        liaActive: isPlayerActiveInHouse(state, TWIN_SHOCK_LIA_ID),
      })
      applyTwinShockTurnResult(state, result)
    },

    completeTwinShockRevealAnimation(state) {
      if (!state.twinShock) return
      state.twinShock.pendingRevealAnimation = null
    },

    /**
     * Archive the completed season.  Prepends the archive entry and caps the
     * list at 50 entries to bound memory usage.
     */
    archiveSeason(state, action: PayloadAction<SeasonArchive>) {
      if (!state.seasonArchives) state.seasonArchives = []
      state.seasonArchives.unshift(action.payload)
      if (state.seasonArchives.length > 50) {
        state.seasonArchives = state.seasonArchives.slice(0, 50)
      }
    },
    /**
     * Replace the entire player list.  Used by the start-new-season flow to
     * inject a normalized roster (no stale evicted/jury/grayscale flags).
     */
    replacePlayers(state, action: PayloadAction<Player[]>) {
      state.players = action.payload
      state.competitionSeasonStateByPlayerId = buildInitialCompetitionSeasonState(action.payload)
    },
    updateUserPlayerIdentity(
      state,
      action: PayloadAction<{ name: string; avatar: string; photoId?: string }>
    ) {
      const human = state.players.find((player) => player.isUser)
      if (!human) return
      human.name = action.payload.name.trim() || human.name
      human.avatar = action.payload.photoId
        ? profilePhotoAvatar(action.payload.photoId)
        : action.payload.avatar
    },
    /** Reset game state with a fresh random roster. */
    resetGame(state, action: PayloadAction<SeasonArchive[] | undefined>) {
      // Mix Math.random() with Date.now() to derive a fresh 32-bit game seed.
      // This seed drives in-game RNG (LOH/POS/vote outcomes); it is independent
      // of the Math.random() seed used in pickHouseguests() for roster selection.
      const seed =
        getE2ENewSeasonFixture()?.seasonSeed ??
        (Math.floor(Math.random() * 0x100000000) ^ (Date.now() & 0xffffffff)) >>> 0
      // When an explicit archives array is provided (e.g. on profile switch) use it;
      // otherwise preserve the current in-memory archives so a regular game restart
      // does not lose season history.
      const seasonArchives =
        action.payload !== undefined ? action.payload : (state.seasonArchives ?? [])
      // Derive the next season number from the maximum archived seasonIndex so the
      // result is stable even after the 50-entry archive cap or non-contiguous entries.
      const season = nextSeasonNumber(seasonArchives)
      const twinShockConsumed = state.twinShockConsumed === true
      // Use the factory to build a fully fresh initial state from the latest
      // persisted settings/profile, then override seed, seasonArchives, and season.
      const fresh = {
        ...createInitialGameState({ twinShockConsumed, seed }),
        seasonArchives,
        season,
        status: 'active' as const,
        broadcastOverrides: state.broadcastOverrides ?? {},
        customBroadcasts: state.customBroadcasts ?? [],
      }
      fresh.twinShockConsumed = twinShockConsumed
      fresh.twinShockActivatedSeason = state.twinShockActivatedSeason ?? null
      fresh.twinShockResolution = state.twinShockResolution ?? null
      fresh.twinShockResolvedDay = state.twinShockResolvedDay ?? null
      fresh.twinShockDiscoveredByUser = state.twinShockDiscoveredByUser ?? false
      fresh.liaForcedUntilTwinShockResolved = !twinShockConsumed
      if (fresh.cupidArrow) {
        fresh.cupidArrow.status =
          fresh.cupidArrow.scheduledSeason === season ? 'scheduled' : 'inactive'
      }
      if (fresh.voxPopuli) {
        fresh.voxPopuli.status =
          fresh.voxPopuli.scheduledSeason === season ? 'scheduled' : 'inactive'
      }
      // Preserve the manager-built Season Start sequence. Only refresh the
      // dynamic season placeholder after the archive-derived season is known.
      fresh.tvFeed = fresh.tvFeed.map((event) =>
        event.meta?.broadcastTemplateId === 'season.welcome'
          ? {
              ...event,
              text: renderBroadcastTemplate(
                fresh.broadcastOverrides?.['season.welcome']?.text ??
                  getBroadcastTemplate('season.welcome')?.text ??
                  event.text,
                [String(season)]
              ),
            }
          : event
      )
      beginPhaseBroadcastSequence(fresh, 'season_start')
      finishPhaseBroadcastSequence(fresh)
      fresh.tvFeed.forEach((event) => refreshManagedBroadcastDefinition(fresh, event))
      rebuildManagedBroadcastQueue(fresh, 'season_start')
      return fresh
    },
    /**
     * Restore a previously saved in-progress game state (manual save/resume).
     * Replaces the entire game slice with the snapshot.
     * seasonFinale field is always preserved as-is from the snapshot.
     */
    hydrateGame(state, action: PayloadAction<GameState>) {
      const hydrated: GameState = {
        ...action.payload,
        gameId: action.payload.gameId ?? crypto.randomUUID(),
        hasSeenConfessionalSpotlight: action.payload.hasSeenConfessionalSpotlight ?? false,
        status: action.payload.status ?? 'active',
        // Season archives are persisted independently from in-progress runs.
        // New snapshots omit them to stay small, so retain the active profile's
        // already-loaded archive history while hydrating a campaign.
        seasonArchives: state.seasonArchives ?? [],
        // Broadcast Manager configuration is permanent authoring data, not a
        // campaign snapshot. Never let an older saved run overwrite it.
        broadcastOverrides: state.broadcastOverrides ?? {},
        customBroadcasts: state.customBroadcasts ?? [],
        tvFeed: (action.payload.tvFeed ?? []).map((event) => ({
          ...event,
          meta: event.meta ? { ...event.meta } : undefined,
        })),
        broadcastQueue: action.payload.broadcastQueue ?? [],
        lastPlainBroadcastEventId: action.payload.lastPlainBroadcastEventId ?? null,
        twinShock: action.payload.twinShock ?? createInitialTwinShockState(),
        lohSafetyAdvice: action.payload.lohSafetyAdvice ?? null,
        currentWeekNominationRecord: action.payload.currentWeekNominationRecord ?? null,
        lastWeekNominationRecord: action.payload.lastWeekNominationRecord ?? null,
        twinShockConsumed: action.payload.twinShockConsumed ?? false,
        twinShockActivatedSeason: action.payload.twinShockActivatedSeason ?? null,
        twinShockResolution: action.payload.twinShockResolution ?? null,
        twinShockResolvedDay: action.payload.twinShockResolvedDay ?? null,
        twinShockDiscoveredByUser: action.payload.twinShockDiscoveredByUser ?? false,
        voxPopuli: action.payload.voxPopuli
          ? {
              ...createInitialVoxPopuliState(action.payload.voxPopuli.scheduledSeason),
              ...action.payload.voxPopuli,
              lastReplacementNomineeIds: action.payload.voxPopuli.lastReplacementNomineeIds ?? [],
            }
          : createInitialVoxPopuliState(null),
        voteResultsMode: action.payload.voteResultsMode ?? 'house',
        liaForcedUntilTwinShockResolved:
          action.payload.liaForcedUntilTwinShockResolved ??
          !(action.payload.twinShockConsumed ?? false),
      }
      if (import.meta.env.DEV && import.meta.env.VITE_FORCE_CLASSIC === 'true') {
        hydrated.expansionMode = null
        hydrated.twistActive = false
        if (hydrated.cupidArrow) {
          hydrated.cupidArrow = {
            ...hydrated.cupidArrow,
            scheduledSeason: null,
            status: 'inactive',
            activatedSeason: null,
            activatedWeek: null,
            pairs: [],
            eliminatedPairCount: 0,
            pendingPartnerEvictionId: null,
          }
        }
        if (hydrated.voxPopuli) {
          hydrated.voxPopuli = {
            ...hydrated.voxPopuli,
            scheduledSeason: null,
            status: 'inactive',
            activatedSeason: null,
            activatedWeek: null,
            awaitingPublicVote: false,
            publicVoteContext: null,
            finaleStage: null,
          }
        }
      }
      hydrated.tvFeed.forEach((event) => refreshManagedBroadcastDefinition(hydrated, event))
      rebuildManagedBroadcastQueue(hydrated, hydrated.phase)
      return hydrated
    },

    clearSurvivorReplacementTransition(state) {
      if (state.modeSpecific?.kind !== 'survival') return
      state.modeSpecific.replacementTransition = null
    },

    setHasSeenConfessionalSpotlight(state, action: PayloadAction<boolean>) {
      state.hasSeenConfessionalSpotlight = action.payload
    },

    /** Generate a new random RNG seed (debug only). */
    rerollSeed(state) {
      // Mix Math.random() with the low 32 bits of Date.now() via XOR to derive a 32-bit seed.
      state.seed = (Math.floor(Math.random() * 0x100000000) ^ (Date.now() & 0xffffffff)) >>> 0
      pushEvent(state, `[DEBUG] RNG seed rerolled to ${state.seed}. 🎲`, 'game')
    },

    /** Advance to the next phase, computing outcomes deterministically via RNG. */
    advance(state) {
      // Guard: if any human-decision flag is set, advance() must not proceed.
      // This protects against programmatic dispatches (debug tools, fastForward)
      // bypassing mandatory decision steps and leaving state inconsistent.
      if (
        state.replacementNeeded ||
        state.awaitingNominations ||
        (state.awaitingPublicSave &&
          state.phase === 'pre_veto_public_save' &&
          state.nomineeIds.length === (isCupidArrowActive(state) ? 6 : 3)) ||
        state.awaitingPovDecision ||
        state.awaitingPovSaveTarget ||
        state.awaitingMissionImmunityOffer ||
        state.awaitingHumanVote ||
        state.awaitingTieBreak ||
        state.awaitingFinal3Eviction ||
        state.awaitingFinal3Plea ||
        state.dayStartShock != null ||
        state.specialVeto?.awaitingHolderReplacement ||
        state.specialVeto?.awaitingCoupReplacement1 ||
        state.specialVeto?.awaitingCoupReplacement2 ||
        state.specialVeto?.awaitingVipSecondUseDecision ||
        state.specialVeto?.awaitingVipSecondSaveTarget ||
        state.pendingEviction != null ||
        state.battleBack?.active ||
        state.favoritePlayer?.active ||
        (state.seasonFinale != null && state.seasonFinale.phase !== 'seasonComplete') ||
        state.spectatorActive ||
        state.democracia?.awaitingHumanVote ||
        state.democracia?.awaitingPublicBreaker ||
        state.awaitingCoLohNomination ||
        state.awaitingPosTieBreak ||
        state.voxPopuli?.awaitingPublicVote ||
        state.voxPopuli?.finaleStage != null ||
        state.twinShock?.promptStage != null ||
        state.twinShock?.pendingRevealAnimation != null
      ) {
        return
      }

      // Guard: if a minigame is active the human must complete (or skip) it first.
      // This prevents fastForwardToEviction / debug advance from racing past an
      // open TapRace overlay and leaving it stuck on screen.
      if (state.pendingMinigame) {
        state.pendingMinigame = null // Auto-dismiss; winner falls back to random pick below.
      }

      // Guard: if a Final 3 minigame is in progress, advance() must not proceed.
      // The player must complete (or dismiss) the minigame; applyF3MinigameWinner
      // handles the phase transition after the minigame result is received.
      if (
        state.phase === 'final3_comp1_minigame' ||
        state.phase === 'final3_comp2_minigame' ||
        state.phase === 'final3_comp3_minigame'
      ) {
        return
      }

      // Emit any current-phase message that was authored after the phase had
      // already been entered. Normally these were emitted during entry and the
      // ID/day guard makes this a no-op.
      if (PHASE_ORDER.includes(state.phase)) {
        beginPhaseBroadcastSequence(state, state.phase)
        finishPhaseBroadcastSequence(state)
      } else {
        // Finale-only phases do not use the weekly destination switch below.
        beginPhaseBroadcastSequence(state, state.phase)
        finishPhaseBroadcastSequence(state)
      }

      // ── Special-phase handling (Final4 / Final3 are outside PHASE_ORDER) ──
      if (state.phase === 'final4_eviction') {
        // Guard: Final 4 eviction requires a valid POS holder
        if (!state.posWinnerId) return

        const povHolder = state.players.find((p) => p.id === state.posWinnerId)
        const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))

        // Emit plea sequence: POS holder asks nominees for their pleas
        pushEvent(
          state,
          `${povHolder?.name ?? 'The POS holder'} asks nominees for their pleas. 🎤`,
          'game'
        )
        nominees.forEach((nominee, idx) => {
          const plea = pickPhrase(NOMINEE_PLEA_TEMPLATES, state.seed, idx)
          pushEvent(state, `${nominee.name}: "${plea}"`, 'game')
        })

        // Guard: if the POS holder is the human player, set awaitingPovDecision
        // so the UI shows the decision modal and advance() is blocked until the
        // player acts (the general guard at the top of advance() will catch it).
        if (povHolder?.isUser) {
          state.awaitingPovDecision = true
          return
        }

        // AI POS holder casts the sole vote deterministically
        const seedRng = mulberry32(state.seed)
        state.seed = (seedRng() * 0x100000000) >>> 0
        const rng = mulberry32(state.seed)

        if (nominees.length > 0) {
          const evictee = seededPick(rng, nominees)
          // Defer the eviction commit — overlay (finalizePendingEviction) will
          // set evictee.status and transition to final3 after the cinematic plays.
          state.pendingEviction = {
            evicteeId: evictee.id,
            evictionMessage: `${povHolder?.name ?? 'The POS holder'} has chosen to eliminate ${evictee.name}. ${evictee.name} has been eliminated from The Big Eye house. 🚪`,
          }
        }
        return
      }

      if (state.phase === 'final3') {
        // Final Three begins as a clean ceremony, never as an extension of the
        // Final Four. This also makes a legitimate Final Three entry safe after
        // a long safety or eviction presentation has just finished.
        state.week += 1
        resetVoxFinalThreeRound(state)
        if (isVoxPopuliActive(state)) {
          const seedRng = mulberry32(state.seed)
          state.seed = (seedRng() * 0x100000000) >>> 0
          const rng = mulberry32(state.seed)
          const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
          const hasHuman = alive.some((p) => p.isUser)
          if (hasHuman) {
            state.minigameContext = {
              phaseKey: 'final3_comp1',
              participants: alive.map((p) => p.id),
              seed: state.seed,
            }
            state.phase = 'final3_comp1_minigame'
            return
          }
          const winner = seededPick(rng, alive)
          state.f3Part1WinnerId = winner.id
          pushVoxFinalThreeResult(
            state,
            `PART 1: ${winner.name.toUpperCase()} ADVANCES`,
            `${winner.name} advances to Part 3. The other two finalists now fight for the remaining place.`
          )
          state.phase = 'final3_comp2'
          return
        }
        state.phase = 'final3_comp1'
        return
      }

      if (state.phase === 'final3_comp1') {
        if (
          !isVoxPopuliActive(state) &&
          holdVoxFinalThreePrelude(
            state,
            'part1',
            'THE FINAL THREE',
            `The final three wake to an almost empty house. Breakfast is polite, but every pause carries the weight of the last immunity battle. Tonight, one of them can still be placed beyond the audience's reach.`
          )
        )
          return
        // Part 1: all 3 finalists compete; winner advances to Part 3; 2 losers go to Part 2
        const seedRng = mulberry32(state.seed)
        state.seed = (seedRng() * 0x100000000) >>> 0
        const rng = mulberry32(state.seed)

        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
        if (!isVoxPopuliActive(state)) {
          pushEvent(
            state,
            `Final 3 Part 1 is underway! All three players compete for the first leg of the Final LOH. 🏁`,
            'game'
          )
        }

        // If any participant is human, launch interactive minigame instead of deterministic pick.
        const hasHuman = alive.some((p) => p.isUser)
        if (hasHuman) {
          state.minigameContext = {
            phaseKey: 'final3_comp1',
            participants: alive.map((p) => p.id),
            seed: state.seed,
          }
          state.phase = 'final3_comp1_minigame'
          return
        }

        const winner = seededPick(rng, alive)
        state.f3Part1WinnerId = winner.id

        if (isVoxPopuliActive(state)) {
          pushVoxFinalThreeResult(
            state,
            `PART 1: ${winner.name.toUpperCase()} ADVANCES`,
            `${winner.name} advances to Part 3. The other two finalists now fight for the remaining place.`
          )
        } else {
          pushEvent(
            state,
            `Final 3 Part 1 result: ${winner.name} wins and advances directly to Part 3! The other two players will compete in Part 2. 🏆`,
            'game'
          )
        }
        state.phase = 'final3_comp2'
        return
      }

      if (state.phase === 'final3_comp2') {
        const partOneWinnerName = state.players.find((p) => p.id === state.f3Part1WinnerId)?.name
        if (
          holdVoxFinalThreePrelude(
            state,
            'part2',
            'THE ROAD BACK',
            `${partOneWinnerName ?? 'The Part 1 winner'} waits for Part 3 while the other two finalists fight for the remaining place. Only one will join the final immunity showdown.`
          )
        )
          return
        // Part 2: the 2 Part-1 losers compete; winner advances to Part 3
        const seedRng = mulberry32(state.seed)
        state.seed = (seedRng() * 0x100000000) >>> 0
        const rng = mulberry32(state.seed)

        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
        const losers = alive.filter((p) => p.id !== state.f3Part1WinnerId)
        if (losers.length === 0) {
          // Defensive: should not happen in normal play; log and skip to Part 3
          pushEvent(
            state,
            `[Warning] No Part-2 competitors found — advancing to Part 3 directly.`,
            'game'
          )
          state.phase = 'final3_comp3'
          return
        }
        if (!isVoxPopuliActive(state)) {
          pushEvent(
            state,
            `Final 3 Part 2 is underway! The remaining two players battle to join the Part 1 winner in Part 3. 🏁`,
            'game'
          )
        }

        // If any Part-2 competitor is human, launch interactive minigame.
        const hasHuman = losers.some((p) => p.isUser)
        if (hasHuman) {
          state.minigameContext = {
            phaseKey: 'final3_comp2',
            participants: losers.map((p) => p.id),
            seed: state.seed,
          }
          state.phase = 'final3_comp2_minigame'
          return
        }

        const winner = seededPick(rng, losers)
        state.f3Part2WinnerId = winner.id

        if (isVoxPopuliActive(state)) {
          pushVoxFinalThreeResult(
            state,
            `PART 2: ${winner.name.toUpperCase()} ADVANCES`,
            `${winner.name} joins ${partOneWinnerName ?? 'the Part 1 winner'} in Part 3. The Part 2 loser now waits on the block.`
          )
        } else {
          pushEvent(
            state,
            `Final 3 Part 2 result: ${winner.name} wins and advances to face the Part 1 winner in Part 3! 🏆`,
            'game'
          )
        }
        state.phase = 'final3_comp3'
        return
      }

      if (state.phase === 'final3_comp3') {
        const immunityFinalists = [state.f3Part1WinnerId, state.f3Part2WinnerId]
          .map((id) => state.players.find((p) => p.id === id)?.name)
          .filter((name): name is string => Boolean(name))
        if (
          holdVoxFinalThreePrelude(
            state,
            'part3',
            'THE LAST SHOWDOWN',
            `${formatNameList(immunityFinalists)} meet in Part 3 for final immunity. The Part 2 loser is already on the block; the Part 3 loser will join them for the audience vote.`
          )
        )
          return
        // Part 3: Part-1 winner vs Part-2 winner → Final LOH crowned
        const seedRng = mulberry32(state.seed)
        state.seed = (seedRng() * 0x100000000) >>> 0
        const rng = mulberry32(state.seed)

        const finalists = state.players.filter(
          (p) => p.id === state.f3Part1WinnerId || p.id === state.f3Part2WinnerId
        )
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
        // Only Part 1 and Part 2 winners should compete in Part 3.
        // Fallback to all alive players guards against corrupted state while preserving progress.
        const pool = finalists.length >= 2 ? finalists : alive
        if (finalists.length < 2) {
          pushEvent(
            state,
            `[Warning] Part 3 finalists missing — using all alive players as fallback.`,
            'game'
          )
        }

        const f3Part1Name = state.players.find((p) => p.id === state.f3Part1WinnerId)?.name
        const f3Part2Name = state.players.find((p) => p.id === state.f3Part2WinnerId)?.name
        if (!isVoxPopuliActive(state) && f3Part1Name && f3Part2Name) {
          pushEvent(
            state,
            `Final 3 Part 3 is underway! ${f3Part1Name} (Part 1 winner) vs ${f3Part2Name} (Part 2 winner) — the winner becomes the Final Leader of the House! 🏁`,
            'game'
          )
        }

        // If any Part-3 competitor is human, launch interactive minigame.
        const hasHuman = pool.some((p) => p.isUser)
        if (hasHuman) {
          state.minigameContext = {
            phaseKey: 'final3_comp3',
            participants: pool.map((p) => p.id),
            seed: state.seed,
          }
          state.phase = 'final3_comp3_minigame'
          return
        }

        const finalHoh = seededPick(rng, pool)

        // Crown the Final LOH
        if (import.meta.env.DEV) {
          console.log('[applyLohWinner]', {
            source: '[advance/final3_comp3]',
            previousHohId: state.lohId,
            nextHohId: finalHoh.id,
            currentPhase: state.phase,
          })
        }
        state.lohId = finalHoh.id
        markFinalHohWinner(state, finalHoh.id)
        state.players.forEach((p) => {
          if (p.status === 'loh') p.status = 'active'
        })
        const lohPlayer = state.players.find((p) => p.id === finalHoh.id)
        if (lohPlayer) lohPlayer.status = 'loh'

        // The 2 non-Final-LOH players are now nominees (eligible to be evicted)
        const nominees = alive.filter((p) => p.id !== finalHoh.id)
        state.nomineeIds = nominees.map((p) => p.id)
        nominees.forEach((p) => {
          const np = state.players.find((x) => x.id === p.id)
          if (np && np.status !== 'nominated') np.status = 'nominated'
        })

        if (isVoxPopuliActive(state)) {
          pushVoxFinalThreeResult(
            state,
            `FINAL IMMUNITY: ${finalHoh.name.toUpperCase()}`,
            `${finalHoh.name} has won immunity. The other two finalists now face the audience for the final place in the Final 2.`
          )
        } else {
          pushEvent(
            state,
            `Final 3 Part 3: ${finalHoh.name} wins and is crowned the Final Leader of the House! 👑`,
            'game'
          )
        }

        if (isVoxPopuliActive(state) && state.voxPopuli) {
          state.voxPopuli.immunityWinnerId = finalHoh.id
          state.voxPopuli.awaitingPublicVote = false
          state.voxPopuli.publicVoteContext = null
          state.voxPopuli.publicVotePercentages = null
          state.awaitingFinal3Eviction = false
          state.awaitingFinal3Plea = false
          state.phase = 'final3_decision'
          return
        }

        // Check if Final LOH is the human player
        if (lohPlayer?.isUser) {
          state.awaitingFinal3Eviction = true
          const nomineeNames = state.nomineeIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ')
          pushEvent(
            state,
            `${finalHoh.name}, you must now eliminate either ${nomineeNames} to set the Final 2. 🎯`,
            'game'
          )
        } else {
          // AI Final LOH: trigger the Final-3 ceremony overlay so the user sees
          // the coronation, plea, and eviction cinematic before the game ends.
          // finalizeFinal3Decision (dispatched by Final3Ceremony on completion)
          // performs the actual eviction and clears this flag.
          state.awaitingFinal3Plea = true
          if (import.meta.env.DEV) {
            console.log(
              '[gameSlice] advance() final3_comp3: AI LOH crowned, awaitingFinal3Plea set',
              { lohId: finalHoh.id }
            )
          }
        }

        state.phase = 'final3_decision'
        return
      }

      if (state.phase === 'final3_decision') {
        if (isVoxPopuliActive(state) && state.voxPopuli) {
          const nomineeNames = formatNameList(
            state.nomineeIds.map(
              (id) => state.players.find((player) => player.id === id)?.name ?? id
            )
          )
          if (
            holdVoxFinalThreePrelude(
              state,
              'public_decision',
              'THE FINAL APPEALS',
              `${nomineeNames} make their final private appeals, pack their cases, and wait together as the audience prepares to close one journey forever.`
            )
          ) {
            // Arm the public vote before the appeals card is dismissed. This
            // lets that card's Play press hand directly into the live reveal;
            // otherwise the listener mounts one render too late and leaves an
            // empty faux-TV screen that requires a second press.
            state.voxPopuli.awaitingPublicVote = true
            state.voxPopuli.publicVoteContext = 'final3'
            state.voxPopuli.publicVotePercentages = null
            return
          }
          state.voxPopuli.awaitingPublicVote = true
          state.voxPopuli.publicVoteContext = 'final3'
          state.voxPopuli.publicVotePercentages = null
          return
        }
        // AI Final LOH evicts (fallback if UI wasn't shown / human didn't act)
        const seedRng = mulberry32(state.seed)
        state.seed = (seedRng() * 0x100000000) >>> 0
        const rng = mulberry32(state.seed)

        const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
        const finalHoh = state.players.find((p) => p.id === state.lohId)
        if (nominees.length > 0) {
          const evictee = seededPick(rng, nominees)
          assignSeasonPlacementOnExit(state, evictee.id)
          evictee.status = evictedStatus(state)
          state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id)
          state.awaitingFinal3Eviction = false
          pushEvent(
            state,
            `${finalHoh?.name ?? 'The Final LOH'} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
            'game'
          )
          pushEvent(
            state,
            `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`,
            'game'
          )
        }
        state.phase = 'week_end'
        return
      }

      // Guard: jury is a terminal phase — advance() is a no-op once reached.
      if (state.phase === 'jury') return

      // Guard: jury_announcement → jury_cinematic (user dismissed the modal).
      if (state.phase === 'jury_announcement') {
        state.phase = 'jury_cinematic'
        return
      }

      // Guard: jury_cinematic → jury (cinematic complete or skipped).
      if (state.phase === 'jury_cinematic') {
        state.phase = 'jury'
        return
      }

      // Guard: at week_end with ≤2 players alive the Final 2 is set.
      // Transition to jury_announcement so the UI can show the modal/cinematic
      // before entering jury voting.
      if (state.phase === 'week_end') {
        const aliveAtEnd = state.players.filter(
          (p) => p.status !== 'evicted' && p.status !== 'jury'
        )
        if (aliveAtEnd.length <= 2) {
          if (isVoxPopuliActive(state) && state.voxPopuli) {
            state.voxPopuli.finalistIds = aliveAtEnd.map((player) => player.id)
            state.voxPopuli.finaleStage = 'showcase'
            return
          }
          state.phase = 'jury_announcement'
          return
        }
      }

      // Guard: handle intermediate AI replacement steps (after veto auto-save or human POS use).
      // Each call to advance() processes one step so the TV shows each message separately.
      // Each step advances the seed to maintain the deterministic RNG sequence.
      if (state.aiReplacementStep === 1) {
        // Step 1: show the "LOH is selecting a replacement" beat; AI will pick on next advance.
        // Advance seed to keep the RNG sequence consistent with normal advance() calls.
        const seedRng1 = mulberry32(state.seed)
        state.seed = (seedRng1() * 0x100000000) >>> 0
        const lohPlayer = state.players.find((pl) => pl.id === state.lohId)
        pushEvent(state, `${lohPlayer?.name ?? 'The LOH'} is selecting a backup nominee...`, 'game')
        state.aiReplacementStep = 2
        return
      }

      if (state.aiReplacementStep === 2) {
        // Guard: wait until the UI has acknowledged the step-1 announcement.
        if (state.aiReplacementWaiting) return
        // Step 2: AI LOH picks the replacement nominee.
        // Advance seed first, then use the new seed for the pick.
        const seedRng2 = mulberry32(state.seed)
        state.seed = (seedRng2() * 0x100000000) >>> 0
        const rng = mulberry32(state.seed)
        const aliveNow = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
        const lohPlayer = state.players.find((pl) => pl.id === state.lohId)
        const eligible = getReplacementEligiblePlayers(state, aliveNow)
        if (eligible.length > 0) {
          const disclosedBackupId =
            state.lohSocialPlan?.week === state.week && state.lohSocialPlan.lohId === state.lohId
              ? state.lohSocialPlan.backupTargetId
              : null
          const replacement =
            eligible.find((player) => player.id === disclosedBackupId) ??
            pickStrategicAiPlayer(state, eligible, rng, 'highest')
          if (replacement) appendNominee(state, replacement.id)
          pushEvent(
            state,
            `${lohPlayer?.name ?? 'The LOH'} named ${replacement?.name ?? 'a backup nominee'} as the backup nominee. 🎯`,
            'game'
          )
        }
        // Keep povSavedId set so the UI can detect "veto was used" and show
        // the AI replacement animation. Cleared at week_start.
        state.aiReplacementStep = 0
        // VIP: after AI replacement completes first use, advance to second-use decision stage
        if (state.specialVeto?.activeType === 'vip' && state.specialVeto.vipUseStage === 1) {
          state.specialVeto.vipUseStage = 2
        }
        // VIP: after AI replacement completes second use, mark ceremony done
        if (state.specialVeto?.activeType === 'vip' && state.specialVeto.vipUseStage === 3) {
          state.specialVeto.vipUseStage = -1
        }
        return
      }

      // ── Double Trouble second-use handling ──────────────────────────────────────
      if (state.specialVeto?.activeType === 'vip' && state.specialVeto.vipUseStage === 2) {
        const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
        if (nominees.length === 0) {
          state.specialVeto.vipUseStage = -1
          return
        }
        const povHolder = state.players.find((p) => p.id === state.posWinnerId)
        if (povHolder?.isUser) {
          state.specialVeto.awaitingVipSecondUseDecision = true
          pushEvent(
            state,
            `${povHolder.name}, you may use Double Trouble a second time! Would you like to save another nominee? 👑`,
            'game'
          )
        } else {
          // AI: seeded decision — tends to use second time (~70%)
          const seedRng2 = mulberry32(state.seed)
          state.seed = (seedRng2() * 0x100000000) >>> 0
          const rng2 = mulberry32(state.seed)
          const eligible = getReplacementEligiblePlayers(
            state,
            state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
          )
          const useSecond =
            shouldUseSafetyForTwin(state, povHolder?.id, nominees) ||
            shouldAiUseTargetedSafetyPower(state, povHolder?.id, nominees, eligible)
          if (useSecond && nominees.length > 0) {
            const nominee2 = pickSafetySaveTarget(state, povHolder?.id, nominees, rng2)
            if (!nominee2) {
              state.specialVeto.vipUseStage = -1
              return
            }
            state.nomineeIds = state.nomineeIds.filter((id) => id !== nominee2.id)
            const savedP = state.players.find((p) => p.id === nominee2.id)
            if (savedP) savedP.status = 'active'
            state.povSavedId = nominee2.id
            addPovProtectedId(state, nominee2.id)
            pushEvent(
              state,
              `${povHolder?.name ?? 'The Double Trouble holder'} used Double Trouble a second time, saving ${nominee2.name}! 👑`,
              'game'
            )
            const hohP = state.players.find((p) => p.id === state.lohId)
            if (hohP?.isUser) {
              state.specialVeto.vipUseStage = 3
              state.replacementNeeded = true
              pushEvent(state, `${hohP.name} must now name another backup nominee. 🎯`, 'game')
            } else {
              state.specialVeto.vipUseStage = 3
              state.aiReplacementStep = 1
            }
          } else {
            state.specialVeto.vipUseStage = -1
            pushEvent(
              state,
              `${povHolder?.name ?? 'The Double Trouble holder'} chose not to use Double Trouble a second time. The nominations stand. 👑`,
              'game'
            )
          }
        }
        return
      }

      // ── Democracia special-phase handlers ──────────────────────────────────────
      // These phases are outside PHASE_ORDER and must be handled explicitly.
      if (state.phase === 'democracia_vote') {
        const dem = state.democracia
        // Safety: if Democracia state is missing or public-breaker pending, bail.
        if (!dem || dem.awaitingPublicBreaker) return

        // Advance seed
        const dSeedRng = mulberry32(state.seed)
        state.seed = (dSeedRng() * 0x100000000) >>> 0
        const dRng = mulberry32(state.seed)

        // Tally votes
        const dVoteCounts: Record<string, number> = {}
        for (const cId of dem.candidateIds) dVoteCounts[cId] = 0
        for (const targetId of Object.values(dem.votesByVoterId)) {
          if (targetId in dVoteCounts) dVoteCounts[targetId]++
        }

        // Determine top candidates
        let dMaxVotes = -1
        for (const cnt of Object.values(dVoteCounts)) {
          if (cnt > dMaxVotes) dMaxVotes = cnt
        }
        const dTopCandidates = dem.candidateIds.filter((id) => (dVoteCounts[id] ?? 0) === dMaxVotes)
        const dTopNames = formatDemocraciaResultNames(state, dTopCandidates)

        if (dTopCandidates.length === 1) {
          // Clear winner
          const winnerId = dTopCandidates[0]
          const winnerName = state.players.find((p) => p.id === winnerId)?.name ?? winnerId
          dem.resultDisplay = buildDemocraciaResultDisplay(
            'winner',
            [winnerId],
            dVoteCounts,
            'DEMOCRACIA WINNER',
            `${winnerName} wins the vote with ${dVoteCounts[winnerId] ?? 0} vote${(dVoteCounts[winnerId] ?? 0) === 1 ? '' : 's'}.`
          )
          pushEvent(
            state,
            `🗳️ The votes are in! ${winnerName} has been elected Leader of the House! 👑`,
            'game'
          )
          applyLohWinner(state, winnerId, '[advance/democracia_vote]')
          dem.active = false
          state.phase = 'democracia_results'
        } else {
          // Tie
          const dAliveNow = state.players.filter(
            (p) => p.status !== 'evicted' && p.status !== 'jury'
          )
          const dBallotageVoters = dAliveNow.filter((p) => !dTopCandidates.includes(p.id))

          if (dem.round >= 2) {
            // Already had ballotage — still tied → resolve by public or co-LOH
            if (state.publicModeEnabled) {
              // Signal UI to pick by approval rating
              dem.awaitingPublicBreaker = true
              dem.resultDisplay = buildDemocraciaResultDisplay(
                dTopCandidates.length > 3 ? 'message' : 'tie',
                dTopCandidates.length > 3 ? [] : [...dTopCandidates],
                dVoteCounts,
                dTopCandidates.length > 3 ? 'DEMOCRACIA TIE' : 'FINAL TIE',
                dTopCandidates.length > 3
                  ? `${dTopNames} remain tied. The public will decide the winner by approval rating.`
                  : `${dTopNames} are still tied. The public will decide the winner by approval rating.`
              )
              pushEvent(
                state,
                `🗳️ Even after the ballotage, ${dTopNames} are still tied! The public will decide by approval rating! 📊`,
                'game'
              )
            } else {
              // No public mode → both become co-LOHs
              state.coLohIds = [...dTopCandidates]
              for (const id of dTopCandidates) {
                const cp = state.players.find((pl) => pl.id === id)
                if (cp) {
                  cp.status = 'loh'
                  ensurePlayerStats(cp).lohWins += 1
                }
              }
              // Keep lohId pointing to first co-LOH for compatibility
              state.lohId = dTopCandidates[0]
              dem.resultDisplay = buildDemocraciaResultDisplay(
                dTopCandidates.length > 3 ? 'message' : 'tie',
                dTopCandidates.length > 3 ? [] : [...dTopCandidates],
                dVoteCounts,
                dTopCandidates.length > 3 ? 'DEMOCRACIA TIE' : 'CO-LEADERS ELECTED',
                dTopCandidates.length > 3
                  ? `${dTopNames} remain tied after the ballotage and will serve together as co-Leaders of the House.`
                  : `${dTopNames} remain tied and will serve together as co-Leaders of the House.`
              )
              pushEvent(
                state,
                `🗳️ The votes remain tied! ${dTopNames} will BOTH serve as co-Leaders of the House! 👑👑`,
                'game'
              )
              dem.active = false
              state.phase = 'democracia_results'
            }
          } else if (dBallotageVoters.length === 0) {
            // No eligible ballotage voters — deterministic fallback
            pushEvent(
              state,
              `⚠️ No eligible voters available for ballotage. The winner is decided by chance!`,
              'game'
            )
            const dFbRng = mulberry32((state.seed ^ 0xdec0de) >>> 0)
            const fallbackId = dTopCandidates[Math.floor(dFbRng() * dTopCandidates.length)]
            const fallbackName = state.players.find((p) => p.id === fallbackId)?.name ?? fallbackId
            dem.resultDisplay = buildDemocraciaResultDisplay(
              'winner',
              [fallbackId],
              dVoteCounts,
              'DEMOCRACIA WINNER',
              `${fallbackName} wins the tiebreak by chance after no eligible ballotage voters remained.`
            )
            pushEvent(state, `🗳️ ${fallbackName} has been elected Leader of the House! 👑`, 'game')
            applyLohWinner(state, fallbackId, '[advance/democracia_vote/ballotage_fallback]')
            dem.active = false
            state.phase = 'democracia_results'
          } else {
            // Go to ballotage round
            dem.resultDisplay = buildDemocraciaResultDisplay(
              dTopCandidates.length > 3 ? 'message' : 'tie',
              dTopCandidates.length > 3 ? [] : [...dTopCandidates],
              dVoteCounts,
              dTopCandidates.length > 3 ? 'REVOTE REQUIRED' : 'TIED VOTE',
              dTopCandidates.length > 3
                ? `${dTopNames} are tied. The house must revote among the tied candidates.`
                : `${dTopNames} are tied at ${dMaxVotes} vote${dMaxVotes === 1 ? '' : 's'}. The house must revote.`
            )
            pushEvent(
              state,
              `🗳️ It's a tie between ${dTopNames}! We go to BALLOTAGE! All other houseguests must revote between the tied candidates. 🗳️`,
              'game'
            )
            dem.round += 1
            dem.candidateIds = [...dTopCandidates]
            dem.eligibleVoterIds = dBallotageVoters.map((p) => p.id)
            dem.votesByVoterId = {}
            // Cast AI votes for ballotage
            for (const voter of dBallotageVoters) {
              if (!voter.isUser) {
                // Use per-voter seed for determinism
                const vSeed =
                  (state.seed ^
                    (voter.id.charCodeAt(0) * 31 + voter.id.charCodeAt(voter.id.length - 1))) >>>
                  0
                const vRng = mulberry32(vSeed)
                const voteIdx = Math.floor(vRng() * dTopCandidates.length)
                dem.votesByVoterId[voter.id] = dTopCandidates[voteIdx]
              }
            }
            // Block if human is a ballotage voter
            const humanIsVoter = dBallotageVoters.some((p) => p.isUser)
            if (humanIsVoter) {
              dem.awaitingHumanVote = true
            }
            // Stay at democracia_vote — do NOT call dRng, seed already advanced above
            void dRng // suppress unused warning
          }
        }
        return
      }

      if (state.phase === 'democracia_results') {
        // democracia_results → social_1
        if (state.coLohIds && state.coLohIds.length > 0) {
          const coNames = state.coLohIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ')
          pushEvent(
            state,
            `${coNames} are now co-Leaders of the House! 👑👑 Alliances are already forming…`,
            'social'
          )
        } else {
          const hohName = state.players.find((p) => p.id === state.lohId)?.name ?? 'The new LOH'
          pushEvent(
            state,
            isVoxPopuliActive(state)
              ? `Housemates congratulate ${hohName} on winning immunity. The secret nomination conversations begin. 💬`
              : `Housemates congratulate ${hohName}. Alliances are already forming… 💬`,
            'social'
          )
        }
        state.phase = 'social_1'
        return
      }

      const currentIdx = PHASE_ORDER.indexOf(state.phase)
      const nextIdx = (currentIdx + 1) % PHASE_ORDER.length
      let nextPhase: Phase = state.phase === 'season_start' ? 'week_start' : PHASE_ORDER[nextIdx]

      if (state.phase === 'eviction_results' && nextPhase === 'week_end') {
        if (shouldQueueTwinShockBeforeDayEnd(state)) return
      }

      // Advance seed: consume one RNG value so each advance uses a different seed
      const seedRng = mulberry32(state.seed)
      state.seed = (seedRng() * 0x100000000) >>> 0
      const rng = mulberry32(state.seed)

      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')

      beginPhaseBroadcastSequence(state, nextPhase)
      switch (nextPhase) {
        case 'week_start': {
          const enteringDayOne = state.phase === 'season_start'
          activateVoxPopuliForSeason(state)
          // week_end → week_start: increment week and reset week-level fields.
          // Save the outgoing LOH so they can be excluded from this week's LOH comp.
          if (!enteringDayOne) {
            state.prevHohId = state.lohId ?? null
            state.lastWeekNominationRecord = state.currentWeekNominationRecord ?? null
            state.week += 1
          }
          state.currentWeekNominationRecord = null
          state.lohId = null
          state.lohSocialPlan = null
          state.nomineeIds = []
          state.lohSafetyAdvice = null
          state.posWinnerId = null
          state.replacementNeeded = false
          state.povSavedId = null
          state.povProtectedIds = []
          state.awaitingNominations = false
          state.pendingNominee1Id = null
          state.awaitingPovDecision = false
          state.awaitingPovSaveTarget = false
          state.lastHohCompFinisherId = null
          state.lastHohCompFinisherType = null
          state.publicSavedNomineeId = null
          state.nominationContext = null
          state.awaitingPublicSave = false
          state.votes = {}
          state.voteResultsMode = 'house'
          state.awaitingHumanVote = false
          state.awaitingTieBreak = false
          state.tiedNomineeIds = null
          state.awaitingMissionImmunityOffer = false
          state.aiReplacementStep = 0
          state.aiReplacementWaiting = false
          // Clear per-week special veto ceremony flags (preserve seasonUsed flag)
          if (state.specialVeto) {
            state.specialVeto.activeType = null
            state.specialVeto.activatedWeek = null
            state.specialVeto.vipUseStage = 0
            state.specialVeto.awaitingHolderReplacement = false
            state.specialVeto.awaitingCoupReplacement1 = false
            state.specialVeto.awaitingCoupReplacement2 = false
            state.specialVeto.coupReplacement1Id = null
            state.specialVeto.awaitingVipSecondUseDecision = false
            state.specialVeto.awaitingVipSecondSaveTarget = false
            state.twistActive = false
          }
          if (isCupidArrowActive(state)) state.twistActive = false
          if (isVoxPopuliActive(state) && state.voxPopuli) {
            state.voxPopuli.nominationBallots = {}
            state.voxPopuli.nominationVoteCounts = {}
            state.voxPopuli.lastReplacementNomineeIds = []
            state.voxPopuli.immunityWinnerId = null
            state.voxPopuli.autoNomineeId = null
            state.voxPopuli.awaitingPublicVote = false
            state.voxPopuli.publicVoteContext = null
            state.voxPopuli.publicVotePercentages = null
            state.voxPopuli.audiencePreviewWeek = null
            state.voxPopuli.audiencePreviewNomineeIds = []
            state.voxPopuli.audiencePreviewPercentages = null
            state.twistActive = false
          }
          state.twistActivatedThisWeek = false
          state.players.forEach((p) => {
            if (['loh', 'nominated', 'pos', 'loh+pos', 'nominated+pos'].includes(p.status)) {
              p.status = 'active'
            }
          })
          // Clear Democracia per-day state (preserve usedThisSeason flag)
          if (state.democracia) {
            state.democracia.active = false
            state.democracia.activatedDay = null
            state.democracia.round = 0
            state.democracia.candidateIds = []
            state.democracia.eligibleVoterIds = []
            state.democracia.votesByVoterId = {}
            state.democracia.awaitingHumanVote = false
            state.democracia.awaitingPublicBreaker = false
            state.democracia.resultDisplay = null
          }
          // Clear co-LOH state
          state.coLohIds = null
          state.awaitingCoLohNomination = false
          state.coLohNomineeByCoLohId = null
          state.awaitingPosTieBreak = false
          const tribunalPhaseBegins =
            !isVoxPopuliActive(state) &&
            state.tribunalPhaseAnnounced !== true &&
            state.players.some((player) => player.status === 'jury')
          const tribunalEvent = tribunalPhaseBegins
            ? pushEvent(
                state,
                `Congrats all, you've just made it to tribunal. Your voices will crown the winner.`,
                'game',
                { major: 'tribunal_phase', phase: 'week_start' }
              )
            : null
          if (tribunalEvent) {
            state.tribunalPhaseAnnounced = true
          }
          pushEvent(state, `Day ${state.week} has begun. Get ready.`, 'game', {
            key: 'day_start',
            phase: 'week_start',
            ...(tribunalEvent ? { announcementPrerollEventId: tribunalEvent.id } : {}),
          })
          break
        }
        case 'loh_comp_announcement': {
          activateCupidArrowForSeason(state)
          break
        }
        case 'loh_comp': {
          // Democracia: redirect to democratic vote instead of LOH competition
          if (state.democracia?.active && state.democracia.activatedDay === state.week) {
            const demAlive = state.players.filter(
              (p) => p.status !== 'evicted' && p.status !== 'jury'
            )
            state.democracia.round = 1
            state.democracia.candidateIds = demAlive.map((p) => p.id)
            state.democracia.eligibleVoterIds = demAlive.map((p) => p.id)
            state.democracia.votesByVoterId = {}
            state.democracia.resultDisplay = null
            // Cast AI votes (no self-vote)
            for (const voter of demAlive) {
              if (!voter.isUser) {
                const candidates = demAlive.filter(
                  (c) => c.id !== voter.id && canPlayerTargetPlayer(state, voter.id, c.id)
                )
                if (candidates.length > 0) {
                  const vSeed =
                    (state.seed ^
                      (voter.id.charCodeAt(0) * 31 + voter.id.charCodeAt(voter.id.length - 1))) >>>
                    0
                  const vRng = mulberry32(vSeed)
                  const voteIdx = Math.floor(vRng() * candidates.length)
                  state.democracia.votesByVoterId[voter.id] = candidates[voteIdx].id
                }
              }
            }
            // Block if human needs to vote
            const humanIsVoter = demAlive.some((p) => p.isUser)
            if (humanIsVoter) {
              state.democracia.awaitingHumanVote = true
            }
            pushEvent(
              state,
              `🗳️ Today's Leader of the House will be chosen by popular vote! Cast your votes now.`,
              'game'
            )
            nextPhase = 'democracia_vote'
            break
          }
          pushEvent(
            state,
            `The Leader of the House competition has begun! 🏆 Who will win power today?`,
            'game'
          )
          break
        }
        case 'loh_results': {
          // completeMinigame() applies the LOH winner inline and advances the phase
          // directly, so minigameResult is always null here.  Always pick randomly.
          // Exclude the outgoing LOH (prevHohId) to respect the ineligibility rule.
          const outgoingLohIds = new Set(getCupidRoleIds(state, state.prevHohId))
          const hohPool =
            state.prevHohId && !isVoxPopuliActive(state)
              ? alive.filter((p) => !outgoingLohIds.has(p.id))
              : alive
          const hohEligible = hohPool.length > 0 ? hohPool : alive
          const hoh = seededPick(rng, hohEligible)
          applyLohWinner(state, hoh.id, '[advance/loh_results]')
          // Track last-place LOH competition finisher for the third-nominee rule.
          // Use RNG to pick deterministically among non-LOH eligible players.
          const winningPairIds = new Set(getCupidRoleIds(state, hoh.id))
          const lastPlacePool = hohEligible.filter((p) => !winningPairIds.has(p.id))
          if (lastPlacePool.length > 0) {
            state.lastHohCompFinisherId = seededPick(rng, lastPlacePool).id
            if (isVoxPopuliActive(state) && state.voxPopuli) {
              state.voxPopuli.autoNomineeId = state.lastHohCompFinisherId
            }
            announceVoxLastPlaceNominee(state)
          }
          break
        }
        case 'social_1': {
          maybePushTwinShockClue(state)
          const democraciaSocialBeatAlreadyShown =
            state.democracia?.activatedDay === state.week && state.democracia.active === false
          if (!democraciaSocialBeatAlreadyShown) {
            const hohName = state.players.find((p) => p.id === state.lohId)?.name ?? 'The new LOH'
            pushEvent(
              state,
              `Housemates congratulate ${hohName}. Alliances are already forming… 💬`,
              'social'
            )
          }
          break
        }
        case 'nominations': {
          const hohName = state.players.find((p) => p.id === state.lohId)?.name ?? 'The LOH'
          pushEvent(
            state,
            isVoxPopuliActive(state)
              ? `Housemates are being called to the Confessional one by one to nominate in secret. 🗳️`
              : `${hohName} is preparing the nomination ceremony. 🎯`,
            'game'
          )
          break
        }
        case 'nomination_results': {
          if (isVoxPopuliActive(state) && state.voxPopuli) {
            state.voxPopuli.nominationBallots = {}
            castVoxAiNominationBallots(state, rng)
            const human = alive.find((player) => player.isUser)
            const immunityWinnerId = getVoxNominationImmunityId(state)
            const autoNomineeId =
              state.voxPopuli.autoNomineeId ?? state.lastHohCompFinisherId ?? null
            const humanEligibleTargets = human
              ? alive.filter(
                  (candidate) =>
                    candidate.id !== human.id &&
                    candidate.id !== immunityWinnerId &&
                    candidate.id !== autoNomineeId &&
                    canPlayerTargetPlayer(state, human.id, candidate.id)
                )
              : []
            const humanCanVote =
              Boolean(human) && !(isVoxFinalFour(state) && human?.id === autoNomineeId)
            if (human && humanCanVote && humanEligibleTargets.length > 0) {
              state.awaitingNominations = true
              state.pendingNominee1Id = null
              const requiredVotes = Math.min(getVoxBallotSize(state), humanEligibleTargets.length)
              pushEvent(
                state,
                `${human.name}, cast ${
                  requiredVotes === 1
                    ? 'your secret nomination vote'
                    : 'your two secret nomination votes'
                } in the Confessional.`,
                'diary',
                { major: 'vox_populi_ballot' }
              )
            } else {
              finalizeVoxNominations(state)
            }
            break
          }
          // ── Co-LOH Democracia day path ───────────────────────────────────────
          // When there are co-LOHs (Democracia tie), each nominates exactly 1 person.
          // Standard 2-nominee block produced; no public save / no auto-third-nominee.
          if (state.coLohIds != null && state.coLohIds.length >= 2) {
            const coLohIds = state.coLohIds
            const coAlive = state.players.filter(
              (p) => p.status !== 'evicted' && p.status !== 'jury'
            )
            state.coLohNomineeByCoLohId = {}
            // AI co-LOHs nominate first
            for (const coLohId of coLohIds) {
              const coLoh = state.players.find((p) => p.id === coLohId)
              if (coLoh?.isUser) continue // human handled below
              const coPool = coAlive.filter(
                (p) =>
                  p.id !== coLohId &&
                  !coLohIds.includes(p.id) &&
                  !state.nomineeIds.includes(p.id) &&
                  canPlayerTargetPlayer(state, coLohId, p.id)
              )
              if (coPool.length > 0) {
                const nominee =
                  pickStrategicAiPlayer(state, coPool, rng, 'highest') ?? seededPick(rng, coPool)
                state.nomineeIds.push(nominee.id)
                const np = state.players.find((pl) => pl.id === nominee.id)
                if (np) np.status = 'nominated'
                incrementTimesNominated(state, nominee.id)
                state.coLohNomineeByCoLohId[coLohId] = nominee.id
                pushEvent(state, `${coLoh?.name ?? coLohId} nominates ${nominee.name}. 🎯`, 'game')
              }
            }
            // Human co-LOH must nominate via modal
            const humanCoLohId = coLohIds.find(
              (id) => state.players.find((p) => p.id === id)?.isUser
            )
            if (humanCoLohId) {
              const humanCoLoh = state.players.find((p) => p.id === humanCoLohId)
              state.awaitingCoLohNomination = true
              pushEvent(
                state,
                `${humanCoLoh?.name ?? 'You'}, as co-Leader of the House, you must nominate one houseguest for elimination. 🎯`,
                'game'
              )
            } else {
              // All AI co-LOHs: log final block
              const coNomNames = state.nomineeIds
                .map((id) => state.players.find((p) => p.id === id)?.name)
                .filter(Boolean)
                .join(' and ')
              if (coNomNames) {
                pushEvent(state, `${coNomNames} have been nominated for elimination. 🎯`, 'game')
              }
            }
            break
          }

          // Double Eviction week: LOH nominates 3; otherwise 2.
          const isDoubleEviction = state.doubleEviction?.weekActive === true
          const publicModeEnabled = state.publicModeEnabled === true
          const canUsePublicNomineeRule = publicModeEnabled && !isDoubleEviction
          const nomineeCount = isDoubleEviction ? 3 : 2
          // Guard: need LOH + nomineeCount eligible players.
          const pool = collapseCupidCandidates(
            state,
            alive.filter(
              (p) => p.id !== state.lohId && canPlayerTargetPlayer(state, state.lohId, p.id)
            )
          )
          if (pool.length < nomineeCount) break

          const lohPlayer =
            getCupidHumanCoholder(state, state.lohId) ??
            state.players.find((p) => p.id === state.lohId)
          if (lohPlayer?.isUser) {
            // Human LOH: block advance() and wait for the multi-select nomination UI.
            // Human still picks 2; the 3rd auto-nominee is appended by commitNominees.
            state.awaitingNominations = true
            state.pendingNominee1Id = null
            const countWord = isDoubleEviction ? 'three' : 'two'
            pushEvent(
              state,
              `${lohPlayer.name}, it's time to make your nominations. Choose ${countWord} players to nominate. 🎯`,
              'game'
            )
            break
          }

          // AI LOH: pick randomly (2 for normal weeks, 3 for DE).
          // In public mode non-DE weeks, exclude the forced auto-nominee from the AI pick
          // pool so the AI always selects distinct nominees and the auto-nominee is reliably
          // appended as the third nominee below.
          const autoNomineeUnitIds =
            canUsePublicNomineeRule && state.lastHohCompFinisherId
              ? new Set(expandCupidIds(state, [state.lastHohCompFinisherId]))
              : null
          const aiPool = autoNomineeUnitIds
            ? pool.filter((p) => !autoNomineeUnitIds.has(p.id))
            : pool
          const nominees = pickStrategicNominationTargets(
            state,
            state.lohId!,
            aiPool,
            nomineeCount,
            rng
          )
          state.nomineeIds = nominees.map((n) => n.id)
          nominees.forEach((n) => {
            const p = state.players.find((pl) => pl.id === n.id)
            if (p) p.status = 'nominated'
            incrementTimesNominated(state, n.id)
          })
          expandCupidNominees(state)

          // In public mode on non-Double Eviction weeks, auto-append the last-place LOH comp finisher.
          if (canUsePublicNomineeRule && state.lastHohCompFinisherId) {
            const autoId = state.lastHohCompFinisherId
            let autoNomineeId: string | null = null
            const autoPairAlreadyNominated = expandCupidIds(state, [autoId]).some((id) =>
              state.nomineeIds.includes(id)
            )
            if (!autoPairAlreadyNominated) {
              const autoPlayer = pool.find((p) => p.id === autoId)
              if (autoPlayer) {
                appendNominee(state, autoId)
                autoNomineeId = autoId
              }
            }
            state.nominationContext = {
              hohNomineeIds: expandCupidIds(
                state,
                nominees.map((nominee) => nominee.id)
              ),
              autoNomineeId,
              publicSaveApplied: false,
            }
          }

          rememberOriginalNominations(state)
          const allNominees = state.nomineeIds.map((id) => state.players.find((p) => p.id === id))
          const names = allNominees.filter(Boolean).map((n) => n!.name)
          const nameList = isDoubleEviction ? names.join(', ') : formatNameList(names)
          pushEvent(state, `${nameList} have been nominated for elimination. 🎯`, 'game')
          break
        }
        case 'pre_veto_public_save': {
          // Skip this phase unless Public mode is on, this is not a Double Eviction,
          // and there is a valid 3-nominee block to reduce back to 2 before veto.
          const expectedPublicNominees = isCupidArrowActive(state) ? 6 : 3
          if (
            isVoxPopuliActive(state) ||
            state.publicModeEnabled !== true ||
            state.doubleEviction?.weekActive ||
            state.nomineeIds.length !== expectedPublicNominees
          ) {
            if (import.meta.env.DEV && state.publicModeEnabled === true) {
              const reason = state.doubleEviction?.weekActive
                ? 'double eviction active'
                : `nomineeIds.length is ${state.nomineeIds.length} (expected ${expectedPublicNominees})`
              console.warn(
                `[publicMode] pre_veto_public_save skipped even though publicModeEnabled=true — reason: ${reason}`,
                { week: state.week, nomineeCount: state.nomineeIds.length }
              )
            }
            nextPhase = 'pos_comp_announcement'
            break
          }
          // Normal weeks: block advance() and let the UI resolve which nominee is saved.
          state.awaitingPublicSave = true
          pushEvent(
            state,
            `The final list of nominees today will be decided with the public's help.`,
            'game'
          )
          break
        }
        case 'pos_comp_announcement':
          break
        case 'pos_comp': {
          pushEvent(state, `The Power of Safety competition is underway! 🎭`, 'game')
          break
        }
        case 'pos_results': {
          // completeMinigame() applies the POS winner inline and advances the phase
          // directly, so minigameResult is always null here.  Always pick randomly.
          const posWinnerId = seededPick(rng, alive).id
          nextPhase = applyPosWinner(state, posWinnerId, alive)
          break
        }
        case 'pos_ceremony': {
          const povName =
            state.players.find((p) => p.id === state.posWinnerId)?.name ?? 'The safety holder'
          pushEvent(state, `${povName} is holding the Safety Ceremony. ⚡`, 'game')
          break
        }
        case 'pos_ceremony_results': {
          const svType = state.specialVeto?.activeType ?? null

          // VIP: if already processed (stage not 0), this is a second pass – skip to advance phase.
          if (svType === 'vip' && state.specialVeto!.vipUseStage !== 0) {
            break
          }

          const posWinner = state.posWinnerId
            ? (state.players.find((p) => p.id === state.posWinnerId) ?? null)
            : null
          const posDecisionPlayer = getCupidHumanCoholder(state, state.posWinnerId) ?? posWinner
          if (!posWinner) break
          const isNominee = posWinner !== null && state.nomineeIds.includes(posWinner.id)

          const missionImmunityCheck = {
            phase: nextPhase as string,
            week: state.week,
            secretMission: state.secretMission,
            nomineeIds: state.nomineeIds,
            lohId: state.lohId,
            posWinnerId: state.posWinnerId,
            players: state.players,
            doubleEviction: state.doubleEviction,
            voteResults: state.voteResults,
            awaitingTieBreak: state.awaitingTieBreak,
          }
          if (canOfferMissionImmunity(missionImmunityCheck)) {
            state.awaitingMissionImmunityOffer = true
            const humanPlayer = state.players.find((player) => player.isUser)
            const rewardDays = state.secretMission?.reward?.durationDays ?? 1
            pushEvent(
              state,
              `${humanPlayer?.name ?? 'You'} may use a secret ${rewardDays}-day immunity right now to escape the block before the Safety Ceremony concludes. 🛡️`,
              'game'
            )
            break
          }

          // ── Force Majeure: mandatory use (no choice) ──────────────────────────
          if (svType === 'spotlight') {
            if (isNominee && posWinner !== null) {
              // Nominee auto-saves self
              const savedName = posWinner.name
              const autoSavedId = posWinner.id
              state.nomineeIds = state.nomineeIds.filter((id) => id !== posWinner.id)
              posWinner.status = 'pos'
              state.povSavedId = autoSavedId
              addPovProtectedId(state, autoSavedId)
              pushEvent(state, `${savedName} used Force Majeure and saved themselves! ✨`, 'game')
              const lohPlayer =
                getCupidHumanCoholder(state, state.lohId) ??
                state.players.find((pl) => pl.id === state.lohId)
              if (lohPlayer?.isUser) {
                state.replacementNeeded = true
                pushEvent(state, `${lohPlayer.name} must now name a backup nominee. 🎯`, 'game')
              } else {
                const eligible = getReplacementEligiblePlayers(state, alive)
                if (eligible.length > 0) {
                  const replacement = pickStrategicAiPlayer(state, eligible, rng, 'highest')
                  if (replacement) {
                    appendNominee(state, replacement.id)
                    pushEvent(
                      state,
                      `${lohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`,
                      'game'
                    )
                  }
                }
              }
            } else if (posDecisionPlayer?.isUser) {
              // Human must use — directly to save target
              state.awaitingPovSaveTarget = true
              pushEvent(
                state,
                `${posWinner.name}, Force Majeure MUST be used! Choose a nominee to save. ✨`,
                'game'
              )
            } else {
              // AI: pick one nominee to save
              const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
              if (nominees.length > 0) {
                const nomineeToSave = pickSafetySaveTarget(state, posWinner?.id, nominees, rng)
                if (!nomineeToSave) break
                const savedName = nomineeToSave.name
                state.nomineeIds = state.nomineeIds.filter((id) => id !== nomineeToSave.id)
                const savedP = state.players.find((p) => p.id === nomineeToSave.id)
                if (savedP) savedP.status = 'active'
                state.povSavedId = nomineeToSave.id
                addPovProtectedId(state, nomineeToSave.id)
                pushEvent(
                  state,
                  `${posWinner?.name ?? 'The Force Majeure holder'} used Force Majeure on ${savedName}! ✨`,
                  'game'
                )
                const lohPlayer =
                  getCupidHumanCoholder(state, state.lohId) ??
                  state.players.find((pl) => pl.id === state.lohId)
                if (lohPlayer?.isUser) {
                  state.replacementNeeded = true
                  pushEvent(state, `${lohPlayer.name} must now name a backup nominee. 🎯`, 'game')
                } else {
                  state.aiReplacementStep = 1
                }
              }
            }
            break
          }

          // ── Halo Exchange: holder names the replacement ────────────────────────
          if (svType === 'diamond') {
            if (isNominee && posWinner !== null) {
              const savedName = posWinner.name
              const autoSavedId = posWinner.id
              state.nomineeIds = state.nomineeIds.filter((id) => id !== posWinner.id)
              posWinner.status = 'pos'
              state.povSavedId = autoSavedId
              addPovProtectedId(state, autoSavedId)
              pushEvent(state, `${savedName} used Halo Exchange and saved themselves! 😇`, 'game')
              if (posDecisionPlayer?.isUser) {
                state.specialVeto!.awaitingHolderReplacement = true
                pushEvent(
                  state,
                  `${posWinner.name}, as the Halo Exchange holder, you must name the backup nominee. 😇`,
                  'game'
                )
              } else {
                const eligible = getReplacementEligiblePlayers(state, alive, 1, {
                  actorId: posWinner.id,
                })
                if (eligible.length > 0) {
                  const replacement = pickStrategicAiPlayer(state, eligible, rng, 'highest')
                  if (replacement) {
                    appendNominee(state, replacement.id)
                    pushEvent(
                      state,
                      `${posWinner.name} named ${replacement.name} as the Halo Exchange backup nominee. 😇`,
                      'game'
                    )
                  }
                }
              }
            } else if (posDecisionPlayer?.isUser) {
              state.awaitingPovDecision = true
              pushEvent(state, `${posWinner.name}, will you use Halo Exchange? 😇`, 'game')
            } else {
              const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
              const eligible = getReplacementEligiblePlayers(state, alive, 1, {
                actorId: posWinner?.id,
              })
              const useIt =
                shouldUseSafetyForTwin(state, posWinner?.id, nominees) ||
                shouldAiUseTargetedSafetyPower(state, posWinner?.id, nominees, eligible)
              if (useIt) {
                if (nominees.length > 0) {
                  const nomineeToSave = pickSafetySaveTarget(state, posWinner?.id, nominees, rng)
                  if (!nomineeToSave) break
                  state.nomineeIds = state.nomineeIds.filter((id) => id !== nomineeToSave.id)
                  const savedP = state.players.find((p) => p.id === nomineeToSave.id)
                  if (savedP) savedP.status = 'active'
                  state.povSavedId = nomineeToSave.id
                  addPovProtectedId(state, nomineeToSave.id)
                  pushEvent(
                    state,
                    `${posWinner?.name ?? 'The Halo Exchange holder'} used Halo Exchange on ${nomineeToSave.name}! 😇`,
                    'game'
                  )
                  if (eligible.length > 0) {
                    const replacement = pickStrategicAiPlayer(state, eligible, rng, 'highest')
                    if (replacement) {
                      appendNominee(state, replacement.id)
                      pushEvent(
                        state,
                        `${posWinner?.name ?? 'The Halo Exchange holder'} named ${replacement.name} as the backup nominee. 😇`,
                        'game'
                      )
                    }
                  }
                }
              } else {
                pushEvent(
                  state,
                  `${posWinner?.name ?? 'The Halo Exchange holder'} chose not to use Halo Exchange. 😇`,
                  'game'
                )
              }
            }
            break
          }

          // ── Detox: removes both nominees, holder names both replacements ────────
          if (svType === 'coup') {
            if (isNominee && posWinner !== null) {
              const oldNominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
              oldNominees.forEach((n) => {
                if (n.id === posWinner.id) {
                  n.status = state.lohId === n.id ? 'loh+pos' : 'pos'
                } else {
                  n.status = 'active'
                }
              })
              state.nomineeIds = []
              state.povSavedId = null
              state.povProtectedIds = oldNominees.map((nominee) => nominee.id)
              const removedNames = oldNominees.map((n) => n.name).join(' and ')
              pushDetoxEvent(
                state,
                `${posWinner.name} ${getPlayerBeVerb(posWinner, 'has', 'have')} decided to use Detox. ⚡`
              )

              pushDetoxEvent(
                state,
                `${posWinner.name} used Detox and cleared ${removedNames} from the block! ⚡`
              )
              const eligible = getReplacementEligiblePlayers(state, alive, 2, {
                allowLoh: true,
                actorId: posWinner.id,
              })
              const replacements = pickStrategicAiPlayers(
                state,
                eligible,
                Math.min(2, eligible.length),
                rng,
                { preferLoh: true }
              )
              if (replacements.length > 0) {
                replacements.forEach((replacement) => appendNominee(state, replacement.id))
                pushDetoxEvent(
                  state,
                  `${posWinner.name} named ${replacements.map((replacement) => replacement.name).join(' and ')} as the new nominees. ⚡`
                )
              }
            } else if (posDecisionPlayer?.isUser) {
              state.awaitingPovDecision = true
              pushEvent(
                state,
                `${posWinner.name}, will you use Detox? ⚡ Both nominees would be removed and you would name two replacements!`,
                'game'
              )
            } else {
              const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
              const eligible = getReplacementEligiblePlayers(state, alive, 2, {
                allowLoh: true,
                actorId: posWinner?.id,
              })
              const useIt =
                shouldUseSafetyForTwin(state, posWinner?.id, nominees) ||
                shouldAiUseTargetedSafetyPower(state, posWinner?.id, nominees, eligible, {
                  replacementCount: Math.min(2, nominees.length),
                  preferLoh: true,
                })
              if (useIt) {
                const oldNominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
                oldNominees.forEach((n) => {
                  n.status = 'active'
                })
                state.nomineeIds = []
                state.povSavedId = null
                state.povProtectedIds = oldNominees.map((nominee) => nominee.id)
                const removedNames = oldNominees.map((n) => n.name).join(' and ')
                pushDetoxEvent(
                  state,
                  `${posWinner?.name ?? 'The Detox holder'} ${getPlayerBeVerb(posWinner, 'has', 'have')} decided to use Detox. ⚡`
                )
                pushDetoxEvent(
                  state,
                  `${posWinner?.name ?? 'The Detox holder'} used Detox! ${removedNames} are cleared from the block! ⚡`
                )
                if (eligible.length >= 2) {
                  const replacements = pickStrategicAiPlayers(state, eligible, 2, rng, {
                    preferLoh: true,
                  })
                  replacements.forEach((r) => {
                    appendNominee(state, r.id)
                  })
                  const repNames = replacements.map((r) => r.name).join(' and ')
                  pushDetoxEvent(
                    state,
                    `${posWinner?.name ?? 'The Detox holder'} named ${repNames} as the new nominees. ⚡`
                  )
                } else if (eligible.length === 1) {
                  const r = eligible[0]
                  appendNominee(state, r.id)
                  pushDetoxEvent(
                    state,
                    `${posWinner?.name ?? 'The Detox holder'} named ${r.name} as the only available replacement. ⚡`
                  )
                }
              } else {
                pushEvent(
                  state,
                  `${posWinner?.name ?? 'The Detox holder'} chose not to use Detox. ⚡`,
                  'game'
                )
              }
            }
            break
          }

          // ── Double Trouble: like standard but holder may use it twice ───────────
          if (svType === 'vip') {
            if (isNominee && posWinner !== null) {
              const savedName = posWinner.name
              const autoSavedId = posWinner.id
              state.nomineeIds = state.nomineeIds.filter((id) => id !== posWinner.id)
              posWinner.status = 'pos'
              state.povSavedId = autoSavedId
              addPovProtectedId(state, autoSavedId)
              state.specialVeto!.vipUseStage = 1
              pushEvent(state, `${savedName} used Double Trouble and saved themselves! 👑`, 'game')
              const lohPlayer = state.players.find((pl) => pl.id === state.lohId)
              if (lohPlayer?.isUser) {
                state.replacementNeeded = true
                pushEvent(state, `${lohPlayer.name} must now name a backup nominee. 🎯`, 'game')
              } else {
                state.aiReplacementStep = 1
              }
            } else if (posWinner?.isUser) {
              state.awaitingPovDecision = true
              pushEvent(
                state,
                `${posWinner.name}, will you use Double Trouble? 👑 You may use it TWICE this ceremony!`,
                'game'
              )
            } else {
              const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
              const eligible = getReplacementEligiblePlayers(state, alive)
              const useIt =
                shouldUseSafetyForTwin(state, posWinner?.id, nominees) ||
                shouldAiUseTargetedSafetyPower(state, posWinner?.id, nominees, eligible)
              if (useIt) {
                if (nominees.length > 0) {
                  const nomineeToSave = pickSafetySaveTarget(state, posWinner?.id, nominees, rng)
                  if (!nomineeToSave) {
                    state.specialVeto!.vipUseStage = -1
                    break
                  }
                  state.nomineeIds = state.nomineeIds.filter((id) => id !== nomineeToSave.id)
                  const savedP = state.players.find((p) => p.id === nomineeToSave.id)
                  if (savedP) savedP.status = 'active'
                  state.povSavedId = nomineeToSave.id
                  addPovProtectedId(state, nomineeToSave.id)
                  state.specialVeto!.vipUseStage = 1
                  pushEvent(
                    state,
                    `${posWinner?.name ?? 'The Double Trouble holder'} used Double Trouble on ${nomineeToSave.name}! 👑`,
                    'game'
                  )
                  const lohPlayer = state.players.find((pl) => pl.id === state.lohId)
                  if (lohPlayer?.isUser) {
                    state.replacementNeeded = true
                    pushEvent(state, `${lohPlayer.name} must now name a backup nominee. 🎯`, 'game')
                  } else {
                    state.aiReplacementStep = 1
                  }
                } else {
                  state.specialVeto!.vipUseStage = -1
                }
              } else {
                state.specialVeto!.vipUseStage = -1
                pushEvent(
                  state,
                  `${posWinner?.name ?? 'The Double Trouble holder'} chose not to use Double Trouble. 👑`,
                  'game'
                )
              }
            }
            break
          }

          // ── Standard (no special veto) ────────────────────────────────────────
          if (isNominee && posWinner !== null) {
            // ── POS auto-use rule: nominee who wins POS MUST use it on themselves ──
            const savedName = posWinner.name
            const autoSavedId = posWinner.id
            const savedUnitIds = removeCupidNomineeUnit(state, posWinner.id)
            // Update status: was 'nominated+pos', now just 'pos' (saved themselves)
            posWinner.status = 'pos'
            // Track the self-saved player so they cannot be re-nominated as the replacement
            state.povSavedId = autoSavedId
            savedUnitIds.forEach((id) => addPovProtectedId(state, id))
            if (isVoxPopuliActive(state)) {
              restoreVoxNomineeMinimum(state)
              pushVoxSafetyOutcome(state, posWinner.id, autoSavedId)
              break
            }
            pushEvent(
              state,
              `${savedName} ${getPlayerBeVerb(posWinner, 'has', 'have')} decided to use the Power of Safety on ${getPlayerReflexive(posWinner)}. ${
                state.players.find((pl) => pl.id === state.lohId)?.name ?? 'The LOH'
              } must now name a backup nominee.`,
              'game'
            )

            // LOH must name a replacement
            const lohPlayer =
              getCupidHumanCoholder(state, state.lohId) ??
              state.players.find((pl) => pl.id === state.lohId)
            if (lohPlayer?.isUser) {
              // Human LOH: set flag; UI will render replacement picker; Continue hidden
              state.replacementNeeded = true
              pushEvent(state, `${lohPlayer.name} is selecting a backup nominee...`, 'game')
            } else {
              state.aiReplacementStep = 1
            }
          } else if (posDecisionPlayer?.isUser) {
            // Human POS holder who is not a nominee: they must decide whether to use it
            state.awaitingPovDecision = true
            pushEvent(
              state,
              `${posDecisionPlayer.name}, will your pair use the Power of Safety? ⚡`,
              'game'
            )
          } else {
            const nominees = state.players.filter((player) => state.nomineeIds.includes(player.id))
            const eligible = getReplacementEligiblePlayers(state, alive)
            const useIt =
              shouldUseSafetyForTwin(state, posWinner?.id, nominees) ||
              shouldAiUseTargetedSafetyPower(state, posWinner?.id, nominees, eligible)
            const saveTarget = useIt
              ? pickSafetySaveTarget(state, posWinner?.id, nominees, rng)
              : null

            if (saveTarget) {
              const savedUnitIds = removeCupidNomineeUnit(state, saveTarget.id)
              saveTarget.status = 'active'
              state.povSavedId = saveTarget.id
              savedUnitIds.forEach((id) => addPovProtectedId(state, id))
              if (isVoxPopuliActive(state)) {
                restoreVoxNomineeMinimum(state)
                pushVoxSafetyOutcome(state, posWinner?.id ?? null, saveTarget.id)
                break
              }
              pushEvent(
                state,
                `${posWinner?.name ?? 'The safety holder'} used the Power of Safety on ${saveTarget.name}. ⚡`,
                'game'
              )
              const lohPlayer =
                getCupidHumanCoholder(state, state.lohId) ??
                state.players.find((player) => player.id === state.lohId)
              if (lohPlayer?.isUser) state.replacementNeeded = true
              else state.aiReplacementStep = 1
            } else {
              const povName = posWinner?.name ?? 'The safety holder'
              if (isVoxPopuliActive(state)) {
                pushVoxSafetyStandPat(state, posWinner?.id ?? null)
              } else {
                pushEvent(
                  state,
                  `${povName} has decided NOT to use the Power of Safety. The nominations remain the same. ⚡`,
                  'game'
                )
              }
            }
          }
          break
        }
        case 'social_2': {
          clearExpiredSafetyStatuses(state)
          if (isVoxPopuliActive(state)) {
            pushEvent(
              state,
              `The nominees make their final appeals directly to the audience. Housemates may offer support, but they do not vote.`,
              'social',
              { key: 'vox_populi_audience_appeals' }
            )
          } else {
            pushEvent(state, LIVE_VOTE_PITCHES_TEXT, 'social', {
              key: LIVE_VOTE_PITCHES_EVENT_KEY,
            })
          }
          break
        }
        case 'live_vote': {
          if (isVoxPopuliActive(state) && state.voxPopuli) {
            state.votes = {}
            state.awaitingHumanVote = false
            state.voxPopuli.awaitingPublicVote = true
            state.voxPopuli.publicVoteContext = 'eviction'
            state.voxPopuli.publicVotePercentages = null
            pushEvent(
              state,
              `The audience vote to eliminate is now open. No housemate will cast an eviction ballot.`,
              'vote',
              { major: 'vox_populi_public_vote_open' }
            )
            break
          }

          // Cast AI eligible votes. During Cupid's Arrow each pair deliberates
          // once, stores the same target for both partners, and therefore counts
          // as a joint two-vote ballot.
          state.votes = {}
          const voteMap = state.votes
          const lohIds = new Set(getCupidRoleIds(state, state.lohId))
          const eligibleVoters = alive.filter(
            (p) => !lohIds.has(p.id) && !state.nomineeIds.includes(p.id)
          )
          const eligibleVoterIds = new Set(eligibleVoters.map((player) => player.id))
          const processedVoterUnits = new Set<string>()
          for (const voter of eligibleVoters) {
            const pair = getCupidPair(state, voter.id)
            const voterUnitKey = isCupidArrowActive(state) && pair ? pair.id : `solo:${voter.id}`
            if (processedVoterUnits.has(voterUnitKey)) continue
            processedVoterUnits.add(voterUnitKey)

            const jointVoterIds = getCupidRoleIds(state, voter.id).filter((id) =>
              eligibleVoterIds.has(id)
            )
            if (
              jointVoterIds.some((id) => state.players.find((player) => player.id === id)?.isUser)
            )
              continue

            const eligibleNomineeIds = state.nomineeIds.filter((nomineeId) =>
              jointVoterIds.every((voterId) => canPlayerTargetPlayer(state, voterId, nomineeId))
            )
            const targetId = isCupidArrowActive(state)
              ? chooseCupidPairEvictionVote(
                  state,
                  jointVoterIds,
                  eligibleNomineeIds.length > 0 ? eligibleNomineeIds : state.nomineeIds,
                  state.seed
                )
              : chooseAiEvictionVote(
                  state,
                  voter.id,
                  eligibleNomineeIds.length > 0 ? eligibleNomineeIds : state.nomineeIds,
                  state.seed
                )
            jointVoterIds.forEach((voterId) => {
              voteMap[voterId] = targetId
            })
          }

          // Block advance() if the human player is an eligible voter
          const humanVoter = eligibleVoters.find((p) => p.isUser)
          if (humanVoter) {
            state.awaitingHumanVote = true

            // PR 3 — doubleVote offer: if the player has an eligible doubleVote
            // reward and no conflicting twist is active, prompt them before the
            // vote modal so they can choose whether to cast two votes.
            // Note: the switch runs for the phase being ENTERED (nextPhase), so
            // state.phase still holds the previous phase. Build a check state
            // that reflects the phase we are entering ('live_vote').
            const dvCheck = {
              phase: nextPhase as string,
              secretMission: state.secretMission,
              nomineeIds: state.nomineeIds,
              lohId: state.lohId,
              players: state.players,
              doubleEviction: state.doubleEviction,
              voteResults: state.voteResults,
              awaitingTieBreak: state.awaitingTieBreak,
            }
            if (
              !isCupidArrowActive(state) &&
              canUseDoubleVote(dvCheck) &&
              !state.humanDoubleVoteActive
            ) {
              state.awaitingDoubleVoteOffer = true
            }
          }
          break
        }
        case 'eviction_results': {
          // Guard: never evict when fewer than 2 players remain (should not happen in
          // normal flow, but prevents infinite loops if endgame guards are bypassed).
          if (alive.length < 2) break
          // Guard: if we're already waiting for a human tie-break, do nothing.
          if (state.awaitingTieBreak) break

          const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id))
          if (nominees.length === 0) break
          if (resolveCupidPairEviction(state)) break

          // ── Tally votes ───────────────────────────────────────────────────
          const voteCounts: Record<string, number> = {}
          for (const nomineeId of state.nomineeIds) voteCounts[nomineeId] = 0
          for (const nomineeId of Object.values(state.votes ?? {})) {
            if (nomineeId in voteCounts) voteCounts[nomineeId]++
          }
          state.pendingExitContext = {
            week: state.week,
            leaderIds: state.coLohIds?.length
              ? [...state.coLohIds]
              : state.lohId
                ? [state.lohId]
                : [],
            nomineeIds: [...state.nomineeIds],
            votesByVoterId: { ...(state.votes ?? {}) },
            voteCounts: { ...voteCounts },
          }

          // ── Double Eviction: evict top 2 nominees ─────────────────────────
          if (state.doubleEviction?.weekActive && nominees.length >= 2) {
            // Precompute deterministic tie-break ranks for the current nominee
            // IDs so the comparator stays transitive/stable for tied vote counts.
            const aiRng = mulberry32((state.seed ^ 0xdeadbeef) >>> 0)
            const tieBreakRanks: Record<string, number> = {}
            for (const nomineeId of state.nomineeIds) {
              tieBreakRanks[nomineeId] = aiRng()
            }

            // Sort nominees by vote count descending; use precomputed ranks for ties.
            const sortedIds = [...state.nomineeIds].sort((a, b) => {
              const diff = (voteCounts[b] ?? 0) - (voteCounts[a] ?? 0)
              if (diff !== 0) return diff
              return (tieBreakRanks[b] ?? 0) - (tieBreakRanks[a] ?? 0)
            })

            const firstId = sortedIds[0]
            const secondId = sortedIds[1]
            const firstEvictee = state.players.find((p) => p.id === firstId)
            const secondEvictee = state.players.find((p) => p.id === secondId)
            const boundaryVoteCount = voteCounts[secondId] ?? 0
            const guaranteedIds = state.nomineeIds.filter(
              (id) => (voteCounts[id] ?? 0) > boundaryVoteCount
            )
            const tiedBoundaryIds = state.nomineeIds.filter(
              (id) => (voteCounts[id] ?? 0) === boundaryVoteCount
            )
            const remainingBoundarySlots = Math.max(0, 2 - guaranteedIds.length)
            const ambiguousBoundaryTie =
              tiedBoundaryIds.length > remainingBoundarySlots && remainingBoundarySlots > 0

            if (firstEvictee && secondEvictee) {
              state.voteResults = { ...voteCounts }
              state.votes = {}
              if (guaranteedIds.length > 0) {
                state.pendingEviction = {
                  evicteeId: guaranteedIds[0],
                  evictionMessage: `${firstEvictee.name}, you have been eliminated from The Big Eye house. 🚪`,
                }
              } else if (!ambiguousBoundaryTie) {
                state.pendingEviction = {
                  evicteeId: firstId,
                  evictionMessage: `${firstEvictee.name}, you have been eliminated from The Big Eye house. 🚪`,
                }
              } else {
                state.pendingEviction = null
              }
              if (ambiguousBoundaryTie) {
                state.awaitingTieBreak = true
                state.tiedNomineeIds = tiedBoundaryIds
              } else {
                state.doubleEviction.pendingSecondEviction = {
                  evicteeId: secondId,
                  evictionMessage: `${secondEvictee.name}, you have also been eliminated in tonight's Double Elimination! 🚪`,
                }
              }
            }
            break
          }

          // ── Standard single eviction ──────────────────────────────────────
          // Find the highest vote count
          let maxVotes = -1
          for (const count of Object.values(voteCounts)) {
            if (count > maxVotes) maxVotes = count
          }
          const topNominees = state.nomineeIds.filter((id) => (voteCounts[id] ?? 0) === maxVotes)

          if (topNominees.length === 1) {
            // Clear winner — defer the commit until the cinematic overlay completes
            const evicted = state.players.find((p) => p.id === topNominees[0])
            if (evicted) {
              // Store vote results for popup reveal, then queue the pending eviction.
              // Intentionally do NOT clear state.votes here — the raw per-voter mapping
              // is preserved for the confessional vote-breakdown unlock that fires after
              // the eviction animation. Votes are cleared when the game next enters
              // the live_vote phase in the normal advance() flow.
              state.voteResults = { ...voteCounts }
              state.pendingEviction = {
                evicteeId: evicted.id,
                evictionMessage: `${evicted.name}, you have been eliminated from The Big Eye house. 🚪`,
              }

              // PR 3 — voteDeduction offer: if the human player is on the block
              // with votes against them and has an eligible voteDeduction reward,
              // pause the flow so they can decide whether to use the power.
              // Note: state.phase still holds the previous phase here — pass nextPhase
              // explicitly so canUseVoteDeduction sees the correct phase ('eviction_results').
              const vdCheck = {
                phase: nextPhase as string,
                secretMission: state.secretMission,
                nomineeIds: state.nomineeIds,
                lohId: state.lohId,
                players: state.players,
                doubleEviction: state.doubleEviction,
                voteResults: state.voteResults,
                awaitingTieBreak: state.awaitingTieBreak,
              }
              if (canUseVoteDeduction(vdCheck)) {
                state.awaitingVoteDeductionPrompt = true
              }
            }
          } else {
            // Tie — on co-LOH Democracia days, POS holder breaks it; otherwise LOH breaks it.
            const isCoLohDay = Array.isArray(state.coLohIds) && state.coLohIds.length >= 2
            const tieBreakerPlayerId = isCoLohDay ? state.posWinnerId : state.lohId
            const tieBreakerPlayer = state.players.find((p) => p.id === tieBreakerPlayerId)
            const tiedNames = topNominees
              .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
              .join(' and ')
            if (tieBreakerPlayer?.isUser) {
              // Human POS holder (co-LOH day) or human LOH (normal day): show tie-break modal
              state.voteResults = { ...voteCounts }
              state.awaitingTieBreak = true
              if (isCoLohDay) state.awaitingPosTieBreak = true
              state.tiedNomineeIds = topNominees
              if (isCoLohDay) {
                pushEvent(
                  state,
                  `It's a tie between ${tiedNames}! ${tieBreakerPlayer.name}, as POS holder, you must break the tie as a special exception. 🗳️`,
                  'game'
                )
              } else {
                pushEvent(
                  state,
                  `It's a tie between ${tiedNames}! ${tieBreakerPlayer.name}, as LOH you must break the tie. 🗳️`,
                  'game'
                )
              }
            } else if (tieBreakerPlayer) {
              // AI tiebreaker: deterministically pick among tied nominees — defer commit
              const aiRng = mulberry32((state.seed ^ 0xdeadbeef) >>> 0)
              const evicteeId = topNominees[Math.floor(aiRng() * topNominees.length)]
              const evicted = state.players.find((p) => p.id === evicteeId)
              if (evicted) {
                state.voteResults = { ...voteCounts }
                const breakerLabel = isCoLohDay ? 'The POS holder' : 'The LOH'
                state.pendingEviction = {
                  evicteeId: evicted.id,
                  evictionMessage: `${tieBreakerPlayer.name ?? breakerLabel} breaks the tie, voting to eliminate ${evicted.name}. ${evicted.name} has been eliminated from The Big Eye house. 🗳️`,
                }
              }
            } else {
              // Fallback: tiebreaker unavailable — deterministic seeded pick to prevent deadlock
              const aiRng = mulberry32((state.seed ^ 0xdeadbeef) >>> 0)
              const evicteeId = topNominees[Math.floor(aiRng() * topNominees.length)]
              const evicted = state.players.find((p) => p.id === evicteeId)
              if (evicted) {
                state.voteResults = { ...voteCounts }
                state.pendingEviction = {
                  evicteeId: evicted.id,
                  evictionMessage: `${evicted.name} has been eliminated from The Big Eye house. 🚪`,
                }
              }
            }
          }
          break
        }
        case 'week_end': {
          pushEvent(state, `Day ${state.week} has come to an end. A new day begins soon…`, 'game', {
            key: 'day_end',
            phase: 'week_end',
          })
          break
        }
      }

      finishPhaseBroadcastSequence(state)
      state.phase = nextPhase
    },

    // ── Secret Mission reducers ────────────────────────────────────────────

    /**
     * Trigger a new secret mission for the current season.
     * Supports up to two missions per season when the current slot is recyclable.
     * @param day  The game week / day on which the trigger fires.
     */
    triggerSecretMission(
      state,
      action: PayloadAction<number | { day: number; maxDaySpan?: number }>
    ) {
      if (isCupidArrowTwistLocked(state) || isVoxPopuliTwistLocked(state)) return
      const missionCount = getSeasonSecretMissionCount(state)
      if (missionCount >= 2) return
      if (!canReplaceSecretMissionSlot(state.secretMission)) return

      const day = typeof action.payload === 'number' ? action.payload : action.payload.day
      const maxDaySpan = typeof action.payload === 'number' ? undefined : action.payload.maxDaySpan
      const nextMissionNumber = missionCount + 1
      state.secretMission = createSecretMissionState(day, {
        maxDaySpan,
        missionNumber: nextMissionNumber,
      })
      state.secretMissionCount = nextMissionNumber
      if (nextMissionNumber >= 2) {
        state.secretMissionSecondChanceResolved = true
      }
    },

    markSecondSecretMissionChanceResolved(state) {
      state.secretMissionSecondChanceResolved = true
    },

    /**
     * Mark the mission as offered in the Confessional (status → 'offered').
     * Records the day of the offer and increments the offer count.
     * @param day  Current game week / day when the offer is shown.
     */
    offerSecretMission(state, action: PayloadAction<number>) {
      const sm = state.secretMission
      if (!sm || (sm.status !== 'available' && sm.status !== 'declined')) return
      // Limit to 2 offers (original + one re-offer after decline)
      if (sm.offerCount >= 2) return
      sm.status = 'offered'
      sm.offeredDay = action.payload
      sm.offerCount += 1
    },

    /**
     * Player accepted the mission (status → 'accepted').
     * Initialises the task list from the matching template.
     */
    acceptSecretMission(state) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'offered') return
      const nextMission = buildSecretMissionTasksForTemplate(state, sm.templateId, sm.triggeredDay)
      sm.status = 'accepted'
      sm.templateId = nextMission.templateId
      sm.tasks = nextMission.tasks
      const signature = getMissionTaskSetSignature(nextMission.tasks)
      state.secretMissionTaskSetHistory = Array.from(
        new Set([...(state.secretMissionTaskSetHistory ?? []), signature])
      )
    },

    /**
     * Player declined the mission (status → 'declined').
     * Records the day of the decline.
     * @param day  Current game week / day when the player declined.
     */
    declineSecretMission(state, action: PayloadAction<number>) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'offered') return
      sm.status = 'declined'
      sm.declinedDay = action.payload
    },

    /**
     * Update progress on a single mission task.
     * Automatically marks the task completed when current >= target.
     * If all tasks complete, transitions the mission to 'rewardPending'.
     */
    updateMissionTaskProgress(
      state,
      action: PayloadAction<{
        taskId: string
        current: number
        lastProgressDay?: number
        firstSatisfiedDay?: number
        auditEntry?: string
        currentStreak?: number
        maxStreak?: number
      }>
    ) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'accepted') return
      const task = sm.tasks.find((t) => t.id === action.payload.taskId)
      if (!task) return
      task.current = action.payload.current
      if (typeof action.payload.currentStreak === 'number')
        task.currentStreak = action.payload.currentStreak
      if (typeof action.payload.maxStreak === 'number') task.maxStreak = action.payload.maxStreak
      if (typeof action.payload.lastProgressDay === 'number')
        task.lastProgressDay = action.payload.lastProgressDay
      task.completed = task.current >= task.target
      if (task.completed && typeof action.payload.firstSatisfiedDay === 'number') {
        task.firstSatisfiedDay = action.payload.firstSatisfiedDay
      }
      if (action.payload.auditEntry) {
        task.auditLog = [...(task.auditLog ?? []), action.payload.auditEntry].slice(-12)
      }
      refreshSecretMissionCompletion(sm)
    },

    /**
     * Anti-cheese: credit a unique day for a task that requires visits on
     * separate calendar days (e.g. `confessional_visits`).
     *
     * Rules:
     *  - The day string must NOT already be in `task.uniqueDays`.
     *  - `task.current` never decreases when `uniqueDays` is introduced for an
     *    upgraded save; new credits only move progress forward.
     *  - If `current >= target` the task is marked completed and, if all
     *    tasks finish, the mission transitions to 'rewardPending'.
     *
     * Idempotent: re-crediting a day that was already counted is a no-op.
     */
    addUniqueDayToTask(state, action: PayloadAction<{ taskId: string; day: string }>) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'accepted') return
      const task = sm.tasks.find((t) => t.id === action.payload.taskId)
      if (!task || task.completed) return
      const previousCurrent = typeof task.current === 'number' ? task.current : 0
      if (!task.uniqueDays) task.uniqueDays = []
      if (task.uniqueDays.includes(action.payload.day)) return // already counted
      task.uniqueDays.push(action.payload.day)
      task.current = Math.max(previousCurrent, task.uniqueDays.length)
      task.completed = task.current >= task.target
      refreshSecretMissionCompletion(sm)
    },

    /**
     * Explicitly mark the mission as completed (e.g. when the final task
     * is ticked via a passive update path).
     * Transitions to rewardPending.
     */
    completeMission(state) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'accepted') return
      sm.tasks.forEach((t) => {
        t.completed = true
        t.current = t.target
      })
      sm.status = 'rewardPending'
    },

    syncMissionTask(
      state,
      action: PayloadAction<{ taskId: string; updates: Partial<MissionTask> }>
    ) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'accepted') return
      const task = sm.tasks.find((candidate) => candidate.id === action.payload.taskId)
      if (!task) return
      Object.assign(task, action.payload.updates)
      task.completed = task.current >= task.target || task.completed === true
      refreshSecretMissionCompletion(sm)
    },

    setMissionTaskBaselineApproval(
      state,
      action: PayloadAction<{ taskId: string; approval: number }>
    ) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'accepted') return
      const task = sm.tasks.find((candidate) => candidate.id === action.payload.taskId)
      if (!task) return
      task.baselineApproval = action.payload.approval
    },

    recordSecretMissionEasterEgg(state, action: PayloadAction<{ eggId: string; day: number }>) {
      const sm = state.secretMission
      if (!sm) return
      const discovered = new Set(sm.discoveredEasterEggIds ?? [])
      if (discovered.has(action.payload.eggId)) return
      discovered.add(action.payload.eggId)
      sm.discoveredEasterEggIds = [...discovered]

      if (sm.status !== 'accepted') return
      const task = sm.tasks.find((candidate) => candidate.type === 'easter_egg_discovery')
      if (!task) return
      const discoveredEggIds = new Set(task.discoveredEggIds ?? [])
      discoveredEggIds.add(action.payload.eggId)
      task.discoveredEggIds = [...discoveredEggIds]
      task.current = task.discoveredEggIds.length
      task.lastProgressDay = action.payload.day
      task.completed = task.current >= task.target
      if (task.completed && task.firstSatisfiedDay == null) {
        task.firstSatisfiedDay = action.payload.day
      }
      task.auditLog = [...(task.auditLog ?? []), `Discovered ${action.payload.eggId}`].slice(-12)
      refreshSecretMissionCompletion(sm)
    },

    expireSecretMission(state) {
      const sm = state.secretMission
      if (!sm) return
      if (sm.status === 'rewardClaimed') return
      if (sm.status === 'expired') return
      sm.status = 'expired'
    },

    /**
     * Claim the reward after mission completion.
     * New missions use deterministic immunity rewards; legacy reward types are
     * still accepted for migration/tests.
     */
    claimMissionReward(
      state,
      action: PayloadAction<
        LegacyMissionRewardType | { claimDay: number; durationDays?: 1 | 2 | 3 }
      >
    ) {
      const sm = state.secretMission
      if (!sm || sm.status !== 'rewardPending') return
      if (typeof action.payload === 'string') {
        sm.reward = createMissionReward(action.payload)
      } else {
        const duration =
          action.payload.durationDays ?? pickMissionImmunityDuration(sm.triggeredDay, sm.templateId)
        sm.reward = createImmunityReward(duration, action.payload.claimDay)
      }
      sm.status = 'rewardClaimed'
    },

    /**
     * Expire a claimed reward when Final 4 is reached.
     * Only runs when the reward exists and is still eligible (i.e. not consumed
     * and not already an empty box).  Idempotent — safe to call multiple times.
     *
     * The Final 4 restriction: rewards can only be used BEFORE Final 4 week.
     * Once Final 4 begins, any stored eligible reward is expired and becomes unusable.
     */
    expireMissionReward(state) {
      const sm = state.secretMission
      if (!sm || !sm.reward) return
      if (sm.reward.consumed) return // already used — nothing to expire
      if (!sm.reward.eligible) return // emptyBox or already expired — skip
      sm.reward.expired = true
      sm.reward.eligible = false
    },

    activateMissionImmunityReward(state) {
      if (!state.awaitingMissionImmunityOffer) return
      state.awaitingMissionImmunityOffer = false
      const sm = state.secretMission
      const reward = sm?.reward
      if (
        !reward ||
        reward.type !== 'immunity' ||
        !reward.eligible ||
        state.phase === 'final4_eviction' ||
        state.phase === 'final3' ||
        reward.activeUntilDay === undefined ||
        state.week > reward.activeUntilDay
      ) {
        return
      }

      const humanPlayer = state.players.find((player) => player.isUser)
      if (
        !humanPlayer ||
        !state.nomineeIds.includes(humanPlayer.id) ||
        state.posWinnerId === humanPlayer.id
      )
        return

      state.nomineeIds = state.nomineeIds.filter((id) => id !== humanPlayer.id)
      if (humanPlayer.status === 'nominated+pos') humanPlayer.status = 'pos'
      else humanPlayer.status = 'active'
      addPovProtectedId(state, humanPlayer.id)
      reward.consumed = true
      reward.eligible = false
      reward.usedDay = state.week

      pushEvent(
        state,
        `${humanPlayer.name} used their secret immunity and stepped off the block before the Safety Ceremony could finish! 🛡️`,
        'game'
      )

      const aliveNow = state.players.filter(
        (player) => player.status !== 'evicted' && player.status !== 'jury'
      )
      // Use a dedicated seed modifier so immunity-driven replacement picks stay
      // deterministic without perturbing the main ceremony RNG stream.
      const seedRng = mulberry32((state.seed ^ IMMUNITY_REPLACEMENT_SEED_MODIFIER) >>> 0)
      ensureMinimumNominees(state, aliveNow, 2, seedRng)
    },

    declineMissionImmunityReward(state) {
      state.awaitingMissionImmunityOffer = false
    },

    // ── PR 3: doubleVote activation reducers ──────────────────────────────

    /**
     * Accept the Big Eye doubleVote offer — activates the double-vote mode
     * for the current live_vote phase.
     *
     * Sets `humanDoubleVoteActive = true` and clears `awaitingDoubleVoteOffer`.
     * The live-vote modal in GameScreen detects `humanDoubleVoteActive` and shows
     * two nominee selectors instead of one.
     *
     * Guard: only applies when `awaitingDoubleVoteOffer` is true and an eligible
     * doubleVote reward exists.
     */
    activateDoubleVoteReward(state) {
      if (!state.awaitingDoubleVoteOffer) return
      // Always clear the offer flag (ensures UI won't be stuck if state is inconsistent)
      state.awaitingDoubleVoteOffer = false
      const sm = state.secretMission
      if (!sm?.reward || sm.reward.type !== 'doubleVote' || !sm.reward.eligible) return
      state.humanDoubleVoteActive = true
    },

    /**
     * Decline the Big Eye doubleVote offer — clears `awaitingDoubleVoteOffer`
     * without consuming the reward. The reward remains stored for a future vote.
     */
    declineDoubleVoteReward(state) {
      state.awaitingDoubleVoteOffer = false
      // humanDoubleVoteActive stays false (or undefined); normal vote modal follows.
    },

    /**
     * Submit two vote targets when the human player has the doubleVote power active.
     * Records both votes in `state.votes` using `<humanId>` and `<humanId>__dv2`
     * as the voter keys, then consumes the reward and clears the activation flag.
     *
     * @param action.payload  Tuple [primaryTarget, secondaryTarget] — both must be
     *                        valid nominee IDs.  The same nominee may be chosen twice.
     */
    submitHumanDoubleVote(state, action: PayloadAction<[string, string]>) {
      if (!state.humanDoubleVoteActive) return
      const [target1, target2] = action.payload
      if (!state.nomineeIds.includes(target1)) return
      if (!state.nomineeIds.includes(target2)) return

      const humanPlayer = state.players.find((p) => p.isUser)
      if (!humanPlayer) return
      if (!state.votes) state.votes = {}

      // Primary vote (same key as a normal vote)
      state.votes[humanPlayer.id] = target1
      // Secondary vote stored under a suffix key — tallied by the same loop
      // in advance() that iterates Object.values(state.votes).
      state.votes[`${humanPlayer.id}__dv2`] = target2

      state.awaitingHumanVote = false
      state.humanDoubleVoteActive = false

      // Consume the reward
      const sm = state.secretMission
      if (sm?.reward && sm.reward.type === 'doubleVote') {
        sm.reward.consumed = true
        sm.reward.eligible = false
      }
    },

    // ── PR 3: voteDeduction activation reducers ───────────────────────────

    /**
     * Accept the Big Eye voteDeduction offer — subtracts 1 vote from the human
     * player's tally in `voteResults`, recomputes `pendingEviction` based on the
     * updated counts, consumes the reward, and clears `awaitingVoteDeductionPrompt`.
     *
     * Guard: only applies when `awaitingVoteDeductionPrompt` is true and an
     * eligible voteDeduction reward exists.
     */
    activateVoteDeductionReward(state) {
      if (!state.awaitingVoteDeductionPrompt) return
      // Always clear the prompt flag (ensures UI won't be stuck if state is inconsistent)
      state.awaitingVoteDeductionPrompt = false
      const sm = state.secretMission
      if (!sm?.reward || sm.reward.type !== 'voteDeduction' || !sm.reward.eligible) return
      if (!state.voteResults) return

      const humanPlayer = state.players.find((p) => p.isUser)
      if (!humanPlayer) return
      if (!(humanPlayer.id in state.voteResults)) return

      // Apply the deduction (floor at 0 to be safe)
      state.voteResults[humanPlayer.id] = Math.max(0, (state.voteResults[humanPlayer.id] ?? 0) - 1)

      // Recompute the evictee based on the updated tallies
      let maxVotes = -1
      for (const id of state.nomineeIds) {
        const count = state.voteResults[id] ?? 0
        if (count > maxVotes) maxVotes = count
      }
      const topNominees = state.nomineeIds.filter(
        (id) => (state.voteResults![id] ?? 0) === maxVotes
      )

      if (topNominees.length === 1) {
        const newEvictee = state.players.find((p) => p.id === topNominees[0])
        if (newEvictee) {
          state.pendingEviction = {
            evicteeId: newEvictee.id,
            evictionMessage: `${newEvictee.name}, you have been eliminated from The Big Eye house. 🚪`,
          }
        }
      }
      // Note: canUseVoteDeduction guards against tie-creation so topNominees.length
      // should always be 1 here.

      // Consume the reward
      sm.reward.consumed = true
      sm.reward.eligible = false
    },

    /**
     * Decline the Big Eye voteDeduction offer — clears `awaitingVoteDeductionPrompt`
     * without consuming the reward. The power remains stored for a future vote week.
     */
    declineVoteDeduction(state) {
      state.awaitingVoteDeductionPrompt = false
    },
  },
})

export const {
  setPhase,
  advanceWeek,
  updatePlayer,
  syncStrategicRelationships,
  setLohSocialPlan,
  addTvEvent,
  updateTvEvent,
  removeTvEvent,
  setBroadcastOverride,
  resetBroadcastOverride,
  replaceBroadcastConfig,
  syncPhaseBroadcasts,
  consumeBroadcastEvent,
  addCustomBroadcast,
  updateCustomBroadcast,
  reorderCustomBroadcasts,
  reorderPhaseBroadcasts,
  removeCustomBroadcast,
  setDramaSocialMode,
  setLohSafetyAdvice,
  addSocialSummary,
  setLive,
  launchMinigame,
  completeMinigame,
  skipMinigame,
  applyMinigameWinner,
  applyCompetitionSeasonUpdate,
  applyF3MinigameWinner,
  updateGamePRs,
  advance,
  setReplacementNominee,
  selectNominee1,
  finalizeNominations,
  commitNominees,
  commitPublicSave,
  submitPovDecision,
  submitPovSaveTarget,
  submitHumanVote,
  submitTieBreak,
  submitDoubleEvictionTieBreak,
  commitVoxAudienceVote,
  commitVoxAudiencePreview,
  dismissVoteResults,
  dismissEvictionSplash,
  setEvictionOverlay,
  clearEvictionOverlay,
  finalizePendingEviction,
  selfEvict,
  aiReplacementRendered,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  finalizeGame,
  completeVoxFinalistShowcase,
  startVoxFinalVote,
  resolveVoxSeasonWinner,
  completeVoxSeasonRecap,
  startWinnerCinematic,
  startWinnerInterview,
  advanceInterview,
  startPublicFavorite,
  resumeAfterPublicFavorite,
  startGoodbyeSequence,
  advanceGoodbyeSequence,
  startLightsOff,
  completeFinale,
  activateBattleBack,
  completeBattleBack,
  dismissBattleBack,
  openBattleBackCompetition,
  activateDoubleEviction,
  activateSpecialVeto,
  setCupidArrowSchedule,
  activateCupidArrowNow,
  breakCupidArrowNow,
  setVoxPopuliSchedule,
  activateVoxPopuliNow,
  setSeasonExpansion,
  queueForcedShock,
  clearForcedShock,
  consumeForcedShock,
  activateDayStartShock,
  confirmDayStartShock,
  submitDiamondReplacement,
  submitCoupReplacement,
  submitVipSecondUseDecision,
  submitVipSecondSaveTarget,
  startFavoritePlayerPhase,
  openFavoritePlayerVoting,
  eliminateFavoriteCandidate,
  resolveFavoritePlayerWinner,
  awardFavoritePrize,
  openSpectator,
  closeSpectator,
  setAwaitingFinal3Plea,
  finalizeFinal3Decision,
  forceHoH,
  forceNominees,
  forcePovWinner,
  forcePlayerStatus,
  prepareVoxFinalThreeTest,
  forcePhase,
  clearBlockingFlags,
  archiveSeason,
  replacePlayers,
  updateUserPlayerIdentity,
  clearSurvivorReplacementTransition,
  resetGame,
  rerollSeed,
  hydrateGame,
  setHasSeenConfessionalSpotlight,
  submitTwinShockAnswer,
  completeTwinShockRevealAnimation,
  triggerSecretMission,
  markSecondSecretMissionChanceResolved,
  offerSecretMission,
  acceptSecretMission,
  declineSecretMission,
  updateMissionTaskProgress,
  syncMissionTask,
  setMissionTaskBaselineApproval,
  addUniqueDayToTask,
  recordSecretMissionEasterEgg,
  completeMission,
  expireSecretMission,
  claimMissionReward,
  expireMissionReward,
  activateMissionImmunityReward,
  declineMissionImmunityReward,
  activateDoubleVoteReward,
  declineDoubleVoteReward,
  submitHumanDoubleVote,
  activateVoteDeductionReward,
  declineVoteDeduction,
  activateDemocracia,
  submitDemocraciaVote,
  dismissDemocraciaResultDisplay,
  resolveDemocraciaPublicBreaker,
  submitCoLohNomination,
  submitPosTieBreak,
} = gameSlice.actions
export default gameSlice.reducer

// ─── Selectors ────────────────────────────────────────────────────────────────
/** Resolve a pending Vox Populi audience vote from the live Public Opinion model. */
export const resolvePendingVoxAudienceVote =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const root = getState()
    const game = root.game
    const context = game.voxPopuli?.publicVoteContext
    if (
      !isVoxPopuliActive(game) ||
      !game.voxPopuli?.awaitingPublicVote ||
      (context !== 'eviction' && context !== 'final3')
    ) {
      return
    }
    const rawResult = resolveVoxAudienceEviction({
      nomineeIds: game.nomineeIds,
      profiles: root.publicOpinion?.profiles ?? {},
      seed: game.seed,
      week: game.week,
    })
    const previewApplies =
      game.voxPopuli.audiencePreviewWeek === game.week &&
      game.voxPopuli.audiencePreviewNomineeIds?.length === game.nomineeIds.length &&
      game.nomineeIds.every((id) => game.voxPopuli?.audiencePreviewNomineeIds?.includes(id))
    const result = previewApplies
      ? reconcileVoxAudienceResultWithPreview({
          finalPercentages: rawResult.percentages,
          previewPercentages: game.voxPopuli.audiencePreviewPercentages,
          nomineeIds: game.nomineeIds,
        })
      : rawResult
    dispatch(
      commitVoxAudienceVote({
        context,
        percentages: result.percentages,
        rankedIds: result.rankedIds,
      })
    )
  }

/** Reveal the once-per-day, rewarded Vox audience snapshot on the Faux TV. */
export const revealVoxTemporaryAudienceVote =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const root = getState()
    const game = root.game
    if (
      !isVoxPopuliActive(game) ||
      !game.voxPopuli ||
      game.voxPopuli.audiencePreviewWeek === game.week ||
      game.nomineeIds.length < 2
    ) {
      return
    }
    const finalResult = resolveVoxAudienceEviction({
      nomineeIds: game.nomineeIds,
      profiles: root.publicOpinion?.profiles ?? {},
      seed: game.seed,
      week: game.week,
    })
    const percentages = resolveVoxAudiencePreview({
      finalPercentages: finalResult.percentages,
      nomineeIds: game.nomineeIds,
      seed: game.seed,
      week: game.week,
    })
    dispatch(
      commitVoxAudiencePreview({
        week: game.week,
        nomineeIds: [...game.nomineeIds],
        percentages,
      })
    )
  }

const selectPlayers = (state: RootState) => state.game.players

export const selectAlivePlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
)

export const selectEvictedPlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status === 'evicted' || p.status === 'jury')
)

/**
 * Deterministically predicts the Final 3 Part 3 winner without mutating state.
 *
 * Mirrors the RNG logic in the `final3_comp3` branch of `advance()` so
 * SpectatorView can receive an authoritative `initialWinnerId` before
 * `advance()` is dispatched (which happens only after playback completes).
 *
 * Returns null when the prediction is not applicable (wrong phase, missing
 * finalists, or a human finalist is present — the minigame path takes over).
 */
export const selectF3Part3PredictedWinnerId = (state: RootState): string | null => {
  const { phase, seed, f3Part1WinnerId, f3Part2WinnerId, players } = state.game
  if (phase !== 'final3_comp3' || !f3Part1WinnerId || !f3Part2WinnerId) return null
  const finalists = players.filter((p) => p.id === f3Part1WinnerId || p.id === f3Part2WinnerId)
  if (finalists.length < 2) return null
  // Bail out for the human-participant path (minigame handles that case).
  if (finalists.some((p) => p.isUser)) return null
  const seedRng = mulberry32(seed)
  const newSeed = (seedRng() * 0x100000000) >>> 0
  const rng = mulberry32(newSeed)
  return seededPick(rng, finalists).id
}

/**
 * Deterministically predicts the Final 3 Part 2 winner without mutating state.
 *
 * Mirrors the RNG logic in the `final3_comp2` branch of `advance()` so
 * SpectatorView can receive an authoritative `initialWinnerId` before
 * `advance()` is dispatched (which happens only after playback completes).
 *
 * Returns null when the prediction is not applicable (wrong phase, missing
 * Part-1 winner, no Part-2 competitors, or a human is competing in Part 2 —
 * the minigame path takes over in that case). Mirrors the `advance()` guard
 * exactly: only `losers.length === 0` is treated as non-applicable so that a
 * single-competitor edge case (corrupted state) still yields a deterministic
 * result consistent with what `advance()` would pick.
 */
export const selectF3Part2PredictedWinnerId = (state: RootState): string | null => {
  const { phase, seed, f3Part1WinnerId, players } = state.game
  if (phase !== 'final3_comp2' || !f3Part1WinnerId) return null
  const alive = players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
  const losers = alive.filter((p) => p.id !== f3Part1WinnerId)
  if (losers.length === 0) return null
  // Bail out for the human-participant path (minigame handles that case).
  if (losers.some((p) => p.isUser)) return null
  const seedRng = mulberry32(seed)
  const newSeed = (seedRng() * 0x100000000) >>> 0
  const rng = mulberry32(newSeed)
  return seededPick(rng, losers).id
}

function pickDebugAlivePlayer(
  state: GameState,
  rng: () => number,
  excludeIds: Set<string> = new Set(),
  mode: 'highest' | 'lowest' = 'highest'
): Player | null {
  const alive = state.players.filter(
    (player) =>
      player.status !== 'evicted' && player.status !== 'jury' && !excludeIds.has(player.id)
  )
  if (alive.length === 0) return null
  return pickStrategicAiPlayer(state, alive, rng, mode) ?? seededPick(rng, alive)
}

function buildDebugIncomingInteraction(
  fromId: string,
  week: number,
  rng: () => number
): IncomingInteraction {
  const types: IncomingInteraction['type'][] = [
    'compliment',
    'gossip',
    'warning',
    'alliance_proposal',
    'deal_offer',
    'nomination_plea',
    'check_in',
    'snide_remark',
    'other',
  ]
  const type = seededPick(rng, types)
  const now = Date.now()
  const requiresResponse = ['alliance_proposal', 'deal_offer', 'nomination_plea'].includes(type)
  const textByType: Record<IncomingInteraction['type'], string[]> = {
    compliment: ['You are still the one to beat.', 'That move was pretty iconic.'],
    gossip: [
      'People are already reading the week as a power shift.',
      'There is a new whisper chain in the house.',
    ],
    warning: ['The house is noticing your numbers.', 'Someone thinks your name is coming up soon.'],
    alliance_proposal: [
      'Want to keep the line steady this week?',
      'We should make this official while we still can.',
    ],
    deal_offer: [
      'Keep me off the block and I will return the favor.',
      'There is a quiet deal to be made here.',
    ],
    nomination_plea: ['I need one more week to survive.', 'Please, not me this time.'],
    check_in: ['Just checking in on the vibe.', 'Wanted to see where your head is at.'],
    snide_remark: ['Bold plan. Hope it works.', 'Interesting strategy if you like chaos.'],
    other: ['We need to talk later.', 'Something feels off this week.'],
  }
  const text = seededPick(rng, textByType[type])

  return {
    id: `dbg-interaction-${week}-${fromId}-${Math.floor(now % 1_000_000)}-${Math.floor(rng() * 1_000)}`,
    fromId,
    type,
    text,
    createdAt: now,
    createdWeek: week,
    expiresAtWeek: week + 1,
    read: false,
    requiresResponse,
    resolved: false,
  }
}

// ─── Debug thunks ─────────────────────────────────────────────────────────────
function seedDebugCycleNoise(dispatch: AppDispatch, rootState: RootState, rng: () => number): void {
  const { game, publicOpinion } = rootState
  const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
  if (alive.length === 0) return

  dispatch(resetDailyFeedBudget({ week: game.week }))
  dispatch(snapshotWeekRelationships())
  dispatch(decaySocialMemory())

  const beatCount = Math.min(3, alive.length)
  const actors = seededPickN(rng, alive, beatCount)
  const socialSummaryParts: string[] = []

  actors.forEach((actor, index) => {
    const targets = alive.filter((p) => p.id !== actor.id)
    if (targets.length === 0) return

    const target =
      pickStrategicAiPlayer(game, targets, rng, index % 2 === 0 ? 'highest' : 'lowest') ??
      seededPick(rng, targets)
    const approvalDelta = rng() < 0.5 ? 2 : -2
    const relationshipDelta = approvalDelta > 0 ? 2 : -2
    const memoryDeltas =
      approvalDelta > 0 ? { gratitude: 1, trustMomentum: 1 } : { resentment: 1, trustMomentum: -1 }
    const timestamp = Date.now()

    dispatch(
      updateRelationship({
        source: actor.id,
        target: target.id,
        delta: relationshipDelta,
        actionSource: 'system',
      })
    )
    dispatch(
      updateSocialMemory({
        actorId: actor.id,
        targetId: target.id,
        deltas: memoryDeltas,
        event: {
          type: 'debug_cycle_noise',
          actorId: actor.id,
          targetId: target.id,
          week: game.week,
          timestamp,
        },
      })
    )
    dispatch(
      recordSocialAction({
        entry: {
          actionId: `dbg-social-${game.week}-${actor.id}-${target.id}-${timestamp}`,
          actorId: actor.id,
          targetId: target.id,
          cost: 0,
          delta: relationshipDelta,
          outcome: approvalDelta > 0 ? 'success' : 'failure',
          newEnergy: publicOpinion?.profiles?.[actor.id]?.approval ?? 0,
          timestamp,
          score: approvalDelta > 0 ? 1 : -1,
          label: approvalDelta > 0 ? 'Warm' : 'Messy',
          source: 'system',
          costs: { energy: 0, influence: 0, info: 0 },
          balancesAfter: { energy: 0, influence: 0, info: 0 },
        } satisfies SocialActionLogEntry,
      })
    )
    dispatch(pushIncomingInteraction(buildDebugIncomingInteraction(actor.id, game.week, rng)))
    dispatch(
      updateApproval({
        playerId: target.id,
        delta: approvalDelta,
        reason: 'debug_week_noise',
        week: game.week,
        eventType: 'debug_week_noise',
        attributedToId: actor.id,
      })
    )

    socialSummaryParts.push(
      `${actor.name} stirred things up with ${target.name} (${approvalDelta > 0 ? '+' : ''}${approvalDelta})`
    )
  })

  if (socialSummaryParts.length > 0) {
    dispatch(
      addDirection({
        id: `dbg-direction-${game.week}-${Date.now()}`,
        type: rng() < 0.5 ? 'start_drama' : 'reinforce_alliance',
        playerId: actors[0]?.id ?? alive[0].id,
        relatedPlayerId: actors[1]?.id,
        description: socialSummaryParts.join(' | '),
        status: 'active',
        createdWeek: game.week,
        expiresAtWeek: game.week + 1,
        approvalDelta: rng() < 0.5 ? -2 : 2,
        progressPercent: 25,
      })
    )
  }

  dispatch(
    addSocialSummary({
      summary:
        socialSummaryParts.length > 0
          ? socialSummaryParts.join(' | ')
          : `Quiet week for the house — ${alive[0]?.name ?? 'the house'} kept things contained.`,
      week: game.week,
    })
  )
}

function resolveDebugBlockers(
  dispatch: AppDispatch,
  rootState: RootState,
  rng: () => number
): boolean {
  const { game } = rootState
  const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')

  if (game.voxPopuli?.awaitingPublicVote) {
    dispatch(resolvePendingVoxAudienceVote())
    return true
  }

  if (game.voxPopuli?.finaleStage === 'recap') {
    dispatch(game.voxPopuli.winnerId ? completeVoxSeasonRecap() : startVoxFinalVote())
    return true
  }

  if (game.voxPopuli?.finaleStage === 'showcase') {
    dispatch(completeVoxFinalistShowcase())
    return true
  }

  if (game.voxPopuli?.finaleStage === 'ready') {
    dispatch(startVoxFinalVote())
    return true
  }

  if (game.voxPopuli?.finaleStage === 'final_vote') {
    const finalists = game.voxPopuli.finalistIds
      .map((id) => game.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player))
    const winner =
      [...finalists].sort(
        (a, b) =>
          (rootState.publicOpinion?.profiles?.[b.id]?.approval ?? 50) -
          (rootState.publicOpinion?.profiles?.[a.id]?.approval ?? 50)
      )[0] ?? null
    if (winner) dispatch(resolveVoxSeasonWinner(winner.id))
    return true
  }

  if (game.pendingEviction) {
    dispatch(finalizePendingEviction(game.pendingEviction.evicteeId))
    return true
  }

  if (game.dayStartShock) {
    dispatch(confirmDayStartShock())
    return true
  }

  if (game.spectatorActive) {
    dispatch(closeSpectator())
    return true
  }

  if (game.battleBack?.active) {
    const candidates = game.battleBack.candidates
      .map((id) => game.players.find((p) => p.id === id))
      .filter((player): player is Player => Boolean(player))
    const winner =
      candidates.find((player) => player.status === 'jury' || player.status === 'evicted') ?? null
    if (winner) {
      dispatch(completeBattleBack(winner.id))
    } else {
      dispatch(dismissBattleBack())
    }
    return true
  }

  if (game.favoritePlayer?.active) {
    const winner = pickDebugAlivePlayer(game, rng) ?? alive[0] ?? null
    if (winner) {
      dispatch(resolveFavoritePlayerWinner(winner.id))
      dispatch(awardFavoritePrize())
    }
    return true
  }

  if (game.replacementNeeded) {
    const exclude = new Set<string>([game.lohId ?? '', game.posWinnerId ?? ''])
    game.nomineeIds.forEach((id) => exclude.add(id))
    if (game.povSavedId) exclude.add(game.povSavedId)
    const replacement = pickDebugAlivePlayer(game, rng, exclude, 'highest')
    if (replacement) {
      dispatch(setReplacementNominee(replacement.id))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (
    game.awaitingPublicSave &&
    game.phase === 'pre_veto_public_save' &&
    game.nomineeIds.length === (isCupidArrowActive(game) ? 6 : 3)
  ) {
    const publicSaveResult = resolvePairAwarePublicSave(rootState)
    const savedId = publicSaveResult.savedId || game.nomineeIds[0]
    dispatch(
      commitPublicSave({
        savedId,
      })
    )
    return true
  }

  if (game.awaitingPovDecision) {
    const nominees = game.nomineeIds
      .map((id) => game.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player))
    const eligible = getReplacementEligiblePlayers(
      game,
      alive,
      game.specialVeto?.activeType === 'coup' ? 2 : 1,
      { allowLoh: true }
    )
    const usePower =
      shouldUseSafetyForTwin(game, game.posWinnerId, nominees) ||
      shouldAiUseTargetedSafetyPower(game, game.posWinnerId, nominees, eligible, {
        replacementCount: game.specialVeto?.activeType === 'coup' ? 2 : 1,
        preferLoh: true,
      })

    dispatch(submitPovDecision(usePower))
    return true
  }

  if (game.awaitingPovSaveTarget) {
    const nominees = game.nomineeIds
      .map((id) => game.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player))
    const nomineeToSave = pickSafetySaveTarget(game, game.posWinnerId, nominees, rng)
    if (nomineeToSave) {
      dispatch(submitPovSaveTarget(nomineeToSave.id))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (game.specialVeto?.awaitingHolderReplacement) {
    const eligible = getReplacementEligiblePlayers(game, alive, 1, { actorId: game.posWinnerId })
    const replacement = pickStrategicAiPlayer(game, eligible, rng, 'highest')
    if (replacement) {
      dispatch(submitDiamondReplacement(replacement.id))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (game.specialVeto?.awaitingCoupReplacement1 || game.specialVeto?.awaitingCoupReplacement2) {
    const eligible = getReplacementEligiblePlayers(game, alive, 2, {
      allowLoh: true,
      actorId: game.posWinnerId,
    })
    const replacement = pickStrategicAiPlayer(game, eligible, rng, 'highest', { preferLoh: true })
    if (replacement) {
      dispatch(submitCoupReplacement(replacement.id))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (game.specialVeto?.awaitingVipSecondUseDecision) {
    const nominees = game.players.filter((player) => game.nomineeIds.includes(player.id))
    const eligible = getReplacementEligiblePlayers(game, alive)
    const useSecond =
      shouldUseSafetyForTwin(game, game.posWinnerId, nominees) ||
      shouldAiUseTargetedSafetyPower(game, game.posWinnerId, nominees, eligible, {
        preferLoh: true,
      })
    dispatch(submitVipSecondUseDecision(useSecond))
    return true
  }

  if (game.specialVeto?.awaitingVipSecondSaveTarget) {
    const nominees = game.nomineeIds
      .map((id) => game.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player))
    const nomineeToSave = pickSafetySaveTarget(game, game.posWinnerId, nominees, rng)
    if (nomineeToSave) {
      dispatch(submitVipSecondSaveTarget(nomineeToSave.id))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (game.awaitingMissionImmunityOffer) {
    dispatch(declineMissionImmunityReward())
    return true
  }

  if (game.awaitingDoubleVoteOffer) {
    dispatch(declineDoubleVoteReward())
    return true
  }

  if (game.awaitingVoteDeductionPrompt) {
    dispatch(declineVoteDeduction())
    return true
  }

  if (game.awaitingHumanVote && game.phase === 'live_vote') {
    const target = pickStrategicAiPlayer(
      game,
      game.players.filter((player) => game.nomineeIds.includes(player.id)),
      rng,
      'highest'
    )
    if (target) {
      dispatch(submitHumanVote(target.id))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (game.awaitingTieBreak) {
    const tiedIds = game.tiedNomineeIds ?? game.nomineeIds
    const tiedPlayers = tiedIds
      .map((id) => game.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player))
    const chosen = pickStrategicAiPlayer(game, tiedPlayers, rng, 'highest')
    if (chosen) {
      if (game.awaitingPosTieBreak) {
        dispatch(submitPosTieBreak(chosen.id))
      } else {
        dispatch(submitTieBreak(chosen.id))
      }
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (game.awaitingCoLohNomination) {
    const excluded = new Set<string>([...(game.coLohIds ?? []), ...game.nomineeIds])
    const nominee = pickDebugAlivePlayer(game, rng, excluded, 'highest')
    const coLohId = game.coLohIds?.find(
      (id) => game.players.find((player) => player.id === id)?.isUser
    )
    if (coLohId && nominee) {
      dispatch(submitCoLohNomination({ coLohId, nomineeId: nominee.id }))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  if (game.awaitingFinal3Plea || game.awaitingFinal3Eviction) {
    const hohWinnerId = game.lohId ?? pickDebugAlivePlayer(game, rng)?.id ?? null
    const nominee = pickStrategicAiPlayer(
      game,
      game.nomineeIds
        .map((id) => game.players.find((player) => player.id === id))
        .filter((player): player is Player => Boolean(player)),
      rng,
      'highest'
    )
    if (hohWinnerId && nominee) {
      dispatch(finalizeFinal3Decision({ hohWinnerId, evicteeId: nominee.id }))
    } else {
      dispatch(clearBlockingFlags())
    }
    return true
  }

  return false
}

/** Dispatch advance() repeatedly until the phase reaches 'eviction_results' (debug only). */
export const fastForwardToEviction = () => (dispatch: AppDispatch, getState: () => RootState) => {
  let steps = 0
  while (
    getState().game.phase !== 'eviction_results' &&
    getState().game.phase !== 'jury' &&
    steps < PHASE_ORDER.length
  ) {
    const rootState = getState()
    const state = rootState.game
    if (state.voxPopuli?.awaitingPublicVote) {
      dispatch(resolvePendingVoxAudienceVote())
    }
    // Auto-resolve pre-veto public save only when it is actually actionable.
    else if (
      state.awaitingPublicSave &&
      state.phase === 'pre_veto_public_save' &&
      state.nomineeIds.length === (isCupidArrowActive(state) ? 6 : 3)
    ) {
      const publicSaveResult = resolvePairAwarePublicSave(rootState)
      const savedId = publicSaveResult.savedId || state.nomineeIds[0]
      dispatch(
        commitPublicSave({
          savedId,
        })
      )
    } else {
      dispatch(advance())
    }
    steps++
  }
}

/**
 * Simulate a full elimination cycle with debug-friendly social/public noise.
 * Advances through blocker states, commits pending evictions, and continues
 * until the game stabilises on the next week or a terminal endgame beat.
 */
export const simulateImmediateEliminationCycle =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const initialWeek = getState().game.week
    const cycleSeed =
      (getState().game.seed ^
        ((initialWeek + 1) * 0x9e3779b9) ^
        (getState().game.players.length << 8)) >>>
      0
    const rng = mulberry32(cycleSeed)

    seedDebugCycleNoise(dispatch, getState(), rng)

    let steps = 0
    const maxSteps = PHASE_ORDER.length * 24
    while (steps < maxSteps) {
      const rootState = getState()
      const game = rootState.game

      if (game.phase === 'jury' || game.seasonFinale?.phase === 'seasonComplete') {
        break
      }

      if (game.week > initialWeek && game.phase === 'week_start') {
        break
      }

      if (resolveDebugBlockers(dispatch, rootState, rng)) {
        steps++
        continue
      }

      const prevPhase = game.phase
      const prevWeek = game.week
      dispatch(advance())

      const nextState = getState().game
      if (
        nextState.phase === prevPhase &&
        nextState.week === prevWeek &&
        !nextState.pendingEviction
      ) {
        dispatch(clearBlockingFlags())
        break
      }

      steps++
    }
  }

/**
 * Public minigame API — startMinigame thunk.
 *
 * A fresh per-invocation seed is generated on every call so that restarting,
 * reloading, or re-launching a minigame never replays the exact same game
 * (same booster sequence, same AI variation, etc.).  This seed is generated
 * independently of the caller-supplied `opts.seed` — `opts.seed` is not used
 * by this thunk at all, so even passing the same base seed across replays or
 * debug runs still produces varied results each time.
 *
 * All participants in the same invocation — human UI and precomputed AI scores
 * — share this single fresh seed, preserving internal consistency for that run.
 *
 * Score-based (non-endurance) games with a human participant (except Quick Tap):
 *   AI scores are NOT precomputed here. Instead the session is flagged with
 *   `hybridResolveOnComplete: true` and the central hybrid resolver in
 *   `completeMinigame` generates AI scores after the human score is known.
 *   This prevents a predictable outcome before the human has finished playing.
 *
 * Quick Tap Race with a human participant:
 *   AI scores ARE precomputed via `simulateQuickTapAiScore()`, giving a
 *   competitive band-based distribution independent of the human score anchor.
 *   `isHybridScoredGame('quickTap')` returns false, so it follows the same
 *   precomputed path as endurance games.
 *
 * Endurance / non-hybrid games with a human participant:
 *   AI scores ARE precomputed and stored in `session.aiScores` as before.
 *
 * AI-only games (no human participant):
 *   Precomputed scores are used immediately to derive the winner — no UI needed.
 *
 * Returns the MinigameResult for AI-only runs; undefined when human UI is shown.
 */
export const startMinigame =
  (opts: { key: string; participants: string[]; seed: number; options: { timeLimit: number } }) =>
  (dispatch: AppDispatch, getState: () => RootState): MinigameResult | undefined => {
    const state = getState().game
    const model = getMinigameAiModel(opts.key)
    const isHybrid = isHybridScoredGame(opts.key)

    // Generate a fresh per-invocation seed so every new game launch / restart /
    // reload gets a different booster sequence and AI variation, even when the
    // caller passes the same base seed (e.g. the same game.seed across replays).
    // Mix Math.random() with Date.now() — the same pattern used elsewhere in
    // this file — so the result is unpredictable per invocation.
    const invocationSeed =
      (Math.floor(Math.random() * 0x100000000) ^ (Date.now() & 0xffffffff)) >>> 0

    // Always precompute AI scores for AI-only runs (no UI is involved) and for
    // endurance/non-hybrid games (which keep the old precomputed path).
    // For hybrid games with a human participant, precomputation is skipped.
    const aiScores: Record<string, number> = {}

    const hasHuman = opts.participants.some((id) => {
      const p = state.players.find((pl) => pl.id === id)
      return !!p?.isUser
    })

    if (!isHybrid || !hasHuman) {
      // Precompute for: (a) AI-only runs, (b) endurance/non-hybrid games,
      // (c) Quick Tap Race and Snake (isHybridScoredGame returns false for them).
      opts.participants.forEach((id, index) => {
        const p = state.players.find((pl) => pl.id === id)
        if (p && !p.isUser) {
          aiScores[id] = simulateMinigameAiScore({
            gameKey: opts.key,
            seed: invocationSeed,
            playerId: id,
            participantIndex: index,
            profile: p.competitionProfile ?? getDefaultCompetitionProfile(),
            seasonState: getCompetitionSeasonState(state.competitionSeasonStateByPlayerId, id),
            timeLimitSeconds: opts.options.timeLimit,
            minigameModel: model,
          })
        }
      })
    }

    if (!hasHuman) {
      // AI-only: determine winner immediately and return the result directly.
      // We do NOT dispatch completeMinigame here — that would write a stale
      // minigameResult that could later be consumed by an unrelated advance().
      const winnerId =
        opts.key === 'pressurePlank'
          ? rankPressurePlankResults(opts.participants, aiScores, invocationSeed)[0]?.playerId
          : determineWinner(opts.participants, aiScores)
      if (!winnerId) throw new Error('startMinigame could not resolve a winner')
      const result: MinigameResult = { seedUsed: invocationSeed, scores: aiScores, winnerId }
      dispatch(
        applyCompetitionSeasonUpdate({
          participants: opts.participants,
          scores: aiScores,
          winnerId,
        })
      )
      return result
    }

    // Human present: launch UI and return undefined (UI resolves via completeMinigame).
    // For hybrid (scored) games, flag the session so completeMinigame resolves AI scores.
    const session = {
      key: opts.key,
      participants: opts.participants,
      seed: invocationSeed,
      options: opts.options,
      aiScores,
      ...(isHybrid ? { hybridResolveOnComplete: true } : {}),
    }
    dispatch(launchMinigame(session))
    return undefined
  }

/**
 * Attempt to trigger the seasonal secret mission for the current day.
 *
 * Rules:
 *  - Evaluates from Day 3 onward while more than 5 players remain
 *  - The first mission is guaranteed on the first eligible week
 *  - A second mission may trigger later in the season with a single 50% roll
 *  - The second mission only triggers if its deadline can still land by Final 5
 *  - The testing overrides affect only this calculation
 *  - Uses a twist-specific RNG path so it does not perturb other outcomes
 *
 * Returns `true` if the mission triggered for the current day.
 */
export const tryActivateSecretMission =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState()
    if (isCupidArrowTwistLocked(game) || isVoxPopuliTwistLocked(game)) return false
    const aliveCount = game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    ).length
    const seasonMissionCount = getSeasonSecretMissionCount(game)
    // Legacy saves may not have `secretMissionSecondChanceResolved`; once two
    // missions are already counted, treat the second-chance roll as resolved.
    const secondMissionChanceResolved =
      game.secretMissionSecondChanceResolved ?? seasonMissionCount >= 2

    if (game.phase !== 'week_start') return false
    if (game.week < 3) return false
    if (aliveCount <= 5) return false
    if (seasonMissionCount >= 2) return false
    if (game.twistActivatedThisWeek) return false
    if (game.twinShock?.promptStage || game.twinShock?.pendingRevealAnimation) return false
    if (
      game.twinShock?.status === 'day4_pending' ||
      game.twinShock?.status === 'day4_asked_no_correct_guess'
    )
      return false
    if (!canReplaceSecretMissionSlot(game.secretMission)) return false

    const maxDaySpan = aliveCount - 5
    const isSecondMissionAttempt = seasonMissionCount === 1
    if (isSecondMissionAttempt && maxDaySpan < MIN_SECRET_MISSION_DAY_SPAN) {
      dispatch(markSecondSecretMissionChanceResolved())
      return false
    }

    const forcedWeek = settings.sim.secretMissionTriggerWeekOverride
    if (forcedWeek !== null) {
      if (game.week !== forcedWeek) return false
      dispatch(
        triggerSecretMission(isSecondMissionAttempt ? { day: game.week, maxDaySpan } : game.week)
      )
      return true
    }

    const override = settings.sim.secretMissionTriggerOverride
    const rng = mulberry32((game.seed ^ Math.imul(game.week, 0x9e3779b1)) >>> 0)

    const didTrigger = checkSecretMissionTrigger(
      {
        day: game.week,
        aliveCount,
        override,
        seasonMissionCount,
        secondMissionRollResolved: secondMissionChanceResolved,
      },
      rng
    )
    if (!didTrigger) {
      if (isSecondMissionAttempt && !secondMissionChanceResolved) {
        dispatch(markSecondSecretMissionChanceResolved())
      }
      return false
    }

    dispatch(
      triggerSecretMission(isSecondMissionAttempt ? { day: game.week, maxDaySpan } : game.week)
    )
    return true
  }

/**
 * Attempt to trigger the random day-start shock on the current day.
 *
 * Eligibility:
 *  - `settings.sim.enableTwists` must be true
 *  - current phase must be `week_start`
 *  - the season must be at least Day 3
 *  - at least 5 housemates must still be alive
 *  - no other twist may already be active this week
 *  - no queued debug shock may be waiting to consume the window
 *
 * If the roll succeeds, the popup is activated and the user must confirm the
 * eviction before the standard eviction animation can begin.
 */
export const tryActivateDayStartShock =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState()

    if (isCupidArrowTwistLocked(game)) return false
    if (!settings.sim.enableTwists) return false
    if (game.phase !== 'week_start') return false
    if (game.dayStartShock) return false
    if (game.dayStartShockUsedThisSeason) return false
    if (game.pendingForcedShock) return false
    if (game.twistActivatedThisWeek) return false
    if (game.week < DAY_START_SHOCK_MIN_WEEK) return false

    const activePlayers = game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    )
    if (activePlayers.length <= 4) return false

    const chance = Math.max(0, Math.min(100, settings.sim.dayStartShockChance ?? 1))
    if (chance <= 0) return false

    const rng = mulberry32((game.seed ^ DAY_START_SHOCK_RNG_SALT) >>> 0)
    if (rng() * 100 >= chance) return false

    const selection = buildDayStartShockSelection(
      game.players,
      rng,
      game.players.filter((player) => player.isUser).map((player) => player.id)
    )
    if (!selection) return false

    dispatch(
      activateDayStartShock({
        ...selection,
        triggeredWeek: game.week,
        source: 'random',
      })
    )
    return true
  }

/**
 * Attempt to trigger a queued debug day-start shock.
 *
 * Bypasses the probability roll, but still respects the day 1 / day 2 and
 * final-4 guardrails so the debug queue mirrors the live ruleset.
 */
export const tryActivatePendingForcedDayStartShock =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game } = getState()
    const pending = game.pendingForcedShock

    if (isCupidArrowTwistLocked(game)) return false
    if (!pending || pending.type !== 'dayStartShock') return false
    if (game.phase !== 'week_start') return false
    if (game.week < pending.earliestWeek) return false
    if (game.dayStartShock) return false
    if (game.dayStartShockUsedThisSeason) {
      dispatch(clearForcedShock())
      return false
    }
    if (game.twistActivatedThisWeek) return false

    const activePlayers = game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    )
    if (activePlayers.length <= 4) {
      dispatch(clearForcedShock())
      return false
    }

    const rng = mulberry32((game.seed ^ (DAY_START_SHOCK_RNG_SALT ^ 0x1f1f1f1f)) >>> 0)
    const selection = buildDayStartShockSelection(
      game.players,
      rng,
      game.players.filter((player) => player.isUser).map((player) => player.id)
    )
    if (!selection) {
      dispatch(clearForcedShock())
      return false
    }

    dispatch(
      activateDayStartShock({
        ...selection,
        triggeredWeek: game.week,
        source: 'debug',
      })
    )
    dispatch(consumeForcedShock())
    return true
  }

/**
 * Attempt to activate the Battle Back / Jury Return twist after an eviction.
 *
 * Eligibility:
 *  - `settings.sim.enableTwists` must be true
 *  - twist has not been used this season (`!game.battleBack?.used`)
 *  - at least 3 jurors currently in the game
 *  - at least 5 active players remaining after the eviction
 *  - current phase is `eviction_results`
 *
 * If eligible, rolls a probability check using `settings.sim.battleBackChance`
 * (percentage, 0–100; default 30) and a seeded RNG derived from the game seed.
 *
 * Returns `true` if the twist was activated (overlay will appear); `false` otherwise.
 */
export const tryActivateBattleBack =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState()

    if (isCupidArrowTwistLocked(game) || isVoxPopuliTwistLocked(game)) return false
    if (!settings.sim.enableTwists) return false
    if (game.battleBack?.used) return false
    if (game.phase !== 'eviction_results') return false

    const jurors = game.players.filter((p) => p.status === 'jury')
    const active = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')

    if (jurors.length < 3) return false
    if (active.length < 5) return false

    const chance = settings.sim.battleBackChance ?? 30
    // Use a twist-specific RNG offset so this roll is independent of the main
    // game seed sequence and does not perturb future LOH/POS/vote outcomes.
    const rng = mulberry32((game.seed ^ 0xba77eba0) >>> 0)
    const roll = rng() * 100

    if (roll >= chance) return false

    const candidates = jurors.map((p) => p.id)
    dispatch(activateBattleBack({ candidates, week: game.week }))
    return true
  }

export const tryActivatePendingForcedBattleBack =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game } = getState()

    if (isCupidArrowTwistLocked(game) || isVoxPopuliTwistLocked(game)) return false
    if (game.pendingForcedShock?.type !== 'battleBack') return false
    if (game.phase !== 'eviction_results') return false
    if (game.week < game.pendingForcedShock.earliestWeek) return false
    if (game.battleBack?.used) return false
    if (game.twistActivatedThisWeek) return false

    const jurors = game.players.filter((p) => p.status === 'jury')
    const active = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')

    if (jurors.length < 3) return false
    if (active.length < 5) return false

    dispatch(activateBattleBack({ candidates: jurors.map((p) => p.id), week: game.week }))
    dispatch(consumeForcedShock())
    return true
  }

/**
 * Attempt to activate the Double Eviction twist for the current week.
 *
 * Activation rules (eviction-count pacing):
 *  - Does not attempt until at least 5 evictions have happened this season.
 *  - Does not attempt at final 5 or fewer alive players.
 *  - Typically attempted at most once per eligible week by the main UI.
 *  - Each eligible attempt rolls against `settings.sim.doubleEvictionChance` (default 35%).
 *  - May activate up to 2 times per season; failed attempts do not consume a use.
 *  - Cannot activate during the same week as a Special Veto.
 *
 * Eligibility:
 *  - `settings.sim.enableTwists` must be true
 *  - current phase must be `nominations`
 *  - double eviction must not already be active this week
 *  - no other twist has already activated this week (`twistActivatedThisWeek`)
 *
 * Returns `true` if the twist was activated; `false` otherwise.
 */
export const tryActivateDoubleEviction =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState()

    if (isCupidArrowTwistLocked(game)) return false
    if (game.pendingForcedShock) return false
    if (!settings.sim.enableTwists) return false
    if (game.phase !== 'nominations') return false
    // Don't activate twice in the same week
    if (game.doubleEviction?.weekActive) return false
    // No two twists in the same week
    if (game.twistActivatedThisWeek) return false

    const evictionsSoFar = game.players.filter(
      (p) => p.status === 'evicted' || p.status === 'jury'
    ).length
    const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
    const aliveCount = alive.length
    const usedCount = game.doubleEviction?.usedCount ?? 0

    // Only attempt mid-season: after 5 evictions and above final 5
    if (evictionsSoFar < 5) return false
    if (aliveCount <= 5) return false
    // Cap at 2 uses per season
    if (usedCount >= 2) return false

    const chance = settings.sim.doubleEvictionChance ?? 35

    // Use a twist-specific RNG offset so this roll is independent of the main
    // game seed sequence and does not perturb future LOH/POS/vote outcomes.
    const rng = mulberry32((game.seed ^ 0xde1cef01) >>> 0)
    const roll = rng() * 100 // [0, 100)

    if (roll >= chance) return false

    dispatch(activateDoubleEviction())
    return true
  }

export const tryActivatePendingForcedDoubleEviction =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game } = getState()

    if (isCupidArrowTwistLocked(game)) return false
    if (game.pendingForcedShock?.type !== 'doubleEviction') return false
    if (game.phase !== 'nominations') return false
    if (game.week < game.pendingForcedShock.earliestWeek) return false
    if (game.doubleEviction?.weekActive) return false
    if (game.twistActivatedThisWeek) return false

    const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
    if (alive.length <= 5) return false
    if (isVoxPopuliActive(game)) {
      const evictionsSoFar = game.players.length - alive.length
      if (evictionsSoFar < 5 || (game.doubleEviction?.usedCount ?? 0) >= 2) return false
    }

    dispatch(activateDoubleEviction())
    dispatch(consumeForcedShock())
    return true
  }

/**
 * Attempt to activate a special safety twist after the POS winner is determined.
 *
 * Activation rules:
 *  - `settings.sim.enableTwists` must be true
 *  - current phase must be `pos_results`
 *  - at least 5 evictions must have happened this season
 *  - at least 6 alive players (above final 5)
 *  - not a Double Eviction week
 *  - no other twist has already activated this week (`twistActivatedThisWeek`)
 *  - the season must not already have had a special safety activated
 *
 * If eligible, rolls `settings.sim.specialSafetyChance` (0-100, default 25) and
 * picks a random safety type deterministically.
 *
 * Note: the thunk/function name and `specialVeto` state key remain legacy internal
 * identifiers for compatibility, even though the user-facing terminology is Safety.
 *
 * Returns `true` if activated, `false` otherwise.
 */
export const tryActivateSpecialVeto =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState()

    if (isCupidArrowTwistLocked(game) || isVoxPopuliTwistLocked(game)) return false
    if (game.pendingForcedShock) return false
    if (!settings.sim.enableTwists) return false
    if (game.phase !== 'pos_results') return false
    if (game.doubleEviction?.weekActive) return false
    // No two twists in the same week
    if (game.twistActivatedThisWeek) return false
    if (game.specialVeto?.seasonUsed) return false

    const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
    if (alive.length <= 5) return false

    // Only attempt mid-season: after 5 evictions
    const evictionsSoFar = game.players.filter(
      (p) => p.status === 'evicted' || p.status === 'jury'
    ).length
    if (evictionsSoFar < 5) return false

    const chance = settings.sim.specialSafetyChance ?? 25
    // Use a twist-specific RNG offset so this roll is independent of the main game seed
    // sequence and does not perturb future LOH/POS/vote outcomes.
    const SPECIAL_VETO_RNG_SALT = 0x5e7c7074 // arbitrary constant distinguishing this roll from others
    const rngSpecial = mulberry32((game.seed ^ SPECIAL_VETO_RNG_SALT) >>> 0)
    const roll = rngSpecial() * 100

    if (roll >= chance) return false

    // Deterministically pick one of the 4 veto types
    const types: SpecialVetoType[] = ['vip', 'diamond', 'coup', 'spotlight']
    const typeRoll = rngSpecial()
    const chosenType = types[Math.floor(typeRoll * types.length)]

    dispatch(activateSpecialVeto({ type: chosenType, week: game.week }))
    return true
  }

export const tryActivatePendingForcedSpecialVeto =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game } = getState()
    const pending = game.pendingForcedShock

    if (isCupidArrowTwistLocked(game) || isVoxPopuliTwistLocked(game)) return false
    if (!pending || !isSpecialVetoType(pending.type)) return false
    if (game.phase !== 'pos_results') return false
    if (game.week < pending.earliestWeek) return false
    if (game.doubleEviction?.weekActive) return false
    if (game.twistActivatedThisWeek) return false

    const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
    if (alive.length <= 5) return false

    dispatch(activateSpecialVeto({ type: pending.type, week: game.week }))
    dispatch(consumeForcedShock())
    return true
  }

// ─── Democracia thunks ────────────────────────────────────────────────────────

/**
 * Attempt to automatically activate Democracia on the current day.
 *
 * Eligibility conditions:
 *  - Simulation twists are enabled in settings
 *  - Current day (week) is 5, 7, 9, or 10 (hard cutoff)
 *  - Alive count is odd
 *  - Democracia has not been used this season
 *  - No other twist is already active this day
 *  - Phase must be 'loh_comp_announcement' (the LOH competition window)
 */
export const tryActivateDemocracia =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState()

    if (isCupidArrowTwistLocked(game) || isVoxPopuliTwistLocked(game)) return false
    if (!settings.sim.enableTwists) return false
    if (game.democracia?.usedThisSeason) return false
    if (game.phase !== 'loh_comp_announcement') return false
    if (game.twistActivatedThisWeek) return false
    if (game.doubleEviction?.weekActive) return false
    if (game.specialVeto?.activeType != null) return false
    if (game.democracia?.active) return false

    // Day eligibility: 5, 7, 9 (with fallback up to 10)
    const day = game.week
    const ELIGIBLE_DAYS = [5, 7, 9, 10]
    if (!ELIGIBLE_DAYS.includes(day)) return false
    if (day > 10) return false

    const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
    if (alive.length % 2 === 0) return false // must be odd alive count

    dispatch(activateDemocracia())
    return true
  }

/**
 * Attempt to activate a debug-forced Democracia shock.
 *
 * Bypasses normal day/alive-count eligibility checks.
 * Fires when the pending forced shock type is 'democracia' and the
 * current phase is 'loh_comp_announcement' at or after the earliest week.
 */
export const tryActivatePendingForcedDemocracia =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game } = getState()
    const pending = game.pendingForcedShock

    if (isCupidArrowTwistLocked(game) || isVoxPopuliTwistLocked(game)) return false
    if (!pending || pending.type !== 'democracia') return false
    if (game.phase !== 'loh_comp_announcement') return false
    if (game.week < pending.earliestWeek) return false
    if (game.twistActivatedThisWeek) return false
    if (game.doubleEviction?.weekActive) return false
    if (game.specialVeto?.activeType != null) return false
    if (game.democracia?.active) return false

    dispatch(activateDemocracia())
    dispatch(consumeForcedShock())
    return true
  }
