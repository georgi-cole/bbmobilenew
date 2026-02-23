/**
 * Tests for ActionGrid component.
 *
 * Covers:
 *  1. Renders a card for every action in SOCIAL_ACTIONS.
 *  2. Calls onActionClick with the action id when a card is activated.
 *  3. Calls onPreview with the action id when a Preview button is clicked.
 *  4. Cards in disabledIds are rendered as disabled.
 *  5. The selectedId card has aria-pressed="true"; others have aria-pressed="false".
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionGrid from '../ActionGrid';
import { SOCIAL_ACTIONS } from '../../../social/socialActions';

describe('ActionGrid – rendering', () => {
  it('renders a card for every action in SOCIAL_ACTIONS', () => {
    render(<ActionGrid />);
    for (const action of SOCIAL_ACTIONS) {
      expect(screen.getByText(action.title)).toBeDefined();
    }
  });
});

describe('ActionGrid – interaction', () => {
  it('calls onActionClick with action id when a card is clicked', () => {
    const onActionClick = vi.fn();
    render(<ActionGrid onActionClick={onActionClick} />);
    // Click the first action card
    const firstAction = SOCIAL_ACTIONS[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(firstAction.title, 'i') }));
    expect(onActionClick).toHaveBeenCalledWith(firstAction.id);
  });

  it('calls onPreview with action id when Preview button is clicked', () => {
    const onPreview = vi.fn();
    render(<ActionGrid onPreview={onPreview} />);
    const firstAction = SOCIAL_ACTIONS[0];
    fireEvent.click(screen.getByRole('button', { name: `Preview ${firstAction.title}` }));
    expect(onPreview).toHaveBeenCalledWith(firstAction.id);
  });
});

describe('ActionGrid – disabled and selected state', () => {
  it('marks cards in disabledIds as disabled', () => {
    const disabledIds = new Set([SOCIAL_ACTIONS[0].id]);
    render(<ActionGrid disabledIds={disabledIds} />);
    const firstCard = screen.getByRole('button', {
      name: new RegExp(SOCIAL_ACTIONS[0].title, 'i'),
    });
    expect(firstCard.getAttribute('aria-disabled')).toBe('true');
  });

  it('non-disabled cards are not disabled', () => {
    const disabledIds = new Set([SOCIAL_ACTIONS[0].id]);
    render(<ActionGrid disabledIds={disabledIds} />);
    const secondCard = screen.getByRole('button', {
      name: new RegExp(SOCIAL_ACTIONS[1].title, 'i'),
    });
    expect(secondCard.getAttribute('aria-disabled')).toBe('false');
  });

  it('selectedId card has aria-pressed true', () => {
    const selected = SOCIAL_ACTIONS[2];
    render(<ActionGrid selectedId={selected.id} />);
    const card = screen.getByRole('button', { name: new RegExp(selected.title, 'i') });
    expect(card.getAttribute('aria-pressed')).toBe('true');
  });

  it('non-selected cards have aria-pressed false', () => {
    const selected = SOCIAL_ACTIONS[2];
    render(<ActionGrid selectedId={selected.id} />);
    const otherCard = screen.getByRole('button', {
      name: new RegExp(SOCIAL_ACTIONS[0].title, 'i'),
    });
    expect(otherCard.getAttribute('aria-pressed')).toBe('false');
  });
});
