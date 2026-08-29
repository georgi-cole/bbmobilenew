import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import gameReducer, {
  finalizePendingEviction,
  hydrateGame,
  revealSurvivorReplacement,
} from '../src/store/gameSlice';
import { survivorMiddleware } from '../src/modes/survivorMiddleware';
import { createSurvivorRun, SURVIVOR_STARTING_CAST_SIZE } from '../src/modes/survivorRun';

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(survivorMiddleware),
  });
}

describe('Survivor replacement transition', () => {
  it('holds the evicted tile until Play reveals the replacement', () => {
    const store = makeStore();
    const survivorRun = createSurvivorRun();
    const outgoing = survivorRun.players.find((player) => player.isRobo);
    expect(outgoing).toBeTruthy();

    store.dispatch(hydrateGame({
      ...survivorRun,
      phase: 'eviction_results',
      pendingEviction: {
        evicteeId: outgoing!.id,
        evictionMessage: `${outgoing!.name} has been evicted.`,
      },
    }));

    store.dispatch(finalizePendingEviction(outgoing!.id));

    const pausedGame = store.getState().game;
    const pending = pausedGame.modeSpecific?.kind === 'survival'
      ? pausedGame.modeSpecific.replacementPending
      : null;
    expect(pending?.outgoingPlayerSnapshot.id).toBe(outgoing!.id);
    expect(pausedGame.players.some((player) => player.id === outgoing!.id)).toBe(true);
    expect(pausedGame.players.find((player) => player.id === outgoing!.id)?.status).toBe('evicted');

    store.dispatch(revealSurvivorReplacement());

    const game = store.getState().game;
    const transition = game.modeSpecific?.kind === 'survival'
      ? game.modeSpecific.replacementTransition
      : null;
    const activePlayers = game.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury');
    const replacement = transition
      ? game.players.find((player) => player.id === transition.incomingPlayerId)
      : null;

    expect(activePlayers).toHaveLength(SURVIVOR_STARTING_CAST_SIZE);
    expect(game.players.some((player) => player.id === outgoing!.id)).toBe(false);
    expect(transition?.outgoingPlayerSnapshot.id).toBe(outgoing!.id);
    expect(transition?.outgoingPlayerSnapshot.status).toBe('evicted');
    expect(transition?.slot).toBe(outgoing!.survivorSlot);
    expect(transition?.durationMs).toBe(2000);
    expect(replacement?.isRobo).toBe(true);
    expect(replacement?.survivorSlot).toBe(outgoing!.survivorSlot);
    const replacementEvent = game.tvFeed.find((event) =>
      event.text.includes('replacement synthetic contestant')
    );
    expect(replacementEvent?.meta?.phase).toBe('eviction_results');
    expect(replacementEvent?.meta?.forceOnTv).toBe(true);
  });
});
