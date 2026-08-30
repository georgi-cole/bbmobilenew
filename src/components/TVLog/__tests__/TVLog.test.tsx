/**
 * Tests for TVLog component.
 *
 * Covers:
 *  1. tease() truncation helper — long strings, short strings, exact-length strings.
 *  2. Duplicate suppression — first entry matching mainTVMessage is hidden.
 *  3. Non-duplicate first entry remains visible.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
      makeEvent({ id: 'e1', text: 'Alex won the LOH competition!' }),
      makeEvent({ id: 'e2', text: 'The nominations are set.' }),
    ];
    render(<TVLog entries={entries} mainTVMessage="Alex won the LOH competition!" />);

    // e1 should be suppressed
    expect(screen.queryByText('Alex won the LOH competition!')).toBeNull();
    // e2 should still appear (possibly teased)
    expect(screen.getByText('The nominations are set.')).toBeDefined();
  });

  it('does NOT suppress the first entry when text differs from mainTVMessage', () => {
    const entries: TvEvent[] = [
      makeEvent({ id: 'e1', text: 'Alex won the LOH competition!' }),
    ];
    render(<TVLog entries={entries} mainTVMessage="Something else entirely" />);

    expect(screen.getByText('Alex won the LOH competition!')).toBeDefined();
  });

  it('does NOT suppress any entry when mainTVMessage is undefined', () => {
    const entries: TvEvent[] = [
      makeEvent({ id: 'e1', text: 'Alex won the LOH competition!' }),
    ];
    render(<TVLog entries={entries} />);

    expect(screen.getByText('Alex won the LOH competition!')).toBeDefined();
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
    const longText = 'The Big Eye drama unfolded as ' + 'x'.repeat(50);
    const entries: TvEvent[] = [makeEvent({ id: 'e1', text: longText })];

    render(<TVLog entries={entries} />);

    // Initially shows teased version
    const teased = tease(longText);
    expect(screen.getByText(teased)).toBeDefined();

    // Click to expand
    await userEvent.click(screen.getByText(teased));

    // Now shows the full text
    expect(screen.getByText(longText)).toBeDefined();
  });
});

describe('TVLog — mobile compact mode', () => {
  it('marks the feed for two-line mobile rendering when enabled', () => {
    const entries: TvEvent[] = [makeEvent({ id: 'e1', text: 'Compact mobile log message' })];

    render(<TVLog entries={entries} mobileTwoLineMode />);

    expect(screen.getByRole('list', { name: /Game event log/i }).getAttribute('data-mobile-two-line')).toBe('true');
  });

  it('allows callers to reserve a one-row scroller on tight game layouts', () => {
    const entries: TvEvent[] = [makeEvent({ id: 'e1', text: 'Compact mobile log message' })];

    render(<TVLog entries={entries} maxVisible={1} />);

    expect(screen.getByRole('list', { name: /Game event log/i }).getAttribute('style')).toContain(
      '--tv-log-max-vis: 1',
    );
  });
});

describe('TVLog — activity filters', () => {
  it('filters the feed without changing the underlying event list', async () => {
    const entries: TvEvent[] = [
      makeEvent({ id: 'game', text: 'Competition announced', type: 'game' }),
      makeEvent({ id: 'social', text: 'A new alliance formed', type: 'social' }),
    ];
    render(<TVLog entries={entries} />);

    await userEvent.click(screen.getByRole('button', { name: 'Social' }));
    expect(screen.getByText('A new alliance formed')).toBeDefined();
    expect(screen.queryByText('Competition announced')).toBeNull();
    expect(screen.getByRole('button', { name: 'Social' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels each event by type and exposes its timestamp', () => {
    const entries: TvEvent[] = [makeEvent({ id: 'vote', text: 'The vote is locked', type: 'vote' })];
    const { container } = render(<TVLog entries={entries} />);
    expect(screen.getByText('Vote')).toBeDefined();
    expect(container.querySelector('time[datetime]')).toBeTruthy();
  });
});
describe('TVLog — refined on-demand module', () => {
  it('keeps events off the main screen until the Log control is opened', async () => {
    document.body.classList.add('experiment-game-chrome-refined');
    const entries: TvEvent[] = [makeEvent({ id: 'game', text: 'Competition announced', type: 'game' })];
    render(<TVLog entries={entries} />);

    expect(screen.queryByText('Competition announced')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Open game log/i }));
    expect(screen.getByRole('dialog', { name: 'Game log' })).toBeDefined();
    expect(screen.getByText('Competition announced')).toBeDefined();

    document.body.classList.remove('experiment-game-chrome-refined');
  });

  it('shows lightweight inline rows when House Feed is active', () => {
    document.body.classList.add('experiment-game-chrome-refined');
    const entries: TvEvent[] = [makeEvent({ id: 'survivor', text: 'Survivor round begins', type: 'game' })];
    render(<TVLog entries={entries} maxVisible={2} inlineVisible />);

    expect(screen.getByText('Survivor round begins')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Open game log, /i })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    document.body.classList.remove('experiment-game-chrome-refined');
  });

  it('opens the full log when an inline House Feed row is tapped', async () => {
    document.body.classList.add('experiment-game-chrome-refined');
    const entries: TvEvent[] = [
      makeEvent({ id: 'latest', text: 'The POV ceremony is complete', type: 'game' }),
      makeEvent({ id: 'earlier', text: 'The nominees react to the result', type: 'social' }),
    ];
    render(<TVLog entries={entries} inlineVisible />);

    await userEvent.click(screen.getByRole('button', { name: /Open game log from Game event/i }));
    const dialog = screen.getByRole('dialog', { name: 'Game log' });
    expect(within(dialog).getByText('The nominees react to the result')).toBeDefined();

    document.body.classList.remove('experiment-game-chrome-refined');
  });
});
