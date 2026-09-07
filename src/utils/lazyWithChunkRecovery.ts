import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const CHUNK_RECOVERY_QUERY = 'bbmobile-recovery'
const CHUNK_RECOVERY_STORAGE_KEY = 'bbmobilenew:chunk-recovery'
const RECOVERY_COOLDOWN_MS = 30_000

/**
 * Browsers can keep an old entry bundle while GitHub Pages has already
 * replaced its hashed lazy-route chunks. Android is especially likely to
 * expose this after a slow or interrupted update. These are the errors
 * produced when that old bundle asks for a chunk that no longer exists.
 */
export function isDynamicImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i.test(
    message
  )
}

function hasRecentRecoveryAttempt(): boolean {
  if (typeof window === 'undefined') return true

  const url = new URL(window.location.href)
  if (url.searchParams.has(CHUNK_RECOVERY_QUERY)) return true

  try {
    const attemptedAt = Number(sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY))
    return Number.isFinite(attemptedAt) && Date.now() - attemptedAt < RECOVERY_COOLDOWN_MS
  } catch {
    return false
  }
}

function reloadWithFreshEntryBundle(): boolean {
  if (typeof window === 'undefined' || hasRecentRecoveryAttempt()) return false

  try {
    sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(Date.now()))
  } catch {
    // The URL marker below still prevents a reload loop when storage is blocked.
  }

  const url = new URL(window.location.href)
  url.searchParams.set(CHUNK_RECOVERY_QUERY, String(Date.now()))
  try {
    window.location.replace(url.toString())
    return true
  } catch {
    return false
  }
}

/**
 * React.lazy with one automatic recovery attempt for stale hashed chunks.
 * Ordinary module errors still reach the route error boundary unchanged.
 */
export function lazyWithChunkRecovery<T extends ComponentType<object>>(
  loader: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await loader()
    } catch (error) {
      if (isDynamicImportFailure(error) && reloadWithFreshEntryBundle()) {
        // Navigation replaces this document. Keep the rejected lazy promise
        // pending so React does not briefly paint a misleading error screen.
        return new Promise<never>(() => {})
      }
      throw error
    }
  })
}
