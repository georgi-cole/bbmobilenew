import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/store/rng';
import {
  advanceTurn,
  applyEffectSelection,
  createInitialState,
  getValidTargets,
  getNextEligiblePlayer,
  getAlivePlayers,
  getCurrentPlayer,
  type GameState,
  type GridPlayer,
  type ResolvedParticipant,
  resolveBoxSelection,
} from '../../src/components/GridOfLuck/gridOfLuckLogic';

function makeParticipants(count = 6): ResolvedParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    isHuman: index === 0,
    precomputedScore: 100 - index * 5,
    avatar: String.fromCharCode(65 + index),
  }));
}

function updatePlayers(state: GameState, mutate: (players: GridPlayer[]) => void): GameState {
  const players = state.players.map((player) => ({ ...player, statusEffects: [...player.statusEffects] }));
  mutate(players);
  return { ...state, players };
}

describe('Grid of Luck logic', () => {
  it('rerolls elimination-type boxes away from the first three picks', () => {
    const state = createInitialState(makeParticipants(), 7);
    state.gridBoxes[0].type = 'execution';
    state.gridBoxes[1].type = 'gain200';

    const outcome = resolveBoxSelection(state, getCurrentPlayer(state).id, 0, mulberry32(19));

    expect(outcome.revealedEffectType).not.toBe('execution');
    expect(outcome.revealedEffectType).not.toBe('martyrdom');
    expect(outcome.state.gridBoxes[0]?.isOpened).toBe(true);
  });

  it('consumes a shield before execution can eliminate a player', () => {
    let state = createInitialState(makeParticipants(), 11);
    state = updatePlayers(state, (players) => {
      players[1].shield = true;
      players[1].statusEffects = ['Shielded'];
    });

    const outcome = applyEffectSelection(state, state.players[0]!.id, 'execution', 0, [state.players[1]!.id], mulberry32(5));
    const target = outcome.state.players.find((player) => player.id === state.players[1]!.id);

    expect(target?.shield).toBe(false);
    expect(target?.isEliminated).toBe(false);
    expect(target?.lp).toBe(500);
  });

  it('allows execution to target the only rival in a two-player game', () => {
    const state = createInitialState(makeParticipants(2), 13);

    const targets = getValidTargets(state.players, state.players[0]!.id, 'execution');

    expect(targets.map((player) => player.id)).toEqual([state.players[1]!.id]);
  });

  it('keeps at least three players alive until the final two turns', () => {
    let state = createInitialState(makeParticipants(), 17);
    state = updatePlayers(state, (players) => {
      players[0]!.lp = 500;
      players[1]!.lp = 410;
      players[2]!.lp = 120;
      for (const player of players.slice(3)) {
        player.isEliminated = true;
        player.lp = 0;
      }
    });
    state.gridBoxes.forEach((box, index) => {
      box.isOpened = index < 10;
    });

    const outcome = applyEffectSelection(state, state.players[0]!.id, 'steal150', 10, [state.players[2]!.id], mulberry32(23));
    const victim = outcome.state.players.find((player) => player.id === state.players[2]!.id);

    expect(getAlivePlayers(outcome.state.players)).toHaveLength(3);
    expect(victim?.isEliminated).toBe(false);
    expect(victim?.lp).toBe(120);
  });

  it('advances until it finds a player whose skipped turns are fully exhausted', () => {
    let state = createInitialState(makeParticipants(4), 29);
    state = updatePlayers(state, (players) => {
      players[1]!.skipTurns = 2;
      players[2]!.skipTurns = 1;
      players[3]!.skipTurns = 1;
    });

    const advanced = advanceTurn(state);
    const nextPlayer = getCurrentPlayer(advanced.state);

    expect(nextPlayer.skipTurns).toBe(0);
    expect(nextPlayer.id).not.toBe(state.players[1]!.id);
  });

  it('previews the same next eligible player that turn advancement will select', () => {
    let state = createInitialState(makeParticipants(5), 41);
    state = updatePlayers(state, (players) => {
      players[1]!.skipTurns = 1;
      players[2]!.isEliminated = true;
      players[2]!.lp = 0;
      players[3]!.skipTurns = 2;
    });

    const preview = getNextEligiblePlayer(state);
    const advanced = advanceTurn(state);

    expect(preview?.id).toBe(getCurrentPlayer(advanced.state).id);
  });

  it('uses a single target prompt for martyrdom in two-player games', () => {
    const state = createInitialState(makeParticipants(2), 43);
    state.openedCount = 3;
    state.gridBoxes[0]!.type = 'martyrdom';

    const outcome = resolveBoxSelection(state, state.players[0]!.id, 0, mulberry32(7));

    expect(outcome.pendingSelection?.step).toBe('target');
    expect(outcome.message).toMatch(/touched by martyrdom/i);
  });

  it('unlocks all unopened boxes if they would all remain locked', () => {
    const state = createInitialState(makeParticipants(), 31);
    state.gridBoxes.forEach((box, index) => {
      if (index > 0) {
        box.isLocked = true;
      }
    });

    const outcome = resolveBoxSelection(state, getCurrentPlayer(state).id, 0, mulberry32(2));
    const unopened = outcome.state.gridBoxes.filter((box) => !box.isOpened);

    expect(unopened.some((box) => box.isLocked)).toBe(false);
  });
});
