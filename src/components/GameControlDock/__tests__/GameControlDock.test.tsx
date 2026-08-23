import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GameControlDock from '../GameControlDock';

describe('GameControlDock', () => {
  it('uses the clean glassy dock shell, play, and icon assets', () => {
    const { container } = render(<GameControlDock />);

    const shell = container.querySelector<HTMLImageElement>('.game-control-dock__shell');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('src')).toContain('/assets/clean_glassy_dock/fab_shell_clean.svg');

    const play = container.querySelector<HTMLImageElement>('.game-control-dock__play');
    expect(play).not.toBeNull();
    expect(play?.getAttribute('src')).toContain('/assets/clean_glassy_dock/fab_center_play_clean.svg');

    const glyphs = Array.from(
      container.querySelectorAll<HTMLImageElement>('.game-control-dock__icon'),
    ).map((glyph) => glyph.getAttribute('src'));

    expect(glyphs).toEqual([
      expect.stringContaining('/assets/updated_nav_fab_bar/home_approved_final.svg'),
      expect.stringContaining('/assets/clean_glassy_dock/fab_icon_social_clean.svg'),
      expect.stringContaining('/assets/clean_glassy_dock/fab_icon_inbox_clean.svg'),
      expect.stringContaining('/assets/clean_glassy_dock/fab_icon_stats_clean.svg'),
      expect.stringContaining('/assets/clean_glassy_dock/fab_icon_confessional_clean.svg'),
    ]);
    expect(container.querySelector('.fab-more-glyph')).not.toBeNull();
  });

  it('preserves dock hit areas, badges, and disabled behavior', () => {
    const onChatClick = vi.fn();
    const onRequestsClick = vi.fn();
    const onPrimaryActionClick = vi.fn();
    const onPublicMeterClick = vi.fn();
    const onToolClick = vi.fn();

    const { rerender } = render(
      <GameControlDock
        onChatClick={onChatClick}
        onIncomingRequestsClick={onRequestsClick}
        onPrimaryActionClick={onPrimaryActionClick}
        onPublicMeterClick={onPublicMeterClick}
        onToolClick={onToolClick}
        chatBadgeCount={3}
        incomingRequestsBadgeCount={7}
        publicMeterBadgeCount={11}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Social (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Incoming requests (7)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advance to next phase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Public meter (11)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confessional' }));

    expect(onChatClick).toHaveBeenCalledTimes(1);
    expect(onRequestsClick).toHaveBeenCalledTimes(1);
    expect(onPrimaryActionClick).toHaveBeenCalledTimes(1);
    expect(onPublicMeterClick).toHaveBeenCalledTimes(1);
    expect(onToolClick).toHaveBeenCalledTimes(1);

    rerender(<GameControlDock disabled primaryDisabled />);

    expect(screen.getByRole('button', { name: 'Social' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Incoming requests' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Advance to next phase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Public meter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confessional' })).toBeDisabled();
  });

  it('forwards the confessional icon ref for spotlight targeting', () => {
    const confessionalIconRef = createRef<HTMLImageElement>();

    const { container } = render(<GameControlDock confessionalIconRef={confessionalIconRef} />);

    expect(confessionalIconRef.current).toBe(
      container.querySelector<HTMLImageElement>('.fab-icon.confessional'),
    );
  });

  it('opens a dock-attached one-column More menu and closes it on an outside pointer', () => {
    render(<GameControlDock />);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu', { name: 'More destinations' })).toBeDefined();
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu', { name: 'More destinations' })).toBeNull();
  });
});
