/**
 * Tests for the ExpandedPlayerView component.
 *
 * Covers:
 *  1. Renders the player's name.
 *  2. Renders the player's status.
 *  3. Renders the correct aria-label on the container.
 *  4. Displays affinity as a percentage when defined.
 *  5. Clamps affinity above 100 to 100%.
 *  6. Clamps affinity below 0 to 0%.
 *  7. Displays "—" when affinity is undefined.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Player } from '../../../types';
import ExpandedPlayerView from '../ExpandedPlayerView';

function makePlayer(overrides?: Partial<Player>): Player {
  return {
    id: 'p1',
    name: 'Alice',
    avatar: '😀',
    status: 'active',
    ...overrides,
  };
}

describe('ExpandedPlayerView', () => {
  it('renders the player name', () => {
    render(<ExpandedPlayerView player={makePlayer({ name: 'Bob' })} />);
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('renders the player status', () => {
    render(<ExpandedPlayerView player={makePlayer({ status: 'nominated' })} />);
    expect(screen.getByText('nominated')).toBeDefined();
  });

  it('sets the correct aria-label on the container', () => {
    render(<ExpandedPlayerView player={makePlayer({ name: 'Alice' })} />);
    expect(screen.getByLabelText('Alice details')).toBeDefined();
  });

  it('displays affinity as a percentage when defined', () => {
    render(<ExpandedPlayerView player={makePlayer()} affinity={65} />);
    expect(screen.getByText('65%')).toBeDefined();
  });

  it('clamps affinity above 100 to 100%', () => {
    render(<ExpandedPlayerView player={makePlayer()} affinity={150} />);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('clamps affinity below 0 to 0%', () => {
    render(<ExpandedPlayerView player={makePlayer()} affinity={-5} />);
    expect(screen.getByText('0%')).toBeDefined();
  });

  it('displays "—" when affinity is undefined', () => {
    render(<ExpandedPlayerView player={makePlayer()} />);
    expect(screen.getByText('—')).toBeDefined();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
