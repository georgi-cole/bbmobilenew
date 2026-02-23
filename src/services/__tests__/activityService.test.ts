/**
 * Unit tests for src/services/activityService.ts
 *
 * Covers:
 *  1. A subscriber on a matching channel receives the published event.
 *  2. A subscriber on a non-matching channel does NOT receive the event.
 *  3. Events with multiple channels fan-out to all matching subscribers.
 *  4. Unsubscribing prevents future delivery.
 *  5. reset() removes all subscribers so nothing is called after reset.
 *  6. Multiple subscribers on the same channel all receive the event.
 *  7. DR log consumer only receives events where channels includes 'dr'.
 *  8. DR log consumer filters for source === 'manual'.
 *  9. mainLog consumer only receives events where channels includes 'mainLog'.
 * 10. A subscriber receives the full event object (channels + source + meta).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publish, subscribe, reset } from '../activityService';
import type { ActivityEvent } from '../activityService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    text: 'Test event',
    channels: ['recentActivity'],
    source: 'manual',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  reset();
});

describe('activityService – basic routing', () => {
  it('delivers the event to a subscriber on a matching channel', () => {
    const cb = vi.fn();
    subscribe(['recentActivity'], cb);
    const event = makeEvent({ channels: ['recentActivity'] });
    publish(event);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(event);
  });

  it('does not deliver the event to a subscriber on a non-matching channel', () => {
    const cb = vi.fn();
    subscribe(['mainLog'], cb);
    publish(makeEvent({ channels: ['recentActivity'] }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('fans out to all matching channels when an event targets multiple channels', () => {
    const tvCb = vi.fn();
    const drCb = vi.fn();
    subscribe(['tv'], tvCb);
    subscribe(['dr'], drCb);
    publish(makeEvent({ channels: ['tv', 'dr'] }));
    expect(tvCb).toHaveBeenCalledTimes(1);
    expect(drCb).toHaveBeenCalledTimes(1);
  });

  it('calls all subscribers on the same channel', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    subscribe(['recentActivity'], cb1);
    subscribe(['recentActivity'], cb2);
    publish(makeEvent({ channels: ['recentActivity'] }));
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('passes the full event object to the subscriber', () => {
    const cb = vi.fn();
    subscribe(['mainLog'], cb);
    const event = makeEvent({ channels: ['mainLog'], source: 'system', meta: { week: 3 } });
    publish(event);
    expect(cb).toHaveBeenCalledWith(event);
    const received = cb.mock.calls[0][0] as ActivityEvent;
    expect(received.source).toBe('system');
    expect(received.meta?.week).toBe(3);
  });
});

describe('activityService – unsubscribe', () => {
  it('does not deliver events after unsubscribing', () => {
    const cb = vi.fn();
    const unsubscribe = subscribe(['tv'], cb);
    unsubscribe();
    publish(makeEvent({ channels: ['tv'] }));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('activityService – reset', () => {
  it('clears all subscribers so nothing is called after reset', () => {
    const cb = vi.fn();
    subscribe(['recentActivity', 'tv', 'dr', 'mainLog'], cb);
    reset();
    publish(makeEvent({ channels: ['recentActivity', 'tv', 'dr', 'mainLog'] }));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('activityService – DR log filtering pattern', () => {
  it('DR consumer receives events with channels including "dr"', () => {
    const drCb = vi.fn();
    subscribe(['dr'], drCb);
    publish(makeEvent({ channels: ['dr'], source: 'manual', text: 'Player did X' }));
    expect(drCb).toHaveBeenCalledTimes(1);
  });

  it('DR consumer does NOT receive events that omit "dr" from channels', () => {
    const drCb = vi.fn();
    subscribe(['dr'], drCb);
    publish(makeEvent({ channels: ['recentActivity'], source: 'manual', text: 'Background event' }));
    expect(drCb).not.toHaveBeenCalled();
  });

  it('DR consumer can filter source === "manual" inside the callback', () => {
    const manualEvents: ActivityEvent[] = [];
    subscribe(['dr'], (event) => {
      if (event.source === 'manual') manualEvents.push(event);
    });
    publish(makeEvent({ channels: ['dr'], source: 'manual', text: 'Manual interaction' }));
    publish(makeEvent({ channels: ['dr'], source: 'system', text: 'System background event' }));
    expect(manualEvents).toHaveLength(1);
    expect(manualEvents[0].text).toBe('Manual interaction');
  });
});

describe('activityService – mainLog consumer', () => {
  it('mainLog consumer only receives events that include "mainLog" in channels', () => {
    const mainLogCb = vi.fn();
    subscribe(['mainLog'], mainLogCb);
    publish(makeEvent({ channels: ['tv'] }));
    expect(mainLogCb).not.toHaveBeenCalled();
    publish(makeEvent({ channels: ['mainLog'] }));
    expect(mainLogCb).toHaveBeenCalledTimes(1);
  });
});
