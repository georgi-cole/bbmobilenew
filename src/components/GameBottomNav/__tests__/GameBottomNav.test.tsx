import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameBottomNav from '../GameBottomNav';

describe('GameBottomNav', () => {
  it('uses the updated navbar shell asset and approved icons without inner segment wrappers', () => {
    const { container } = render(<GameBottomNav activeTab="settings" />);

    const shell = container.querySelector<HTMLImageElement>('.game-bottom-nav__shell');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('src')).toContain('/assets/updated_nav_fab_bar/bottom_nav_shell_final.svg');

    expect(container.querySelectorAll('.game-bottom-nav__segment')).toHaveLength(0);

    expect(
      container.querySelector<HTMLImageElement>('.game-bottom-nav__item--active .game-bottom-nav__glyph')
        ?.getAttribute('src'),
    ).toContain('/assets/updated_nav_fab_bar/settings_approved_final.svg');

    expect(screen.getByRole('button', { name: 'SETTINGS' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'BOARD' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'USER' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'LEADERBOARD' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PROFILE' })).toBeNull();
  });
});
