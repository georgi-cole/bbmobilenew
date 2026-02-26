/**
 * Unit tests for ChatOverlay component.
 *
 * Covers:
 *  1. Renders with role="dialog".
 *  2. Shows Skip button when skippable=true (default).
 *  3. Hides Skip button when skippable=false.
 *  4. Typing indicator appears after mount during autoPlay.
 *  5. Clicking Skip reveals all lines and calls onComplete.
 *  6. Skip button disappears after skip completes.
 *  7. onComplete fires after full autoPlay sequence.
 *  8. Renders player names in speaker labels.
 *  9. Renders header title and subtitle.
 * 10. Calls onComplete immediately when lines array is empty.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatOverlay, { EXIT_ANIM_MS } from '../../src/components/ChatOverlay/ChatOverlay';
import type { ChatLine } from '../../src/components/ChatOverlay/ChatOverlay';

const LINES: ChatLine[] = [
  { id: '1', role: 'host', text: 'Welcome to the show!' },
  {
    id: '2',
    role: 'nominee',
    player: { id: 'p1', name: 'Alex', avatar: '😊', status: 'nominated' },
    text: 'Please keep me in the game.',
  },
  {
    id: '3',
    role: 'nominee',
    player: { id: 'p2', name: 'Blake', avatar: '🙏', status: 'nominated' },
    text: 'I deserve to stay.',
  },
];

describe('ChatOverlay', () => {
  it('renders with role="dialog"', () => {
    render(<ChatOverlay lines={LINES} onComplete={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the Skip button when skippable=true (default)', () => {
    render(<ChatOverlay lines={LINES} onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  });

  it('does not show Skip button when skippable=false', () => {
    render(<ChatOverlay lines={LINES} skippable={false} onComplete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
  });

  it('typing indicator appears after mount during autoPlay', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<ChatOverlay lines={LINES} onComplete={onComplete} />);

    // Advance just past the initial delay (200ms) but before the typing indicator hides
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    // Typing indicator should now be visible
    const typingIndicator = document.querySelector('.chat-overlay__typing');
    expect(typingIndicator).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('clicking Skip reveals all lines and calls onComplete', async () => {
    const onComplete = vi.fn();
    render(<ChatOverlay lines={LINES} onComplete={onComplete} />);

    const skipBtn = screen.getByRole('button', { name: /skip/i });
    await userEvent.click(skipBtn);

    // All line texts must be visible
    expect(screen.getByText('Welcome to the show!')).toBeInTheDocument();
    expect(screen.getByText('Please keep me in the game.')).toBeInTheDocument();
    expect(screen.getByText('I deserve to stay.')).toBeInTheDocument();

    // onComplete must have been called
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Skip button disappears after skip completes', async () => {
    render(<ChatOverlay lines={LINES} onComplete={vi.fn()} />);
    const skipBtn = screen.getByRole('button', { name: /skip/i });
    await userEvent.click(skipBtn);
    // After skip, component is completed; Skip button should be gone
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
  });

  it('onComplete fires after autoPlay sequence finishes and user clicks Continue', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<ChatOverlay lines={[{ id: 'x', role: 'host', text: 'Hello' }]} onComplete={onComplete} />);

    // Advance timers past the full reveal sequence
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // onComplete must NOT have fired yet — waiting for user to dismiss
    expect(onComplete).not.toHaveBeenCalled();

    // Continue button should be visible after autoPlay completes
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await act(async () => {
      continueBtn.click();
    });

    // Advance past the exit animation
    await act(async () => {
      vi.advanceTimersByTime(EXIT_ANIM_MS + 50);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('renders player names in speaker labels when player is provided', async () => {
    render(<ChatOverlay lines={LINES} onComplete={vi.fn()} />);
    // Skip to reveal all lines
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Blake')).toBeInTheDocument();
  });

  it('renders header title and subtitle when provided', () => {
    render(
      <ChatOverlay
        lines={LINES}
        header={{ title: 'Final 4', subtitle: 'Hear the nominees' }}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText('Final 4')).toBeInTheDocument();
    expect(screen.getByText('Hear the nominees')).toBeInTheDocument();
  });

  it('calls onComplete immediately when lines array is empty', async () => {
    const onComplete = vi.fn();
    render(<ChatOverlay lines={[]} onComplete={onComplete} />);
    // onComplete should fire via useEffect
    await act(async () => {});
    expect(onComplete).toHaveBeenCalled();
  });
});
