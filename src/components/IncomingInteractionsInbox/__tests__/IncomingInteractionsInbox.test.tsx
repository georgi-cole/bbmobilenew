import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../../store/gameSlice';
import socialReducer, {
  openIncomingInbox,
  pushIncomingInteraction,
  updateRelationship,
  updateSocialMemory,
} from '../../../social/socialSlice';
import IncomingInteractionsInbox from '../IncomingInteractionsInbox';
import { socialMiddleware } from '../../../social/socialMiddleware';

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
  });
}

function makeStoreWithSocialMiddleware() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  });
}

function renderInbox(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <IncomingInteractionsInbox />
    </Provider>,
  );
}

function getNonUserPlayer(store: ReturnType<typeof makeStore>) {
  const player = store.getState().game.players.find((p) => !p.isUser);
  if (!player) {
    throw new Error('Expected a non-user player for test setup.');
  }
  return player;
}

describe('IncomingInteractionsInbox', () => {
  it('creates a store with a non-user player', () => {
    const store = makeStore();
    const player = getNonUserPlayer(store);
    expect(player.isUser).not.toBe(true);
  });

  it('sorts, groups, and summarizes interactions while marking them read', async () => {
    const store = makeStore();
    store.dispatch(openIncomingInbox());
    const otherId = getNonUserPlayer(store).id;
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
        requiresResponse: false,
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
        requiresResponse: false,
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
        resolvedWeek: 1,
        resolvedWith: 'positive',
      }),
    );

    renderInbox(store);

    expect(screen.getByText('4 pending • 3 urgent')).toBeInTheDocument();

    const needsSection = screen.getByLabelText('Needs Response');
    const needsItems = within(needsSection).getAllByRole('listitem');
    expect(needsItems).toHaveLength(2);
    expect(needsItems[0].textContent).toContain('High soon.');
    expect(needsItems[1].textContent).toContain('High later.');

    expect(within(needsSection).getByText('Urgent this week')).toBeInTheDocument();

    const updatesSection = screen.getByLabelText('Updates');
    const updatesItems = within(updatesSection).getAllByRole('listitem');
    expect(updatesItems).toHaveLength(2);
    expect(updatesItems[0].textContent).toContain('Medium soon.');
    expect(updatesItems[1].textContent).toContain('Low later.');
    expect(within(updatesSection).getByText('Expires this week')).toBeInTheDocument();

    const resolvedSection = screen.getByLabelText('Resolved Today');
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
    const otherPlayer = getNonUserPlayer(store);
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-3',
        fromId: otherPlayer.id,
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

    fireEvent.click(screen.getByRole('button', { name: 'Thank' }));

    const entry = store.getState().social.incomingInteractions.find((i) => i.id === 'interaction-3');
    expect(entry?.resolved).toBe(true);
    expect(entry?.resolvedWith).toBe('positive');
    expect(store.getState().game.tvFeed[0]?.text).toMatch(/encouraged/i);
  });

  it('marks both players as allies when accepting an alliance proposal', () => {
    const store = makeStoreWithSocialMiddleware();
    store.dispatch(openIncomingInbox());
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    const otherPlayer = getNonUserPlayer(store);
    store.dispatch(
      pushIncomingInteraction({
        id: 'alliance-proposal',
        fromId: otherPlayer.id,
        type: 'alliance_proposal',
        text: 'Want to lock this in?',
        createdAt: 320,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );

    renderInbox(store);

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    const socialState = store.getState().social;
    expect(socialState.relationships[otherPlayer.id]?.[humanId]?.tags).toContain('alliance');
    expect(socialState.relationships[humanId]?.[otherPlayer.id]?.tags).toContain('alliance');
    expect(socialState.energyBank[humanId]).toBe(2);
    expect(socialState.energyBank[otherPlayer.id]).toBe(2);
    expect(socialState.influenceBank[humanId]).toBe(200);
    expect(socialState.influenceBank[otherPlayer.id]).toBe(200);
  });

  it('renders contextual responses and tone labels', () => {
    const store = makeStore();
    store.dispatch(openIncomingInbox());
    const otherId = getNonUserPlayer(store).id;
    store.dispatch(
      updateRelationship({
        source: otherId,
        target: 'user',
        delta: -60,
      }),
    );
    store.dispatch(
      updateSocialMemory({
        actorId: otherId,
        targetId: 'user',
        deltas: { resentment: 8 },
      }),
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-tone',
        fromId: otherId,
        type: 'snide_remark',
        text: 'Tone check.',
        createdAt: 420,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }),
    );

    renderInbox(store);

    expect(screen.getByRole('button', { name: 'Fire back' })).toBeInTheDocument();
    expect(screen.getByText(/Bitter/)).toBeInTheDocument();
  });

  it('closes and logs the reason when the phase changes to eviction results', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = makeStore();
    store.dispatch(openIncomingInbox());

    renderInbox(store);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      store.dispatch(setPhase('eviction_results'));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().social.incomingInboxOpen).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Incoming social module did not open: Social modules are blocked during the eviction_results phase.'),
      expect.objectContaining({ phase: 'eviction_results' }),
    );

    warnSpy.mockRestore();
  });
});
