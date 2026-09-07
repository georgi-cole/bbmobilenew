import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const CHUNK_RECOVERY_QUERY = 'bbmobile-recovery'
const CHUNK_RECOVERY_STORAGE_KEY = 'bbmobilenew:chunk-recovery'
const RECOVERY_STATE_VERSION = 1
const RECOVERY_WINDOW_MS = 2 * 60_000
const MAX_RECOVERY_ATTEMPTS = 2

type ChunkRecoveryState = {
  version: typeof RECOVERY_STATE_VERSION
  startedAt: number
  attempts: number
}

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

function readRecoveryState(): ChunkRecoveryState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY)
    if (!raw) return null

    // Accept the old timestamp-only value written by the first recovery
    // implementation, so an upgrade cannot accidentally create a reload loop.
    const legacyTimestamp = Number(raw)
    if (Number.isFinite(legacyTimestamp)) {
      return {
        version: RECOVERY_STATE_VERSION,
        startedAt: legacyTimestamp,
        attempts: 1,
      }
    }

    const parsed = JSON.parse(raw) as Partial<ChunkRecoveryState>
    if (
      parsed.version !== RECOVERY_STATE_VERSION ||
      typeof parsed.startedAt !== 'number' ||
      typeof parsed.attempts !== 'number'
    ) {
      return null
    }
    return parsed as ChunkRecoveryState
  } catch {
    return null
  }
}

function writeRecoveryState(state: ChunkRecoveryState): void {
  try {
    sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The navigation fallback below remains available when storage is blocked.
  }
}

function clearRecoveryState(): void {
  try {
    sessionStorage.removeItem(CHUNK_RECOVERY_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

function getRecoveryStateForNextAttempt(): ChunkRecoveryState | null {
  const now = Date.now()
  const previous = readRecoveryState()
  if (previous && now - previous.startedAt < RECOVERY_WINDOW_MS) {
    if (previous.attempts >= MAX_RECOVERY_ATTEMPTS) return null
    return { ...previous, attempts: previous.attempts + 1 }
  }

  return {
    version: RECOVERY_STATE_VERSION,
    startedAt: now,
    attempts: 1,
  }
}

function getDeploymentRootUrl(): URL {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  return new URL('./', url)
}

/**
 * Fetch the current entry HTML without relying on the browser/CDN cache.
 * GitHub Pages replaces hashed assets on deployment, so navigating with a
 * stale cached entry can otherwise request a chunk that no longer exists.
 */
let recoveryPromise: Promise<boolean> | null = null

async function performFreshEntryRecovery(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const recoveryState = getRecoveryStateForNextAttempt()
  if (!recoveryState) return false
  writeRecoveryState(recoveryState)

  const freshUrl = getDeploymentRootUrl()
  freshUrl.searchParams.set(
    CHUNK_RECOVERY_QUERY,
    `${recoveryState.startedAt}-${recoveryState.attempts}`
  )

  try {
    const response = await fetch(freshUrl.toString(), {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    })
    if (!response.ok) throw new Error(`Fresh app entry returned HTTP ${response.status}`)

    const html = await response.text()
    if (!/<script\b[^>]*\bsrc=["'][^"']+\.js["'][^>]*>/i.test(html)) {
      throw new Error('Fresh app entry did not contain a module script')
    }

    // Replacing the document with the freshly fetched HTML avoids another
    // cache-controlled navigation and preserves the current hash route.
    document.open()
    document.write(html)
    document.close()
    return true
  } catch {
    // If the direct fetch is unavailable, retain the original navigation
    // fallback. The bounded attempt state prevents an infinite reload loop.
    try {
      window.location.replace(freshUrl.toString())
      return true
    } catch {
      return false
    }
  }
}

function reloadWithFreshEntryBundle(): Promise<boolean> {
  // Several lazy routes can reject during the same render when the entry is
  // stale. Share one recovery operation so they cannot race document.open().
  if (recoveryPromise) return recoveryPromise
  recoveryPromise = performFreshEntryRecovery()
  return recoveryPromise
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
      const result = await loader()
      clearRecoveryState()
      return result
    } catch (error) {
      if (isDynamicImportFailure(error) && (await reloadWithFreshEntryBundle())) {
        // Navigation replaces this document. Keep the rejected lazy promise
        // pending so React does not briefly paint a misleading error screen.
        return new Promise<never>(() => {})
      }
      throw error
    }
  })
}
