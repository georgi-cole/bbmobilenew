import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FindYourTwin2 from '../../../src/screens/FindYourTwin2/FindYourTwin2';
import FindYourTwinExperiment from '../../../src/screens/FindYourTwinExperiment/FindYourTwinExperiment';

describe('Find Your Twin AI comparison entry points', () => {
  it('lets the player choose Part 1 or Part 2 before playing against the AIs', () => {
    render(<FindYourTwinExperiment />);

    const gameSelect = screen.getByRole('combobox', { name: 'Game' });
    expect(gameSelect).toHaveValue('classic');
    expect(screen.getByRole('button', { name: 'Play against the AIs' })).toBeInTheDocument();

    fireEvent.change(gameSelect, { target: { value: 'benny-lenny' } });
    expect(gameSelect).toHaveValue('benny-lenny');
  });

  it('links the Part 2 preview directly to the AI comparison lab', () => {
    render(<FindYourTwin2 />);

    expect(screen.getByRole('link', { name: 'Play against AIs' })).toHaveAttribute(
      'href',
      '#/find-your-twin-experiment',
    );
  });
});
