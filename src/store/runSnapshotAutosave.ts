import {
  getSavedRunSlot,
  type SavedRunSlot,
  type SavedSeasonSnapshot,
} from './saveStatePersistence'

export const RUN_SNAPSHOT_AUTOSAVE_DELAY_MS = 120

type SaveRunSnapshot = (profileId: string, snapshot: SavedSeasonSnapshot) => boolean

type PendingSave = {
  profileId: string
  slot: SavedRunSlot
  snapshot: SavedSeasonSnapshot
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

/**
 * Coalesces a burst of Redux updates into one durable save per profile/run slot.
 *
 * The first change arms a short timer instead of resetting it on every update,
 * so continuous gameplay is still persisted regularly. The latest snapshot wins
 * inside that window. `flush()` remains synchronous for lifecycle boundaries
 * such as document visibility loss.
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
    for (const save of saves) {
      saveRunSnapshot(save.profileId, save.snapshot)
    }
  }

  const schedule = (profileId: string, snapshot: SavedSeasonSnapshot) => {
    const slot = getSavedRunSlot(snapshot.game)
    pending.set(pendingKey(profileId, slot), { profileId, slot, snapshot })
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
