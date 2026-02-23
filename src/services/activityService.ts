/**
 * ActivityService — lightweight channel-based pub/sub routing for game events.
 *
 * Events carry a `channels` array so a single publish call can fan-out to
 * multiple consumers (e.g. recentActivity + tv) without each producer needing
 * to know which consumers exist.
 *
 * Supported channels
 * ------------------
 * 'recentActivity'  Per-action events shown in the Social modal log.
 * 'tv'              Single TV-zone message (e.g. the close summary).
 * 'dr'              Diary Room log — only concise manual-interaction entries.
 * 'mainLog'         Main-screen event log.
 *
 * Source convention
 * -----------------
 * source: 'manual'  — user-initiated interaction (player selects target + action).
 * source: 'system'  — background / autonomous engine events.
 *
 * DR log consumers should filter for source === 'manual' to avoid receiving
 * background engine events or the full recentActivity stream.
 */

export type ActivityChannel = 'recentActivity' | 'tv' | 'dr' | 'mainLog';

export interface ActivityEvent {
  /** Human-readable message text. */
  text: string;
  /** Channels this event should be delivered to. */
  channels: ActivityChannel[];
  /**
   * 'manual'  — triggered by a user selecting a target and action.
   * 'system'  — triggered autonomously by the AI engine or background logic.
   */
  source?: 'manual' | 'system';
  /** Optional free-form metadata (week number, actor/target ids, etc.). */
  meta?: Record<string, unknown>;
}

export type ActivitySubscriber = (event: ActivityEvent) => void;

/** Subscriber registry keyed by channel. */
const _registry = new Map<ActivityChannel, Set<ActivitySubscriber>>();

/**
 * Publish an event to all subscribers whose channel list intersects with
 * `event.channels`. Each matching subscriber receives the full event object.
 */
export function publish(event: ActivityEvent): void {
  for (const channel of event.channels) {
    const subs = _registry.get(channel);
    if (subs) {
      for (const sub of subs) {
        sub(event);
      }
    }
  }
}

/**
 * Subscribe to one or more channels.
 *
 * @param channels  Array of channel names to listen on.
 * @param callback  Called once per matching published event.
 * @returns         Unsubscribe function — call it to remove the listener.
 */
export function subscribe(
  channels: ActivityChannel[],
  callback: ActivitySubscriber,
): () => void {
  for (const channel of channels) {
    if (!_registry.has(channel)) {
      _registry.set(channel, new Set());
    }
    _registry.get(channel)!.add(callback);
  }

  return () => {
    for (const channel of channels) {
      _registry.get(channel)?.delete(callback);
    }
  };
}

/**
 * Reset all subscribers — intended for use in tests to prevent cross-test
 * pollution without needing to import and re-initialise the module.
 */
export function reset(): void {
  _registry.clear();
}
