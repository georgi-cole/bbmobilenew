import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AvatarTile from '../AvatarTile';

describe('AvatarTile', () => {
  it('renders the nomination asset instead of the question-mark badge', () => {
    const { container } = render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        statuses="nominated"
      />,
    );

    const badge = screen.getByLabelText('Nominated');
    const badgeImage = badge.querySelector('img');

    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('');
    expect(badgeImage).not.toBeNull();
    expect(badgeImage).toHaveAttribute('src', '/assets/avatar_badges/badge_nom.svg');
    expect(container).not.toHaveTextContent('❓');
  });

  it('renders the LOH and POS badge assets for matching statuses', () => {
    render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        statuses={['hoh', 'pov']}
      />,
    );

    expect(screen.getByLabelText('Leader of the House').querySelector('img')).toHaveAttribute(
      'src',
      '/assets/avatar_badges/badge_loh.svg',
    );
    expect(screen.getByLabelText('Power of Safety').querySelector('img')).toHaveAttribute(
      'src',
      '/assets/avatar_badges/badge_pos.svg',
    );
  });

  it('renders the fitted glass-bed shell and cracked-glass eviction overlay', () => {
    const { container } = render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        isEvicted
      />,
    );

    expect(container.querySelector('img[src="/assets/avatar_badges/bed_avatar_glass_v2.svg"]')).not.toBeNull();
    expect(container.querySelector('img[src="/assets/avatar_badges/overlay_eliminated_cracked_glass.svg"]')).not.toBeNull();
  });
});
