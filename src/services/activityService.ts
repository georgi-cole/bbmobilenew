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
 * are treated as legacy events and remain visible everywhere (mainLog + tv).
 */

/** Destination channels an activity event can be routed to. */
export type ActivityChannel = 'recentActivity' | 'tv' | 'dr' | 'mainLog';

/** Origin of an activity event — user gesture vs. background/AI system. */
export type ActivitySource = 'manual' | 'system';

// ── Visibility predicates ─────────────────────────────────────────────────

/**
 * Returns true when the event should appear in the main-screen TVLog strip.
 *
 * Rules:
 *  - No channels (legacy event): visible everywhere → true.
 *  - Has channels: visible only if 'mainLog' or 'tv' is included.
 */
export function isVisibleInMainLog(ev: { channels?: ActivityChannel[] }): boolean {
  if (!ev.channels) return true;
  return ev.channels.includes('mainLog') || ev.channels.includes('tv');
}

/**
 * Returns true when the event should appear in the TV-zone viewport.
 *
 * Rules:
 *  - No channels (legacy event): visible everywhere → true.
 *  - Has channels: visible only if 'tv' or 'mainLog' is included.
 */
export function isVisibleOnTv(ev: { channels?: ActivityChannel[] }): boolean {
  if (!ev.channels) return true;
  return ev.channels.includes('tv') || ev.channels.includes('mainLog');
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
  channels?: ActivityChannel[];
  source?: ActivitySource;
  type?: string;
}): boolean {
  if (ev.channels) {
    return ev.channels.includes('dr') && ev.source === 'manual';
  }
  // Legacy fallback: plain diary-type events without channel tags.
  return ev.type === 'diary';
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
  failCount: number,
): string {
  const sLabel = successCount === 1 ? 'success' : 'successes';
  const fLabel = failCount === 1 ? 'failure' : 'failures';
  return `📋 Week ${week}: ${count} social action(s) — ${successCount} ${sLabel}, ${failCount} ${fLabel}.`;
}
