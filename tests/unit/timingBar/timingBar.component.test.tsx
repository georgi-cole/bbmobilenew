import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import TimingBar from '../../../src/components/TimingBar/TimingBar';

vi.mock('../../../src/components/TimingBar/TimingBar.css', () => ({}));

function renderTimingBar(props: Partial<ComponentProps<typeof TimingBar>> = {}) {
  const store = configureStore({
    reducer: {
      game: (
        state = {
          players: [{ id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true }],
        },
      ) => state,
    },
  });

  return render(
    <Provider store={store}>
      <TimingBar seed={42} onFinish={vi.fn()} {...props} />
    </Provider>,
  );
}

describe('TimingBar', () => {
  it('starts directly on the round intro without showing a duplicate rules screen', () => {
    renderTimingBar();

    expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Begin Round 1 ▶' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ready to compete?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Game rules' })).not.toBeInTheDocument();
  });

  it('auto-starts into gameplay for hosted mode without restoring the duplicate rules screen', async () => {
    renderTimingBar({ autoStart: true });

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Begin Round 1 ▶' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ready to compete?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Game rules' })).not.toBeInTheDocument();
  });
});
