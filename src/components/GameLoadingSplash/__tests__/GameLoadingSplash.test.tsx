import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GameLoadingSplash from '../GameLoadingSplash';

describe('GameLoadingSplash', () => {
  it('renders the eye loader with determinate progress', () => {
    const { container } = render(
      <GameLoadingSplash progress={42} status="Preparing the houseguest portraits." />,
    );

    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Preparing the houseguest portraits. 42%',
    );
    expect(screen.getByAltText('Kolequant')).toBeInTheDocument();
    expect(container.querySelector('.game-loading__eye-svg')).toHaveAttribute(
      'viewBox',
      '0 0 210 124',
    );
    expect(container.querySelectorAll('.game-loading__iris-rotor')).toHaveLength(1);
    expect(container.querySelectorAll('.game-loading__eye-progress')).toHaveLength(1);
    expect(container.querySelector('.kq-splash')).toBeNull();
  });

  it('clamps progress to the supported range', () => {
    render(<GameLoadingSplash progress={140} status="Entering the house." />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Entering the house. 100%');
  });
});
