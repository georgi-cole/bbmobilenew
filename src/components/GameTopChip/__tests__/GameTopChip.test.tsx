import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GameTopChip from '../GameTopChip';

describe('GameTopChip', () => {
  it('keeps the default shell width for shorter labels', () => {
    render(<GameTopChip label="DAY START" />);

    const chip = screen.getByLabelText('DAY START');
    const style = chip.getAttribute('style') ?? '';

    expect(style).toContain('--game-top-chip-min-width: 68px');
    expect(style).toContain('--game-top-chip-inline-padding: 13px');
  });

  it('widens the shell for longer labels so the text stays inside the chip', () => {
    render(<GameTopChip label="SAFETY RESULTS" />);

    const chip = screen.getByLabelText('SAFETY RESULTS');
    const style = chip.getAttribute('style') ?? '';

    expect(style).toContain('--game-top-chip-min-width: 124px');
    expect(style).toContain('--game-top-chip-inline-padding: 13px');
  });
});
