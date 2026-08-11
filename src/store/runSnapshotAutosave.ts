import {
  getSavedRunSlot,
  savedRunSlotKeyForProfile,
  type SavedRunSlot,
  type SavedSeasonSnapshot,
} from './saveStatePersistence'

export const RUN_SNAPSHOT_AUTOSAVE_DELAY_MS = 0

type SaveRunSnapshot = (profileId: string, snapshot: SavedSeasonSnapshot) => boolean

type PendingSave = {
  profileId: string
  slot: SavedRunSlot
  snapshot: SavedSeasonSnapshot
  persistenceRevision: string | null | undefined
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

function readPersistenceRevision(
  profileId: string,
  slot: SavedRunSlot
): string | null | undefined {
  try {
    return localStorage.getItem(savedRunSlotKeyForProfile(profileId, slot))
  } catch {
    // Storage-unavailable environments should keep the existing best-effort save
    // behavior. The persistence layer will report the actual write failure.
    return undefined
  }
}

/**
 * Coalesces a synchronous burst of Redux updates into one durable save per
 * profile/run slot without keeping gameplay progress pending longer than the
 * current JavaScript task. The latest snapshot wins inside that burst and
 * `flush()` remains synchronous for lifecycle boundaries such as visibility loss.
 *
 * The current split run-slot value also acts as a persistence revision. If
 * another flow clears or replaces that exact run after a snapshot was queued,
 * the revision changes and the stale timer is ignored instead of resurrecting
 * the just-cleared save. Metadata-only changes do not invalidate gameplay work.
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

    // Freeze persisted revisions before writing anything. This lets multiple
    // legitimate slots flush together without one save affecting another.
    const persistedRevisions = new Map<string, string | null | undefined>()
    for (const save of saves) {
      const key = pendingKey(save.profileId, save.slot)
      persistedRevisions.set(key, readPersistenceRevision(save.profileId, save.slot))
    }

    for (const save of saves) {
      const currentRevision = persistedRevisions.get(pendingKey(save.profileId, save.slot))
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
    pending.set(pendingKey(profileId, slot), {
      profileId,
      slot,
      snapshot,
      persistenceRevision: readPersistenceRevision(profileId, slot),
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
