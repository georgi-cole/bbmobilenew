import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GridOfLuck from '../../src/components/GridOfLuck/GridOfLuck';

describe('GridOfLuck component', () => {
  it('renders the full box grid, opens a selected box, and pauses on a continue CTA', () => {
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

    fireEvent.click(boxes[0]);

    expect(boxes[0]).not.toHaveTextContent('Sealed');
    expect(screen.queryByText(/Current turn/i)).toBeNull();
    expect(screen.queryByText(/Last reveal/i)).toBeNull();
    expect(screen.getByTestId('grid-of-luck-event-card')).toHaveTextContent(/Turn resolved/i);
    expect(screen.getByRole('button', { name: /continue ritual/i })).toBeTruthy();
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

    expect(screen.getByAltText('Kian').getAttribute('src')).toContain('avatars/Kian.png');
    expect(screen.getByAltText('Aria').getAttribute('src')).toContain('avatars/Aria.png');
  });
});
