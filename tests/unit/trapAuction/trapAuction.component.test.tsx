import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrapAuction from '../../../src/components/TrapAuction/TrapAuction';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'aria', name: 'Aria', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'kian', name: 'Kian', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'nova', name: 'Nova', isHuman: false, precomputedScore: 0, previousPR: null },
];

describe('TrapAuction component', () => {
  it('skips the in-component intro when autoStart is enabled', async () => {
    render(<TrapAuction participants={participants} seed={42} autoStart />);

    await act(async () => {});

    expect(screen.queryByText("Let's Auction")).not.toBeInTheDocument();
    expect(screen.getByText('Your Bank')).toBeInTheDocument();
  });

  it('shows a single next-round action after all reveal cards are visible', async () => {
    render(<TrapAuction participants={participants} seed={42} autoStart />);

    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    fireEvent.click(screen.getByRole('button', { name: /reveal all/i }));

    expect(screen.queryByRole('button', { name: /flip next card/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reveal all$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next round/i })).toBeInTheDocument();
  });
});
