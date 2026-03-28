import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameBottomNav from '../GameBottomNav';

describe('GameBottomNav', () => {
  it('uses the updated segmented navbar assets and approved icons', () => {
    const { container } = render(<GameBottomNav activeTab="settings" />);

    const shell = container.querySelector<HTMLImageElement>('.game-bottom-nav__shell');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('src')).toContain('/assets/updated_nav_fab_bar/bottom_nav_shell_final.svg');

    const segments = Array.from(
      container.querySelectorAll<HTMLImageElement>('.game-bottom-nav__segment'),
    ).map((segment) => segment.getAttribute('src'));
    expect(segments).toEqual([
      expect.stringContaining('/assets/updated_nav_fab_bar/bottom_nav_segment_idle_final.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/bottom_nav_segment_idle_final.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/bottom_nav_segment_active_final.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/bottom_nav_segment_idle_final.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/bottom_nav_segment_idle_final.svg'),
    ]);

    expect(
      container.querySelector<HTMLImageElement>('.game-bottom-nav__item--active .game-bottom-nav__glyph')
        ?.getAttribute('src'),
    ).toContain('/assets/updated_nav_fab_bar/settings_approved_final.svg');

    expect(screen.getByRole('button', { name: 'SETTINGS' })).toHaveAttribute('aria-current', 'page');
  });
});
