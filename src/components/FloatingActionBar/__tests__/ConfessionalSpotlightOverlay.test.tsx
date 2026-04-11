import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfessionalSpotlightOverlay from '../ConfessionalSpotlightOverlay';

vi.mock('framer-motion', async () => {
  const React = await import('react');

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    },
  );

  return {
    motion,
    useReducedMotion: () => false,
  };
});

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe('ConfessionalSpotlightOverlay', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalVisualViewport = window.visualViewport;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    });
  });

  it('anchors the spotlight to the measured target center with tight radii', () => {
    const target = document.createElement('img');
    const targetRef = createRef<HTMLElement>();
    targetRef.current = target;
    target.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 200,
        width: 18,
        height: 18,
        right: 118,
        bottom: 218,
      }) as DOMRect;

    render(<ConfessionalSpotlightOverlay active targetRef={targetRef} onComplete={() => {}} />);

    const overlay = screen.getByTestId('confessional-spotlight');
    const overlayLayer = overlay.querySelector('.confessional-spotlight__overlay') as HTMLElement;
    const haloLayer = overlay.querySelector('.confessional-spotlight__halo') as HTMLElement;
    const buttonGlowLayer = overlay.querySelector('.confessional-spotlight__button-glow') as HTMLElement;

    expect(overlayLayer.style.getPropertyValue('--confessional-spotlight-x')).toBe('109px');
    expect(overlayLayer.style.getPropertyValue('--confessional-spotlight-y')).toBe('209px');
    expect(overlayLayer.style.getPropertyValue('--confessional-spotlight-inner')).toBe('14px');
    expect(overlayLayer.style.getPropertyValue('--confessional-spotlight-outer')).toBe('22px');
    expect(haloLayer.style.width).toBe('46px');
    expect(haloLayer.style.height).toBe('46px');
    expect(buttonGlowLayer.style.width).toBe('40px');
    expect(buttonGlowLayer.style.height).toBe('40px');
  });

  it('re-measures the target on resize and keeps the spotlight bounded for larger targets', async () => {
    const target = document.createElement('img');
    const targetRef = createRef<HTMLElement>();
    targetRef.current = target;

    let rect = {
      left: 40,
      top: 60,
      width: 24,
      height: 24,
      right: 64,
      bottom: 84,
    };
    target.getBoundingClientRect = () => rect as DOMRect;

    render(<ConfessionalSpotlightOverlay active targetRef={targetRef} onComplete={() => {}} />);

    const overlay = screen.getByTestId('confessional-spotlight');
    const overlayLayer = overlay.querySelector('.confessional-spotlight__overlay') as HTMLElement;

    expect(overlayLayer.style.getPropertyValue('--confessional-spotlight-inner')).toBe('16px');
    expect(overlayLayer.style.getPropertyValue('--confessional-spotlight-outer')).toBe('24px');

    rect = {
      left: 180,
      top: 320,
      width: 24,
      height: 24,
      right: 204,
      bottom: 344,
    };

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      const updatedOverlayLayer = screen
        .getByTestId('confessional-spotlight')
        .querySelector('.confessional-spotlight__overlay') as HTMLElement;
      expect(updatedOverlayLayer.style.getPropertyValue('--confessional-spotlight-x')).toBe('192px');
      expect(updatedOverlayLayer.style.getPropertyValue('--confessional-spotlight-y')).toBe('332px');
    });
  });
});
