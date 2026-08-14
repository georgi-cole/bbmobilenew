let suspensionDepth = 0

export function isRunAutosaveSuspended(): boolean {
  return suspensionDepth > 0
}

/**
 * Redux store subscribers run after every dispatch. Hydrating a saved run uses
 * several slice-level dispatches, so without this gate autosave can persist a
 * temporarily mixed snapshot (new game slice + previous profile's social/finale
 * slices). Keep the whole hydration sequence invisible to run autosave.
 */
export function withRunAutosaveSuspended<T>(operation: () => T): T {
  suspensionDepth += 1
  try {
    return operation()
  } finally {
    suspensionDepth = Math.max(0, suspensionDepth - 1)
  }
}
