import { fireEvent, render, screen, within, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GridOfLuck from '../../src/components/GridOfLuck/GridOfLuck';

describe('GridOfLuck component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stages the box reveal before showing the compact ritual update and continue CTA', () => {
    render(
      <GridOfLuck
        participants={[
          { id: 'human', name: 'You', isHuman: true, precomputedScore: 88, previousPR: 88 },
          { id: 'p2', name: 'Nyx', isHuman: false, precomputedScore: 80, previousPR: 80 },
          { id: 'p3', name: 'Vex', isHuman: false, precomputedScore: 72, previousPR: 72 },
          { id: 'p4', name: 'Mara', isHuman: false, precomputedScore: 68, previousPR: 68 },
          { id: 'p5', name: 'Orion', isHuman: false, precomputedScore: 61, previousPR: 61 },
          { id: 'p6', name: 'Sable', isHuman: false, precomputedScore: 54, previousPR: 54 },
        ]}
        seed={42}
        onFinish={() => {}}
      />,
    );

    const boxes = screen.getAllByTestId('grid-of-luck-box');
    expect(boxes).toHaveLength(20);
    expect(boxes[0]).toHaveTextContent('Sealed');
    expect(screen.queryByText('Grid of Luck')).toBeNull();
    expect(screen.getByText('Mystic Chamber')).toBeTruthy();
    expect(screen.getByTestId('grid-of-luck-event-card')).toHaveTextContent(/Current turn|Your turn/i);
    expect(screen.queryByText(/^Active$/i)).toBeNull();
    expect(screen.queryByText(/^Alive$/i)).toBeNull();
    expect(screen.queryByText(/No active effects/i)).toBeNull();
    expect(screen.getByRole('button', { name: /You 500 LP No active effects/i })).toBeTruthy();

    fireEvent.click(boxes[10]);

    const eventCard = screen.getByTestId('grid-of-luck-event-card');
    expect(eventCard).toHaveTextContent(/choice locked/i);
    expect(eventCard).toHaveTextContent(/you reach for box 11/i);
    expect(eventCard).toHaveTextContent(/random boon/i);
    expect(screen.queryByRole('button', { name: /continue ritual/i })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(eventCard).toHaveTextContent(/seal opening/i);
    expect(eventCard).toHaveTextContent(/box 11 opens and reveals/i);

    act(() => {
      vi.advanceTimersByTime(850);
    });

    expect(boxes[10]).not.toHaveTextContent('Sealed');
    const resolvedEventCard = screen.getByTestId('grid-of-luck-event-card');
    expect(resolvedEventCard).not.toHaveTextContent(/turn resolved/i);
    expect(resolvedEventCard).not.toHaveTextContent(/effect resolved/i);
    expect(resolvedEventCard).not.toHaveTextContent(/^up next$/i);
    expect(resolvedEventCard).toHaveTextContent(/\+\d+ lp/i);
    expect(resolvedEventCard).not.toHaveTextContent(/worth \+\d+ lp/i);
    expect(resolvedEventCard).toHaveTextContent(/You uncover a hidden bonus\./i);
    expect(resolvedEventCard).toHaveTextContent(/next:/i);
    expect(screen.getByRole('button', { name: /continue ritual/i })).toBeTruthy();
    const ritualFeed = within(screen.getByTestId('grid-of-luck-ritual-feed'));
    expect(ritualFeed.getAllByRole('listitem')).toHaveLength(2);
    expect(ritualFeed.getAllByRole('listitem')[0]).toHaveTextContent(/You uncover a hidden bonus/i);
    expect(ritualFeed.getAllByRole('listitem')[1]).toHaveTextContent(/The chamber awakens/i);
  }, 10_000);

  it('keeps the human player card first even when another player acts first', () => {
    render(
      <GridOfLuck
        participants={[
          { id: 'human', name: 'You', isHuman: true, precomputedScore: 40, previousPR: 40 },
          { id: 'p2', name: 'Nyx', isHuman: false, precomputedScore: 90, previousPR: 90 },
          { id: 'p3', name: 'Vex', isHuman: false, precomputedScore: 80, previousPR: 80 },
        ]}
        seed={11}
        onFinish={() => {}}
      />,
    );

    const playerCards = screen.getAllByTestId('grid-of-luck-player-card');
    expect(playerCards[0]).toHaveAccessibleName(/you 500 lp/i);
    expect(playerCards[1]).toHaveAccessibleName(/nyx 500 lp/i);
    expect(playerCards[2]).toHaveAccessibleName(/vex 500 lp/i);
  });

  it('prefers local png avatar candidates for named houseguests', () => {
    render(
      <GridOfLuck
        participants={[
          { id: 'user', name: 'You', isHuman: true, precomputedScore: 88, previousPR: 88 },
          { id: 'kian', name: 'Kian', isHuman: false, precomputedScore: 80, previousPR: 80 },
          { id: 'aria', name: 'Aria', isHuman: false, precomputedScore: 72, previousPR: 72 },
        ]}
        seed={7}
        onFinish={() => {}}
      />,
    );

    expect(screen.getByAltText('Kian').getAttribute('src')).toContain('assets/skins/backup-grey-lux/Kian_avatar.webp');
    expect(screen.getByAltText('Aria').getAttribute('src')).toContain('assets/skins/backup-grey-lux/Aria_avatar.webp');
  });
});
