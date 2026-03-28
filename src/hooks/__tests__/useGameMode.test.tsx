import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import useGameMode from '../useGameMode';

function GameModeHarness() {
  useGameMode();
  return <div>game mode</div>;
}

describe('useGameMode', () => {
  const originalVisibilityState = document.visibilityState;
  const originalOrientation = screen.orientation;
  const originalWakeLock = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: originalVisibilityState,
    });
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: originalOrientation,
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: originalWakeLock,
    });
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

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });
});
