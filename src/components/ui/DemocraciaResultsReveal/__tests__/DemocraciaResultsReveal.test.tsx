import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemocraciaResultsReveal from '../DemocraciaResultsReveal';
import type { Player } from '../../../../types';

type LayoutScenario = {
  safeAreaWidth: number;
  safeAreaHeight: number;
  contentWidth: number;
  contentHeight: number;
};

const originalResizeObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');

let layoutScenario: LayoutScenario;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    avatar: '🧑',
    isUser: false,
    status: 'active' as const,
  };
}

describe('DemocraciaResultsReveal', () => {
  beforeEach(() => {
    layoutScenario = {
      safeAreaWidth: 220,
      safeAreaHeight: 180,
      contentWidth: 320,
      contentHeight: 360,
    };

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if (this.classList?.contains('democracia-results__safe-area')) {
          return layoutScenario.safeAreaWidth;
        }

        return originalClientWidth?.get?.call(this) ?? 0;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        if (this.classList?.contains('democracia-results__safe-area')) {
          return layoutScenario.safeAreaHeight;
        }

        return originalClientHeight?.get?.call(this) ?? 0;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        if (this.classList?.contains('democracia-results__content')) {
          return layoutScenario.contentWidth;
        }

        return originalScrollWidth?.get?.call(this) ?? 0;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        if (this.classList?.contains('democracia-results__content')) {
          return layoutScenario.contentHeight;
        }

        return originalScrollHeight?.get?.call(this) ?? 0;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });

    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }

    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
    }

    if (originalScrollWidth) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth);
    }

    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
    }
  });

  it('scales the content to stay inside the faux-tv viewport bounds', async () => {
    const { container } = render(
      <DemocraciaResultsReveal
        mode="tie"
        title="TIED VOTE"
        subtitle="Ash and Remy are tied at 3 votes."
        participants={[
          { player: makePlayer('p1', 'Ash'), voteCount: 3 },
          { player: makePlayer('p2', 'Remy'), voteCount: 3 },
        ]}
        onDone={vi.fn()}
        countdownMs={100000}
      />,
    );

    const content = container.querySelector('.democracia-results__content');

    await waitFor(() => {
      expect(content).toHaveStyle({ transform: 'scale(0.5)' });
    });
  });

  it('keeps the content at full scale when the viewport has enough room', async () => {
    layoutScenario = {
      safeAreaWidth: 480,
      safeAreaHeight: 420,
      contentWidth: 320,
      contentHeight: 260,
    };

    const { container } = render(
      <DemocraciaResultsReveal
        mode="winner"
        title="DEMOCRACIA WINNER"
        subtitle="Remy wins the vote with 10 votes."
        participants={[
          { player: makePlayer('p2', 'Remy'), voteCount: 10 },
        ]}
        onDone={vi.fn()}
        countdownMs={100000}
      />,
    );

    const content = container.querySelector('.democracia-results__content');

    await waitFor(() => {
      expect(content).toHaveStyle({ transform: 'scale(1)' });
    });
  });
});
