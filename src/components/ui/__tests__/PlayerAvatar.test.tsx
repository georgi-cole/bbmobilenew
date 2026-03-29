/**
 * Tests for ui/PlayerAvatar nominated badge rendering.
 *
 * Verifies that:
 *  1. A nominated player renders the glow badge image, not the ❓ emoji.
 *  2. The badge span retains an accessible aria-label of "Nominated".
 *  3. Non-nominated badge types (HOH, POV, jury) still render their emoji.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Player } from '../../../types';
import PlayerAvatar from '../PlayerAvatar';

function makePlayer(overrides?: Partial<Player>): Player {
  return {
    id: 'p1',
    name: 'Taylor',
    avatar: '🙂',
    status: 'active',
    ...overrides,
  };
}

describe('ui/PlayerAvatar nominated badge', () => {
  it('renders the glow nomination image for a nominated player', () => {
    const { container } = render(
      <PlayerAvatar player={makePlayer({ status: 'nominated' })} />,
    );

    const badge = screen.getByLabelText('Nominated');
    const badgeImage = badge.querySelector('img');

    expect(badge).toBeInTheDocument();
    expect(badgeImage).not.toBeNull();
    expect(badgeImage).toHaveAttribute('src', '/assets/nomination%20mark%20glow.png');
    expect(container).not.toHaveTextContent('❓');
  });

  it('does not render the ❓ emoji for a nominated player', () => {
    const { container } = render(
      <PlayerAvatar player={makePlayer({ status: 'nominated' })} />,
    );

    expect(container).not.toHaveTextContent('❓');
  });

  it('retains accessible aria-label on the badge for a nominated player', () => {
    render(<PlayerAvatar player={makePlayer({ status: 'nominated' })} />);

    const badge = screen.getByLabelText('Nominated');
    expect(badge).toBeInTheDocument();
  });

  it('renders the HOH emoji badge for an HOH player', () => {
    render(<PlayerAvatar player={makePlayer({ status: 'hoh' })} />);

    const badge = screen.getByLabelText('Leader of the House');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('👑');
  });

  it('renders the POV emoji badge for a POV-holding player', () => {
    render(<PlayerAvatar player={makePlayer({ status: 'pov' })} />);

    const badge = screen.getByLabelText('Power of Safety');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('🛡️');
  });

  it('renders no badge for an active (non-status) player', () => {
    const { container } = render(
      <PlayerAvatar player={makePlayer({ status: 'active' })} />,
    );

    expect(container.querySelector('.player-avatar__badge')).toBeNull();
  });
});
