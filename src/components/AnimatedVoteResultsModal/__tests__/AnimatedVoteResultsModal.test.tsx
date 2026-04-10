import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '../../../types';
import AnimatedVoteResultsModal from '../AnimatedVoteResultsModal';

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'nominated',
    isUser: false,
  };
}

describe('AnimatedVoteResultsModal public tie-break reveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows tied nominees with approval percentages and resolves the lower-rated nominee', async () => {
    const onDone = vi.fn();
    const onPublicTiebreakResolved = vi.fn();
    const topNominee = makePlayer('p1', 'Nominee 1');
    const tiedA = makePlayer('p2', 'Nominee 2');
    const tiedB = makePlayer('p3', 'Nominee 3');

    const { container } = render(
      <AnimatedVoteResultsModal
        nominees={[
          { nominee: topNominee, voteCount: 0 },
          { nominee: tiedA, voteCount: 0 },
          { nominee: tiedB, voteCount: 0 },
        ]}
        evictee={topNominee}
        publicTiebreak={{
          tiedNominees: [
            { nominee: tiedA, approval: 47 },
            { nominee: tiedB, approval: 31 },
          ],
          evicteeIds: ['p3'],
          countdownMs: 10,
        }}
        onPublicTiebreakResolved={onPublicTiebreakResolved}
        onDone={onDone}
        revealIntervalMs={1}
        postRevealDelayMs={1}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByText('Public approval breaks the tie.')).toBeTruthy();
    expect(screen.getByText('47% approval')).toBeTruthy();
    expect(screen.getByText('31% approval')).toBeTruthy();
    expect(container.querySelector('.avrm__public-tiebreak-option--evictee')?.textContent).toContain('Nominee 3');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(onPublicTiebreakResolved).toHaveBeenCalledWith(['p3']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('can highlight and resolve two evictees from a three-way public tie', async () => {
    const onDone = vi.fn();
    const onPublicTiebreakResolved = vi.fn();
    const tiedA = makePlayer('p1', 'Nominee 1');
    const tiedB = makePlayer('p2', 'Nominee 2');
    const tiedC = makePlayer('p3', 'Nominee 3');

    const { container } = render(
      <AnimatedVoteResultsModal
        nominees={[
          { nominee: tiedA, voteCount: 0 },
          { nominee: tiedB, voteCount: 0 },
          { nominee: tiedC, voteCount: 0 },
        ]}
        publicTiebreak={{
          tiedNominees: [
            { nominee: tiedA, approval: 60 },
            { nominee: tiedB, approval: 32 },
            { nominee: tiedC, approval: 18 },
          ],
          evicteeIds: ['p3', 'p2'],
          countdownMs: 10,
        }}
        onPublicTiebreakResolved={onPublicTiebreakResolved}
        onDone={onDone}
        revealIntervalMs={1}
        postRevealDelayMs={1}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByText('The nominees with lower public approval will be eliminated.')).toBeTruthy();
    expect(container.querySelectorAll('.avrm__public-tiebreak-option--evictee')).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(onPublicTiebreakResolved).toHaveBeenCalledWith(['p3', 'p2']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders the TV variant as avatar-first vote panels with progress bars', async () => {
    render(
      <AnimatedVoteResultsModal
        nominees={[
          { nominee: makePlayer('p1', 'Nominee 1'), voteCount: 5 },
          { nominee: makePlayer('p2', 'Nominee 2'), voteCount: 4 },
        ]}
        evictee={makePlayer('p1', 'Nominee 1')}
        onDone={vi.fn()}
        revealIntervalMs={1}
        postRevealDelayMs={1}
        variant="tv"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });

    expect(document.querySelector('.avrm__tally--tv')).toBeTruthy();
    expect(document.querySelectorAll('.avrm__tv-progress-track')).toHaveLength(2);
    expect(screen.getByText('LIVE FEED')).toBeTruthy();
  });
});
