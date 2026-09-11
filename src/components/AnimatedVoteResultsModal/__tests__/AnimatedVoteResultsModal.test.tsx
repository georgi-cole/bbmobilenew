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
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByText('Public approval breaks the tie.')).toBeTruthy();
    expect(screen.getByText('47% approval')).toBeTruthy();
    expect(screen.getByText('31% approval')).toBeTruthy();
    expect(
      container.querySelector('.avrm__public-tiebreak-option--evictee')?.textContent
    ).toContain('Nominee 3');

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
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(
      screen.getByText('The nominees with lower public approval will be eliminated.')
    ).toBeTruthy();
    expect(container.querySelectorAll('.avrm__public-tiebreak-option--evictee')).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(onPublicTiebreakResolved).toHaveBeenCalledWith(['p3', 'p2']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('replaces the tv vote-results stage with the public tie-break screen before resolving', async () => {
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
          countdownMs: 1000,
        }}
        onPublicTiebreakResolved={onPublicTiebreakResolved}
        onDone={onDone}
        revealIntervalMs={1}
        postRevealDelayMs={1}
        variant="tv"
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByText('Public approval breaks the tie.')).toBeTruthy();
    expect(container.querySelector('.avrm__tv-stage')).toBeNull();
    expect(container.querySelector('.avrm__public-tiebreak')).toBeTruthy();
    expect(onPublicTiebreakResolved).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(onPublicTiebreakResolved).toHaveBeenCalledWith(['p3', 'p2']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders the TV variant as a duel layout with circular vote rings', async () => {
    const { container } = render(
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
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(container.querySelectorAll('.avrm__tally--tv')).toHaveLength(2);
    expect(container.querySelector('.avrm__tv-stage')).toBeTruthy();
    expect(container.querySelector('.avrm__tv-duel-divider')?.textContent).toContain('VS');
    expect(container.querySelectorAll('.avrm__tv-vote-ring')).toHaveLength(2);
    expect(container.querySelectorAll('.avrm__tv-vote-ring-track')).toHaveLength(2);
    expect(
      container.querySelector('.avrm__tv-vote-ring-fill')?.getAttribute('stroke-dasharray')
    ).toBeTruthy();
    expect(container.querySelector('.avrm__tally-count[aria-label="1 vote"]')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
    expect(container.querySelector('.avrm__commentary--tv')).toBeNull();
    expect(container.querySelector('.avrm__tv-vote-share')).toBeNull();
    expect(container.querySelector('.avrm__tally--tv .avrm__tally-name')).toBeNull();
    expect(screen.getByText('Nominee 1')).toHaveClass('visually-hidden');
    expect(screen.queryByText(/has been eliminated\./i)).toBeNull();
  });

  it('renders Cupid vote results as two overlapped pair units with shared tallies', async () => {
    const pairOneA = makePlayer('p1', 'Pair One A');
    const pairOneB = makePlayer('p2', 'Pair One B');
    const pairTwoA = makePlayer('p3', 'Pair Two A');
    const pairTwoB = makePlayer('p4', 'Pair Two B');
    const { container } = render(
      <AnimatedVoteResultsModal
        nominees={[
          {
            nominee: pairOneA,
            partner: pairOneB,
            pairColor: '#ff5d8f',
            voteCount: 0,
          },
          {
            nominee: pairTwoA,
            partner: pairTwoB,
            pairColor: '#5bbcff',
            voteCount: 0,
          },
        ]}
        evictee={pairOneA}
        evicteeIds={[pairOneB.id]}
        onDone={vi.fn()}
        revealIntervalMs={1}
        postRevealDelayMs={1}
        variant="tv"
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(container.querySelectorAll('.avrm__tally--tv')).toHaveLength(2);
    expect(container.querySelectorAll('.avrm__tv-avatar-wrap--pair')).toHaveLength(2);
    expect(container.querySelectorAll('.avrm__tv-avatar-member')).toHaveLength(4);
    expect(container.querySelectorAll('.avrm__tally--evictee')).toHaveLength(1);
    expect(screen.getByText('Pair One A and Pair One B')).toHaveClass('visually-hidden');
  });

  it('keeps three TV nominees in the same compact row for double eliminations', async () => {
    const { container } = render(
      <AnimatedVoteResultsModal
        nominees={[
          { nominee: makePlayer('p1', 'Nominee 1'), voteCount: 4 },
          { nominee: makePlayer('p2', 'Nominee 2'), voteCount: 3 },
          { nominee: makePlayer('p3', 'Nominee 3'), voteCount: 2 },
        ]}
        evictee={makePlayer('p1', 'Nominee 1')}
        onDone={vi.fn()}
        revealIntervalMs={1}
        postRevealDelayMs={1}
        variant="tv"
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3);
    });

    expect(container.querySelectorAll('.avrm__tally--tv-triple')).toHaveLength(3);
    expect(container.querySelector('.avrm__tv-duel-divider')).toBeNull();
    expect(container.querySelector('.avrm__commentary--tv')).toBeNull();
  });

  it('highlights both evictees in the TV variant during a double elimination', async () => {
    const { container } = render(
      <AnimatedVoteResultsModal
        nominees={[
          { nominee: makePlayer('p1', 'Nominee 1'), voteCount: 0 },
          { nominee: makePlayer('p2', 'Nominee 2'), voteCount: 0 },
          { nominee: makePlayer('p3', 'Nominee 3'), voteCount: 0 },
        ]}
        evictee={makePlayer('p1', 'Nominee 1')}
        evicteeIds={['p1', 'p2']}
        onDone={vi.fn()}
        revealIntervalMs={1}
        postRevealDelayMs={1}
        variant="tv"
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });

    expect(container.querySelectorAll('.avrm__tally--evictee')).toHaveLength(2);
  });

  it('starts public percentages near their result and fluctuates instead of counting from zero', async () => {
    const { container } = render(
      <AnimatedVoteResultsModal
        nominees={[
          { nominee: makePlayer('p1', 'Nominee 1'), voteCount: 61.4 },
          { nominee: makePlayer('p2', 'Nominee 2'), voteCount: 38.6 },
        ]}
        evictee={makePlayer('p1', 'Nominee 1')}
        onDone={vi.fn()}
        revealIntervalMs={10}
        postRevealDelayMs={1}
        variant="tv"
        resultMode="public"
      />
    );

    const openingValues = Array.from(container.querySelectorAll('.avrm__tally-count')).map(
      (node) => Number(node.textContent?.replace('%', ''))
    );
    expect(openingValues[0]).toBeGreaterThan(50);
    expect(openingValues[1]).toBeGreaterThan(30);
    expect(container.querySelector('.avrm__tally--leading')).toBeNull();
    expect(container.querySelector('.avrm__tv-vote-ring-fill--leading')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const updatedValues = Array.from(container.querySelectorAll('.avrm__tally-count')).map(
      (node) => Number(node.textContent?.replace('%', ''))
    );
    expect(updatedValues).not.toEqual(openingValues);
    expect(updatedValues[0]).toBeGreaterThan(50);
    expect(updatedValues[1]).toBeGreaterThan(30);
    expect(container.querySelector('.avrm__tally--leading')).toBeNull();
  });
});
