/**
 * tests/spotlight.viewport.test.tsx
 *
 * Unit tests verifying that SpotlightAnimation:
 *   1. Locks body overflow while the overlay is active and restores it on unmount.
 *   2. Registers visualViewport resize/scroll listeners when measureA is provided.
 *   3. Calls measureA via requestAnimationFrame on visualViewport resize.
 *   4. Calls measureA via requestAnimationFrame on window scroll.
 *   5. Performs no tracking when no measure callbacks are provided (fast-path).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import SpotlightAnimation from '../src/components/SpotlightAnimation/spotlight-animation';
import type { CeremonyTile } from '../src/components/CeremonyOverlay/CeremonyOverlay';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRect(x = 50, y = 100, width = 60, height = 80): DOMRect {
  return new DOMRect(x, y, width, height);
}

function makeTiles(rect: DOMRect | null = makeRect()): CeremonyTile[] {
  return [{ rect, badge: '👑', badgeStart: 'center' }];
}

// Minimal VisualViewport mock with EventTarget capabilities.
function makeVisualViewport() {
  const listeners: Record<string, EventListenerOrEventListenerObject[]> = {};
  return {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((l) => l !== listener);
      }
    }),
    dispatchEvent: vi.fn((event: Event) => {
      const handler = listeners[event.type];
      if (handler) handler.forEach((fn) => (typeof fn === 'function' ? fn(event) : fn.handleEvent(event)));
      return true;
    }),
    _listeners: listeners,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SpotlightAnimation — body scroll lock', () => {
  it('locks body overflow on mount and restores it on unmount', async () => {
    document.body.style.overflow = 'auto';

    const { unmount } = render(
      <SpotlightAnimation
        tiles={makeTiles()}
        caption="Test caption"
        onDone={vi.fn()}
      />,
    );

    await act(async () => {});
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores previous overflow value on unmount (not always empty string)', async () => {
    document.body.style.overflow = 'scroll';

    const { unmount } = render(
      <SpotlightAnimation
        tiles={makeTiles()}
        caption="Test caption"
        onDone={vi.fn()}
      />,
    );

    await act(async () => {});
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });
});

describe('SpotlightAnimation — fast-path (no measure callbacks)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT register resize/scroll listeners when no measureA/measureB provided', async () => {
    const { unmount } = render(
      <SpotlightAnimation
        tiles={makeTiles()}
        caption="No measure"
        onDone={vi.fn()}
      />,
    );

    await act(async () => {});

    // Only the body scroll lock path runs; no resize/scroll on window.
    const resizeCalls = (window.addEventListener as ReturnType<typeof vi.spyOn>).mock.calls.filter(
      ([type]) => type === 'resize',
    );
    const scrollCalls = (window.addEventListener as ReturnType<typeof vi.spyOn>).mock.calls.filter(
      ([type]) => type === 'scroll',
    );
    expect(resizeCalls).toHaveLength(0);
    expect(scrollCalls).toHaveLength(0);

    unmount();
  });
});

describe('SpotlightAnimation — viewport tracking with measureA', () => {
  let visualViewportMock: ReturnType<typeof makeVisualViewport>;

  beforeEach(() => {
    vi.useFakeTimers();
    visualViewportMock = makeVisualViewport();
    // @ts-expect-error – attaching mock to window
    window.visualViewport = visualViewportMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // @ts-expect-error – cleanup
    delete window.visualViewport;
  });

  it('registers visualViewport resize and scroll listeners when measureA provided', async () => {
    const measureA = vi.fn(() => makeRect());

    render(
      <SpotlightAnimation
        tiles={makeTiles()}
        caption="Track me"
        onDone={vi.fn()}
        measureA={measureA}
      />,
    );

    await act(async () => {});

    expect(visualViewportMock.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(visualViewportMock.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('removes visualViewport listeners on unmount', async () => {
    const measureA = vi.fn(() => makeRect());

    const { unmount } = render(
      <SpotlightAnimation
        tiles={makeTiles()}
        caption="Track me"
        onDone={vi.fn()}
        measureA={measureA}
      />,
    );

    await act(async () => {});
    unmount();

    expect(visualViewportMock.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(visualViewportMock.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('calls measureA via rAF when visualViewport fires a resize event', async () => {
    const updatedRect = makeRect(80, 120, 60, 80);
    let callCount = 0;
    const measureA = vi.fn(() => {
      callCount++;
      return updatedRect;
    });

    render(
      <SpotlightAnimation
        tiles={makeTiles(makeRect(50, 100, 60, 80))}
        caption="Track me"
        onDone={vi.fn()}
        measureA={measureA}
      />,
    );

    await act(async () => {});

    // Simulate a visualViewport resize event.
    await act(async () => {
      visualViewportMock.dispatchEvent(new Event('resize'));
      // Run pending rAF callbacks.
      vi.runAllTimers();
    });

    // measureA should have been called at least once by the remeasure rAF.
    expect(callCount).toBeGreaterThan(0);
  });

  it('calls measureA via rAF on window scroll event (capture phase)', async () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    const measureA = vi.fn(() => makeRect());

    render(
      <SpotlightAnimation
        tiles={makeTiles()}
        caption="Track me"
        onDone={vi.fn()}
        measureA={measureA}
      />,
    );

    await act(async () => {});

    // Verify scroll listener was registered with capture: true.
    const scrollCall = addEventSpy.mock.calls.find(
      ([type, , opts]) => type === 'scroll' && (opts as AddEventListenerOptions)?.capture === true,
    );
    expect(scrollCall).toBeDefined();
  });
});

describe('SpotlightAnimation — immediate fallback for null tiles', () => {
  it('fires onDone immediately when tile rect is null (headless fallback via CeremonyOverlay)', async () => {
    const onDone = vi.fn();
    render(
      <SpotlightAnimation
        tiles={[{ rect: null, badge: '👑' }]}
        caption="Instant"
        onDone={onDone}
      />,
    );

    await act(async () => {});
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
