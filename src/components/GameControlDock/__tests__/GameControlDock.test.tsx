import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GameControlDock from '../GameControlDock';

describe('GameControlDock', () => {
  it('renders the mockup-faithful three-zone command surface', () => {
    const { container } = render(<GameControlDock />);

    expect(container.querySelector('.game-command-dock')).not.toBeNull();
    expect(screen.getByText('FEED')).toBeInTheDocument();
    expect(screen.getByText('CONTINUE')).toBeInTheDocument();
    expect(screen.getByText('Advance to Results')).toBeInTheDocument();
    expect(screen.getByText('STRATEGY')).toBeInTheDocument();
    expect(container.querySelector('.game-command-dock__top-chevron')).not.toBeNull();
    expect(container.querySelector('.game-command-dock__honeycomb')).not.toBeNull();
    expect(container.querySelector('.game-control-dock__shell')).toBeNull();
    expect(container.querySelector('.game-control-dock__play')).toBeNull();
  });

  it('preserves all five existing actions, badges, and disabled behavior', () => {
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
        confessionalBadgeCount={2}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Social (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Incoming requests (7)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advance to next phase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Public meter (11)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confessional (2)' }));

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

  it('preserves unavailable module semantics without disabling the visual shell', () => {
    render(
      <GameControlDock
        socialDisabled
        incomingRequestsDisabled
        publicMeterDisabled
      />,
    );

    expect(screen.getByRole('button', { name: 'Social' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Incoming requests' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Public meter' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('forwards the confessional spotlight ref to the strategy icon target', () => {
    const confessionalIconRef = createRef<HTMLImageElement>();

    const { container } = render(<GameControlDock confessionalIconRef={confessionalIconRef} />);

    expect(confessionalIconRef.current).toBe(
      container.querySelector<HTMLImageElement>('.game-command-dock__spotlight-target'),
    );
  });
});
