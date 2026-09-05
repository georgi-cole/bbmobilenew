/**
 * activityService — channel-based activity routing for bbmobilenew.
 *
 * Events produced by social actions, TV messages, and the Diary Room are
 * tagged with one or more destination channels so each consumer only
 * receives the events it cares about:
 *
 *   recentActivity — Social modal Recent Activity panel (sessionLogs).
 *   tv             — TV-zone viewport one-liner (shown in the BB TV bezel).
 *   dr             — Diary Room log (concise manual-interaction summaries).
 *   mainLog        — Main-screen TVLog strip below the TV viewport.
 *
 * Backward-compatibility rule: TvEvent entries that carry NO channels field
 * are treated as legacy events and remain visible everywhere (mainLog + tv),
 * except for the one explicit Public Mode status message that belongs only in
 * the log.
 */

/** Destination channels an activity event can be routed to. */
export type ActivityChannel = 'recentActivity' | 'tv' | 'dr' | 'mainLog'

/** Origin of an activity event — user gesture vs. background/AI system. */
export type ActivitySource = 'manual' | 'system'

// ── Visibility predicates ─────────────────────────────────────────────────

type ActivityVisibilityEvent = {
  channels?: ActivityChannel[]
  type?: string
  text?: string
  meta?: { suppressTv?: boolean; [key: string]: unknown }
}

const PUBLIC_MODE_STATUS_TEMPLATE_ID = 'season.public-mode-rule'
const PUBLIC_MODE_STATUS_TEXT = /^\s*\[Rules\]\s*Public mode:\s*(?:ON|OFF)\s*$/i

/**
 * The season-start Public Mode ON/OFF status is configuration information,
 * not an in-world TV beat. This is intentionally the only new service-message
 * exclusion: do not infer or suppress any other rule/system/social copy.
 */
export function isServiceConfigurationEvent(ev: ActivityVisibilityEvent): boolean {
  if (ev.meta?.broadcastTemplateId === PUBLIC_MODE_STATUS_TEMPLATE_ID) return true
  return typeof ev.text === 'string' && PUBLIC_MODE_STATUS_TEXT.test(ev.text)
}

/**
 * The original season-start copy is replaced by the staged onboarding welcome.
 * Hide only the exact legacy defaults so Broadcast Manager customisations are
 * not swallowed by this compatibility bridge.
 */
export function isLegacySeasonWelcomeEvent(ev: ActivityVisibilityEvent): boolean {
  if (typeof ev.text !== 'string') return false
  return (
    /^Welcome to The Big Eye hub! 🏠 Season \d+ is about to begin\.$/.test(ev.text) ||
    /^The Big Eye hub is now filled with love! 🏠 Season \d+ is about to begin\. Get some chocolate and press play\.$/.test(
      ev.text
    )
  )
}

/**
 * Back 2 the Game completion is a result/log message, not a new shock trigger.
 * Keeping it out of the TV viewport prevents TvZone's legacy Battle Back text
 * fallback from interpreting the winner event as a second fullscreen announcement.
 */
export function isBattleBackReturnResultEvent(ev: ActivityVisibilityEvent): boolean {
  return (
    ev.type === 'twist' &&
    typeof ev.text === 'string' &&
    /won\s+back\s*2\s+the\s+game.*returns?\s+to\s+the\s+game/i.test(ev.text)
  )
}

/**
 * Returns true when the event should appear in the main-screen TVLog strip.
 *
 * Rules:
 *  - Replaced legacy welcome defaults: false; the staged welcome supersedes them.
 *  - No channels (legacy event): visible everywhere → true.
 *  - Has channels: visible only if 'mainLog' or 'tv' is included.
 */
export function isVisibleInMainLog(ev: ActivityVisibilityEvent): boolean {
  if (isLegacySeasonWelcomeEvent(ev)) return false
  if (!ev.channels) return true
  return ev.channels.includes('mainLog') || ev.channels.includes('tv')
}

/**
 * Returns true when the event should appear in the TV-zone viewport.
 *
 * The only new log-only exception is the exact Public Mode status. Normal game
 * and social events retain their authored routing; no prefix/wording classifier
 * is allowed to hide them.
 */
export function isVisibleOnTv(ev: ActivityVisibilityEvent): boolean {
  // Broadcast Manager's "Force to TV" is an explicit authoring instruction.
  // It must win over compatibility filters that normally keep service and
  // legacy messages in the log only.
  if (ev.meta?.forceOnTv === true) return true
  if (isServiceConfigurationEvent(ev)) return false
  if (isLegacySeasonWelcomeEvent(ev)) return false
  if (isBattleBackReturnResultEvent(ev)) return false
  if (ev.meta?.suppressTv === true) return false
  if (!ev.channels) return true
  return ev.channels.includes('tv') || ev.channels.includes('mainLog')
}

/**
 * Returns true when the event should appear in the Diary Room log.
 *
 * Rules:
 *  - Has channels including 'dr' AND source === 'manual': visible in DR.
 *  - Legacy diary events (no channels, type === 'diary'): still visible.
 *  - All other events: not visible in DR.
 */
export function isVisibleInDr(ev: {
  channels?: ActivityChannel[]
  source?: ActivitySource
  type?: string
}): boolean {
  if (ev.channels) {
    return ev.channels.includes('dr') && ev.source === 'manual'
  }
  // Legacy fallback: plain diary-type events without channel tags.
  return ev.type === 'diary'
}

// ── Summary builder ───────────────────────────────────────────────────────

/**
 * Build a concise one-line Diary Room summary for a completed social session.
 *
 * @param week         Current game week number.
 * @param count        Total number of manual social actions performed.
 * @param successCount Number of successful actions.
 * @param failCount    Number of failed actions.
 */
export function buildDrSessionSummary(
  week: number,
  count: number,
  successCount: number,
  failCount: number
): string {
  const sLabel = successCount === 1 ? 'success' : 'successes'
  const fLabel = failCount === 1 ? 'failure' : 'failures'
  return `📋 Day ${week}: ${count} social action(s) — ${successCount} ${sLabel}, ${failCount} ${fLabel}.`
}
