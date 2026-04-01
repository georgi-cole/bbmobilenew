import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrapAuction from '../../../src/components/TrapAuction/TrapAuction';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'aria', name: 'Aria', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'kian', name: 'Kian', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'nova', name: 'Nova', isHuman: false, precomputedScore: 0, previousPR: null },
];

describe('TrapAuction component', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips the in-component intro when autoStart is enabled', async () => {
    render(<TrapAuction participants={participants} seed={42} autoStart />);

    await act(async () => {});

    expect(screen.queryByText("Let's Auction")).not.toBeInTheDocument();
    expect(screen.getByText('Your Bank')).toBeInTheDocument();
  });

  it('never shows Flip Next Card or Reveal All buttons (redundant reveal controls removed)', async () => {
    vi.useFakeTimers();

    render(<TrapAuction participants={participants} seed={42} autoStart />);

    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));

    // After submitting bid, we are in reveal phase — manual controls must not appear
    expect(screen.queryByRole('button', { name: /flip next card/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next round/i })).not.toBeInTheDocument();
  });

  it('auto-advances through reveal to elimination without any user interaction', async () => {
    vi.useFakeTimers();

    render(<TrapAuction participants={participants} seed={42} autoStart />);

    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));

    // Verify we entered the reveal phase
    expect(screen.getByText(/the bids are in/i)).toBeInTheDocument();

    // Each card reveal fires a chained setTimeout. With 4 participants, up to
    // 2 reveal cards are built (highest + lowest). Advance in 1-second steps
    // (> revealStepMs=700) so React processes each state update before the
    // next timer is scheduled. 8 steps covers: 2 card reveals + 900ms
    // auto-advance pause + 1800ms elimination pause — all with headroom.
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Should have progressed past the reveal phase (into elimination or bid/complete)
    expect(screen.queryByText(/the bids are in/i)).not.toBeInTheDocument();
  });
});
