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
 * except for explicitly classified result-only or service/configuration events
 * that belong in the log rather than the faux TV.
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

const LOG_ONLY_BROADCAST_TEMPLATE_IDS = new Set([
  'season.public-mode-rule',
  'survival.rules',
])

/**
 * Service/configuration copy is useful history, but it is not an in-world TV
 * event. Keep current and legacy [Rules]/[System]/[Config] messages in the log
 * only. The explicit template IDs cover the known production rules messages;
 * the prefix fallback prevents a future service line from accidentally taking
 * over the faux TV merely because it omitted routing metadata.
 */
export function isServiceConfigurationEvent(ev: ActivityVisibilityEvent): boolean {
  const templateId =
    typeof ev.meta?.broadcastTemplateId === 'string' ? ev.meta.broadcastTemplateId : null
  if (templateId && LOG_ONLY_BROADCAST_TEMPLATE_IDS.has(templateId)) return true
  return typeof ev.text === 'string' && /^\s*\[(?:Rules|System|Config)\]\s*/i.test(ev.text)
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
 *  - No channels (legacy event): visible everywhere → true.
 *  - Has channels: visible only if 'mainLog' or 'tv' is included.
 */
export function isVisibleInMainLog(ev: ActivityVisibilityEvent): boolean {
  if (!ev.channels) return true
  return ev.channels.includes('mainLog') || ev.channels.includes('tv')
}

/**
 * Returns true when the event should appear in the TV-zone viewport.
 *
 * Rules:
 *  - Service/configuration messages: false; they remain available to mainLog.
 *  - Back 2 the Game winner/result event: false; it remains available to mainLog.
 *  - No channels (legacy event): visible everywhere → true.
 *  - Has channels: visible only if 'tv' or 'mainLog' is included.
 */
export function isVisibleOnTv(ev: ActivityVisibilityEvent): boolean {
  if (isServiceConfigurationEvent(ev)) return false
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
