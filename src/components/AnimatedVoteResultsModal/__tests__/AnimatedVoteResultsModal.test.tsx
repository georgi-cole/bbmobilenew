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
          evicteeId: 'p3',
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

    expect(onPublicTiebreakResolved).toHaveBeenCalledWith('p3');
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
