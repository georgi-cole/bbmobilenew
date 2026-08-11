import {
  getSavedRunSlot,
  savedRunsKeyForProfile,
  type SavedRunSlot,
  type SavedSeasonSnapshot,
} from './saveStatePersistence'

export const RUN_SNAPSHOT_AUTOSAVE_DELAY_MS = 0

let autosaveSuspensionDepth = 0
const invalidationGeneration = new Map<string, number>()

export function suspendRunSnapshotAutosave(): () => void {
  autosaveSuspensionDepth += 1
  let released = false
  return () => {
    if (released) return
    released = true
    autosaveSuspensionDepth = Math.max(0, autosaveSuspensionDepth - 1)
  }
}

export function isRunSnapshotAutosaveSuspended(): boolean {
  return autosaveSuspensionDepth > 0
}

export function invalidateRunSnapshotAutosaves(profileId: string): void {
  invalidationGeneration.set(profileId, (invalidationGeneration.get(profileId) ?? 0) + 1)
}

function getInvalidationGeneration(profileId: string): number {
  return invalidationGeneration.get(profileId) ?? 0
}

type SaveRunSnapshot = (profileId: string, snapshot: SavedSeasonSnapshot) => boolean

type PendingSave = {
  profileId: string
  slot: SavedRunSlot
  snapshot: SavedSeasonSnapshot
  persistenceRevision: string | null | undefined
  invalidationGeneration: number
}

export interface RunSnapshotAutosaveController {
  schedule(profileId: string, snapshot: SavedSeasonSnapshot): void
  flush(): void
  discard(profileId: string, slot: SavedRunSlot): void
  pendingCount(): number
}

function pendingKey(profileId: string, slot: SavedRunSlot): string {
  return `${profileId}:${slot}`
}

function snapshotRunId(snapshot: SavedSeasonSnapshot): string | null {
  return snapshot.game.runId ?? snapshot.game.gameId ?? null
}

/**
 * Read only the two run-identity fields from the small split-profile metadata.
 * This avoids reading/copying a potentially large campaign slot on the Play
 * path while still detecting explicit clears/replacements of the active run.
 */
function readPersistenceRevision(profileId: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(savedRunsKeyForProfile(profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      activeRunId?: unknown
      lastPlayedRunId?: unknown
    }
    const activeRunId = typeof parsed.activeRunId === 'string' ? parsed.activeRunId : ''
    const lastPlayedRunId = typeof parsed.lastPlayedRunId === 'string' ? parsed.lastPlayedRunId : ''
    return `${activeRunId}\u0000${lastPlayedRunId}`
  } catch {
    // Storage-unavailable or malformed legacy metadata should keep the existing
    // best-effort save behavior. The persistence layer owns recovery/reporting.
    return undefined
  }
}

/**
 * Coalesces a synchronous burst of Redux updates into one durable save per
 * profile/run slot without keeping gameplay progress pending longer than the
 * current JavaScript task. The latest snapshot wins inside that burst and
 * `flush()` remains synchronous for lifecycle boundaries such as visibility loss.
 *
 * The small profile metadata's active/last run identity acts as a persistence
 * revision. If another flow clears or replaces the active run after a snapshot
 * was queued, stale work is ignored instead of resurrecting that run. Unrelated
 * metadata-only changes, such as achievement bookkeeping, do not invalidate it.
 */
export function createRunSnapshotAutosaveController(
  saveRunSnapshot: SaveRunSnapshot,
  delayMs = RUN_SNAPSHOT_AUTOSAVE_DELAY_MS
): RunSnapshotAutosaveController {
  const pending = new Map<string, PendingSave>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (pending.size === 0) return

    const saves = [...pending.values()]
    pending.clear()

    // Freeze the persisted revision once per profile before writing anything.
    // This lets multiple legitimate slots flush together without the first save
    // making the second look stale merely because it updated shared metadata.
    const persistedRevisions = new Map<string, string | null | undefined>()
    for (const save of saves) {
      if (!persistedRevisions.has(save.profileId)) {
        persistedRevisions.set(save.profileId, readPersistenceRevision(save.profileId))
      }
    }

    for (const save of saves) {
      if (save.invalidationGeneration !== getInvalidationGeneration(save.profileId)) continue
      const currentRevision = persistedRevisions.get(save.profileId)
      if (
        save.persistenceRevision !== undefined &&
        currentRevision !== undefined &&
        currentRevision !== save.persistenceRevision
      ) {
        continue
      }
      saveRunSnapshot(save.profileId, save.snapshot)
    }
  }

  const schedule = (profileId: string, snapshot: SavedSeasonSnapshot) => {
    const slot = getSavedRunSlot(snapshot.game)
    const key = pendingKey(profileId, slot)
    const existing = pending.get(key)
    const sameRun = existing && snapshotRunId(existing.snapshot) === snapshotRunId(snapshot)
    pending.set(key, {
      profileId,
      slot,
      snapshot,
      // Rapid Redux updates from one physical Play press reuse the same tiny
      // revision lookup. A genuinely new run re-reads it so a fresh season can
      // save normally after an explicit clear in the same JavaScript task.
      persistenceRevision: sameRun
        ? existing.persistenceRevision
        : readPersistenceRevision(profileId),
      invalidationGeneration: getInvalidationGeneration(profileId),
    })
    if (timer !== null) return
    timer = setTimeout(flush, Math.max(0, delayMs))
  }

  const discard = (profileId: string, slot: SavedRunSlot) => {
    pending.delete(pendingKey(profileId, slot))
    if (pending.size === 0 && timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule,
    flush,
    discard,
    pendingCount: () => pending.size,
  }
}
