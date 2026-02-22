/**
 * Tests for TVLog component.
 *
 * Covers:
 *  1. tease() truncation helper — long strings, short strings, exact-length strings.
 *  2. Duplicate suppression — first entry matching mainTVMessage is hidden.
 *  3. Non-duplicate first entry remains visible.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TVLog from '../TVLog';
import { tease } from '../../../utils/tvLogTemplates';
import type { TvEvent } from '../../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TvEvent> & Pick<TvEvent, 'id' | 'text'>): TvEvent {
  return {
    type: 'game',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── tease() ──────────────────────────────────────────────────────────────────

describe('tease()', () => {
  it('returns text unchanged when it is shorter than maxLen', () => {
    expect(tease('short text', 60)).toBe('short text');
  });

  it('returns text unchanged when length equals maxLen', () => {
    const text = 'a'.repeat(60);
    expect(tease(text, 60)).toBe(text);
  });

  it('truncates text longer than maxLen and appends ellipsis', () => {
    const text = 'a'.repeat(80);
    const result = tease(text, 60);
    expect(result).toHaveLength(61); // 60 chars + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  it('trims trailing whitespace before appending ellipsis', () => {
    const text = 'hello world   '.padEnd(65, 'x');
    const result = tease(text, 14); // cuts into the spaces
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });

  it('uses 60 as the default maxLen', () => {
    const text = 'b'.repeat(61);
    const result = tease(text);
    expect(result).toHaveLength(61); // 60 chars + '…'
  });
});

// ── Duplicate suppression ─────────────────────────────────────────────────────

describe('TVLog — duplicate suppression', () => {
  it('hides the first entry when its text matches mainTVMessage', () => {
    const entries: TvEvent[] = [
      makeEvent({ id: 'e1', text: 'Alex won the HOH competition!' }),
      makeEvent({ id: 'e2', text: 'The nominations are set.' }),
    ];
    render(<TVLog entries={entries} mainTVMessage="Alex won the HOH competition!" />);

    // e1 should be suppressed
    expect(screen.queryByText('Alex won the HOH competition!')).toBeNull();
    // e2 should still appear (possibly teased)
    expect(screen.getByText('The nominations are set.')).toBeDefined();
  });

  it('does NOT suppress the first entry when text differs from mainTVMessage', () => {
    const entries: TvEvent[] = [
      makeEvent({ id: 'e1', text: 'Alex won the HOH competition!' }),
    ];
    render(<TVLog entries={entries} mainTVMessage="Something else entirely" />);

    expect(screen.getByText('Alex won the HOH competition!')).toBeDefined();
  });

  it('does NOT suppress any entry when mainTVMessage is undefined', () => {
    const entries: TvEvent[] = [
      makeEvent({ id: 'e1', text: 'Alex won the HOH competition!' }),
    ];
    render(<TVLog entries={entries} />);

    expect(screen.getByText('Alex won the HOH competition!')).toBeDefined();
  });

  it('only suppresses the first matching entry, not subsequent ones', () => {
    const entries: TvEvent[] = [
      makeEvent({ id: 'e1', text: 'Repeat message' }),
      makeEvent({ id: 'e2', text: 'Repeat message' }),
    ];
    render(<TVLog entries={entries} mainTVMessage="Repeat message" />);

    // The first is suppressed; the second should still appear
    const items = screen.getAllByText('Repeat message');
    expect(items).toHaveLength(1);
  });
});

// ── Expand on click ───────────────────────────────────────────────────────────

describe('TVLog — expand on click', () => {
  it('shows full text after clicking a teased entry', async () => {
    const longText = 'Big Brother drama unfolded as ' + 'x'.repeat(50);
    const entries: TvEvent[] = [makeEvent({ id: 'e1', text: longText })];

    render(<TVLog entries={entries} />);

    // Initially shows teased version
    const teased = tease(longText);
    expect(screen.getByText(teased)).toBeDefined();

    // Click to expand
    await userEvent.click(screen.getByRole('button', { name: teased }));

    // Now shows the full text
    expect(screen.getByText(longText)).toBeDefined();
  });
});
