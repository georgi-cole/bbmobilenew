/**
 * Tests for ActionGrid component.
 *
 * Covers:
 *  1. Renders a card for every action in SOCIAL_ACTIONS.
 *  2. Calls onActionClick with the action id when a card is activated.
 *  3. Calls onPreview with the action id when a Preview button is clicked.
 *  4. Cards in disabledIds are rendered as disabled.
 *  5. The selectedId card has aria-pressed="true"; others have aria-pressed="false".
 *  6. ArrowRight moves focus to the next action card.
 *  7. ArrowLeft moves focus to the previous action card.
 *  8. Hovering a card shows the PreviewPopup with "Select target(s) to preview" when no targets.
 *  9. Hovering a card shows per-target deltas when selectedTargetIds and players are provided.
 * 10. Mouse leaving the grid clears the preview.
 * 11. Canonical order preserved when actorEnergy is undefined.
 * 12. Affordable actions appear before unaffordable ones when actorEnergy is provided.
 * 13. Unavailable (unaffordable) actions show the correct availabilityReason overlay text.
 * 14. Affordable actions do not show an availabilityReason overlay.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ActionGrid from '../ActionGrid';
import { SOCIAL_ACTIONS } from '../../../social/socialActions';
import { normalizeActionCosts } from '../../../social/smExecNormalize';

/** Actions visible in the human-player grid (excludes aiOnly entries). */
const VISIBLE_ACTIONS = SOCIAL_ACTIONS.filter((a) => !a.aiOnly);

/** Actions visible without any target selected (also excludes role-gated). */
const DEFAULT_VISIBLE_ACTIONS = VISIBLE_ACTIONS.filter((a) => !a.requiredTargetStatus);

describe('ActionGrid – rendering', () => {
  it('renders a card for every non-aiOnly, non-role-gated action in SOCIAL_ACTIONS', () => {
    render(<ActionGrid />);
    for (const action of DEFAULT_VISIBLE_ACTIONS) {
      expect(screen.getByText(action.title)).toBeDefined();
    }
  });

  it('hides role-gated actions when no primaryTargetStatus is provided', () => {
    render(<ActionGrid />);
    const roleGatedActions = VISIBLE_ACTIONS.filter((a) => a.requiredTargetStatus);
    for (const action of roleGatedActions) {
      expect(screen.queryByRole('button', { name: new RegExp(action.title, 'i') })).toBeNull();
    }
  });

  it('shows role-gated actions when primaryTargetStatus matches', () => {
    render(<ActionGrid primaryTargetStatus="loh" />);
    const lohActions = VISIBLE_ACTIONS.filter(
      (a) => a.requiredTargetStatus?.includes('loh'),
    );
    for (const action of lohActions) {
      expect(screen.getByText(action.title)).toBeDefined();
    }
  });

  it('shows POS-gated actions when primaryTargetStatus matches the POS holder', () => {
    render(<ActionGrid primaryTargetStatus="pos" />);
    expect(screen.getByText('Ask to Use Safety')).toBeDefined();
  });

  it('does not render aiOnly actions', () => {
    render(<ActionGrid />);
    const aiOnlyActions = SOCIAL_ACTIONS.filter((a) => a.aiOnly);
    for (const action of aiOnlyActions) {
      expect(screen.queryByRole('button', { name: new RegExp(action.title, 'i') })).toBeNull();
    }
  });
});

describe('ActionGrid – interaction', () => {
  it('calls onActionClick with action id when a card is clicked', () => {
    const onActionClick = vi.fn();
    render(<ActionGrid onActionClick={onActionClick} />);
    // Click the first visible action card
    const firstAction = VISIBLE_ACTIONS[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(firstAction.title, 'i') }));
    expect(onActionClick).toHaveBeenCalledWith(firstAction.id);
  });

  it('calls onPreview with action id when Preview button is clicked', () => {
    const onPreview = vi.fn();
    render(<ActionGrid onPreview={onPreview} />);
    const firstAction = VISIBLE_ACTIONS[0];
    fireEvent.click(screen.getByRole('button', { name: `Preview ${firstAction.title}` }));
    expect(onPreview).toHaveBeenCalledWith(firstAction.id);
  });
});

describe('ActionGrid – disabled and selected state', () => {
  it('marks cards in disabledIds as disabled', () => {
    const disabledIds = new Set([VISIBLE_ACTIONS[0].id]);
    render(<ActionGrid disabledIds={disabledIds} />);
    const firstCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[0].title, 'i'),
    });
    expect(firstCard.getAttribute('aria-disabled')).toBe('true');
  });

  it('non-disabled cards are not disabled', () => {
    const disabledIds = new Set([VISIBLE_ACTIONS[0].id]);
    render(<ActionGrid disabledIds={disabledIds} />);
    const secondCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[1].title, 'i'),
    });
    expect(secondCard.getAttribute('aria-disabled')).toBe('false');
  });

  it('selectedId card has aria-pressed true', () => {
    // Use compliment (index 0) - title is "Compliment", should be unambiguous
    const selected = VISIBLE_ACTIONS[0];
    render(<ActionGrid selectedId={selected.id} />);
    const cards = screen.getAllByRole('button', { name: new RegExp(selected.title, 'i') });
    const card = cards.find((el) => el.getAttribute('data-action-id') === selected.id);
    expect(card).toBeDefined();
    expect(card!.getAttribute('aria-pressed')).toBe('true');
  });

  it('non-selected cards have aria-pressed false', () => {
    const selected = VISIBLE_ACTIONS[0];
    render(<ActionGrid selectedId={selected.id} />);
    const cards = screen.getAllByRole('button', { name: new RegExp(VISIBLE_ACTIONS[1].title, 'i') });
    const otherCard = cards.find((el) => el.getAttribute('data-action-id') === VISIBLE_ACTIONS[1].id);
    expect(otherCard).toBeDefined();
    expect(otherCard!.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ActionGrid – keyboard navigation', () => {
  it('ArrowRight moves focus to the next card', () => {
    render(<ActionGrid />);
    const firstCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[0].title, 'i'),
    });
    const secondCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[1].title, 'i'),
    });
    firstCard.focus();
    act(() => {
      fireEvent.keyDown(firstCard.closest('[role="group"]')!, { key: 'ArrowRight' });
    });
    expect(document.activeElement).toBe(secondCard);
  });

  it('ArrowLeft moves focus to the previous card', () => {
    render(<ActionGrid />);
    const firstCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[0].title, 'i'),
    });
    const secondCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[1].title, 'i'),
    });
    secondCard.focus();
    act(() => {
      fireEvent.keyDown(secondCard.closest('[role="group"]')!, { key: 'ArrowLeft' });
    });
    expect(document.activeElement).toBe(firstCard);
  });
});

describe('ActionGrid – preview popup', () => {
  it('shows "Select target(s) to preview" when no targets are selected on hover', () => {
    render(<ActionGrid />);
    const firstCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[0].title, 'i'),
    });
    fireEvent.mouseEnter(firstCard);
    expect(screen.getByText('Select target(s) to preview')).toBeDefined();
  });

  it('shows per-target deltas when selectedTargetIds and players are provided', () => {
    const players = [{ id: 'p1', name: 'Alice', avatar: '😀', status: 'active' as const }];
    render(
      <ActionGrid
        selectedTargetIds={new Set(['p1'])}
        players={players}
      />,
    );
    const firstCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[0].title, 'i'),
    });
    fireEvent.mouseEnter(firstCard);
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('clears the preview when the mouse leaves the grid', () => {
    render(<ActionGrid />);
    const firstCard = screen.getByRole('button', {
      name: new RegExp(VISIBLE_ACTIONS[0].title, 'i'),
    });
    const grid = firstCard.closest('[role="group"]')!;
    fireEvent.mouseEnter(firstCard);
    expect(screen.queryByText('Select target(s) to preview')).not.toBeNull();
    fireEvent.mouseLeave(grid);
    expect(screen.queryByText('Select target(s) to preview')).toBeNull();
  });
});

describe('ActionGrid – actorEnergy sorting and availability', () => {
  it('preserves canonical order (visible actions only) when actorEnergy is undefined', () => {
    render(<ActionGrid />);
    const cards = screen.getAllByRole('button', { name: /./i }).filter(
      (el) => el.hasAttribute('data-action-id'),
    );
    const renderedIds = cards.map((c) => c.getAttribute('data-action-id'));
    const canonicalIds = DEFAULT_VISIBLE_ACTIONS.map((a) => a.id);
    expect(renderedIds).toEqual(canonicalIds);
  });

  it('places affordable actions before unaffordable ones when actorEnergy is provided', () => {
    // With energy=1, influence=0, info=0: affordable actions are those with
    // energy<=1 AND no influence/info costs. Unaffordable are all others.
    render(<ActionGrid actorEnergy={1} actorInfluence={0} actorInfo={0} />);
    const cards = screen.getAllByRole('button', { name: /./i }).filter(
      (el) => el.hasAttribute('data-action-id'),
    );
    const renderedIds = cards.map((c) => c.getAttribute('data-action-id'));
    // Compute affordable/unaffordable using the same logic as the component
    // (visible only, excluding role-gated actions since no target status is set)
    const actorResources = { energy: 1, influence: 0, info: 0 };
    const affordableIds = DEFAULT_VISIBLE_ACTIONS.filter((a) => {
      const costs = normalizeActionCosts(a);
      return (
        costs.energy <= actorResources.energy &&
        costs.influence <= actorResources.influence &&
        costs.info <= actorResources.info
      );
    }).map((a) => a.id);
    const unaffordableIds = DEFAULT_VISIBLE_ACTIONS.filter((a) => {
      const costs = normalizeActionCosts(a);
      return !(
        costs.energy <= actorResources.energy &&
        costs.influence <= actorResources.influence &&
        costs.info <= actorResources.info
      );
    }).map((a) => a.id);
    // All affordable ids should appear before all unaffordable ids
    const lastAffordableIndex = Math.max(...affordableIds.map((id) => renderedIds.indexOf(id)));
    const firstUnaffordableIndex = Math.min(...unaffordableIds.map((id) => renderedIds.indexOf(id)));
    expect(lastAffordableIndex).toBeLessThan(firstUnaffordableIndex);
  });

  it('shows the availability reason overlay on unaffordable cards', () => {
    // With energy=0: every action with energy cost >0 is unaffordable
    render(<ActionGrid actorEnergy={0} />);
    // Several actions cost 1 energy — at least one overlay should be present
    const overlays = screen.getAllByText(/Need ⚡\d/);
    expect(overlays.length).toBeGreaterThan(0);
  });

  it('does not show availability reason for affordable actions', () => {
    // With ample resources all actions are affordable — no overlays
    render(<ActionGrid actorEnergy={100} actorInfluence={1000} actorInfo={1000} />);
    expect(screen.queryByText(/Need ⚡/)).toBeNull();
    expect(screen.queryByText(/Need 🤝/)).toBeNull();
    expect(screen.queryByText(/Need 💡/)).toBeNull();
  });
});
