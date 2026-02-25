/**
 * Tests for PlayerAvatar component relationship outline integration.
 *
 * Covers:
 *  1. Applies pa--rel-good class when affinity indicates 'good' (percent 75).
 *  2. Applies pa--rel-neutral class when affinity indicates 'neutral' (percent 50).
 *  3. Applies pa--rel-bad class when affinity indicates 'bad' (percent 25).
 *  4. Applies no rel class when affinity is undefined.
 *  5. Applies no rel class when showRelationshipOutline={false} even if affinity is provided.
 *  6. Includes tone in aria-label when tone is not 'none' (button variant).
 *  7. Does not modify aria-label when tone is 'none'.
 *  8. Applies pa--evicted class for evicted player by default.
 *  9. Suppresses pa--evicted class when showEvictedStyle={false}.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Player } from '../../../types';
import PlayerAvatar from '../PlayerAvatar';

function makePlayer(overrides?: Partial<Player>): Player {
  return {
    id: 'p1',
    name: 'Nova',
    avatar: '😀',
    status: 'active',
    ...overrides,
  };
}

describe('PlayerAvatar relationship outline', () => {
  it('applies pa--rel-good class for a "good" affinity (75%)', () => {
    const { container } = render(<PlayerAvatar player={makePlayer()} affinity={75} />);
    expect(container.firstElementChild?.classList.contains('pa--rel-good')).toBe(true);
  });

  it('applies pa--rel-neutral class for a "neutral" affinity (50%)', () => {
    const { container } = render(<PlayerAvatar player={makePlayer()} affinity={50} />);
    expect(container.firstElementChild?.classList.contains('pa--rel-neutral')).toBe(true);
  });

  it('applies pa--rel-bad class for a "bad" affinity (25%)', () => {
    const { container } = render(<PlayerAvatar player={makePlayer()} affinity={25} />);
    expect(container.firstElementChild?.classList.contains('pa--rel-bad')).toBe(true);
  });

  it('applies no rel class when affinity is undefined', () => {
    const { container } = render(<PlayerAvatar player={makePlayer()} />);
    const el = container.firstElementChild;
    expect(el?.className).not.toMatch(/pa--rel-/);
  });

  it('applies no rel class when showRelationshipOutline is false even with affinity', () => {
    const { container } = render(
      <PlayerAvatar player={makePlayer()} affinity={75} showRelationshipOutline={false} />,
    );
    const el = container.firstElementChild;
    expect(el?.className).not.toMatch(/pa--rel-/);
  });

  it('includes tone label in aria-label for button variant when tone is not "none"', () => {
    render(<PlayerAvatar player={makePlayer({ name: 'Nova' })} affinity={75} onClick={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Nova — Allies');
  });

  it('does not modify aria-label when tone is "none" (no affinity)', () => {
    render(<PlayerAvatar player={makePlayer({ name: 'Nova' })} onClick={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Nova');
  });

  it('applies pa--evicted class for an evicted player by default', () => {
    const { container } = render(<PlayerAvatar player={makePlayer({ status: 'evicted' })} />);
    expect(container.firstElementChild?.classList.contains('pa--evicted')).toBe(true);
  });

  it('suppresses pa--evicted class when showEvictedStyle is false', () => {
    const { container } = render(
      <PlayerAvatar player={makePlayer({ status: 'evicted' })} showEvictedStyle={false} />,
    );
    expect(container.firstElementChild?.classList.contains('pa--evicted')).toBe(false);
  });
});
