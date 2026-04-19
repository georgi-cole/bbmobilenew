import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Credits from '../Credits';

function renderCredits() {
  return render(
    <MemoryRouter initialEntries={['/credits']}>
      <Routes>
        <Route path="/credits" element={<Credits />} />
        <Route path="/" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Credits', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the provided credits over the background image and exits on tap', () => {
    renderCredits();

    const stage = screen.getByRole('button', { name: 'Tap to exit credits' });
    const credits = screen.getByLabelText('Credits');

    expect(stage).toHaveStyle({
      backgroundImage: expect.stringContaining('assets/credits/credits-background.png'),
    });
    expect(credits).toHaveTextContent('Thank YOU for playing');
    expect(credits).toHaveTextContent('Created by:\nGeorgi Cole');

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(stage);
      vi.advanceTimersByTime(420);
    });

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('exits when Escape is pressed', () => {
    renderCredits();

    vi.useFakeTimers();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
      vi.advanceTimersByTime(420);
    });

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });
});
