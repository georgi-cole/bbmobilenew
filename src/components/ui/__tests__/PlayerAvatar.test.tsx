/**
 * Tests for ui/PlayerAvatar asset-backed badge rendering.
 *
 * Verifies that:
 *  1. Asset-backed badge types render their SVG badges, not fallback emoji.
 *  2. The badge span retains an accessible aria-label of "Nominated".
 *  3. LOH/POS badge types also render their requested SVG assets.
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

describe('ui/PlayerAvatar badge assets', () => {
  it('renders the nomination asset for a nominated player', () => {
    const { container } = render(
      <PlayerAvatar player={makePlayer({ status: 'nominated' })} />,
    );

    const badge = screen.getByLabelText('Nominated');
    const badgeImage = badge.querySelector('img');

    expect(badge).toBeInTheDocument();
    expect(badgeImage).not.toBeNull();
    expect(badgeImage).toHaveAttribute('src', '/assets/avatar_badges/badge_nom.svg');
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

  it('renders the LOH asset badge for an HOH player', () => {
    render(<PlayerAvatar player={makePlayer({ status: 'hoh' })} />);

    const badge = screen.getByLabelText('Leader of the House');
    const badgeImage = badge.querySelector('img');

    expect(badge).toBeInTheDocument();
    expect(badge).not.toHaveTextContent('👑');
    expect(badgeImage).toHaveAttribute('src', '/assets/avatar_badges/badge_loh.svg');
  });

  it('renders the POS asset badge for a POV-holding player', () => {
    render(<PlayerAvatar player={makePlayer({ status: 'pov' })} />);

    const badge = screen.getByLabelText('Power of Safety');
    const badgeImage = badge.querySelector('img');

    expect(badge).toBeInTheDocument();
    expect(badge).not.toHaveTextContent('🛡️');
    expect(badgeImage).toHaveAttribute('src', '/assets/avatar_badges/badge_pos.svg');
  });

  it('renders no badge for an active (non-status) player', () => {
    const { container } = render(
      <PlayerAvatar player={makePlayer({ status: 'active' })} />,
    );

    expect(container.querySelector('.player-avatar__badge')).toBeNull();
  });
});
