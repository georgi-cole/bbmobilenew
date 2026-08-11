// src/store/saveStatePersistence.ts
//
// Per-profile manual save snapshots for in-progress seasons.
// Separate from season archives (which store completed seasons).
//
// Key behaviours:
//  - Each profile exposes one canonical finite season plus one independent Survival run.
//  - Legacy finite slots can be retained as recovery-only data after one is selected.
//  - Each run slot is stored independently so adding game types does not create
//    one increasingly large localStorage value.
//  - Guest mode never writes or reads snapshots.
//  - Stale/invalid snapshots are silently discarded on load.
//  - Legacy single-slot and embedded multi-run saves are migrated safely.

import type { GameState } from '../types'
import type { GameMode, SeasonExpansionMode } from '../modes/modeTypes'
import { normalizeGameMode } from '../modes/gameModes'
import { isSurvivorRunTerminal } from '../modes/survivorRun'
import {
  applySurvivorAchievementProgress,
  getSurvivorProgressDay,
  normalizeSurvivorAchievementUnlockMap,
} from '../modes/survivorAchievements'
import type { FinaleState } from './finaleSlice'
import type { SocialState } from '../social/types'
import type { PublicOpinionState } from '../publicOpinion/types'
import type { ChallengeState } from './challengeSlice'
import type { SurvivorAchievementUnlockMap } from '../modes/survivorAchievements'

export const SAVED_STATE_KEY_PREFIX = 'bbmobilenew:savedSeason:'
export const SAVED_RUNS_KEY_PREFIX = 'bbmobilenew:savedRuns:'
export const SAVED_RUN_SLOT_KEY_PREFIX = 'bbmobilenew:savedRunSlot:'
export const SAVE_PERSISTENCE_ISSUE_EVENT = 'bb:save-persistence-issue'
export const CORRUPT_SAVE_RECOVERY_KEY = 'bbmobilenew:recovery:lastCorruptSave'

export type SaveFailureReason =
  | 'quota_exceeded'
  | 'storage_unavailable'
  | 'serialization_failed'
  | 'unknown_write_failure'

export type SavePersistenceIssue = {
  kind: 'write_failed' | 'corrupt_recovered'
  occurredAt: string
  reason?: SaveFailureReason
}

let lastSavePersistenceIssue: SavePersistenceIssue | null = null

function classifyWriteFailure(error: unknown): SaveFailureReason {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return 'quota_exceeded'
    }
    if (error.name === 'SecurityError' || error.name === 'InvalidStateError') {
      return 'storage_unavailable'
    }
  }
  return 'unknown_write_failure'
}

function reportSavePersistenceIssue(
  kind: SavePersistenceIssue['kind'],
  reason?: SaveFailureReason
): void {
  if (lastSavePersistenceIssue?.kind === kind && lastSavePersistenceIssue.reason === reason) return
  lastSavePersistenceIssue = { kind, reason, occurredAt: new Date().toISOString() }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SavePersistenceIssue>(SAVE_PERSISTENCE_ISSUE_EVENT, {
        detail: lastSavePersistenceIssue,
      })
    )
  }
}

export function getLastSavePersistenceIssue(): SavePersistenceIssue | null {
  return lastSavePersistenceIssue
}

export function clearLastSavePersistenceIssue(): void {
  lastSavePersistenceIssue = null
}

export interface SavedSeasonSnapshot {
  version: 1
  profileId: string
  savedAt: string
  game: GameState
  finale: FinaleState
  social: SocialState
  publicOpinion?: PublicOpinionState
  challenge?: ChallengeState
}

export interface SavedSeasonState {
  game: GameState
  finale: FinaleState
  social: SocialState
  publicOpinion?: PublicOpinionState
  challenge?: ChallengeState
}

/**
 * Build the durable campaign payload shared by automatic and manual saves.
 *
 * Completed-season history and Broadcast Manager authoring data have their own
 * localStorage keys. Keeping them out of every run snapshot avoids duplicating
 * large, unrelated values and prevents a runtime-only authoring value from
 * blocking an otherwise valid campaign save.
 */
export function createSavedSeasonSnapshot(
  profileId: string,
  state: SavedSeasonState,
  savedAt = new Date().toISOString()
): SavedSeasonSnapshot {
  const campaignGame = { ...state.game }
  delete campaignGame.seasonArchives
  delete campaignGame.broadcastOverrides
  delete campaignGame.customBroadcasts
  const savedAtMs = Date.parse(savedAt)

  return {
    version: 1,
    profileId,
    savedAt,
    game: {
      ...campaignGame,
      mode: state.game.mode ?? 'classic',
      lastPlayedAt: Number.isFinite(savedAtMs) ? savedAtMs : Date.now(),
      saveVersion: state.game.saveVersion ?? 2,
    },
    finale: state.finale,
    social: state.social,
    publicOpinion: state.publicOpinion,
    challenge: state.challenge,
  }
}

export interface SavedRunProfileStats {
  maxSurvivorDaysSurvived: number
  survivorAchievementsUnlocked: SurvivorAchievementUnlockMap
}

export type SavedRunSlot = GameMode | SeasonExpansionMode
export type FiniteSeasonRunSlot = Exclude<SavedRunSlot, 'survival'>

export interface SavedRunProfile {
  version: 2
  profileId: string
  savedAt: string
  activeRunId: string | null
  lastPlayedRunId: string | null
  activeSeasonSlot: FiniteSeasonRunSlot | null
  retiredFiniteSlots: FiniteSeasonRunSlot[]
  runs: Partial<Record<SavedRunSlot, SavedSeasonSnapshot>>
  stats: SavedRunProfileStats
}

export interface FiniteSeasonRunChoice {
  slot: FiniteSeasonRunSlot
  snapshot: SavedSeasonSnapshot
}

type SavedRunProfileMetadata = Omit<SavedRunProfile, 'runs'> & { runs?: never }

const ALL_RUN_SLOTS: SavedRunSlot[] = ['classic', 'survival', 'cupidArrow', 'voxPopuli']
const FINITE_RUN_SLOTS: FiniteSeasonRunSlot[] = ['classic', 'cupidArrow', 'voxPopuli']

function normalizeRetiredFiniteSlots(raw: unknown): FiniteSeasonRunSlot[] {
  if (!Array.isArray(raw)) return []
  return Array.from(
    new Set(
      raw.filter((slot): slot is FiniteSeasonRunSlot =>
        FINITE_RUN_SLOTS.includes(slot as FiniteSeasonRunSlot)
      )
    )
  )
}

export function savedStateKeyForProfile(profileId: string): string {
  return `${SAVED_STATE_KEY_PREFIX}${encodeURIComponent(profileId)}`
}

export function savedRunsKeyForProfile(profileId: string): string {
  return `${SAVED_RUNS_KEY_PREFIX}${encodeURIComponent(profileId)}`
}

export function savedRunSlotKeyForProfile(profileId: string, slot: SavedRunSlot): string {
  return `${SAVED_RUN_SLOT_KEY_PREFIX}${encodeURIComponent(profileId)}:${slot}`
}

function emptySavedRunProfile(profileId: string): SavedRunProfile {
  return {
    version: 2,
    profileId,
    savedAt: new Date(0).toISOString(),
    activeRunId: null,
    lastPlayedRunId: null,
    activeSeasonSlot: null,
    retiredFiniteSlots: [],
    runs: {},
    stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
  }
}

function getRunId(snapshot: SavedSeasonSnapshot | undefined): string | null {
  return snapshot?.game.runId ?? snapshot?.game.gameId ?? null
}

function isRunSnapshotResumable(
  snapshot: SavedSeasonSnapshot | undefined
): snapshot is SavedSeasonSnapshot {
  if (!snapshot) return false
  if (isSurvivorRunTerminal(snapshot.game)) return false
  return snapshot.game.status !== 'completed' && snapshot.game.status !== 'failed'
}

export function getSavedRunSlot(game: GameState): SavedRunSlot {
  if (normalizeGameMode(game.mode) === 'survival') return 'survival'
  if (game.expansionMode === 'cupidArrow' || game.expansionMode === 'voxPopuli') {
    return game.expansionMode
  }
  return 'classic'
}

function coerceSnapshot(raw: unknown, profileId: string): SavedSeasonSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Partial<SavedSeasonSnapshot>
  if (parsed.version !== 1) return null
  if (
    parsed.profileId !== profileId ||
    !parsed.savedAt ||
    !parsed.game ||
    !parsed.finale ||
    !parsed.social
  ) {
    return null
  }
  const snapshot = parsed as SavedSeasonSnapshot
  const legacyGame = snapshot.game as unknown as {
    mode?: GameMode | 'survivor'
    modeSpecific?: {
      kind?: GameMode | 'survivor'
      replacementTransition?: { mode?: GameMode | 'survivor' } | null
    } | null
  }
  const mode = normalizeGameMode(legacyGame.mode)
  legacyGame.mode = mode
  if (legacyGame.modeSpecific?.kind === 'survivor') legacyGame.modeSpecific.kind = 'survival'
  if (legacyGame.modeSpecific?.replacementTransition?.mode === 'survivor') {
    legacyGame.modeSpecific.replacementTransition.mode = 'survival'
  }
  return snapshot
}

function normalizeRunProfile(
  profileId: string,
  parsed: Partial<SavedRunProfile>
): SavedRunProfile | null {
  if (parsed.version !== 2 || parsed.profileId !== profileId) return null
  const retiredFiniteSlots = normalizeRetiredFiniteSlots(parsed.retiredFiniteSlots)
  const runs = parsed.runs as
    | Partial<Record<SavedRunSlot | 'survivor', SavedSeasonSnapshot>>
    | undefined
  const classic = coerceSnapshot(runs?.classic, profileId) ?? undefined
  const survivor = coerceSnapshot(runs?.survival ?? runs?.survivor, profileId) ?? undefined
  const cupidArrow = coerceSnapshot(runs?.cupidArrow, profileId) ?? undefined
  const voxPopuli = coerceSnapshot(runs?.voxPopuli, profileId) ?? undefined
  const resumableClassic =
    !retiredFiniteSlots.includes('classic') && isRunSnapshotResumable(classic) ? classic : undefined
  const resumableSurvivor = isRunSnapshotResumable(survivor) ? survivor : undefined
  const resumableCupidArrow =
    !retiredFiniteSlots.includes('cupidArrow') && isRunSnapshotResumable(cupidArrow)
      ? cupidArrow
      : undefined
  const resumableVoxPopuli =
    !retiredFiniteSlots.includes('voxPopuli') && isRunSnapshotResumable(voxPopuli)
      ? voxPopuli
      : undefined
  const maxSurvivorDaysSurvived = Math.max(
    typeof parsed.stats?.maxSurvivorDaysSurvived === 'number'
      ? parsed.stats.maxSurvivorDaysSurvived
      : 0,
    getSurvivorProgressDay(survivor?.game)
  )
  return {
    version: 2,
    profileId,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    activeRunId: typeof parsed.activeRunId === 'string' ? parsed.activeRunId : null,
    lastPlayedRunId: typeof parsed.lastPlayedRunId === 'string' ? parsed.lastPlayedRunId : null,
    activeSeasonSlot:
      parsed.activeSeasonSlot && FINITE_RUN_SLOTS.includes(parsed.activeSeasonSlot)
        ? parsed.activeSeasonSlot
        : null,
    retiredFiniteSlots,
    runs: {
      ...(resumableClassic ? { classic: resumableClassic } : {}),
      ...(resumableSurvivor ? { survival: resumableSurvivor } : {}),
      ...(resumableCupidArrow ? { cupidArrow: resumableCupidArrow } : {}),
      ...(resumableVoxPopuli ? { voxPopuli: resumableVoxPopuli } : {}),
    },
    stats: {
      maxSurvivorDaysSurvived,
      survivorAchievementsUnlocked: normalizeSurvivorAchievementUnlockMap(
        parsed.stats?.survivorAchievementsUnlocked
      ),
    },
  }
}

function createPersistenceReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const ancestors: object[] = []

  return function persistenceReplacer(this: unknown, _key: string, value: unknown): unknown {
    // Redux state should not contain bigint values, but browser/native bridges
    // can introduce one. Preserve the value instead of failing the entire save.
    if (typeof value === 'bigint') return value.toString()
    if (value === null || typeof value !== 'object') return value

    // Keep only the active ancestor chain. Repeated sibling references are safe
    // and should still be serialized; only an actual back-edge is omitted.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop()
    }
    if (ancestors.includes(value)) return undefined
    ancestors.push(value)
    return value
  }
}

function serialize(value: unknown): string | null {
  try {
    return JSON.stringify(value, createPersistenceReplacer())
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[save] snapshot serialization failed', error)
    reportSavePersistenceIssue('write_failed', 'serialization_failed')
    return null
  }
}

function writeStorage(key: string, serialized: string): boolean {
  try {
    localStorage.setItem(key, serialized)
    if (import.meta.env.DEV) {
      console.debug(`[save] wrote ${key} (${new Blob([serialized]).size} bytes)`)
    }
    return true
  } catch (error) {
    reportSavePersistenceIssue('write_failed', classifyWriteFailure(error))
    return false
  }
}

export function saveSeasonSnapshot(key: string, snapshot: SavedSeasonSnapshot): boolean {
  const serialized = serialize(snapshot)
  return serialized !== null && writeStorage(key, serialized)
}

export function loadSeasonSnapshot(key: string): SavedSeasonSnapshot | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedSeasonSnapshot>
    if (parsed.version !== 1) return null
    if (!parsed.profileId || !parsed.savedAt || !parsed.game || !parsed.finale || !parsed.social)
      return null
    return coerceSnapshot(parsed, parsed.profileId) ?? null
  } catch {
    return null
  }
}

function loadSlotRuns(
  profileId: string,
  retiredFiniteSlots: FiniteSeasonRunSlot[] = []
): SavedRunProfile['runs'] {
  const runs: SavedRunProfile['runs'] = {}
  for (const slot of ALL_RUN_SLOTS) {
    if (slot !== 'survival' && retiredFiniteSlots.includes(slot)) continue
    const snapshot = loadSeasonSnapshot(savedRunSlotKeyForProfile(profileId, slot))
    if (snapshot && isRunSnapshotResumable(snapshot)) runs[slot] = snapshot
  }
  return runs
}

function metadataFromProfile(profile: SavedRunProfile): SavedRunProfileMetadata {
  return {
    version: profile.version,
    profileId: profile.profileId,
    savedAt: profile.savedAt,
    activeRunId: profile.activeRunId,
    lastPlayedRunId: profile.lastPlayedRunId,
    activeSeasonSlot: profile.activeSeasonSlot,
    retiredFiniteSlots: profile.retiredFiniteSlots,
    stats: profile.stats,
  }
}

/**
 * Read only the small split-profile metadata record. This intentionally avoids
 * parsing every campaign slot during routine autosaves. Embedded/legacy profiles
 * return null so their first subsequent write still goes through the full
 * migration-safe path.
 */
function loadSplitMetadata(profileId: string): SavedRunProfileMetadata | null {
  try {
    const raw = localStorage.getItem(savedRunsKeyForProfile(profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedRunProfile> & SavedRunProfileMetadata
    if ('runs' in parsed) return null
    const normalized = normalizeRunProfile(profileId, { ...parsed, runs: {} })
    return normalized ? metadataFromProfile(normalized) : null
  } catch {
    return null
  }
}

function persistSplitProfile(profile: SavedRunProfile): boolean {
  const metadataRaw = serialize(metadataFromProfile(profile))
  if (metadataRaw === null) return false

  const previousMetadata = localStorage.getItem(savedRunsKeyForProfile(profile.profileId))
  const previousSlots = new Map<SavedRunSlot, string | null>()
  for (const slot of ALL_RUN_SLOTS) {
    previousSlots.set(
      slot,
      localStorage.getItem(savedRunSlotKeyForProfile(profile.profileId, slot))
    )
  }

  // Shrink an old embedded multi-run value first. This frees the duplicated space
  // needed to migrate its snapshots into independent keys.
  if (!writeStorage(savedRunsKeyForProfile(profile.profileId), metadataRaw)) return false

  for (const slot of ALL_RUN_SLOTS) {
    const key = savedRunSlotKeyForProfile(profile.profileId, slot)
    const snapshot = profile.runs[slot]
    if (!snapshot) {
      // Keep unselected legacy finite seasons as recovery-only raw data. The loader
      // skips retired keys, so they add no normal runtime parse or autosave cost.
      if (slot !== 'survival' && profile.retiredFiniteSlots.includes(slot)) continue
      localStorage.removeItem(key)
      continue
    }
    const raw = serialize(snapshot)
    if (raw === null || !writeStorage(key, raw)) {
      try {
        for (const rollbackSlot of ALL_RUN_SLOTS) {
          const oldValue = previousSlots.get(rollbackSlot)
          const rollbackKey = savedRunSlotKeyForProfile(profile.profileId, rollbackSlot)
          if (oldValue === null) localStorage.removeItem(rollbackKey)
          else localStorage.setItem(rollbackKey, oldValue)
        }
        if (previousMetadata === null)
          localStorage.removeItem(savedRunsKeyForProfile(profile.profileId))
        else localStorage.setItem(savedRunsKeyForProfile(profile.profileId), previousMetadata)
      } catch {
        // Keep the original failure classification; the active Redux run remains open.
      }
      return false
    }
  }
  return true
}

/**
 * Fast path for an already-migrated profile: write only the active run slot and
 * the tiny metadata record. The old implementation re-serialized and rewrote all
 * four potentially-large campaign slots on every Redux change, turning one Play
 * press into repeated synchronous localStorage work.
 */
function persistSingleRunSnapshot(
  profileId: string,
  slot: SavedRunSlot,
  snapshot: SavedSeasonSnapshot | null,
  metadata: SavedRunProfileMetadata
): boolean {
  const metadataKey = savedRunsKeyForProfile(profileId)
  const slotKey = savedRunSlotKeyForProfile(profileId, slot)
  const metadataRaw = serialize(metadata)
  const snapshotRaw = snapshot ? serialize(snapshot) : null
  if (metadataRaw === null || (snapshot && snapshotRaw === null)) return false

  const previousMetadata = localStorage.getItem(metadataKey)
  const previousSlot = localStorage.getItem(slotKey)

  const rollback = () => {
    try {
      if (previousMetadata === null) localStorage.removeItem(metadataKey)
      else localStorage.setItem(metadataKey, previousMetadata)
      if (previousSlot === null) localStorage.removeItem(slotKey)
      else localStorage.setItem(slotKey, previousSlot)
    } catch {
      // Preserve the original write failure; Redux still contains the live run.
    }
  }

  try {
    if (snapshotRaw !== null) {
      if (!writeStorage(slotKey, snapshotRaw)) return false
    } else {
      localStorage.removeItem(slotKey)
    }
    if (!writeStorage(metadataKey, metadataRaw)) {
      rollback()
      return false
    }
    // Once split metadata is committed the legacy single-slot payload is obsolete.
    localStorage.removeItem(savedStateKeyForProfile(profileId))
    return true
  } catch (error) {
    rollback()
    reportSavePersistenceIssue('write_failed', classifyWriteFailure(error))
    return false
  }
}

export function loadSavedRunProfile(profileId: string): SavedRunProfile {
  const key = savedRunsKeyForProfile(profileId)
  let malformedRaw: string | null = null
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedRunProfile> & SavedRunProfileMetadata
      const splitRuns = loadSlotRuns(profileId, normalizeRetiredFiniteSlots(parsed.retiredFiniteSlots))
      if (parsed.version === 2 && parsed.profileId === profileId && !('runs' in parsed)) {
        return (
          normalizeRunProfile(profileId, { ...parsed, runs: splitRuns }) ??
          emptySavedRunProfile(profileId)
        )
      }
      const normalized = normalizeRunProfile(profileId, parsed)
      if (normalized) return { ...normalized, runs: { ...normalized.runs, ...splitRuns } }
      malformedRaw = raw
    }
  } catch {
    try {
      malformedRaw = localStorage.getItem(key)
    } catch {
      malformedRaw = null
    }
  }

  if (malformedRaw) {
    try {
      sessionStorage.setItem(CORRUPT_SAVE_RECOVERY_KEY, malformedRaw)
      localStorage.removeItem(key)
    } catch {
      // Recovery can continue even if the damaged payload cannot be quarantined.
    }
    reportSavePersistenceIssue('corrupt_recovered')
  }

  const splitRuns = loadSlotRuns(profileId)
  if (Object.keys(splitRuns).length > 0) {
    return { ...emptySavedRunProfile(profileId), runs: splitRuns }
  }

  const legacy = loadSeasonSnapshot(savedStateKeyForProfile(profileId))
  if (legacy && legacy.profileId === profileId) {
    return {
      ...emptySavedRunProfile(profileId),
      savedAt: legacy.savedAt,
      activeRunId: getRunId(legacy),
      lastPlayedRunId: getRunId(legacy),
      activeSeasonSlot: 'classic',
      retiredFiniteSlots: [],
      runs: { classic: { ...legacy, game: { ...legacy.game, mode: 'classic' } } },
    }
  }

  return emptySavedRunProfile(profileId)
}

export function saveRunProfile(profile: SavedRunProfile): boolean {
  const saved = persistSplitProfile(profile)
  if (saved) {
    try {
      localStorage.removeItem(savedStateKeyForProfile(profile.profileId))
    } catch {
      // Legacy cleanup is best-effort only.
    }
  }
  return saved
}

export function saveRunSnapshot(profileId: string, snapshot: SavedSeasonSnapshot): boolean {
  const mode = normalizeGameMode(snapshot.game.mode)
  const slot = getSavedRunSlot(snapshot.game)
  const runId = getRunId(snapshot)
  const resumable = isRunSnapshotResumable(snapshot)

  // Once a profile is using the split format, routine autosaves never need to
  // load or rewrite its other run slots. Legacy/embedded data deliberately falls
  // back to the existing migration-safe full-profile path exactly once.
  const metadata = loadSplitMetadata(profileId)
  if (metadata) {
    const survivorBest =
      mode === 'survival'
        ? Math.max(metadata.stats.maxSurvivorDaysSurvived, getSurvivorProgressDay(snapshot.game))
        : metadata.stats.maxSurvivorDaysSurvived
    const survivorAchievementsUnlocked =
      mode === 'survival'
        ? applySurvivorAchievementProgress(
            metadata.stats.survivorAchievementsUnlocked,
            getSurvivorProgressDay(snapshot.game),
            runId,
            snapshot.savedAt
          ).unlocks
        : metadata.stats.survivorAchievementsUnlocked

    const retiredFiniteSlots = new Set(metadata.retiredFiniteSlots)
    let activeSeasonSlot = metadata.activeSeasonSlot
    if (slot !== 'survival') {
      if (activeSeasonSlot && activeSeasonSlot !== slot) retiredFiniteSlots.add(activeSeasonSlot)
      retiredFiniteSlots.delete(slot)
      activeSeasonSlot = resumable ? slot : activeSeasonSlot === slot ? null : activeSeasonSlot
    }

    return persistSingleRunSnapshot(profileId, slot, resumable ? snapshot : null, {
      ...metadata,
      savedAt: snapshot.savedAt,
      activeRunId: resumable ? runId : null,
      lastPlayedRunId: resumable ? runId : metadata.lastPlayedRunId,
      activeSeasonSlot,
      retiredFiniteSlots: FINITE_RUN_SLOTS.filter((finiteSlot) =>
        retiredFiniteSlots.has(finiteSlot)
      ),
      stats: {
        ...metadata.stats,
        maxSurvivorDaysSurvived: survivorBest,
        survivorAchievementsUnlocked,
      },
    })
  }

  const current = loadSavedRunProfile(profileId)
  const survivorBest =
    mode === 'survival'
      ? Math.max(current.stats.maxSurvivorDaysSurvived, getSurvivorProgressDay(snapshot.game))
      : current.stats.maxSurvivorDaysSurvived
  const survivorAchievementsUnlocked =
    mode === 'survival'
      ? applySurvivorAchievementProgress(
          current.stats.survivorAchievementsUnlocked,
          getSurvivorProgressDay(snapshot.game),
          runId,
          snapshot.savedAt
        ).unlocks
      : current.stats.survivorAchievementsUnlocked
  const nextRuns = { ...current.runs }
  const retiredFiniteSlots = new Set(current.retiredFiniteSlots)
  let activeSeasonSlot = current.activeSeasonSlot
  if (slot !== 'survival') {
    for (const finiteSlot of FINITE_RUN_SLOTS) {
      if (finiteSlot === slot) continue
      if (current.runs[finiteSlot]) {
        retiredFiniteSlots.add(finiteSlot)
        delete nextRuns[finiteSlot]
      }
    }
    retiredFiniteSlots.delete(slot)
    activeSeasonSlot = resumable ? slot : activeSeasonSlot === slot ? null : activeSeasonSlot
  }
  if (resumable) nextRuns[slot] = snapshot
  else delete nextRuns[slot]

  return saveRunProfile({
    ...current,
    savedAt: snapshot.savedAt,
    activeRunId: resumable ? runId : null,
    lastPlayedRunId: resumable ? runId : current.lastPlayedRunId,
    activeSeasonSlot,
    retiredFiniteSlots: FINITE_RUN_SLOTS.filter((finiteSlot) =>
      retiredFiniteSlots.has(finiteSlot)
    ),
    runs: nextRuns,
    stats: {
      ...current.stats,
      maxSurvivorDaysSurvived: survivorBest,
      survivorAchievementsUnlocked,
    },
  })
}

export function markSurvivorAchievementCelebrationSeen(
  profileId: string,
  achievementId: string
): boolean {
  const current = loadSavedRunProfile(profileId)
  const unlock = current.stats.survivorAchievementsUnlocked[achievementId]
  if (!unlock || unlock.celebrationSeen) return false
  return saveRunProfile({
    ...current,
    stats: {
      ...current.stats,
      survivorAchievementsUnlocked: {
        ...current.stats.survivorAchievementsUnlocked,
        [achievementId]: { ...unlock, celebrationSeen: true },
      },
    },
  })
}

export function getSavedRun(profileId: string, slot: SavedRunSlot): SavedSeasonSnapshot | null {
  return loadSavedRunProfile(profileId).runs[slot] ?? null
}

export function getFiniteSeasonRunChoices(profile: SavedRunProfile): FiniteSeasonRunChoice[] {
  const choices = FINITE_RUN_SLOTS.flatMap((slot) => {
    const snapshot = profile.runs[slot]
    return snapshot ? [{ slot, snapshot }] : []
  }).sort((a, b) => Date.parse(b.snapshot.savedAt) - Date.parse(a.snapshot.savedAt))

  if (profile.activeSeasonSlot) {
    const active = choices.find((choice) => choice.slot === profile.activeSeasonSlot)
    if (active) return [active]
  }
  return choices
}

export function activateFiniteSeasonRun(
  profileId: string,
  slot: FiniteSeasonRunSlot
): boolean {
  const current = loadSavedRunProfile(profileId)
  const chosen = current.runs[slot]
  if (!chosen) return false

  const nextRuns = { ...current.runs }
  const retiredFiniteSlots = new Set(current.retiredFiniteSlots)
  for (const finiteSlot of FINITE_RUN_SLOTS) {
    if (finiteSlot === slot) {
      retiredFiniteSlots.delete(finiteSlot)
      continue
    }
    if (current.runs[finiteSlot]) {
      retiredFiniteSlots.add(finiteSlot)
      delete nextRuns[finiteSlot]
    }
  }
  const runId = getRunId(chosen)
  return saveRunProfile({
    ...current,
    activeRunId: runId,
    lastPlayedRunId: runId,
    activeSeasonSlot: slot,
    retiredFiniteSlots: FINITE_RUN_SLOTS.filter((finiteSlot) =>
      retiredFiniteSlots.has(finiteSlot)
    ),
    runs: nextRuns,
    savedAt: new Date().toISOString(),
  })
}

export function getLastPlayedRun(profileId: string): SavedSeasonSnapshot | null {
  const profile = loadSavedRunProfile(profileId)
  const runs = Object.values(profile.runs).filter(Boolean) as SavedSeasonSnapshot[]
  if (profile.lastPlayedRunId) {
    const match = runs.find((snapshot) => getRunId(snapshot) === profile.lastPlayedRunId)
    if (match) return match
  }
  return runs.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0] ?? null
}

export function clearSavedRun(profileId: string, mode: SavedRunSlot): void {
  const current = loadSavedRunProfile(profileId)
  const nextRuns = { ...current.runs }
  delete nextRuns[mode]
  const removedRunId = getRunId(current.runs[mode])
  saveRunProfile({
    ...current,
    runs: nextRuns,
    activeRunId: current.activeRunId === removedRunId ? null : current.activeRunId,
    lastPlayedRunId: current.lastPlayedRunId === removedRunId ? null : current.lastPlayedRunId,
    activeSeasonSlot: current.activeSeasonSlot === mode ? null : current.activeSeasonSlot,
    savedAt: new Date().toISOString(),
  })
}

export function clearSavedRunProfile(profileId: string): void {
  try {
    localStorage.removeItem(savedRunsKeyForProfile(profileId))
    localStorage.removeItem(savedStateKeyForProfile(profileId))
    for (const slot of ALL_RUN_SLOTS) {
      localStorage.removeItem(savedRunSlotKeyForProfile(profileId, slot))
    }
  } catch {
    // Best-effort cleanup; profile deletion must still complete if storage is unavailable.
  }
}

export function clearSeasonSnapshot(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore.
  }
}
