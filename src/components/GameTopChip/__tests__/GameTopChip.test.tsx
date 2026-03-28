import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GameTopChip from '../GameTopChip';

describe('GameTopChip', () => {
  it('keeps default sizing vars for shorter labels', () => {
    render(<GameTopChip label="DAY START" />);

    const chip = screen.getByLabelText('DAY START');
    const style = chip.getAttribute('style') ?? '';

    expect(style).toContain('--game-top-chip-label-scale: 1');
    expect(style).toContain('--game-top-chip-inline-padding: 13px');
  });

  it('scales long labels down and trims padding so the text stays inside the chip', () => {
    render(<GameTopChip label="SAFETY RESULTS" />);

    const chip = screen.getByLabelText('SAFETY RESULTS');
    const style = chip.getAttribute('style') ?? '';

    expect(style).toContain('--game-top-chip-inline-padding: 10px');
    expect(style).toMatch(/--game-top-chip-label-scale:\s*0\.(7|8)\d+/);
  });
});
