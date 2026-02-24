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
 * 14. Renders availability hint badge when action.availabilityHint is set.
 * 15. Does not render availability hint badge when action.availabilityHint is absent.
 * 16. availabilityReason shows overlay while card remains clickable.
 * 17. availabilityReason overlay uses reason text (takes precedence over disabledMessage).
 * 18. available=true adds ac-card--available class (green accent border).
 * 19. available=false + aggressive category adds ac-card--risky class (red accent border).
 * 20. available=false + non-aggressive category does not add ac-card--risky class.
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

const aggressiveAction: SocialActionDefinition = {
  id: 'startFight',
  title: 'Start Fight',
  category: 'aggressive',
  baseCost: 3,
};

const hintAction: SocialActionDefinition = {
  id: 'proposeAlliance',
  title: 'Propose Alliance',
  category: 'alliance',
  baseCost: 3,
  availabilityHint: 'Requires positive affinity',
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
    // baseCost.info = 2 → ×100 scaling → chip shows 200
    expect(screen.getByLabelText('Info cost: 200')).toBeDefined();
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

describe('ActionCard – availabilityHint badge', () => {
  it('renders availability hint badge when action.availabilityHint is set', () => {
    render(<ActionCard action={hintAction} />);
    expect(screen.getByLabelText('Requirement: Requires positive affinity')).toBeDefined();
    expect(screen.getByText('Requires positive affinity')).toBeDefined();
  });

  it('does not render availability hint badge when action.availabilityHint is absent', () => {
    render(<ActionCard action={baseAction} />);
    expect(screen.queryByLabelText(/^Requirement:/)).toBeNull();
  });
});

describe('ActionCard – availabilityReason prop', () => {
  it('shows an overlay with the reason text when availabilityReason is provided', () => {
    render(<ActionCard action={baseAction} availabilityReason="Insufficient energy: 1 ⚡ needed" />);
    expect(screen.getByText('Insufficient energy: 1 ⚡ needed')).toBeDefined();
  });

  it('card remains clickable when availabilityReason is set (not disabled)', () => {
    const onClick = vi.fn();
    render(
      <ActionCard
        action={baseAction}
        availabilityReason="Insufficient energy: 1 ⚡ needed"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }));
    expect(onClick).toHaveBeenCalledWith('compliment');
  });

  it('availabilityReason takes precedence over disabledMessage when both are set (card is disabled)', () => {
    render(
      <ActionCard
        action={baseAction}
        disabled
        disabledMessage="Unavailable"
        availabilityReason="Insufficient energy: 1 ⚡ needed"
      />,
    );
    // availabilityReason overrides disabledMessage in the overlay text
    expect(screen.getByText('Insufficient energy: 1 ⚡ needed')).toBeDefined();
    expect(screen.queryByText('Unavailable')).toBeNull();
  });

  it('aria-disabled remains false when only availabilityReason is set', () => {
    render(<ActionCard action={baseAction} availabilityReason="Insufficient energy: 1 ⚡ needed" />);
    const card = screen.getByRole('button', { name: /Compliment/i });
    expect(card.getAttribute('aria-disabled')).toBe('false');
  });
});

describe('ActionCard – available prop accent border', () => {
  it('adds ac-card--available class when available is true', () => {
    render(<ActionCard action={baseAction} available={true} />);
    const card = screen.getByRole('button', { name: /Compliment/i });
    expect(card.className).toContain('ac-card--available');
  });

  it('does not add ac-card--risky class when available is true', () => {
    render(<ActionCard action={aggressiveAction} available={true} />);
    const card = screen.getByRole('button', { name: /Start Fight/i });
    expect(card.className).not.toContain('ac-card--risky');
  });

  it('adds ac-card--risky class when available is false and category is aggressive', () => {
    render(<ActionCard action={aggressiveAction} available={false} />);
    const card = screen.getByRole('button', { name: /Start Fight/i });
    expect(card.className).toContain('ac-card--risky');
  });

  it('does not add ac-card--risky class when available is false and category is not aggressive', () => {
    render(<ActionCard action={baseAction} available={false} />);
    const card = screen.getByRole('button', { name: /Compliment/i });
    expect(card.className).not.toContain('ac-card--risky');
    expect(card.className).not.toContain('ac-card--available');
  });

  it('adds neither accent class when available is undefined', () => {
    render(<ActionCard action={baseAction} />);
    const card = screen.getByRole('button', { name: /Compliment/i });
    expect(card.className).not.toContain('ac-card--available');
    expect(card.className).not.toContain('ac-card--risky');
  });
});
