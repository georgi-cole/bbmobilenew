/**
 * remoteConfigService.ts — fetch the live-config JSON document.
 *
 * Responsibilities:
 *  - Fetch from the configured endpoint (defaults to /api/live-config).
 *  - Cache the last successful response in localStorage so the app
 *    starts with content even when offline.
 *  - Validate the response shape (strings are strings, URLs are http/https).
 *  - Skip the relative dev proxy path in packaged builds so native releases
 *    never surface a broken fetch error just because the server route is gone.
 *  - Return null on any failure so callers fall back gracefully.
 *
 * SECURITY NOTE: Remote config is treated as pure data. No field is ever
 * executed as code. URL fields are validated to only allow http/https.
 */

import type {
  RemoteConfig,
  RemoteOperations,
  RemotePlayerOverride,
  RemoteRollout,
} from './remoteConfigTypes'
import type { CompSelectionMode } from '../components/compSelectionUtils'
import { apiUrl } from '../utils/apiBase'
import { sanitiseSocialRuntimeOverride } from '../social/socialRuntimeConfig'
import {
  sanitiseMusicConfigOverrides,
  sanitiseMusicTrackAssetOverrides,
} from '../services/sound/musicConfigSanitizer'
import type { GameManagerConfig, GameManagerRule } from '../gameManager/gameManager'
import type { BroadcastOverride, CustomBroadcastMessage, Phase, TvEvent } from '../types'
import { ALL_BROADCAST_PHASES, BROADCAST_CAMPAIGNS } from '../broadcasting/broadcastTemplateCatalog'
import { sanitiseSocialActionOverrides } from '../social/socialActionManager'

// ─── Constants ────────────────────────────────────────────────────────────────

export const REMOTE_CONFIG_STORAGE_KEY = 'bbmobilenew_remote_config_v1'
export const GITHUB_PAGES_REMOTE_CONFIG_URL =
  'https://georgi-cole.github.io/bbmobilenew/config/live-config.json'

/** TTL for the localStorage cache (1 hour). */
const CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Default endpoint for the live-config document.
 * Can be overridden at build time via VITE_REMOTE_CONFIG_URL.
 * Relative endpoints are only fetched in dev, where the Vite proxy exists.
 */
export const DEFAULT_REMOTE_CONFIG_URL: string =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_REMOTE_CONFIG_URL?: string } }).env?.VITE_REMOTE_CONFIG_URL) ||
  (import.meta.env.DEV ? apiUrl('/api/live-config') : GITHUB_PAGES_REMOTE_CONFIG_URL)

const FETCH_TIMEOUT_MS = 8000

/** Accepted CompSelectionMode values — kept in sync with compSelectionUtils. */
const VALID_MODES = new Set<CompSelectionMode>([
  'random-games',
  'single-game',
  'user-selection',
  'arcade-only',
  'trivia-only',
  'endurance-only',
  'logic-only',
  'retired',
  'misc',
  'unique',
  'bracket-template',
])

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Returns true if the string is a safe http/https URL. */
function isSafeUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Returns the value if it is a non-empty string, otherwise undefined. */
function safeStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Returns the value clamped to [0, 1] if it is a finite number, otherwise undefined. */
function safeOpacity(value: unknown): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value))
}

function safePercentage(value: unknown): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.max(0, Math.min(100, value))
}

function sanitiseBroadcast(raw: unknown): RemoteConfig['broadcast'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const broadcast: NonNullable<RemoteConfig['broadcast']> = {}
  if (typeof value.enabled === 'boolean') broadcast.enabled = value.enabled
  const title = safeStr(value.title)
  if (title) broadcast.title = title.slice(0, 100)
  const message = safeStr(value.message)
  if (message) broadcast.message = message.slice(0, 500)
  if (value.priority === 'normal' || value.priority === 'critical') {
    broadcast.priority = value.priority
  }
  const startsAt = safeStr(value.startsAt)
  if (startsAt && !Number.isNaN(Date.parse(startsAt))) broadcast.startsAt = startsAt
  const endsAt = safeStr(value.endsAt)
  if (endsAt && !Number.isNaN(Date.parse(endsAt))) broadcast.endsAt = endsAt
  return Object.keys(broadcast).length > 0 ? broadcast : undefined
}

function sanitiseGameManager(raw: unknown): GameManagerConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const rules: GameManagerRule[] = []
  if (Array.isArray(value.rules)) {
    for (const entry of value.rules.slice(0, 100)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const rule = entry as Record<string, unknown>
      const id = safeStr(rule.id)
      if (!id) continue
      if (rule.trigger !== 'day' && rule.trigger !== 'players') continue
      if (rule.competition !== 'LOH' && rule.competition !== 'POS' && rule.competition !== 'any') {
        continue
      }
      if (
        rule.selection !== 'random' &&
        rule.selection !== 'category' &&
        rule.selection !== 'game'
      ) {
        continue
      }
      if (rule.outcome !== 'play' && rule.outcome !== 'random' && rule.outcome !== 'player')
        continue
      const next: GameManagerRule = {
        id: id.slice(0, 80),
        enabled: rule.enabled !== false,
        priority:
          typeof rule.priority === 'number' && Number.isFinite(rule.priority)
            ? Math.max(-1000, Math.min(1000, Math.round(rule.priority)))
            : 0,
        trigger: rule.trigger,
        competition: rule.competition,
        selection: rule.selection,
        outcome: rule.outcome,
      }
      if (rule.trigger === 'day' && typeof rule.day === 'number') {
        next.day = Math.max(1, Math.min(100, Math.round(rule.day)))
      }
      if (rule.trigger === 'players' && typeof rule.playerCount === 'number') {
        next.playerCount = Math.max(2, Math.min(50, Math.round(rule.playerCount)))
      }
      if (
        rule.category === 'arcade' ||
        rule.category === 'logic' ||
        rule.category === 'trivia' ||
        rule.category === 'endurance'
      ) {
        next.category = rule.category
      }
      const gameKey = safeStr(rule.gameKey)
      if (gameKey) next.gameKey = gameKey.slice(0, 100)
      const winnerId = safeStr(rule.winnerId)
      if (winnerId) next.winnerId = winnerId.slice(0, 100)
      rules.push(next)
    }
  }
  return { enabled: value.enabled !== false, rules }
}

function sanitiseBroadcastManager(raw: unknown): RemoteConfig['broadcastManager'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const result: NonNullable<RemoteConfig['broadcastManager']> = {}
  if (typeof value.enabled === 'boolean') result.enabled = value.enabled
  if (value.overrides && typeof value.overrides === 'object' && !Array.isArray(value.overrides)) {
    const overrides: Record<string, BroadcastOverride> = {}
    for (const [id, entry] of Object.entries(value.overrides).slice(0, 400)) {
      if (!safeStr(id) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const source = entry as Record<string, unknown>
      const override: BroadcastOverride = {}
      const text = safeStr(source.text)
      const title = safeStr(source.title)
      const major = safeStr(source.major)
      if (text) override.text = text.slice(0, 500)
      if (title) override.title = title.slice(0, 120)
      if (major) override.major = major.slice(0, 120)
      if (source.major === null) override.major = null
      if (
        source.type === 'game' ||
        source.type === 'social' ||
        source.type === 'vote' ||
        source.type === 'twist' ||
        source.type === 'diary'
      )
        override.type = source.type
      if (source.level === 'minor' || source.level === 'major' || source.level === 'critical')
        override.level = source.level
      if (typeof source.disabled === 'boolean') override.disabled = source.disabled
      if (typeof source.forceOnTv === 'boolean') override.forceOnTv = source.forceOnTv
      if (typeof source.order === 'number' && Number.isFinite(source.order))
        override.order = Math.round(source.order)
      if (Object.keys(override).length > 0) overrides[id.slice(0, 120)] = override
    }
    if (Object.keys(overrides).length > 0) result.overrides = overrides
  }
  if (Array.isArray(value.customMessages)) {
    const messages: CustomBroadcastMessage[] = []
    for (const rawMessage of value.customMessages.slice(0, 200)) {
      if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) continue
      const entry = rawMessage as Record<string, unknown>
      const id = safeStr(entry.id)
      const text = safeStr(entry.text)
      if (
        !id ||
        !text ||
        typeof entry.phase !== 'string' ||
        !ALL_BROADCAST_PHASES.includes(entry.phase as Phase)
      )
        continue
      if (
        entry.type !== 'game' &&
        entry.type !== 'social' &&
        entry.type !== 'vote' &&
        entry.type !== 'twist' &&
        entry.type !== 'diary'
      )
        continue
      if (entry.level !== 'minor' && entry.level !== 'major' && entry.level !== 'critical') continue
      const message: CustomBroadcastMessage = {
        id: id.slice(0, 120),
        phase: entry.phase as Phase,
        text: text.slice(0, 500),
        type: entry.type as TvEvent['type'],
        level: entry.level,
        enabled: entry.enabled !== false,
      }
      const key = safeStr(entry.key)
      const title = safeStr(entry.title)
      const major = safeStr(entry.major)
      if (key) message.key = key.slice(0, 120)
      if (title) message.title = title.slice(0, 120)
      if (major) message.major = major.slice(0, 120)
      if (typeof entry.forceOnTv === 'boolean') message.forceOnTv = entry.forceOnTv
      if (typeof entry.order === 'number' && Number.isFinite(entry.order))
        message.order = Math.round(entry.order)
      if (
        typeof entry.campaign === 'string' &&
        BROADCAST_CAMPAIGNS.includes(entry.campaign as (typeof BROADCAST_CAMPAIGNS)[number])
      )
        message.campaign = entry.campaign as CustomBroadcastMessage['campaign']
      messages.push(message)
    }
    if (messages.length > 0) result.customMessages = messages
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function sanitiseSocialManager(raw: unknown): RemoteConfig['socialManager'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const actionOverrides = sanitiseSocialActionOverrides(value.actionOverrides)
  const result: NonNullable<RemoteConfig['socialManager']> = {}
  if (typeof value.enabled === 'boolean') result.enabled = value.enabled
  if (Object.keys(actionOverrides).length > 0) result.actionOverrides = actionOverrides
  return Object.keys(result).length > 0 ? result : undefined
}

/** Returns true when the URL is an absolute http(s) URL. */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Returns true when remote config should be fetched from the given URL.
 *
 * Development builds allow the relative `/api/live-config` proxy path.
 * Packaged/native builds only fetch absolute http(s) URLs.
 */
export function shouldFetchRemoteConfig(url: string, isDev = import.meta.env.DEV): boolean {
  const trimmed = url.trim()
  if (trimmed.length === 0) return false
  return isDev || isAbsoluteHttpUrl(trimmed)
}

/** Validates and sanitises a single player-override entry. */
function sanitisePlayerOverride(raw: unknown): RemotePlayerOverride | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = safeStr(r.id)
  if (!id) return null
  const override: RemotePlayerOverride = { id }
  if (isSafeUrl(r.avatarUrl)) override.avatarUrl = r.avatarUrl as string
  const name = safeStr(r.name)
  if (name) override.name = name
  const bio = safeStr(r.bio)
  if (bio) override.bio = bio
  return override
}

/**
 * Validates and sanitises a raw parsed JSON value as RemoteConfig.
 * Returns null if the top-level value is not an object.
 * Unknown/invalid fields are silently dropped.
 */
export function sanitiseRemoteConfig(raw: unknown): RemoteConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const r = raw as Record<string, unknown>
  const config: RemoteConfig = {}

  const broadcast = sanitiseBroadcast(r.broadcast)
  if (broadcast) config.broadcast = broadcast

  const broadcastManager = sanitiseBroadcastManager(r.broadcastManager)
  if (broadcastManager) config.broadcastManager = broadcastManager

  const gameManager = sanitiseGameManager(r.gameManager)
  if (gameManager) config.gameManager = gameManager

  // season
  if (r.season && typeof r.season === 'object' && !Array.isArray(r.season)) {
    const s = r.season as Record<string, unknown>
    config.season = {}

    // season.theme
    if (s.theme && typeof s.theme === 'object' && !Array.isArray(s.theme)) {
      const t = s.theme as Record<string, unknown>
      config.season.theme = {}
      const accent = safeStr(t.accent)
      if (accent) config.season.theme.accent = accent
      const accent2 = safeStr(t.accent2)
      if (accent2) config.season.theme.accent2 = accent2
      const background = safeStr(t.background)
      if (background) config.season.theme.background = background
      if (Object.keys(config.season.theme).length === 0) delete config.season.theme
    }

    // season.introHub
    if (s.introHub && typeof s.introHub === 'object' && !Array.isArray(s.introHub)) {
      const h = s.introHub as Record<string, unknown>
      config.season.introHub = {}
      if (isSafeUrl(h.backgroundImageUrl)) {
        config.season.introHub.backgroundImageUrl = h.backgroundImageUrl as string
      }
      const op = safeOpacity(h.overlayOpacity)
      if (op !== undefined) config.season.introHub.overlayOpacity = op
      const headline = safeStr(h.headline)
      if (headline) config.season.introHub.headline = headline
      if (Object.keys(config.season.introHub).length === 0) delete config.season.introHub
    }

    // season.music
    if (s.music && typeof s.music === 'object' && !Array.isArray(s.music)) {
      const m = s.music as Record<string, unknown>
      config.season.music = {}
      if (isSafeUrl(m.introTrackUrl)) {
        config.season.music.introTrackUrl = m.introTrackUrl as string
      }
      if (isSafeUrl(m.mainTrackUrl)) {
        config.season.music.mainTrackUrl = m.mainTrackUrl as string
      }
      const tracks = sanitiseMusicTrackAssetOverrides(m.tracks)
      if (tracks.length > 0) config.season.music.tracks = tracks
      const assignments = sanitiseMusicConfigOverrides(m.assignments)
      if (Object.keys(assignments).length > 0) {
        config.season.music.assignments = assignments
      }
      if (Object.keys(config.season.music).length === 0) delete config.season.music
    }

    // season.mainTv
    if (s.mainTv && typeof s.mainTv === 'object' && !Array.isArray(s.mainTv)) {
      const tv = s.mainTv as Record<string, unknown>
      config.season.mainTv = {}
      const headline = safeStr(tv.headline)
      if (headline) config.season.mainTv.headline = headline
      const subtext = safeStr(tv.subtext)
      if (subtext) config.season.mainTv.subtext = subtext
      if (Object.keys(config.season.mainTv).length === 0) delete config.season.mainTv
    }

    if (Object.keys(config.season).length === 0) delete config.season
  }

  // challenge
  if (r.challenge && typeof r.challenge === 'object' && !Array.isArray(r.challenge)) {
    const ch = r.challenge as Record<string, unknown>
    config.challenge = {}
    const weeklyMode = safeStr(ch.weeklyMode)
    if (weeklyMode && VALID_MODES.has(weeklyMode as CompSelectionMode)) {
      config.challenge.weeklyMode = weeklyMode as CompSelectionMode
    }
    const weeklyGameKey = safeStr(ch.weeklyGameKey)
    if (weeklyGameKey) config.challenge.weeklyGameKey = weeklyGameKey
    if (Array.isArray(ch.weeklyGameKeys)) {
      const keys = ch.weeklyGameKeys.filter(
        (k): k is string => typeof k === 'string' && k.length > 0
      )
      if (keys.length > 0) config.challenge.weeklyGameKeys = keys
    }
    if (Object.keys(config.challenge).length === 0) delete config.challenge
  }

  // players
  if (Array.isArray(r.players)) {
    const overrides = r.players
      .map(sanitisePlayerOverride)
      .filter((o): o is RemotePlayerOverride => o !== null)
    if (overrides.length > 0) config.players = overrides
  }

  // social: pure-data rules and content overlays with a bundled fallback.
  const social = sanitiseSocialRuntimeOverride(r.social)
  if (social && Object.keys(social).length > 0) config.social = social

  const socialManager = sanitiseSocialManager(r.socialManager)
  if (socialManager) config.socialManager = socialManager

  // operations: gradual UI rollout, kill switches and privacy-safe telemetry.
  if (r.operations && typeof r.operations === 'object' && !Array.isArray(r.operations)) {
    const ops = r.operations as Record<string, unknown>
    config.operations = {}

    if (
      ops.killSwitches &&
      typeof ops.killSwitches === 'object' &&
      !Array.isArray(ops.killSwitches)
    ) {
      const kills = ops.killSwitches as Record<string, unknown>
      if (typeof kills.refinedGameChrome === 'boolean') {
        config.operations.killSwitches = { refinedGameChrome: kills.refinedGameChrome }
      }
    }

    if (ops.rollouts && typeof ops.rollouts === 'object' && !Array.isArray(ops.rollouts)) {
      const rollouts = ops.rollouts as Record<string, unknown>
      const chrome = rollouts.refinedGameChrome
      if (chrome && typeof chrome === 'object' && !Array.isArray(chrome)) {
        const value = chrome as Record<string, unknown>
        const rollout: RemoteRollout = {}
        if (typeof value.enabled === 'boolean') rollout.enabled = value.enabled
        const percentage = safePercentage(value.percentage)
        if (percentage !== undefined) rollout.percentage = percentage
        const salt = safeStr(value.salt)
        if (salt) rollout.salt = salt
        if (Object.keys(rollout).length > 0) {
          config.operations.rollouts = { refinedGameChrome: rollout }
        }
      }
    }

    if (ops.telemetry && typeof ops.telemetry === 'object' && !Array.isArray(ops.telemetry)) {
      const value = ops.telemetry as Record<string, unknown>
      const telemetry: NonNullable<RemoteOperations['telemetry']> = {}
      if (typeof value.enabled === 'boolean') telemetry.enabled = value.enabled
      const samplePercentage = safePercentage(value.samplePercentage)
      if (samplePercentage !== undefined) telemetry.samplePercentage = samplePercentage
      if (isSafeUrl(value.endpointUrl)) telemetry.endpointUrl = value.endpointUrl as string
      if (Object.keys(telemetry).length > 0) config.operations.telemetry = telemetry
    }

    if (Object.keys(config.operations).length === 0) delete config.operations
  }

  return config
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

interface CachedEntry {
  config: RemoteConfig
  fetchedAt: number
}

/** Reads the cached remote config from localStorage. Returns null if absent or expired. */
export function loadCachedRemoteConfig(): RemoteConfig | null {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_STORAGE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CachedEntry
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null
    return sanitiseRemoteConfig(entry.config)
  } catch {
    return null
  }
}

/** Writes the remote config to localStorage with a timestamp. */
export function saveCachedRemoteConfig(config: RemoteConfig): void {
  try {
    const entry: CachedEntry = { config, fetchedAt: Date.now() }
    localStorage.setItem(REMOTE_CONFIG_STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // Ignore write errors (private browsing quota, etc.)
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetches the remote live-config JSON document.
 *
 * Order:
 *  1. Fetch from the configured endpoint (with FETCH_TIMEOUT_MS timeout).
 *  2. On success, validate, cache, and return.
 *  3. On any failure, load and return the cached version.
 *  4. If no cache exists, return null (callers use built-in defaults).
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  const url = DEFAULT_REMOTE_CONFIG_URL.trim()
  if (!shouldFetchRemoteConfig(url)) {
    return loadCachedRemoteConfig()
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json: unknown = await res.json()
    const config = sanitiseRemoteConfig(json)
    if (config) saveCachedRemoteConfig(config)
    return config
  } catch {
    // Network failure, timeout, or invalid JSON — fall back to cache.
    return loadCachedRemoteConfig()
  } finally {
    clearTimeout(timer)
  }
}
