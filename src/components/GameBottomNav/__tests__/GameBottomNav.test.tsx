import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('keeps accessible names when compact mode hides visual labels', () => {
    const { container } = render(<GameBottomNav activeTab="home" />);

    expect(screen.getByRole('button', { name: 'HOME' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'RULES' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'SETTINGS' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'BOARD' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'USER' })).toBeDefined();
    expect(container.querySelectorAll('.game-bottom-nav__label')).toHaveLength(5);
  });

  it('groups lower-frequency destinations in More for the refined architecture', async () => {
    document.body.classList.add('experiment-game-chrome-refined');
    render(<GameBottomNav activeTab={null} />);

    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Leaderboard' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: /Rules/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /Board/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /Store/i })).toBeDefined();
    document.body.classList.remove('experiment-game-chrome-refined');
  });});
