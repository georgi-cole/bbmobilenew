import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, useNavigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import DiaryRoom, { DIARY_ROOM_ENTRY_OVERLAY_MS } from '../DiaryRoom';
import gameReducer, {
  triggerSecretMission,
  offerSecretMission,
  acceptSecretMission,
  completeMission,
  hydrateGame,
} from '../../../store/gameSlice';
import settingsReducer from '../../../store/settingsSlice';
import socialReducer from '../../../social/socialSlice';
import type { RootState } from '../../../store/store';
import { getSecretMissionBoxRewards } from '../../../bb/secretMission';
import {
  loadEvictionVoteBreakdownUnlock,
  saveEvictionVoteBreakdownUnlock,
} from '../../../features/evictionVoteBreakdownStorage';

function renderDiaryRoom(
  initialEntries = ['/game', '/diary-room'],
  options?: { setupStore?: (store: ReturnType<typeof configureStore>) => void },
) {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      social: socialReducer,
    },
  });

  options?.setupStore?.(store);

  return {
    store,
    ...render(
      <Provider store={store}>
        <RouterProvider router={createMemoryRouter([
          { path: '/game', element: <div>Game route</div> },
          { path: '/diary-room', element: <DiaryRoom /> },
          { path: '/self-evicted', element: <div>Self-evicted route</div> },
        ], {
          initialEntries,
          initialIndex: initialEntries.length - 1,
        })}
        />
      </Provider>,
    ),
  };
}

function DiaryRoomWithEscapeRoute() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate('/game')}>
        Leave route
      </button>
      <DiaryRoom />
    </>
  );
}

function renderDiaryRoomWithEscapeRoute(
  initialEntries = ['/game', '/diary-room'],
  options?: { setupStore?: (store: ReturnType<typeof configureStore>) => void },
) {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      social: socialReducer,
    },
  });

  options?.setupStore?.(store);

  return {
    store,
    ...render(
      <Provider store={store}>
        <RouterProvider router={createMemoryRouter([
          { path: '/game', element: <div>Game route</div> },
          { path: '/diary-room', element: <DiaryRoomWithEscapeRoute /> },
          { path: '/self-evicted', element: <div>Self-evicted route</div> },
        ], {
          initialEntries,
          initialIndex: initialEntries.length - 1,
        })}
        />
      </Provider>,
    ),
  };
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

    expect(screen.getByRole('group', { name: /tic tac toe board/i })).toBeTruthy();
    expect(screen.getByLabelText(/tic tac toe status/i).textContent).toMatch(/your turn/i);
    expect(screen.getByRole('button', { name: /reset/i })).toBeTruthy();
  });

  it('lets the player make a move and the big eye answers with a simple move', async () => {
    renderDiaryRoom();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: 'I am bored' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: 'yeah' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    fireEvent.click(screen.getByRole('button', { name: /tic tac toe square 1/i }));

    expect(screen.getByRole('button', { name: /tic tac toe square 1, x/i })).toBeTruthy();
    expect(screen.getByLabelText(/tic tac toe status/i).textContent).toMatch(/thinking/i);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(420);
    });

    expect(screen.getByRole('button', { name: /tic tac toe square 5, o/i })).toBeTruthy();
    expect(screen.getByLabelText(/tic tac toe status/i).textContent).toMatch(/your turn/i);
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

  it('does not open the self-evict modal while a confessional decision is pending', async () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        appStore.dispatch(hydrateGame({
          ...game,
          phase: 'live_vote',
          awaitingHumanVote: true,
        }));
      },
    });

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

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('confessional-decision-message')).toBeTruthy();
  });

  it('greets the player on first entry', async () => {
    renderDiaryRoom();
    await flushConversationTimers();

    expect(
      screen.getByText(/hello, you! welcome to the confessional\. here your thoughts may be echoed off the walls/i),
    ).toBeTruthy();
  });

  it('clears prior chat after leaving and re-entering the confessional', async () => {
    const firstRender = renderDiaryRoom();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: "I'm bored" },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    expect(screen.getByText(/want to play a game|offer tic tac toe|wake the board/i)).toBeTruthy();

    firstRender.unmount();

    renderDiaryRoom();
    await flushConversationTimers();

    expect(screen.queryByText(/i'm bored/i)).toBeNull();
    expect(screen.queryByText(/want to play a game|offer tic tac toe|wake the board/i)).toBeNull();
    expect(
      screen.getByText(/welcome back\. i am all eyes\.|i have been expecting you\.|ah, you return\.|something tells me you are uneasy\./i),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: "I don't think so" },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await flushConversationTimers();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/then sit with it|no game, then|boredom will keep you company/i)).toBeNull();
    expect(screen.getByText(/interesting\. resistance leaves a shape\.|refusal can be useful\.|no is still an answer\./i)).toBeTruthy();
  });

  it('shows only the confessional view without log or daily tabs', () => {
    renderDiaryRoom();

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab', { name: /log/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /daily/i })).toBeNull();
    expect(screen.getByLabelText(/confessional chat/i)).toBeTruthy();
  });

  it('plays the confessional door animation on entry', async () => {
    renderDiaryRoom();

    expect(screen.getByTestId('confessional-entry-overlay')).toBeTruthy();
    expect(screen.getByTestId('diary-room-shell')).toHaveClass('diary-room__shell--masked');
    const doorImages = screen.getAllByTestId('confessional-entry-door-image');
    expect(doorImages).toHaveLength(2);
    doorImages.forEach((doorImage) => {
      expect(doorImage.getAttribute('src')).toContain(
        '/assets/diary-room/confessional-locked-door.png',
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIARY_ROOM_ENTRY_OVERLAY_MS);
    });

    expect(screen.queryByTestId('confessional-entry-overlay')).toBeNull();
    expect(screen.getByTestId('diary-room-shell')).not.toHaveClass('diary-room__shell--masked');
  });

  it('does not show a shuffle control for accepted secret missions', () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (store) => {
        store.dispatch(triggerSecretMission(5));
        store.dispatch(offerSecretMission(5));
        store.dispatch(acceptSecretMission());
      },
    });

    expect(screen.queryByRole('button', { name: /shuffle mission/i })).toBeNull();
  });

  it('answers task-number hint requests from the active mission checklist', async () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (store) => {
        store.dispatch(triggerSecretMission(5));
        store.dispatch(offerSecretMission(5));
        store.dispatch(acceptSecretMission());
      },
    });

    const tasks = store.getState().game.secretMission!.tasks;
    const taskIndex = tasks.findIndex((task) => task.type === 'social_energy_empty_streak');
    const requestedIndex = taskIndex >= 0 ? taskIndex : 0;

    fireEvent.change(screen.getByLabelText(/diary entry/i), {
      target: { value: `How do I complete task ${requestedIndex + 1}?` },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await flushConversationTimers();

    if (taskIndex >= 0) {
      expect(screen.getByText(/Social Energy badge.*reaches 0/i)).toBeTruthy();
    } else {
      expect(screen.getByText(new RegExp(`To complete task ${requestedIndex + 1}`, 'i'))).toBeTruthy();
    }
  });

  it('shows four mystery reward boxes once a secret mission is completed', () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (store) => {
        store.dispatch(triggerSecretMission(5));
        store.dispatch(offerSecretMission(5));
        store.dispatch(acceptSecretMission());
        store.dispatch(completeMission());
      },
    });

    expect(screen.getByLabelText(/secret mission reward boxes/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /open mystery box 1/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open mystery box 2/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open mystery box 3/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open mystery box 4/i })).toBeTruthy();
  });

  it('lets the player claim the box assigned to immunity from the confessional', () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (store) => {
        store.dispatch(triggerSecretMission(5));
        store.dispatch(offerSecretMission(5));
        store.dispatch(acceptSecretMission());
        store.dispatch(completeMission());
      },
    });

    const assignedRewards = getSecretMissionBoxRewards(store.getState().game.secretMission!);
    const immunityBoxIndex = assignedRewards.indexOf('immunity');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`open mystery box ${immunityBoxIndex + 1}`, 'i') }));

    expect(store.getState().game.secretMission?.status).toBe('rewardClaimed');
    expect(store.getState().game.secretMission?.reward?.type).toBe('immunity');
  });

  it('applies 1,000 Influence when the assigned influence box is claimed', () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (store) => {
        store.dispatch(triggerSecretMission(5));
        store.dispatch(offerSecretMission(5));
        store.dispatch(acceptSecretMission());
        store.dispatch(completeMission());
      },
    });

    const assignedRewards = getSecretMissionBoxRewards(store.getState().game.secretMission!);
    const influenceBoxIndex = assignedRewards.indexOf('plus1000Influence');
    const userId = store.getState().game.players.find((player) => player.isUser)?.id ?? 'user';
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`open mystery box ${influenceBoxIndex + 1}`, 'i') }));

    expect(store.getState().game.secretMission?.reward?.type).toBe('plus1000Influence');
    expect(store.getState().social.influenceBank[userId]).toBe(1000);
  });

  it('uses outcome-neutral reward-pending copy and reinjects it for a later mission', async () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (store) => {
        store.dispatch(triggerSecretMission(5));
        store.dispatch(offerSecretMission(5));
        store.dispatch(acceptSecretMission());
        store.dispatch(completeMission());
      },
    });

    await flushConversationTimers();
    expect(screen.getByText(/four reward boxes await/i)).toBeTruthy();
    expect(screen.queryByText(/temporary shield is waiting/i)).toBeNull();

    const current = store.getState().game;
    await act(async () => {
      store.dispatch(hydrateGame({
        ...current,
        week: 8,
        secretMissionCount: 2,
        secretMission: {
          ...current.secretMission!,
          missionNumber: 2,
          triggeredDay: 8,
          startDay: 8,
          endDay: 11,
          targetDeadlineDay: 11,
          survivalWindowEndDay: 11,
          templateId: 'social_engine',
          status: 'rewardPending',
          reward: undefined,
        },
      }));
    });

    await flushConversationTimers();
    expect(screen.getAllByText(/four reward boxes await/i)).toHaveLength(2);
  });

  it('shows only the locked door for eliminated players and leaves secret missions inactive', async () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        appStore.dispatch(triggerSecretMission(5));
        const game = (appStore.getState() as RootState).game;
        appStore.dispatch(hydrateGame({
          ...game,
          players: game.players.map((player) =>
            player.isUser ? { ...player, status: 'evicted' } : player,
          ),
        }));
      },
    });

    await flushConversationTimers();

    expect(screen.getByTestId('confessional-locked-door')).toBeTruthy();
    expect(screen.getByTestId('confessional-locked-door-image').getAttribute('src')).toContain(
      '/assets/diary-room/confessional-locked-door.png',
    );
    expect(screen.getByText('The door is locked.')).toBeTruthy();
    expect(screen.queryByLabelText(/confessional chat/i)).toBeNull();
    expect(screen.queryByLabelText(/secret mission checklist/i)).toBeNull();
    expect(store.getState().game.secretMission?.status).toBe('available');
  });

  it('offers the eviction vote reveal in the confessional during week_end on eviction day', async () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        saveEvictionVoteBreakdownUnlock({
          week: 2,
          phase: 'eviction_results',
          votes: {
            [game.players[1].id]: game.players[2].id,
            [game.players[3].id]: game.players[2].id,
          },
          nomineeIds: [game.players[2].id, game.players[4].id],
          evicteeId: game.players[2].id,
          status: 'available',
        });
        appStore.dispatch(hydrateGame({
          ...game,
          week: 2,
          phase: 'week_end',
        }));
      },
    });

    expect(screen.getByText(/are you ready to peek behind the curtain/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No' })).toBeTruthy();
  });

  it('surfaces the vote reveal offer before the chat log and message box', async () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        saveEvictionVoteBreakdownUnlock({
          week: 2,
          phase: 'eviction_results',
          votes: {
            [game.players[1].id]: game.players[2].id,
            [game.players[3].id]: game.players[2].id,
          },
          nomineeIds: [game.players[2].id, game.players[4].id],
          evicteeId: game.players[2].id,
          status: 'available',
        });
        appStore.dispatch(hydrateGame({
          ...game,
          week: 2,
          phase: 'week_end',
        }));
      },
    });

    const voteRevealOffer = screen.getByLabelText(/vote reveal offer/i);
    const chat = screen.getByLabelText(/confessional chat/i);
    const diaryEntry = screen.getByLabelText(/diary entry/i);

    expect(voteRevealOffer.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(voteRevealOffer.compareDocumentPosition(diaryEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not offer the eviction vote reveal after a new day begins', async () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        saveEvictionVoteBreakdownUnlock({
          week: 2,
          phase: 'eviction_results',
          votes: {
            [game.players[1].id]: game.players[2].id,
            [game.players[3].id]: game.players[2].id,
          },
          nomineeIds: [game.players[2].id, game.players[4].id],
          evicteeId: game.players[2].id,
          status: 'available',
        });
        appStore.dispatch(hydrateGame({
          ...game,
          week: 3,
          phase: 'week_start',
        }));
      },
    });

    expect(screen.queryByText(/are you ready to peek behind the curtain/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
  });

  it('does not offer the eviction vote reveal when the stored unlock phase is not eviction_results', async () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        saveEvictionVoteBreakdownUnlock({
          week: 2,
          phase: 'live_vote',
          votes: {
            [game.players[1].id]: game.players[2].id,
            [game.players[3].id]: game.players[2].id,
          },
          nomineeIds: [game.players[2].id, game.players[4].id],
          evicteeId: game.players[2].id,
          status: 'available',
        });
        appStore.dispatch(hydrateGame({
          ...game,
          week: 2,
          phase: 'week_end',
        }));
      },
    });

    expect(screen.queryByText(/are you ready to peek behind the curtain/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
  });

  it('reveals the vote chart after accepting the confessional vote breakdown', async () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        saveEvictionVoteBreakdownUnlock({
          week: 2,
          phase: 'eviction_results',
          votes: {
            [game.players[1].id]: game.players[2].id,
            [game.players[3].id]: game.players[4].id,
          },
          nomineeIds: [game.players[2].id, game.players[4].id],
          evicteeId: game.players[2].id,
          status: 'available',
        });
        appStore.dispatch(hydrateGame({
          ...game,
          week: 2,
          phase: 'eviction_results',
        }));
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    expect(screen.getByLabelText(/eviction vote breakdown/i)).toBeTruthy();
    expect(screen.getByText(/who voted for whom/i)).toBeTruthy();
    expect(screen.getByText(/then look closely\. the curtain is lifting now\./i)).toBeTruthy();
  });

  it('blocks router navigation away while a confessional decision is pending', () => {
    renderDiaryRoomWithEscapeRoute(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        appStore.dispatch(hydrateGame({
          ...game,
          phase: 'live_vote',
          awaitingHumanVote: true,
        }));
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /leave route/i }));

    expect(screen.queryByText('Game route')).toBeNull();
    expect(screen.getByLabelText(/confessional chat/i)).toBeTruthy();
    expect(screen.getByTestId('confessional-decision-message')).toBeTruthy();
  });

  it('renders a pending vote as a Big Eye chat message and appends the user reply after selection', () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        appStore.dispatch(hydrateGame({
          ...game,
          phase: 'live_vote',
          awaitingHumanVote: true,
          nomineeIds: [game.players[1].id, game.players[2].id],
        }));
      },
    });

    const targetName = store.getState().game.players[1].name;

    expect(screen.getByTestId('confessional-decision-message')).toBeTruthy();
    expect(screen.getByText(/choose who you want to eliminate/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(targetName, 'i') }));

    expect(screen.getByText(new RegExp(`I choose ${targetName}`, 'i'))).toBeTruthy();
    expect(screen.getByText(/your choice has been recorded\. the ceremony will proceed\./i)).toBeTruthy();
    expect(store.getState().game.awaitingHumanVote).toBe(false);
  });

  it('appends a new Big Eye decision message when one confessional choice leads to the next', () => {
    renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        appStore.dispatch(hydrateGame({
          ...game,
          phase: 'pos_ceremony_results',
          awaitingPovDecision: true,
          awaitingPovSaveTarget: false,
          posWinnerId: game.players.find((player) => player.isUser)?.id ?? game.players[0].id,
          nomineeIds: [game.players[1].id, game.players[2].id],
        }));
      },
    });

    expect(screen.getByText(/do you want to use power of safety/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /use power/i }));

    expect(screen.getByText(/i will use power of safety/i)).toBeTruthy();
    expect(screen.getByText(/your choice has been recorded\. the ceremony will proceed\./i)).toBeTruthy();
    expect(screen.getByText(/choose which nominee you want to save/i)).toBeTruthy();
  });

  it('mentions the public auto-nominee in the appended nomination summary', () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        const userId = game.players.find((player) => player.isUser)?.id ?? game.players[0].id;
        appStore.dispatch(hydrateGame({
          ...game,
          phase: 'nomination_results',
          lohId: userId,
          awaitingNominations: true,
          publicModeEnabled: true,
          lastHohCompFinisherId: game.players[3].id,
        }));
      },
    });

    const state = store.getState().game;
    const lohId = state.lohId;
    const autoNomineeId = state.lastHohCompFinisherId;
    const manualChoices = state.players
      .filter((player) => player.status === 'active' && player.id !== lohId && player.id !== autoNomineeId)
      .slice(0, 2);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(manualChoices[0].name, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(manualChoices[1].name, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: /confirm nominations/i }));

    const autoNomineeName = state.players.find((player) => player.id === autoNomineeId)?.name ?? 'Unknown';

    expect(
      screen.getByText(new RegExp(`${autoNomineeName} is already the last-place nominee`, 'i')),
    ).toBeTruthy();
    expect(screen.getByText(/your choice has been recorded\. the ceremony will proceed\./i)).toBeTruthy();
    expect(store.getState().game.nomineeIds).toContain(autoNomineeId);
  });

  it('updates the main TV message after declining the confessional vote breakdown and returning to the game', async () => {
    const { store } = renderDiaryRoom(['/game', '/diary-room'], {
      setupStore: (appStore) => {
        const game = (appStore.getState() as RootState).game;
        saveEvictionVoteBreakdownUnlock({
          week: 2,
          phase: 'eviction_results',
          votes: {
            [game.players[1].id]: game.players[2].id,
            [game.players[3].id]: game.players[4].id,
          },
          nomineeIds: [game.players[2].id, game.players[4].id],
          evicteeId: game.players[2].id,
          status: 'available',
        });
        appStore.dispatch(hydrateGame({
          ...game,
          week: 2,
          phase: 'week_end',
        }));
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(screen.queryByText(/are you ready to peek behind the curtain/i)).toBeNull();
    expect(loadEvictionVoteBreakdownUnlock()).toMatchObject({ status: 'declined' });
    expect(store.getState().game.tvFeed[0]?.text).toBe(
      "It's getting quiet in the house. Sandman on the way?",
    );
  });
});
