import { BUNDLED_AFTER_THE_EYE_CONFIG } from './afterTheEyeOutcomeConfig'
import { resolveRecapTabloidSources } from '../../components/SeasonRecapCinematic/seasonRecapData'
import type { PublicOpinionState } from '../../publicOpinion/types'
import type { SocialState } from '../../social/types'
import type { GameHistoryEvent, Player } from '../../types'

export type AftermathTone = 'excellent' | 'good' | 'neutral' | 'bad' | 'tragic'
export type AftermathRelationKind = 'ally' | 'rival' | 'romantic' | 'betrayal'

interface AftermathEligibility {
  winner?: boolean
  placementMin?: number
  placementMax?: number
  tagsAny?: string[]
  tagsAll?: string[]
  tagsNone?: string[]
  requiresRelation?: Exclude<AftermathRelationKind, 'betrayal'>
}

interface AftermathScenario {
  id: string
  category: string
  tone: AftermathTone
  weight: number
  cooldownGroup: string
  badge: string
  eligibility: AftermathEligibility
  headlines: string[]
  subheadlines: string[]
  bodies: string[]
  bulletPoints: string[]
  twists: string[]
  caption?: string
}

interface LinkedAftermathScenario {
  id: string
  relation: AftermathRelationKind
  category: string
  tone: AftermathTone
  weight: number
  badge: string
  headlines: string[]
  subheadlines: string[]
  bodies: string[]
  bulletPoints: string[]
  twists: string[]
}

export interface AfterTheEyeEditorial {
  publicationName: string
  slogan: string
  editionLabel: string
  sectionLabel: string
  price: string
  issuePrefix: string
  intro: string
  closingLine: string
  photoCaption: string
  exclusiveLabel: string
  loadingLabel: string
}

export interface AfterTheEyeConfig {
  version: 1
  editorial: AfterTheEyeEditorial
  toneLabels: Record<AftermathTone, string>
  categories: Record<string, string>
  scenarios: AftermathScenario[]
  linkedScenarios: LinkedAftermathScenario[]
}

export interface AftermathStory {
  playerId: string
  playerName: string
  placementLabel: string
  tone: AftermathTone
  toneLabel: string
  categoryLabel: string
  badge: string
  headline: string
  subheadline: string
  body: string
  bulletPoints: string[]
  twist: string
  caption: string
  imageSources: string[]
  scenarioId: string
  linkedEventId?: string
}

export interface AftermathIssue {
  schemaVersion: 1
  configVersion: number
  season: number
  issueNumber: string
  dateLabel: string
  generatedAt: string
  editorial: AfterTheEyeEditorial
  stories: AftermathStory[]
}

export interface AftermathBuildOptions {
  gameId?: string
  week?: number
  favoriteWinnerId?: string | null
  publicOpinion?: PublicOpinionState | null
  social?: SocialState
  history?: GameHistoryEvent[]
}

interface TabloidPhotoEntry {
  id: string
  matchToken: string
  extension: string
  source: string
}

interface AftermathPlayerContext {
  player: Player
  firstName: string
  placement: number
  placementLabel: string
  tags: Set<string>
  competitionWins: number
  nominationCount: number
  publicApproval: number | null
  ally?: Player
  rival?: Player
  romantic?: Player
  betrayal?: Player
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  config?: AfterTheEyeConfig
}

const CONFIG_CACHE_KEY = 'after-the-eye:config:last-known-good:v1'
const ISSUE_CACHE_PREFIX = 'after-the-eye:issue:v1'
const SUPPORTED_PLACEHOLDERS = new Set([
  'name',
  'firstName',
  'subject',
  'object',
  'possessive',
  'placement',
  'allyName',
  'rivalName',
  'romanticName',
  'partnerName',
  'competitionWins',
  'nominationCount',
  'seasonNumber',
  'winnerName',
  'publicApproval',
])
const TONES: AftermathTone[] = ['excellent', 'good', 'neutral', 'bad', 'tragic']
const RELATIONS: AftermathRelationKind[] = ['ally', 'rival', 'romantic', 'betrayal']
const TABLOID_PHOTO_MODULES = import.meta.glob(
  '../../../public/assets/tabloid_photos/*.{png,jpg,jpeg,jxl,webp,avif}',
  { eager: true, import: 'default' }
) as Record<string, string>
const AFTERMATH_ASSET_BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

let configPromise: Promise<AfterTheEyeConfig> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  )
}

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1])
}

function validateTemplateCollection(
  value: unknown,
  path: string,
  errors: string[],
  allowedPlaceholders: Set<string>
): value is string[] {
  if (!isStringArray(value)) {
    errors.push(`${path} must be a non-empty string array.`)
    return false
  }

  value.forEach((text, index) => {
    placeholdersIn(text).forEach((placeholder) => {
      if (!allowedPlaceholders.has(placeholder)) {
        errors.push(`${path}[${index}] uses unsupported placeholder {${placeholder}}.`)
      }
    })
  })
  return true
}

function validateScenario(
  value: unknown,
  index: number,
  categoryIds: Set<string>,
  seenIds: Set<string>,
  errors: string[]
): value is AftermathScenario {
  const path = `scenarios[${index}]`
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`)
    return false
  }

  const id = value.id
  if (typeof id !== 'string' || id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`)
  } else if (seenIds.has(id)) {
    errors.push(`${path}.id duplicates "${id}".`)
  } else {
    seenIds.add(id)
  }

  if (typeof value.category !== 'string' || !categoryIds.has(value.category)) {
    errors.push(`${path}.category is unknown.`)
  }
  if (typeof value.tone !== 'string' || !TONES.includes(value.tone as AftermathTone)) {
    errors.push(`${path}.tone is invalid.`)
  }
  if (typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight <= 0) {
    errors.push(`${path}.weight must be greater than zero.`)
  }
  if (typeof value.cooldownGroup !== 'string' || value.cooldownGroup.trim().length === 0) {
    errors.push(`${path}.cooldownGroup must be a non-empty string.`)
  }
  if (typeof value.badge !== 'string' || value.badge.trim().length === 0) {
    errors.push(`${path}.badge must be a non-empty string.`)
  }

  const collections: Array<[unknown, string]> = [
    [value.headlines, `${path}.headlines`],
    [value.subheadlines, `${path}.subheadlines`],
    [value.bodies, `${path}.bodies`],
    [value.bulletPoints, `${path}.bulletPoints`],
    [value.twists, `${path}.twists`],
  ]
  collections.forEach(([collection, collectionPath]) => {
    validateTemplateCollection(collection, collectionPath, errors, SUPPORTED_PLACEHOLDERS)
  })

  if (!isRecord(value.eligibility)) {
    errors.push(`${path}.eligibility must be an object.`)
  } else {
    const eligibility = value.eligibility
    if (
      eligibility.placementMin !== undefined &&
      (typeof eligibility.placementMin !== 'number' || eligibility.placementMin < 1)
    ) {
      errors.push(`${path}.eligibility.placementMin must be at least 1.`)
    }
    if (
      eligibility.placementMax !== undefined &&
      (typeof eligibility.placementMax !== 'number' || eligibility.placementMax < 1)
    ) {
      errors.push(`${path}.eligibility.placementMax must be at least 1.`)
    }
    if (
      typeof eligibility.placementMin === 'number' &&
      typeof eligibility.placementMax === 'number' &&
      eligibility.placementMin > eligibility.placementMax
    ) {
      errors.push(`${path}.eligibility placement range is reversed.`)
    }
    if (
      eligibility.requiresRelation !== undefined &&
      !['ally', 'rival', 'romantic'].includes(String(eligibility.requiresRelation))
    ) {
      errors.push(`${path}.eligibility.requiresRelation is invalid.`)
    }

    const allScenarioText = collections
      .flatMap(([collection]) => (Array.isArray(collection) ? collection : []))
      .filter((entry): entry is string => typeof entry === 'string')
      .join(' ')
    const relationRequirementByPlaceholder: Record<string, string> = {
      allyName: 'ally',
      rivalName: 'rival',
      romanticName: 'romantic',
    }
    Object.entries(relationRequirementByPlaceholder).forEach(([placeholder, relation]) => {
      if (
        allScenarioText.includes(`{${placeholder}}`) &&
        eligibility.requiresRelation !== relation
      ) {
        errors.push(`${path} uses {${placeholder}} without requiresRelation "${relation}".`)
      }
    })
  }

  return true
}

function validateLinkedScenario(
  value: unknown,
  index: number,
  categoryIds: Set<string>,
  seenIds: Set<string>,
  errors: string[]
): value is LinkedAftermathScenario {
  const path = `linkedScenarios[${index}]`
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`)
    return false
  }

  const id = value.id
  if (typeof id !== 'string' || id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`)
  } else if (seenIds.has(id)) {
    errors.push(`${path}.id duplicates "${id}".`)
  } else {
    seenIds.add(id)
  }

  if (
    typeof value.relation !== 'string' ||
    !RELATIONS.includes(value.relation as AftermathRelationKind)
  ) {
    errors.push(`${path}.relation is invalid.`)
  }
  if (typeof value.category !== 'string' || !categoryIds.has(value.category)) {
    errors.push(`${path}.category is unknown.`)
  }
  if (typeof value.tone !== 'string' || !TONES.includes(value.tone as AftermathTone)) {
    errors.push(`${path}.tone is invalid.`)
  }
  if (typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight <= 0) {
    errors.push(`${path}.weight must be greater than zero.`)
  }
  if (typeof value.badge !== 'string' || value.badge.trim().length === 0) {
    errors.push(`${path}.badge must be a non-empty string.`)
  }

  const linkedPlaceholders = new Set(SUPPORTED_PLACEHOLDERS)
  linkedPlaceholders.add('partnerName')
  ;[
    ['headlines', value.headlines],
    ['subheadlines', value.subheadlines],
    ['bodies', value.bodies],
    ['bulletPoints', value.bulletPoints],
    ['twists', value.twists],
  ].forEach(([field, collection]) => {
    validateTemplateCollection(collection, `${path}.${String(field)}`, errors, linkedPlaceholders)
  })

  return true
}

export function validateAftermathConfig(value: unknown): ValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) return { valid: false, errors: ['Config root must be an object.'] }
  if (value.version !== 1) errors.push('Config version must be 1.')

  if (!isRecord(value.editorial)) {
    errors.push('editorial must be an object.')
  } else {
    const editorial = value.editorial as Record<string, unknown>
    ;[
      'publicationName',
      'slogan',
      'editionLabel',
      'sectionLabel',
      'price',
      'issuePrefix',
      'intro',
      'closingLine',
      'photoCaption',
      'exclusiveLabel',
      'loadingLabel',
    ].forEach((field) => {
      if (typeof editorial[field] !== 'string' || String(editorial[field]).trim().length === 0) {
        errors.push(`editorial.${field} must be a non-empty string.`)
      }
    })
  }

  if (!isRecord(value.toneLabels)) {
    errors.push('toneLabels must be an object.')
  } else {
    const toneLabels = value.toneLabels as Record<string, unknown>
    TONES.forEach((tone) => {
      if (typeof toneLabels[tone] !== 'string' || String(toneLabels[tone]).trim().length === 0) {
        errors.push(`toneLabels.${tone} must be a non-empty string.`)
      }
    })
  }

  const categoryIds = new Set<string>()
  if (!isRecord(value.categories)) {
    errors.push('categories must be an object.')
  } else {
    Object.entries(value.categories).forEach(([id, label]) => {
      if (typeof label !== 'string' || label.trim().length === 0) {
        errors.push(`categories.${id} must be a non-empty string.`)
      } else {
        categoryIds.add(id)
      }
    })
  }

  const seenIds = new Set<string>()
  if (!Array.isArray(value.scenarios) || value.scenarios.length === 0) {
    errors.push('scenarios must be a non-empty array.')
  } else {
    value.scenarios.forEach((scenario, index) => {
      validateScenario(scenario, index, categoryIds, seenIds, errors)
    })
  }

  if (!Array.isArray(value.linkedScenarios)) {
    errors.push('linkedScenarios must be an array.')
  } else {
    value.linkedScenarios.forEach((scenario, index) => {
      validateLinkedScenario(scenario, index, categoryIds, seenIds, errors)
    })
  }

  if (errors.length > 0) return { valid: false, errors }
  return { valid: true, errors: [], config: value as unknown as AfterTheEyeConfig }
}

const bundledValidation = validateAftermathConfig(BUNDLED_AFTER_THE_EYE_CONFIG)
if (!bundledValidation.valid || !bundledValidation.config) {
  throw new Error(`Bundled After the Eye config is invalid: ${bundledValidation.errors.join(' ')}`)
}
const BUNDLED_CONFIG = bundledValidation.config

export function getBundledAftermathConfig(): AfterTheEyeConfig {
  return BUNDLED_CONFIG
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readCachedConfig(): AfterTheEyeConfig | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CONFIG_CACHE_KEY) ?? 'null')
    const validation = validateAftermathConfig(parsed)
    return validation.valid && validation.config ? validation.config : null
  } catch {
    return null
  }
}

function cacheConfig(config: AfterTheEyeConfig): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config))
  } catch {
    // Storage can be unavailable or full. The bundled fallback still keeps the feature functional.
  }
}

function remoteConfigUrl(): string {
  const configuredUrl = import.meta.env.VITE_AFTER_THE_EYE_CONFIG_URL?.trim()
  if (configuredUrl) return configuredUrl
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}config/afterTheEyeOutcomes.json`
}

function devWarn(message: string, details?: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[After the Eye] ${message}`, details ?? '')
  }
}

async function fetchRemoteConfig(): Promise<AfterTheEyeConfig | null> {
  if (typeof fetch !== 'function') return null

  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), 4000) : null
  try {
    const response = await fetch(remoteConfigUrl(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    })
    if (!response.ok) {
      devWarn(`Remote config returned ${response.status}.`)
      return null
    }
    const parsed: unknown = await response.json()
    const validation = validateAftermathConfig(parsed)
    if (!validation.valid || !validation.config) {
      devWarn('Remote config was rejected.', validation.errors)
      return null
    }
    cacheConfig(validation.config)
    return validation.config
  } catch (error) {
    devWarn('Remote config could not be loaded.', error)
    return null
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId)
  }
}

export function loadAftermathConfig(): Promise<AfterTheEyeConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      const remote = await fetchRemoteConfig()
      return remote ?? readCachedConfig() ?? BUNDLED_CONFIG
    })()
  }
  return configPromise
}

export function resetAftermathConfigLoaderForTests(): void {
  configPromise = null
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function firstName(player: Player | undefined): string {
  return player?.name.split(' ')[0] ?? 'Housemate'
}

function extensionPriority(extension: string): number {
  switch (extension.toLowerCase()) {
    case 'webp':
      return 0
    case 'jxl':
      return 1
    case 'png':
      return 2
    case 'jpg':
    case 'jpeg':
      return 3
    case 'avif':
      return 4
    default:
      return 5
  }
}

function listTabloidPhotos(): TabloidPhotoEntry[] {
  return Object.keys(TABLOID_PHOTO_MODULES)
    .map((path) => {
      const filename = path.split('/').pop() ?? path
      const extension = filename.split('.').pop() ?? ''
      const basename = filename.replace(/\.[^.]+$/, '')
      const matchBase = basename.replace(/_tabloid\d*$/i, '')
      return {
        id: basename,
        matchToken: normalizeToken(matchBase),
        extension,
        source: `${AFTERMATH_ASSET_BASE}assets/tabloid_photos/${encodeURIComponent(filename)}`,
      }
    })
    .sort((left, right) => {
      if (left.matchToken !== right.matchToken)
        return left.matchToken.localeCompare(right.matchToken)
      const extensionDifference =
        extensionPriority(left.extension) - extensionPriority(right.extension)
      return extensionDifference !== 0 ? extensionDifference : left.id.localeCompare(right.id)
    })
}

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  return sources.filter((source): source is string => {
    if (!source || seen.has(source)) return false
    seen.add(source)
    return true
  })
}

function getTabloidMatchTokens(player: Player | undefined): string[] {
  const tokens = uniqueSources([player?.name, firstName(player)]).map(normalizeToken)
  if (player?.id === 'ali' || player?.name === 'Ali') tokens.push(normalizeToken('Lia'))
  return [...new Set(tokens)]
}

function pickTabloidPhoto(
  player: Player | undefined,
  photos: TabloidPhotoEntry[],
  usedPhotoIds: Set<string>
): string | null {
  if (photos.length === 0) return null
  const desiredTokens = getTabloidMatchTokens(player)
  const matched = photos.find(
    (photo) => !usedPhotoIds.has(photo.id) && desiredTokens.includes(photo.matchToken)
  )
  if (matched) {
    usedPhotoIds.add(matched.id)
    return matched.source
  }
  // A tabloid photo belongs only to the cast member named by its filename.
  // Borrowing the next unused photo made custom/user players appear as Aria (or
  // another unrelated hubmate). Callers can render the intentional silhouette.
  return null
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getPlacementValue(player: Player): number {
  if (typeof player.finalRank === 'number') return player.finalRank
  if (typeof player.seasonPlacement === 'number') return player.seasonPlacement
  if (player.isWinner) return 1
  return Number.MAX_SAFE_INTEGER
}

function getPlacementLabel(player: Player): string {
  const placement = getPlacementValue(player)
  if (placement === 1) return 'Winner'
  if (placement === 2) return 'Runner-up'
  if (placement === 3) return 'Third place'
  if (placement !== Number.MAX_SAFE_INTEGER) return `Placed #${placement}`
  if (player.status === 'jury') return 'Tribunal member'
  if (player.status === 'evicted') return 'Evicted'
  return 'Housemate'
}

function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((left, right) => {
    const placementDifference = getPlacementValue(left) - getPlacementValue(right)
    return placementDifference !== 0 ? placementDifference : left.name.localeCompare(right.name)
  })
}

function playerById(players: Player[], playerId: string | undefined): Player | undefined {
  return playerId ? players.find((player) => player.id === playerId) : undefined
}

function relationFromArc(
  playerId: string,
  players: Player[],
  social: SocialState | undefined,
  type: 'romance' | 'rivalry' | 'betrayal'
): Player | undefined {
  const arc = social?.dramaNetwork?.arcs
    .filter((candidate) => candidate.type === type && candidate.participantIds.includes(playerId))
    .sort((left, right) => right.intensity - left.intensity)[0]
  const partnerId = arc?.participantIds.find((id) => id !== playerId)
  return playerById(players, partnerId)
}

function relationFromAlliance(
  playerId: string,
  players: Player[],
  social: SocialState | undefined
): Player | undefined {
  const alliance = social?.dramaNetwork?.alliances
    .filter((candidate) => candidate.participantIds.includes(playerId))
    .sort((left, right) => {
      const statusScore = { active: 3, strained: 2, broken: 1 }
      return statusScore[right.status] - statusScore[left.status]
    })[0]
  const partnerId = alliance?.participantIds.find((id) => id !== playerId)
  return playerById(players, partnerId)
}

function relationFromAffinity(
  playerId: string,
  players: Player[],
  social: SocialState | undefined,
  direction: 'highest' | 'lowest'
): Player | undefined {
  const entries = Object.entries(social?.relationships?.[playerId] ?? {})
    .filter(
      ([targetId]) => targetId !== playerId && players.some((player) => player.id === targetId)
    )
    .sort((left, right) =>
      direction === 'highest'
        ? right[1].affinity - left[1].affinity
        : left[1].affinity - right[1].affinity
    )
  const selected = entries[0]
  if (!selected) return undefined
  if (direction === 'highest' && selected[1].affinity < 12) return undefined
  if (direction === 'lowest' && selected[1].affinity > -12) return undefined
  return playerById(players, selected[0])
}

function buildContext(
  player: Player,
  players: Player[],
  options: AftermathBuildOptions
): AftermathPlayerContext {
  const placement = getPlacementValue(player)
  const competitionWins = (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)
  const nominationCount = player.stats?.timesNominated ?? 0
  const publicApproval = options.publicOpinion?.profiles[player.id]?.approval ?? null
  const romantic = relationFromArc(player.id, players, options.social, 'romance')
  const rivalryArc = relationFromArc(player.id, players, options.social, 'rivalry')
  const betrayal = relationFromArc(player.id, players, options.social, 'betrayal')
  const alliance = relationFromAlliance(player.id, players, options.social)
  const ally = alliance ?? relationFromAffinity(player.id, players, options.social, 'highest')
  const rival = rivalryArc ?? relationFromAffinity(player.id, players, options.social, 'lowest')
  const tags = new Set<string>()

  if (player.isWinner || placement === 1) tags.add('winner')
  if (placement === 2) tags.add('runner_up')
  if (placement <= 3) tags.add('finalist')
  if (placement <= 4) tags.add('late_game')
  if (placement > Math.max(4, Math.ceil(players.length * 0.66))) tags.add('early_exit')
  if (competitionWins >= 3) tags.add('comp_beast')
  if (competitionWins >= 2 || placement <= 4) tags.add('strategic')
  if (nominationCount >= 3) tags.add('nomination_magnet')
  if ((player.stats?.battleBackWins ?? 0) > 0) tags.add('battle_back')
  if (options.favoriteWinnerId === player.id) tags.add('public_favorite')
  if (publicApproval !== null && publicApproval >= 70) tags.add('fan_favorite')
  if (publicApproval !== null && publicApproval <= 35) tags.add('controversial')
  if (romantic) tags.add('romance')
  if (rival) tags.add('rivalry')
  if (betrayal) tags.add('betrayal')
  if (
    alliance &&
    options.social?.dramaNetwork?.alliances.some(
      (candidate) => candidate.participantIds.includes(player.id) && candidate.status === 'broken'
    )
  ) {
    tags.add('alliance_broken')
  }
  if (
    player.twinMode === 'combined' ||
    options.history?.some((event) => event.type.toLowerCase().includes('twin'))
  ) {
    tags.add('twin_shock')
  }
  if (competitionWins === 0 && nominationCount <= 1 && placement > 4) tags.add('low_profile')

  return {
    player,
    firstName: firstName(player),
    placement,
    placementLabel: getPlacementLabel(player),
    tags,
    competitionWins,
    nominationCount,
    publicApproval,
    ally,
    rival,
    romantic,
    betrayal,
  }
}

function hasRelation(context: AftermathPlayerContext, relation: string | undefined): boolean {
  if (!relation) return true
  if (relation === 'ally') return Boolean(context.ally)
  if (relation === 'rival') return Boolean(context.rival)
  if (relation === 'romantic') return Boolean(context.romantic)
  return false
}

function isEligible(scenario: AftermathScenario, context: AftermathPlayerContext): boolean {
  const eligibility = scenario.eligibility
  const isWinner = context.placement === 1 || context.player.isWinner === true
  if (eligibility.winner !== undefined && eligibility.winner !== isWinner) return false
  if (eligibility.placementMin !== undefined && context.placement < eligibility.placementMin)
    return false
  if (eligibility.placementMax !== undefined && context.placement > eligibility.placementMax)
    return false
  if (eligibility.tagsAny?.length && !eligibility.tagsAny.some((tag) => context.tags.has(tag)))
    return false
  if (eligibility.tagsAll?.length && !eligibility.tagsAll.every((tag) => context.tags.has(tag)))
    return false
  if (eligibility.tagsNone?.some((tag) => context.tags.has(tag))) return false
  return hasRelation(context, eligibility.requiresRelation)
}

function relationPlayer(
  context: AftermathPlayerContext,
  relation: AftermathRelationKind
): Player | undefined {
  if (relation === 'ally') return context.ally
  if (relation === 'rival') return context.rival
  if (relation === 'romantic') return context.romantic
  return context.betrayal
}

function selectIndex(seed: string, collectionLength: number): number {
  return collectionLength <= 1 ? 0 : hashString(seed) % collectionLength
}

function weightedPick<T>(values: T[], seed: string, weightFor: (value: T) => number): T {
  const weighted = values.map((value) => ({ value, weight: Math.max(0.01, weightFor(value)) }))
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = (hashString(seed) / 0xffffffff) * total
  for (const entry of weighted) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.value
  }
  return weighted[weighted.length - 1].value
}

function scenarioWeight(
  scenario: AftermathScenario,
  context: AftermathPlayerContext,
  toneCounts: Map<AftermathTone, number>,
  categoryCounts: Map<string, number>
): number {
  let weight = scenario.weight
  const matchedTags =
    scenario.eligibility.tagsAny?.filter((tag) => context.tags.has(tag)).length ?? 0
  weight *= 1 + matchedTags * 0.7

  if (
    (context.tags.has('winner') ||
      context.tags.has('public_favorite') ||
      context.tags.has('fan_favorite')) &&
    (scenario.tone === 'excellent' || scenario.tone === 'good')
  ) {
    weight *= 1.35
  }
  if (
    (context.tags.has('controversial') || context.tags.has('nomination_magnet')) &&
    (scenario.tone === 'bad' || scenario.tone === 'tragic')
  ) {
    weight *= 1.3
  }
  if (
    (context.tags.has('low_profile') || context.tags.has('early_exit')) &&
    (scenario.tone === 'neutral' || scenario.tone === 'good')
  ) {
    weight *= 1.25
  }

  const toneUsage = toneCounts.get(scenario.tone) ?? 0
  const categoryUsage = categoryCounts.get(scenario.category) ?? 0
  weight *= toneUsage >= 3 ? 0.28 : toneUsage === 2 ? 0.7 : 1
  weight *= categoryUsage >= 2 ? 0.2 : categoryUsage === 1 ? 0.65 : 1
  return weight
}

function renderTemplate(
  template: string,
  context: AftermathPlayerContext,
  season: number,
  winnerName: string,
  partner?: Player
): string {
  const values: Record<string, string> = {
    name: context.player.name,
    firstName: context.firstName,
    subject: 'they',
    object: 'them',
    possessive: 'their',
    placement:
      context.placement === Number.MAX_SAFE_INTEGER
        ? context.placementLabel
        : String(context.placement),
    allyName: context.ally?.name ?? 'a former ally',
    rivalName: context.rival?.name ?? 'a former rival',
    romanticName: context.romantic?.name ?? 'a mystery companion',
    partnerName: partner?.name ?? 'another housemate',
    competitionWins: String(context.competitionWins),
    nominationCount: String(context.nominationCount),
    seasonNumber: String(season),
    winnerName,
    publicApproval:
      context.publicApproval === null ? 'unrecorded' : `${Math.round(context.publicApproval)}%`,
  }

  return template
    .replace(
      /\{([A-Za-z][A-Za-z0-9]*)\}/g,
      (_match, placeholder: string) => values[placeholder] ?? ''
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim()
}

function chooseTwo(values: string[], seed: string): [string, string] {
  const firstIndex = selectIndex(`${seed}:first`, values.length)
  let secondIndex = selectIndex(`${seed}:second`, values.length)
  if (values.length > 1 && secondIndex === firstIndex)
    secondIndex = (secondIndex + 1) % values.length
  return [values[firstIndex], values[secondIndex] ?? values[firstIndex]]
}

function contentWords(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
  )
}

function copyOverlap(left: string, right: string): number {
  const leftWords = contentWords(left)
  const rightWords = contentWords(right)
  if (leftWords.size === 0 || rightWords.size === 0) return 0
  let shared = 0
  leftWords.forEach((word) => {
    if (rightWords.has(word)) shared += 1
  })
  return shared / Math.min(leftWords.size, rightWords.size)
}

function pickDistinctRendered(
  templates: string[],
  seed: string,
  context: AftermathPlayerContext,
  season: number,
  winnerName: string,
  usedCopy: string[],
  partner?: Player
): string {
  const start = selectIndex(seed, templates.length)
  const rendered = templates.map((template) =>
    renderTemplate(template, context, season, winnerName, partner)
  )
  const ordered = rendered.map((_, offset) => rendered[(start + offset) % rendered.length])
  return ordered.find((candidate) => usedCopy.every((used) => copyOverlap(candidate, used) < 0.58))
    ?? ordered.sort((left, right) =>
      Math.max(...usedCopy.map((used) => copyOverlap(left, used)), 0) -
      Math.max(...usedCopy.map((used) => copyOverlap(right, used)), 0)
    )[0]
}

function storyFromScenario(
  scenario: AftermathScenario,
  context: AftermathPlayerContext,
  season: number,
  winnerName: string,
  config: AfterTheEyeConfig,
  seed: string,
  matchedPhoto: string | null
): AftermathStory {
  const headline = renderTemplate(
    scenario.headlines[selectIndex(`${seed}:headline`, scenario.headlines.length)],
    context,
    season,
    winnerName
  )
  const subheadline = pickDistinctRendered(scenario.subheadlines, `${seed}:subheadline`, context, season, winnerName, [headline])
  const body = pickDistinctRendered(scenario.bodies, `${seed}:body`, context, season, winnerName, [headline, subheadline])
  const firstBullet = pickDistinctRendered(scenario.bulletPoints, `${seed}:bullet-1`, context, season, winnerName, [headline, subheadline, body])
  const secondBullet = pickDistinctRendered(scenario.bulletPoints, `${seed}:bullet-2`, context, season, winnerName, [headline, subheadline, body, firstBullet])
  const twist = pickDistinctRendered(scenario.twists, `${seed}:twist`, context, season, winnerName, [headline, subheadline, body, firstBullet, secondBullet])
  return {
    playerId: context.player.id,
    playerName: context.player.name,
    placementLabel: context.placementLabel,
    tone: scenario.tone,
    toneLabel: config.toneLabels[scenario.tone],
    categoryLabel: config.categories[scenario.category] ?? scenario.category,
    badge: scenario.badge,
    headline,
    subheadline,
    body,
    bulletPoints: [firstBullet, secondBullet],
    twist,
    caption: scenario.caption ?? config.editorial.photoCaption,
    imageSources: resolveRecapTabloidSources(context.player, matchedPhoto),
    scenarioId: scenario.id,
  }
}

function storyFromLinkedScenario(
  scenario: LinkedAftermathScenario,
  context: AftermathPlayerContext,
  partner: Player,
  season: number,
  winnerName: string,
  config: AfterTheEyeConfig,
  seed: string,
  matchedPhoto: string | null,
  linkedEventId: string
): AftermathStory {
  const [firstBullet, secondBullet] = chooseTwo(scenario.bulletPoints, `${seed}:bullets`)
  const headline = renderTemplate(
    scenario.headlines[selectIndex(`${seed}:headline`, scenario.headlines.length)],
    context,
    season,
    winnerName,
    partner
  )
  const renderedBody = renderTemplate(
    scenario.bodies[selectIndex(`${seed}:body`, scenario.bodies.length)],
    context,
    season,
    winnerName,
    partner
  )
  const body = `${headline} ${renderedBody}`.includes(partner.name)
    ? renderedBody
    : `${renderedBody} The story remains inseparable from ${partner.name}.`
  return {
    playerId: context.player.id,
    playerName: context.player.name,
    placementLabel: context.placementLabel,
    tone: scenario.tone,
    toneLabel: config.toneLabels[scenario.tone],
    categoryLabel: config.categories[scenario.category] ?? scenario.category,
    badge: scenario.badge,
    headline,
    subheadline: renderTemplate(
      scenario.subheadlines[selectIndex(`${seed}:subheadline`, scenario.subheadlines.length)],
      context,
      season,
      winnerName,
      partner
    ),
    body,
    bulletPoints: [
      renderTemplate(firstBullet, context, season, winnerName, partner),
      renderTemplate(secondBullet, context, season, winnerName, partner),
    ],
    twist: renderTemplate(
      scenario.twists[selectIndex(`${seed}:twist`, scenario.twists.length)],
      context,
      season,
      winnerName,
      partner
    ),
    caption: config.editorial.photoCaption,
    imageSources: resolveRecapTabloidSources(context.player, matchedPhoto),
    scenarioId: scenario.id,
    linkedEventId,
  }
}

function linkedPairCandidates(
  contexts: AftermathPlayerContext[],
  relation: AftermathRelationKind
): Array<[AftermathPlayerContext, AftermathPlayerContext]> {
  const byId = new Map(contexts.map((context) => [context.player.id, context]))
  const seen = new Set<string>()
  const pairs: Array<[AftermathPlayerContext, AftermathPlayerContext]> = []

  contexts.forEach((context) => {
    const partner = relationPlayer(context, relation)
    const partnerContext = partner ? byId.get(partner.id) : undefined
    if (!partnerContext) return
    const key = [context.player.id, partnerContext.player.id].sort().join(':')
    if (seen.has(key)) return
    seen.add(key)
    pairs.push([context, partnerContext])
  })

  return pairs
}

function buildLinkedStories(
  contexts: AftermathPlayerContext[],
  season: number,
  winnerName: string,
  config: AfterTheEyeConfig,
  seedBase: string,
  photos: TabloidPhotoEntry[],
  usedPhotoIds: Set<string>
): Map<string, AftermathStory> {
  const assigned = new Map<string, AftermathStory>()
  const usedPlayers = new Set<string>()
  const relationPriority: AftermathRelationKind[] = ['romantic', 'betrayal', 'rival', 'ally']

  relationPriority.forEach((relation) => {
    if (assigned.size >= 4) return
    const scenarios = config.linkedScenarios.filter((scenario) => scenario.relation === relation)
    if (scenarios.length === 0) return

    const pair = linkedPairCandidates(contexts, relation)
      .filter(
        ([left, right]) => !usedPlayers.has(left.player.id) && !usedPlayers.has(right.player.id)
      )
      .sort(([leftA, rightA], [leftB, rightB]) =>
        `${leftA.player.id}:${rightA.player.id}`.localeCompare(
          `${leftB.player.id}:${rightB.player.id}`
        )
      )[0]
    if (!pair) return

    const [left, right] = pair
    const pairSeed = `${seedBase}:linked:${relation}:${left.player.id}:${right.player.id}`
    const scenario = weightedPick(scenarios, pairSeed, (candidate) => candidate.weight)
    const linkedEventId = `${scenario.id}:${[left.player.id, right.player.id].sort().join(':')}`

    const leftPhoto = pickTabloidPhoto(left.player, photos, usedPhotoIds)
    const rightPhoto = pickTabloidPhoto(right.player, photos, usedPhotoIds)
    assigned.set(
      left.player.id,
      storyFromLinkedScenario(
        scenario,
        left,
        right.player,
        season,
        winnerName,
        config,
        `${pairSeed}:left`,
        leftPhoto,
        linkedEventId
      )
    )
    assigned.set(
      right.player.id,
      storyFromLinkedScenario(
        scenario,
        right,
        left.player,
        season,
        winnerName,
        config,
        `${pairSeed}:right`,
        rightPhoto,
        linkedEventId
      )
    )
    usedPlayers.add(left.player.id)
    usedPlayers.add(right.player.id)
  })

  return assigned
}

export function buildAftermathIssue(
  players: Player[],
  season: number,
  options: AftermathBuildOptions = {},
  config: AfterTheEyeConfig = BUNDLED_CONFIG
): AftermathIssue {
  const sortedPlayers = sortPlayers(players)
  const safePlayers =
    sortedPlayers.length > 0
      ? sortedPlayers
      : [
          {
            id: 'house',
            name: 'The House',
            avatar: '',
            status: 'evicted' as const,
          },
        ]
  const contexts = safePlayers.map((player) => buildContext(player, safePlayers, options))
  const winnerName =
    contexts.find((context) => context.placement === 1)?.player.name ?? 'the winner'
  const seedBase = `${options.gameId ?? `season-${season}`}:${season}:config-${config.version}`
  const tabloidPhotos = listTabloidPhotos()
  const usedPhotoIds = new Set<string>()
  const linkedStories = buildLinkedStories(
    contexts,
    season,
    winnerName,
    config,
    seedBase,
    tabloidPhotos,
    usedPhotoIds
  )
  const usedScenarioIds = new Set([...linkedStories.values()].map((story) => story.scenarioId))
  const usedCooldownGroups = new Set<string>()
  const toneCounts = new Map<AftermathTone, number>()
  const categoryCounts = new Map<string, number>()

  linkedStories.forEach((story) => {
    toneCounts.set(story.tone, (toneCounts.get(story.tone) ?? 0) + 1)
    const categoryEntry = Object.entries(config.categories).find(
      ([, label]) => label === story.categoryLabel
    )?.[0]
    if (categoryEntry)
      categoryCounts.set(categoryEntry, (categoryCounts.get(categoryEntry) ?? 0) + 1)
  })

  const stories = contexts.map((context) => {
    const linked = linkedStories.get(context.player.id)
    if (linked) return linked

    const eligible = config.scenarios.filter((scenario) => isEligible(scenario, context))
    const withoutDuplicates = eligible.filter(
      (scenario) =>
        !usedScenarioIds.has(scenario.id) && !usedCooldownGroups.has(scenario.cooldownGroup)
    )
    const withoutScenarioDuplicates = eligible.filter(
      (scenario) => !usedScenarioIds.has(scenario.id)
    )
    const candidates =
      withoutDuplicates.length > 0
        ? withoutDuplicates
        : withoutScenarioDuplicates.length > 0
          ? withoutScenarioDuplicates
          : eligible.length > 0
            ? eligible
            : config.scenarios

    const seed = `${seedBase}:${context.player.id}`
    const scenario = weightedPick(candidates, `${seed}:scenario`, (candidate) =>
      scenarioWeight(candidate, context, toneCounts, categoryCounts)
    )
    usedScenarioIds.add(scenario.id)
    usedCooldownGroups.add(scenario.cooldownGroup)
    toneCounts.set(scenario.tone, (toneCounts.get(scenario.tone) ?? 0) + 1)
    categoryCounts.set(scenario.category, (categoryCounts.get(scenario.category) ?? 0) + 1)

    return storyFromScenario(
      scenario,
      context,
      season,
      winnerName,
      config,
      seed,
      pickTabloidPhoto(context.player, tabloidPhotos, usedPhotoIds)
    )
  })

  return {
    schemaVersion: 1,
    configVersion: config.version,
    season,
    issueNumber: String(1000 + (hashString(seedBase) % 9000)),
    dateLabel: `THE MORNING AFTER SEASON ${season}`,
    generatedAt: new Date().toISOString(),
    editorial: config.editorial,
    stories,
  }
}

export function buildAftermathStories(
  players: Player[],
  season: number,
  options: AftermathBuildOptions = {},
  config: AfterTheEyeConfig = BUNDLED_CONFIG
): AftermathStory[] {
  return buildAftermathIssue(players, season, options, config).stories
}

export function aftermathIssueStorageKey(
  profileId: string | null | undefined,
  gameId: string | null | undefined,
  season: number
): string {
  return `${ISSUE_CACHE_PREFIX}:${profileId ?? 'guest'}:${gameId ?? `season-${season}`}:${season}`
}

function isStoredStory(value: unknown): value is AftermathStory {
  if (!isRecord(value)) return false
  return (
    typeof value.playerId === 'string' &&
    typeof value.playerName === 'string' &&
    typeof value.headline === 'string' &&
    typeof value.body === 'string' &&
    typeof value.scenarioId === 'string' &&
    Array.isArray(value.bulletPoints) &&
    value.bulletPoints.every((entry) => typeof entry === 'string') &&
    Array.isArray(value.imageSources) &&
    value.imageSources.every((entry) => typeof entry === 'string')
  )
}

export function readPersistedAftermathIssue(storageKey: string): AftermathIssue | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? 'null')
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.stories)) return null
    if (!value.stories.every(isStoredStory) || !isRecord(value.editorial)) return null
    return value as unknown as AftermathIssue
  } catch {
    return null
  }
}

export function persistAftermathIssue(storageKey: string, issue: AftermathIssue): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(storageKey, JSON.stringify(issue))
  } catch {
    // A deterministic issue can still be rebuilt from the bundled config if storage is unavailable.
  }
}
