import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AvatarTile from '../AvatarTile';

describe('AvatarTile', () => {
  it('renders the glow nomination asset instead of the question-mark badge', () => {
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
    expect(badgeImage).toHaveAttribute('src', '/assets/nomination%20mark%20glow.png');
    expect(container).not.toHaveTextContent('❓');
  });
});
