import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, {
  openIncomingInbox,
  pushIncomingInteraction,
} from '../../../social/socialSlice';
import IncomingInteractionsInbox from '../IncomingInteractionsInbox';

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
  });
}

function renderInbox(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <IncomingInteractionsInbox />
    </Provider>,
  );
}

describe('IncomingInteractionsInbox', () => {
  it('renders interactions newest first and marks them read', async () => {
    const store = makeStore();
    store.dispatch(openIncomingInbox());
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-1',
        fromId: store.getState().game.players.find((p) => !p.isUser)!.id,
        type: 'gossip',
        text: 'Old message.',
        createdAt: 100,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-2',
        fromId: store.getState().game.players.find((p) => !p.isUser)!.id,
        type: 'compliment',
        text: 'New message.',
        createdAt: 200,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );

    renderInbox(store);

    const items = await screen.findAllByRole('listitem');
    expect(items[0].textContent).toContain('New message.');
    expect(items[1].textContent).toContain('Old message.');

    await waitFor(() => {
      const state = store.getState().social.incomingInteractions;
      expect(state.every((entry) => entry.read)).toBe(true);
    });
  });

  it('responds to an interaction from the inbox', () => {
    const store = makeStore();
    store.dispatch(openIncomingInbox());
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-3',
        fromId: store.getState().game.players.find((p) => !p.isUser)!.id,
        type: 'warning',
        text: 'Careful this week.',
        createdAt: 300,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );

    renderInbox(store);

    fireEvent.click(screen.getByRole('button', { name: 'Positive' }));

    const entry = store.getState().social.incomingInteractions.find((i) => i.id === 'interaction-3');
    expect(entry?.resolved).toBe(true);
    expect(entry?.resolvedWith).toBe('positive');
    expect(store.getState().game.tvFeed[0]?.text).toMatch(/encouraged/i);
  });
});
