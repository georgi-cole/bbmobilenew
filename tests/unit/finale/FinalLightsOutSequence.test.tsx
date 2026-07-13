import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import FinalLightsOutSequence from '../../../src/components/FinalLightsOutSequence/FinalLightsOutSequence';

const TV_VIEWPORT_RECT = {
  top: 96,
  left: 64,
  width: 320,
  height: 180,
  right: 384,
  bottom: 276,
  x: 64,
  y: 96,
  toJSON: () => undefined,
} satisfies DOMRect;

const TV_ZONE_RECT = {
  top: 72,
  left: 32,
  width: 384,
  height: 264,
  right: 416,
  bottom: 336,
  x: 32,
  y: 72,
  toJSON: () => undefined,
} satisfies DOMRect;

let rafCallbacks: FrameRequestCallback[] = [];

function stubAnimationFrame() {
  rafCallbacks = [];
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }),
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: vi.fn((id: number) => {
      const index = id - 1;
      if (index >= 0 && index < rafCallbacks.length) {
        rafCallbacks[index] = () => undefined;
      }
    }),
  });
}

async function flushAnimationFrame() {
  await act(async () => {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach((cb) => cb(0));
  });
}

beforeEach(() => {
  stubAnimationFrame();
});

afterEach(() => {
  document.body.classList.remove('no-animations');
  document.body.querySelector('.tv-zone__viewport')?.remove();
  document.body.querySelector('.tv-zone')?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('FinalLightsOutSequence', () => {
  it('projects the farewell message into the existing main TV viewport as soon as the lights-out starts', async () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const tvZone = document.createElement('section');
    tvZone.className = 'tv-zone';
    tvZone.getBoundingClientRect = () => TV_ZONE_RECT;
    const viewport = document.createElement('div');
    viewport.className = 'tv-zone__viewport';
    viewport.getBoundingClientRect = () => TV_VIEWPORT_RECT;
    tvZone.appendChild(viewport);
    document.body.appendChild(tvZone);

    render(<FinalLightsOutSequence onComplete={vi.fn()} publicFavoriteWinnerName="Juror 1" />);

    await flushAnimationFrame();

    const tvShell = screen.getByTestId('final-lights-off-tv-shell');
    const tv = screen.getByTestId('final-lights-off-tv');
    expect(tvShell).toHaveClass('flo-tv-shell--anchored');
    expect(tvShell).toHaveStyle({
      top: '72px',
      left: '32px',
      width: '384px',
      height: '264px',
    });
    expect(tv).toHaveClass('flo-tv-frame--anchored');
    expect(tv).toHaveClass('flo-tv-frame--active');
    expect(tv).toHaveStyle({
      top: '96px',
      left: '64px',
      width: '320px',
      height: '180px',
    });

    expect(screen.getByText(/This is not a goodbye/i)).toBeInTheDocument();
    expect(screen.getByText(/It's see you soon/i)).toBeInTheDocument();
    expect(document.querySelector('.flo-tv-message em')).toBeNull();
    expect(document.querySelectorAll('.flo-tv-message > span')).toHaveLength(2);
    const logo = document.querySelector<HTMLImageElement>('.flo-tv-logo-image');
    expect(logo?.getAttribute('src')).toContain('/assets/avatar_badges/goodbye_eye_vector.svg');
    expect(screen.queryByText(/Public's Favorite:/i)).toBeNull();
  });

  it('anchors to the main TV viewport when that element appears after mount', async () => {
    render(<FinalLightsOutSequence onComplete={vi.fn()} />);

    await flushAnimationFrame();

    await waitFor(() => {
      expect(screen.getByTestId('final-lights-off-tv')).toHaveClass('flo-tv-frame--fallback');
    });
    expect(screen.getByTestId('final-lights-off-tv-shell')).toHaveClass('flo-tv-shell--fallback');

    const tvZone = document.createElement('section');
    tvZone.className = 'tv-zone';
    tvZone.getBoundingClientRect = () => TV_ZONE_RECT;
    const viewport = document.createElement('div');
    viewport.className = 'tv-zone__viewport';
    viewport.getBoundingClientRect = () => TV_VIEWPORT_RECT;
    tvZone.appendChild(viewport);

    await act(async () => {
      document.body.appendChild(tvZone);
    });

    await flushAnimationFrame();

    await waitFor(() => {
      expect(screen.getByTestId('final-lights-off-tv')).toHaveClass('flo-tv-frame--anchored');
      expect(screen.getByTestId('final-lights-off-tv-shell')).toHaveClass('flo-tv-shell--anchored');
    });
    expect(screen.getByTestId('final-lights-off-tv')).toHaveStyle({
      top: '96px',
      left: '64px',
      width: '320px',
      height: '180px',
    });
    expect(screen.getByTestId('final-lights-off-tv-shell')).toHaveStyle({
      top: '72px',
      left: '32px',
      width: '384px',
      height: '264px',
    });
  });
});
