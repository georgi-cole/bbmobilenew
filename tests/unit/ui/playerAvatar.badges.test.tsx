import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlayerAvatar from '../../../src/components/ui/PlayerAvatar';
import type { Player } from '../../../src/types';
import { getBadgesForPlayer } from '../../../src/utils/statusBadges';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Nova',
    avatar: '😀',
    status: 'active',
    ...overrides,
  };
}

describe('PlayerAvatar badge assets', () => {
  it('maps LOH and POS badges to image assets', () => {
    expect(getBadgesForPlayer('loh+pos')).toEqual([
      expect.objectContaining({
        code: 'loh',
        imageSrc: '/assets/avatar_badges/loh_badge.png',
        label: 'Leader of the House',
      }),
      expect.objectContaining({
        code: 'pos',
        imageSrc: '/assets/avatar_badges/safety_badge.svg',
        label: 'Power of Safety',
      }),
    ]);
  });

  it('renders LOH and POS badges as image badges without emoji wrappers', () => {
    render(<PlayerAvatar player={makePlayer({ status: 'loh+pos' })} />);

    const badge = screen.getByLabelText('Leader of the House, Power of Safety');
    const badgeImages = badge.querySelectorAll('.player-avatar__badge-image');
    const imageBadgeItems = badge.querySelectorAll('.player-avatar__badge-item--image');

    expect(badgeImages).toHaveLength(2);
    expect(imageBadgeItems).toHaveLength(2);
    expect(badgeImages[0]?.getAttribute('src')).toContain('/assets/avatar_badges/loh_badge.png');
    expect(badgeImages[1]?.getAttribute('src')).toContain('/assets/avatar_badges/safety_badge.svg');
    expect(badge.textContent).toBe('');
  });
});
