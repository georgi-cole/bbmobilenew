/**
 * Unit tests: Hourglass component.
 *
 * Verifies that:
 *  1. Component renders without throwing.
 *  2. The root element has the expected data-testid and aria attributes.
 *  3. The inner DOM structure contains top/bottom chambers and sand elements.
 *  4. The `--htw-hg-dur` CSS custom property reflects cycleDurationMs.
 *  5. The `htw-hourglass--paused` class is applied when `running` is false.
 *  6. The `htw-hourglass--paused` class is absent when `running` is true.
 *  7. Changing `roundKey` causes the component to remount (animation restarts).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Hourglass from '../../../../src/ui/games/HoldTheWall/Hourglass';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Hourglass component', () => {
  it('renders without throwing', () => {
    expect(() => render(<Hourglass />)).not.toThrow();
  });

  it('has correct data-testid and aria attributes', () => {
    render(<Hourglass />);
    const root = screen.getByTestId('htw-hourglass');
    expect(root).toBeDefined();
    expect(root.getAttribute('role')).toBe('img');
    expect(root.getAttribute('aria-label')).toBe('Round timer');
  });

  it('renders top and bottom chambers with sand elements', () => {
    render(<Hourglass />);
    expect(screen.getByTestId('htw-hg-top')).toBeDefined();
    expect(screen.getByTestId('htw-hg-bottom')).toBeDefined();
    expect(screen.getByTestId('htw-hg-sand-top')).toBeDefined();
    expect(screen.getByTestId('htw-hg-sand-bottom')).toBeDefined();
    expect(screen.getByTestId('htw-hg-frame')).toBeDefined();
  });

  it('sets --htw-hg-dur CSS variable based on cycleDurationMs', () => {
    render(<Hourglass cycleDurationMs={5000} />);
    const root = screen.getByTestId('htw-hourglass');
    const style = root.getAttribute('style') ?? '';
    expect(style).toContain('--htw-hg-dur');
    expect(style).toContain('5.00s');
  });

  it('defaults --htw-hg-dur to 7.00s', () => {
    render(<Hourglass />);
    const root = screen.getByTestId('htw-hourglass');
    const style = root.getAttribute('style') ?? '';
    expect(style).toContain('7.00s');
  });

  it('applies htw-hourglass--paused when running is false', () => {
    render(<Hourglass running={false} />);
    const root = screen.getByTestId('htw-hourglass');
    expect(root.classList.contains('htw-hourglass--paused')).toBe(true);
  });

  it('does NOT apply htw-hourglass--paused when running is true', () => {
    render(<Hourglass running={true} />);
    const root = screen.getByTestId('htw-hourglass');
    expect(root.classList.contains('htw-hourglass--paused')).toBe(false);
  });

  it('does NOT apply htw-hourglass--paused by default', () => {
    render(<Hourglass />);
    const root = screen.getByTestId('htw-hourglass');
    expect(root.classList.contains('htw-hourglass--paused')).toBe(false);
  });

  it('remounts (gets fresh DOM) when React key changes', () => {
    // To trigger remount, use a wrapper that passes a different key.
    // React remounts the component when `key` changes.
    const { rerender, container } = render(
      <div>
        <Hourglass key={1} cycleDurationMs={5000} />
      </div>,
    );
    const firstHourglass = container.querySelector('[data-testid="htw-hourglass"]');

    rerender(
      <div>
        <Hourglass key={2} cycleDurationMs={5000} />
      </div>,
    );
    const secondHourglass = container.querySelector('[data-testid="htw-hourglass"]');

    // Both renders produce the same element structure
    expect(secondHourglass).toBeDefined();
    expect(secondHourglass?.getAttribute('data-testid')).toBe('htw-hourglass');
    // After remount, new DOM node should be present (same structure, different reference)
    expect(secondHourglass).not.toBe(firstHourglass);
  });
});
