import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import useGameMode from '../useGameMode';

function GameModeHarness() {
  useGameMode();
  return <div>game mode</div>;
}

interface MockWakeLockSentinel {
  release: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

describe('useGameMode', () => {
  const visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  const hadOwnVisibilityState = Object.prototype.hasOwnProperty.call(document, 'visibilityState');
  const orientationDescriptor = Object.getOwnPropertyDescriptor(screen, 'orientation');
  const hadOwnOrientation = Object.prototype.hasOwnProperty.call(screen, 'orientation');
  const wakeLockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
  const hadOwnWakeLock = Object.prototype.hasOwnProperty.call(navigator, 'wakeLock');

  function restoreProperty(target: object, key: string, existedBefore: boolean, descriptor?: PropertyDescriptor) {
    if (existedBefore && descriptor) {
      Object.defineProperty(target, key, descriptor);
      return;
    }
    Reflect.deleteProperty(target, key);
  }

  function setVisibilityState(value: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value,
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    setVisibilityState('visible');
  });

  afterEach(() => {
    restoreProperty(document, 'visibilityState', hadOwnVisibilityState, visibilityStateDescriptor);
    restoreProperty(screen, 'orientation', hadOwnOrientation, orientationDescriptor);
    restoreProperty(navigator, 'wakeLock', hadOwnWakeLock, wakeLockDescriptor);
  });

  it('requests a wake lock, locks portrait orientation, and cleans up on unmount', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const request = vi.fn().mockResolvedValue({
      release,
      addEventListener,
      removeEventListener,
    });
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { lock, unlock },
    });

    const { unmount } = render(<GameModeHarness />);

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen');
    });
    expect(lock).toHaveBeenCalledWith('portrait');
    expect(addEventListener).toHaveBeenCalledWith('release', expect.any(Function));

    unmount();

    await waitFor(() => {
      expect(release).toHaveBeenCalledTimes(1);
    });
    expect(removeEventListener).toHaveBeenCalledWith('release', expect.any(Function));
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('re-requests wake lock when the document becomes visible again', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ release: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
      .mockResolvedValueOnce({ release: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    });

    render(<GameModeHarness />);

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1);
    });

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  it('re-requests wake lock after an unexpected release while still visible', async () => {
    const firstAddEventListener = vi.fn();
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        release: vi.fn(),
        addEventListener: firstAddEventListener,
        removeEventListener: vi.fn(),
      })
      .mockResolvedValueOnce({
        release: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    });

    render(<GameModeHarness />);

    await waitFor(() => {
      expect(firstAddEventListener).toHaveBeenCalledWith('release', expect.any(Function));
    });

    expect(firstAddEventListener.mock.calls[0]?.[1]).toBeDefined();
    const releaseHandler = firstAddEventListener.mock.calls[0][1] as () => void;
    releaseHandler();

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  it('does not issue a duplicate wake lock request while one is already in flight', async () => {
    let resolveRequest: ((sentinel: MockWakeLockSentinel) => void) | undefined;
    const request = vi.fn().mockImplementation(
      () => new Promise<MockWakeLockSentinel>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    });

    render(<GameModeHarness />);

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1);
    });

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(request).toHaveBeenCalledTimes(1);

    const finishRequest = resolveRequest;
    expect(finishRequest).toBeTypeOf('function');
    if (!finishRequest) {
      throw new Error('wake lock request resolver was not assigned');
    }

    finishRequest({
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });
});
