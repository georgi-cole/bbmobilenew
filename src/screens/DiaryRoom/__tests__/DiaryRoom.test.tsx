import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DiaryRoom from '../DiaryRoom';
import gameReducer from '../../../store/gameSlice';
import settingsReducer from '../../../store/settingsSlice';

function renderDiaryRoom(initialEntries = ['/game', '/diary-room']) {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
        <Routes>
          <Route path="/game" element={<div>Game route</div>} />
          <Route path="/diary-room" element={<DiaryRoom />} />
          <Route path="/self-evicted" element={<div>Self-evicted route</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

async function flushConversationTimers() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('DiaryRoom', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers and triggers tic tac toe when the player accepts after boredom', async () => {
    renderDiaryRoom();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: 'I am bored' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    expect(screen.getByText(/want to play a game|offer tic tac toe|wake the board/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: 'yeah' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    expect(screen.getByText(/tic tac toe would launch here/i)).toBeTruthy();
  });

  it('opens the self-evict modal after a clear confirmation', async () => {
    renderDiaryRoom();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: 'I wanna leave' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: 'yes' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /yes, leave/i })).toBeTruthy();
  });

  it('persists conversation state so a remounted chat still understands follow-up yes/no replies', async () => {
    const firstRender = renderDiaryRoom();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: "I'm bored" },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    expect(screen.getByText(/want to play a game|offer tic tac toe|wake the board/i)).toBeTruthy();

    firstRender.unmount();

    renderDiaryRoom();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: "I don't think so" },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/then sit with it|no game, then|boredom will keep you company/i)).toBeTruthy();
  });
});
