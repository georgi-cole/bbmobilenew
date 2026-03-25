import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FinaleControls from '../src/components/FinalFaceoff/FinaleControls';

describe('FinaleControls', () => {
  it('disables Skip All only in the clues phase after all jurors are revealed', () => {
    render(
      <FinaleControls
        phase="clues"
        allRevealed
        isComplete={false}
        onSkipAll={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Starting recap…' });
    expect(button).toBeDisabled();
  });

  it('keeps Skip All usable during vote reveal even when all jurors are revealed', () => {
    const onSkipAll = vi.fn();

    render(
      <FinaleControls
        phase="revealVotes"
        allRevealed
        isComplete={false}
        onSkipAll={onSkipAll}
        onDismiss={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Skip All ▶▶' });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onSkipAll).toHaveBeenCalledTimes(1);
  });
});
