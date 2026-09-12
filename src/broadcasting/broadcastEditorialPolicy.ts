import type { TvEvent } from '../types'

export type BroadcastPresentationMode = 'log_only' | 'ambient' | 'foreground' | 'interrupt'
export type EditorialImportance = 'optional' | 'required' | 'critical'
export type EditorialSensitivity = 'public' | 'sensitive'

export interface BroadcastEditorialMetadata {
  /** Only explicitly optional stories participate in editorial suppression/ranking. */
  importance?: EditorialImportance
  presentationMode?: BroadcastPresentationMode
  category?: string
  sensitivity?: EditorialSensitivity
  storyKey?: string
  subjectIds?: string[]
  cooldownKey?: string
  expiresAt?: number
}

export interface BroadcastEditorialPolicyConfig {
  /** Optional cap across all optional stories in the supplied history window. */
  maxOptionalStories?: number
  /** Optional per-category caps in the supplied history window. */
  categoryBudgets?: Readonly<Record<string, number>>
  /** Optional story/cooldown-key suppression window. */
  cooldownMs?: number
}

export interface BroadcastEditorialDecision {
  eligible: boolean
  protected: boolean
  presentationMode: BroadcastPresentationMode
  reason:
    | 'legacy_or_required'
    | 'explicit_force_to_tv'
    | 'interrupt'
    | 'expired'
    | 'optional_budget'
    | 'category_budget'
    | 'cooldown'
    | 'optional_eligible'
}

function isEditorialMetadata(value: unknown): value is BroadcastEditorialMetadata {
  return typeof value === 'object' && value !== null
}

export function getBroadcastEditorialMetadata(
  event: Pick<TvEvent, 'meta'>
): BroadcastEditorialMetadata | undefined {
  const candidate = event.meta?.editorial
  return isEditorialMetadata(candidate) ? candidate : undefined
}

export function getBroadcastPresentationMode(
  event: Pick<TvEvent, 'meta'>
): BroadcastPresentationMode {
  const editorial = getBroadcastEditorialMetadata(event)
  if (editorial?.presentationMode) return editorial.presentationMode

  // Backward compatibility: pre-contract events remain on the legacy path.
  // The policy must never reinterpret missing metadata as optional airtime.
  return event.meta?.broadcastPriority === 'critical' ? 'interrupt' : 'foreground'
}

function isExplicitlyProtected(event: Pick<TvEvent, 'meta'>): boolean {
  const editorial = getBroadcastEditorialMetadata(event)
  return (
    event.meta?.forceOnTv === true ||
    event.meta?.broadcastPriority === 'critical' ||
    event.meta?.broadcastLevel === 'critical' ||
    editorial?.importance === 'required' ||
    editorial?.importance === 'critical' ||
    editorial?.presentationMode === 'interrupt'
  )
}

function optionalHistory(
  history: readonly TvEvent[],
  now: number,
  cooldownMs: number | undefined
): TvEvent[] {
  return history.filter((event) => {
    const editorial = getBroadcastEditorialMetadata(event)
    if (editorial?.importance !== 'optional') return false
    if (cooldownMs == null) return true
    return now - event.timestamp <= cooldownMs
  })
}

/**
 * Decides airtime for content that explicitly opts into the optional editorial
 * system. Producers remain authoritative for facts and required game guidance.
 * Legacy events and protected/interrupting events bypass optional budgets.
 */
export function evaluateBroadcastEditorialPolicy(
  event: TvEvent,
  history: readonly TvEvent[],
  config: BroadcastEditorialPolicyConfig = {},
  now = Date.now()
): BroadcastEditorialDecision {
  const editorial = getBroadcastEditorialMetadata(event)
  const presentationMode = getBroadcastPresentationMode(event)

  if (event.meta?.forceOnTv === true) {
    return { eligible: true, protected: true, presentationMode, reason: 'explicit_force_to_tv' }
  }

  if (presentationMode === 'interrupt') {
    return { eligible: true, protected: true, presentationMode, reason: 'interrupt' }
  }

  if (!editorial || editorial.importance !== 'optional' || isExplicitlyProtected(event)) {
    return { eligible: true, protected: true, presentationMode, reason: 'legacy_or_required' }
  }

  if (editorial.expiresAt != null && editorial.expiresAt <= now) {
    return { eligible: false, protected: false, presentationMode, reason: 'expired' }
  }

  const recentOptional = optionalHistory(history, now, config.cooldownMs)
  if (
    config.maxOptionalStories != null &&
    recentOptional.length >= Math.max(0, config.maxOptionalStories)
  ) {
    return { eligible: false, protected: false, presentationMode, reason: 'optional_budget' }
  }

  if (editorial.category && config.categoryBudgets?.[editorial.category] != null) {
    const used = recentOptional.filter(
      (candidate) => getBroadcastEditorialMetadata(candidate)?.category === editorial.category
    ).length
    if (used >= Math.max(0, config.categoryBudgets[editorial.category])) {
      return { eligible: false, protected: false, presentationMode, reason: 'category_budget' }
    }
  }

  const repetitionKey = editorial.cooldownKey ?? editorial.storyKey
  if (repetitionKey && config.cooldownMs != null && config.cooldownMs > 0) {
    const repeated = history.some((candidate) => {
      const candidateEditorial = getBroadcastEditorialMetadata(candidate)
      const candidateKey = candidateEditorial?.cooldownKey ?? candidateEditorial?.storyKey
      return candidateKey === repetitionKey && now - candidate.timestamp <= config.cooldownMs!
    })
    if (repeated) {
      return { eligible: false, protected: false, presentationMode, reason: 'cooldown' }
    }
  }

  return { eligible: true, protected: false, presentationMode, reason: 'optional_eligible' }
}
