/**
 * Color Match — component tests using React Testing Library.
 *
 * Covers:
 *  7. UI regression: hint panel visible and persists after purchase.
 *  8. UI regression: accuracy % is hidden by default and revealed only when a hint is purchased.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ColorMatchComp from '../src/components/ColorMatchComp/ColorMatchComp';

// Silence CSS imports which jsdom cannot process
vi.mock('../src/components/ColorMatchComp/ColorMatchComp.css', () => ({}));

// Suppress SoundManager noise in tests
vi.mock('../src/hooks/useSound', () => ({
  default: () => ({ play: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render the component and advance past the mixing animation. */
function renderAndPlay(onFinish = vi.fn()) {
  const result = render(<ColorMatchComp seed={42} autoStart={false} onFinish={onFinish} />);
  // Advance only past the mixing animation timeout (without draining the round timer interval)
  act(() => { vi.advanceTimersByTime(1600); });
  return result;
}

/** Click "Buy Hint" then confirm in the modal. */
function purchaseHint() {
  const buyBtns = screen.getAllByRole('button', { name: /buy hint/i });
  // First "Buy Hint" button in the action row (not the modal confirm)
  fireEvent.click(buyBtns[0]);
  // Modal should appear — confirm the purchase
  const modal = screen.getByRole('dialog');
  const confirmBtn = Array.from(modal.querySelectorAll('button')).find(
    (b) => /buy hint/i.test(b.textContent ?? ''),
  );
  expect(confirmBtn).toBeDefined();
  fireEvent.click(confirmBtn!);
}

// ── 7. Hint panel rendering ───────────────────────────────────────────────────

describe('Color Match hint panel', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is absent before any hint is purchased', () => {
    renderAndPlay();
    expect(screen.queryByTestId('hint-panel')).not.toBeInTheDocument();
  });

  it('appears after clicking Buy Hint and confirming', () => {
    renderAndPlay();
    purchaseHint();
    expect(screen.getByTestId('hint-panel')).toBeInTheDocument();
  });
});

// ── 8. Accuracy display gating ────────────────────────────────────────────────

describe('Color Match accuracy display', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows "?" and "buy hint to reveal" before any hint is purchased', () => {
    renderAndPlay();
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText(/buy hint to reveal/i)).toBeInTheDocument();
  });

  it('reveals the accuracy % after a hint is purchased', () => {
    const { container } = renderAndPlay();
    purchaseHint();

    // The hidden "?" label should be gone
    expect(screen.queryByText(/buy hint to reveal/i)).not.toBeInTheDocument();
    // The accuracy meter now shows a numeric % value
    const meter = container.querySelector('.cm__accuracy-meter');
    expect(meter?.textContent).toMatch(/\d+%/);
  });

  it('does not reveal accuracy after submitting without a hint', () => {
    renderAndPlay();
    // Submit without buying a hint
    fireEvent.click(screen.getByRole('button', { name: /submit match/i }));
    // Phase transitions to feedback; accuracy meter should still show "?"
    expect(screen.getByText(/buy hint to reveal/i)).toBeInTheDocument();
  });
});
