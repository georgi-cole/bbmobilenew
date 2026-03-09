import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  it('sorts, groups, and summarizes interactions while marking them read', async () => {
    const store = makeStore();
    store.dispatch(openIncomingInbox());
    const otherId = store.getState().game.players.find((p) => !p.isUser)!.id;
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-low-later',
        fromId: otherId,
        type: 'compliment',
        text: 'Low later.',
        createdAt: 120,
        createdWeek: 1,
        expiresAtWeek: 2,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-medium-soon',
        fromId: otherId,
        type: 'gossip',
        text: 'Medium soon.',
        createdAt: 140,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-high-later',
        fromId: otherId,
        type: 'deal_offer',
        text: 'High later.',
        createdAt: 160,
        createdWeek: 1,
        expiresAtWeek: 2,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-high-soon',
        fromId: otherId,
        type: 'nomination_plea',
        text: 'High soon.',
        createdAt: 180,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-resolved',
        fromId: otherId,
        type: 'compliment',
        text: 'Resolved note.',
        createdAt: 190,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: true,
        requiresResponse: true,
        resolved: true,
        resolvedAt: 190,
        resolvedWith: 'positive',
      }),
    );

    renderInbox(store);

    expect(screen.getByText('4 pending • 3 urgent')).toBeInTheDocument();

    const needsSection = screen.getByLabelText('Needs Response');
    const needsItems = within(needsSection).getAllByRole('listitem');
    expect(needsItems).toHaveLength(4);
    expect(needsItems[0].textContent).toContain('High soon.');
    expect(needsItems[1].textContent).toContain('High later.');
    expect(needsItems[2].textContent).toContain('Medium soon.');
    expect(needsItems[3].textContent).toContain('Low later.');

    expect(within(needsSection).getByText('Urgent this week')).toBeInTheDocument();
    expect(within(needsSection).getByText('Needs response this week')).toBeInTheDocument();

    const resolvedSection = screen.getByLabelText('Resolved This Week');
    const resolvedItems = within(resolvedSection).getAllByRole('listitem');
    expect(resolvedItems).toHaveLength(1);
    expect(resolvedItems[0].textContent).toContain('Resolved note.');
    expect(resolvedItems[0].className).toContain('inbox-item--resolved');

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
