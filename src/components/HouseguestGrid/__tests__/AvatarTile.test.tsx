import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AvatarTile from '../AvatarTile';
import styles from '../HouseguestGrid.module.css';

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
    expect(badgeImage).toHaveAttribute('src', '/assets/avatar_badges/badge_nom_rounded.svg');
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
      '/assets/avatar_badges/badge_loh_rounded.svg',
    );
    expect(screen.getByLabelText('Power of Safety').querySelector('img')).toHaveAttribute(
      'src',
      '/assets/avatar_badges/badge_pos_rounded.svg',
    );
  });

  it('renders the CSS glass shell layers and cracked-glass eviction overlay', () => {
    const { container } = render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        isEvicted
      />,
    );

    expect(container.querySelector(`.${styles.avatarShell}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.avatarShellBorder}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.avatarShellBands}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.avatarShellTopShine}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.avatarShellBlobPink}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.avatarShellBlobCyan}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.avatarShellBottomCurve}`)).not.toBeNull();
    expect(container.querySelector('img[src="/assets/avatar_badges/overlay_eliminated_cracked_glass.svg"]')).not.toBeNull();
  });
});
