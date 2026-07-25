import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import BatteryLow from '../../../src/components/VaultVerdict/VaultVerdict';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 90, previousPR: null },
  { id: 'ai-1', name: 'Kian', isHuman: false, precomputedScore: 80, previousPR: null },
  { id: 'ai-2', name: 'Mira', isHuman: false, precomputedScore: 70, previousPR: null },
  { id: 'ai-3', name: 'Jules', isHuman: false, precomputedScore: 60, previousPR: null },
];

describe('Battery Low UI', () => {
  it('renders the complete board and keeps the required gameplay information visible', () => {
    render(<BatteryLow seed={1226} participants={participants} />);

    expect(screen.getByRole('heading', { name: 'Battery Low' })).toBeInTheDocument();
    expect(screen.getByText('Choose a reserve battery')).toBeInTheDocument();
    expect(screen.getByText('Max charge remaining')).toBeInTheDocument();
    expect(screen.getByLabelText(/Elapsed time/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Battery \d+$/i })).toHaveLength(22);
  });

  it('uses an explicit Reserve state instead of the old MY marker', async () => {
    const user = userEvent.setup();
    render(<BatteryLow seed={1226} participants={participants} />);

    await user.click(screen.getByRole('button', { name: 'Battery 8' }));

    expect(await screen.findByRole('button', { name: 'Reserve battery 8' })).toBeInTheDocument();
    expect(screen.getByText('Reserve battery 8')).toBeInTheDocument();
    expect(screen.queryByText('MY')).not.toBeInTheDocument();
    expect(screen.getByText(/Round 1 · 5 picks left/i)).toBeInTheDocument();
  });
});
