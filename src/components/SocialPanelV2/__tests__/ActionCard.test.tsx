/**
 * Tests for ActionCard component.
 *
 * Covers:
 *  1. Renders title.
 *  2. Renders energy cost chip for plain-number baseCost.
 *  3. Renders energy + info chips for object baseCost.
 *  4. Renders zero-cost chip when baseCost is 0.
 *  5. Renders description when provided.
 *  6. Calls onClick with action id when activated.
 *  7. Does not call onClick when disabled.
 *  8. Renders disabled overlay with default message.
 *  9. Renders disabled overlay with custom message.
 * 10. Renders Preview button and calls onPreview with action id.
 * 11. Preview button click does not trigger onClick.
 * 12. aria-pressed reflects selected state.
 * 13. aria-disabled reflects disabled state.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionCard from '../ActionCard';
import type { SocialActionDefinition } from '../../../social/socialActions';

// ── Fixtures ────────────────────────────────────────────────────────────────

const baseAction: SocialActionDefinition = {
  id: 'compliment',
  title: 'Compliment',
  category: 'friendly',
  baseCost: 1,
};

const objectCostAction: SocialActionDefinition = {
  id: 'whisper',
  title: 'Whisper',
  category: 'strategic',
  baseCost: { energy: 1, info: 2 },
};

const zeroCostAction: SocialActionDefinition = {
  id: 'idle',
  title: 'Stay Idle',
  category: 'strategic',
  baseCost: 0,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ActionCard – rendering', () => {
  it('renders the action title', () => {
    render(<ActionCard action={baseAction} />);
    expect(screen.getByText('Compliment')).toBeDefined();
  });

  it('renders energy chip for plain number baseCost', () => {
    render(<ActionCard action={baseAction} />);
    expect(screen.getByLabelText('Energy cost: 1')).toBeDefined();
  });

  it('renders energy and info chips for object baseCost', () => {
    render(<ActionCard action={objectCostAction} />);
    expect(screen.getByLabelText('Energy cost: 1')).toBeDefined();
    expect(screen.getByLabelText('Info cost: 2')).toBeDefined();
  });

  it('renders zero-cost chip when baseCost is 0', () => {
    render(<ActionCard action={zeroCostAction} />);
    expect(screen.getByLabelText('Energy cost: 0')).toBeDefined();
  });

  it('renders optional description', () => {
    render(<ActionCard action={baseAction} description="Say something nice" />);
    expect(screen.getByText('Say something nice')).toBeDefined();
  });

  it('does not render description element when not provided', () => {
    render(<ActionCard action={baseAction} />);
    expect(screen.queryByRole('generic', { name: /say something/i })).toBeNull();
  });
});

describe('ActionCard – interaction', () => {
  it('calls onClick with action id when clicked', () => {
    const onClick = vi.fn();
    render(<ActionCard action={baseAction} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }));
    expect(onClick).toHaveBeenCalledWith('compliment');
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<ActionCard action={baseAction} disabled onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders Preview button and calls onPreview with action id', () => {
    const onPreview = vi.fn();
    render(<ActionCard action={baseAction} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Compliment' }));
    expect(onPreview).toHaveBeenCalledWith('compliment');
  });

  it('Preview button click does not trigger onClick', () => {
    const onClick = vi.fn();
    const onPreview = vi.fn();
    render(<ActionCard action={baseAction} onClick={onClick} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Compliment' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledOnce();
  });
});

describe('ActionCard – disabled state', () => {
  it('renders disabled overlay with default message', () => {
    render(<ActionCard action={baseAction} disabled />);
    expect(screen.getByText('Unavailable')).toBeDefined();
  });

  it('renders disabled overlay with custom message', () => {
    render(<ActionCard action={baseAction} disabled disabledMessage="Not enough energy" />);
    expect(screen.getByText('Not enough energy')).toBeDefined();
  });

  it('sets aria-disabled when disabled', () => {
    render(<ActionCard action={baseAction} disabled />);
    const card = screen.getByRole('button', { name: /Compliment/i });
    expect(card.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('ActionCard – ARIA attributes', () => {
  it('sets aria-pressed to false when not selected', () => {
    render(<ActionCard action={baseAction} />);
    const card = screen.getByRole('button', { name: /Compliment/i });
    expect(card.getAttribute('aria-pressed')).toBe('false');
  });

  it('sets aria-pressed to true when selected', () => {
    render(<ActionCard action={baseAction} selected />);
    const card = screen.getByRole('button', { name: /Compliment/i });
    expect(card.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('ActionCard – hover / focus preview', () => {
  it('calls onHoverFocus with action id on mouseEnter', () => {
    const onHoverFocus = vi.fn();
    render(<ActionCard action={baseAction} onHoverFocus={onHoverFocus} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Compliment/i }));
    expect(onHoverFocus).toHaveBeenCalledWith('compliment');
  });

  it('calls onHoverFocus with action id on focus', () => {
    const onHoverFocus = vi.fn();
    render(<ActionCard action={baseAction} onHoverFocus={onHoverFocus} />);
    fireEvent.focus(screen.getByRole('button', { name: /Compliment/i }));
    expect(onHoverFocus).toHaveBeenCalledWith('compliment');
  });

  it('does not call onHoverFocus when the card is disabled', () => {
    const onHoverFocus = vi.fn();
    render(<ActionCard action={baseAction} disabled onHoverFocus={onHoverFocus} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Compliment/i }));
    fireEvent.focus(screen.getByRole('button', { name: /Compliment/i }));
    expect(onHoverFocus).not.toHaveBeenCalled();
  });
});
