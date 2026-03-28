import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GameControlDock from '../GameControlDock';

describe('GameControlDock', () => {
  it('uses the updated dock shell and v2 glyph assets', () => {
    const { container } = render(<GameControlDock />);

    const shell = container.querySelector<HTMLImageElement>('.game-control-dock__shell');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('src')).toContain('/assets/updated_nav_fab_bar/fab_dock_shell_final.svg');

    const glyphs = Array.from(
      container.querySelectorAll<HTMLImageElement>('.dock-node__glyph'),
    ).map((glyph) => glyph.getAttribute('src'));

    expect(glyphs).toEqual([
      expect.stringContaining('/assets/updated_nav_fab_bar/social_v2.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/requests_v2.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/play_v2.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/public_meter_v2.svg'),
      expect.stringContaining('/assets/updated_nav_fab_bar/confessional_v2.svg'),
    ]);
  });

  it('swaps node shell assets for hover, pressed, and disabled states', () => {
    const { rerender } = render(<GameControlDock />);

    const socialButton = screen.getByRole('button', { name: 'Social' });
    const socialShell = socialButton.querySelector<HTMLImageElement>('.dock-node__shell');
    expect(socialShell).not.toBeNull();
    expect(socialShell?.getAttribute('src')).toContain('/assets/updated_nav_fab_bar/side_node_normal_final.svg');

    fireEvent.mouseEnter(socialButton);
    expect(socialShell?.getAttribute('src')).toContain('/assets/updated_nav_fab_bar/side_node_hover_final.svg');

    fireEvent.mouseDown(socialButton);
    expect(socialShell?.getAttribute('src')).toContain('/assets/updated_nav_fab_bar/side_node_pressed_final.svg');

    fireEvent.mouseLeave(socialButton);
    rerender(<GameControlDock primaryDisabled />);

    const playButton = screen.getByRole('button', { name: 'Advance to next phase' });
    const playShell = playButton.querySelector<HTMLImageElement>('.dock-node__shell');
    expect(playShell).not.toBeNull();
    expect(playShell?.getAttribute('src')).toContain('/assets/updated_nav_fab_bar/play_node_disabled_final.svg');
  });
});
