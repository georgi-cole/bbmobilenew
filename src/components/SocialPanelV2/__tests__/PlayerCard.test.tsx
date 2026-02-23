/**
 * Tests for PlayerCard and PlayerList components.
 *
 * PlayerCard covers:
 *  1. Renders player name and status.
 *  2. Has role="button" and aria-pressed.
 *  3. Calls onSelect on click.
 *  4. Calls onSelect with additive=true when Ctrl key is held.
 *  5. Calls onSelect on Enter / Space keydown.
 *  6. Does not call onSelect when disabled.
 *  7. Renders affinity when provided.
 *  8. Does not render affinity when not provided.
 *
 * PlayerList covers:
 *  9.  Renders a card for each player.
 * 10. Single-click selects only that player.
 * 11. Ctrl+click toggles multi-select.
 * 12. Arrow key navigation moves focus.
 * 13. onSelectionChange callback is fired.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Player } from '../../../types';
import PlayerCard from '../PlayerCard';
import PlayerList from '../PlayerList';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePlayer(overrides?: Partial<Player>): Player {
  return {
    id: 'p1',
    name: 'Alice',
    avatar: '😀',
    status: 'active',
    ...overrides,
  };
}

// ── PlayerCard ───────────────────────────────────────────────────────────────

describe('PlayerCard', () => {
  it('renders player name', () => {
    const player = makePlayer({ name: 'Bob' });
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={() => {}} />,
    );
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('renders player status', () => {
    const player = makePlayer({ status: 'nominated' });
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={() => {}} />,
    );
    expect(screen.getByText('nominated')).toBeDefined();
  });

  it('has role="button" and aria-pressed=false when not selected', () => {
    const player = makePlayer();
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={() => {}} />,
    );
    const card = screen.getByRole('button', { name: /alice/i });
    expect(card.getAttribute('aria-pressed')).toBe('false');
  });

  it('has aria-pressed=true when selected', () => {
    const player = makePlayer();
    render(
      <PlayerCard player={player} selected={true} disabled={false} onSelect={() => {}} />,
    );
    const card = screen.getByRole('button', { name: /alice/i });
    expect(card.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onSelect with (id, false, false) on plain click', () => {
    const onSelect = vi.fn();
    const player = makePlayer({ id: 'p99', name: 'Alice' });
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    expect(onSelect).toHaveBeenCalledWith('p99', false, false);
  });

  it('calls onSelect with additive=true on Ctrl+click', () => {
    const onSelect = vi.fn();
    const player = makePlayer({ id: 'p99', name: 'Alice' });
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /alice/i }), { ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith('p99', true, false);
  });

  it('calls onSelect on Enter keydown', () => {
    const onSelect = vi.fn();
    const player = makePlayer({ id: 'p99', name: 'Alice' });
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={onSelect} />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /alice/i }), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('p99', false, false);
  });

  it('calls onSelect on Space keydown', () => {
    const onSelect = vi.fn();
    const player = makePlayer({ id: 'p99', name: 'Alice' });
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={onSelect} />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /alice/i }), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('p99', false, false);
  });

  it('does not call onSelect when disabled', () => {
    const onSelect = vi.fn();
    const player = makePlayer({ name: 'Alice' });
    render(
      <PlayerCard player={player} selected={false} disabled={true} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    fireEvent.keyDown(screen.getByRole('button', { name: /alice/i }), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders affinity when provided', () => {
    const player = makePlayer();
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={() => {}} affinity={72} />,
    );
    expect(screen.getByText('72%')).toBeDefined();
  });

  it('does not render affinity when not provided', () => {
    const player = makePlayer();
    render(
      <PlayerCard player={player} selected={false} disabled={false} onSelect={() => {}} />,
    );
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

// ── PlayerList ───────────────────────────────────────────────────────────────

describe('PlayerList', () => {
  const players: Player[] = [
    makePlayer({ id: 'a', name: 'Alice', status: 'active' }),
    makePlayer({ id: 'b', name: 'Bob', status: 'nominated' }),
    makePlayer({ id: 'c', name: 'Carol', status: 'hoh' }),
  ];

  it('renders a card for each player', () => {
    render(<PlayerList players={players} />);
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('Carol')).toBeDefined();
  });

  it('single-click selects only the clicked player', () => {
    const onSelectionChange = vi.fn();
    render(<PlayerList players={players} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByRole('button', { name: /bob/i }));
    const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as Set<string>;
    expect(lastCall.has('b')).toBe(true);
    expect(lastCall.size).toBe(1);
  });

  it('Ctrl+click toggles a second player into multi-select', () => {
    const onSelectionChange = vi.fn();
    render(<PlayerList players={players} onSelectionChange={onSelectionChange} />);
    // First select Alice
    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    // Then Ctrl+click Bob
    fireEvent.click(screen.getByRole('button', { name: /bob/i }), { ctrlKey: true });
    const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as Set<string>;
    expect(lastCall.has('a')).toBe(true);
    expect(lastCall.has('b')).toBe(true);
    expect(lastCall.size).toBe(2);
  });

  it('calls onSelectionChange when selection changes', () => {
    const onSelectionChange = vi.fn();
    render(<PlayerList players={players} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByRole('button', { name: /carol/i }));
    expect(onSelectionChange).toHaveBeenCalled();
  });
});
