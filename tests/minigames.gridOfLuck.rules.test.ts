import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../src/store/rng';
import {
  advanceTurn,
  createInitialState,
  getCurrentPlayer,
  getNextEligiblePlayer,
  getValidTargets,
  resolveAutoTargetIds,
  resolveBoxSelection,
  type ResolvedParticipant,
} from '../src/components/GridOfLuck/gridOfLuckLogic';

function makeParticipants(count = 5): ResolvedParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? 'human' : `ai-${index}`,
    name: index === 0 ? 'You' : `AI ${index}`,
    isHuman: index === 0,
    precomputedScore: 100 - index * 8,
    avatar: String.fromCharCode(65 + index),
  }));
}

describe('Grid of Luck rules', () => {
  it('keeps early lethal boxes safe and only exposes an eligible leader to drain effects', () => {
    const earlyState = createInitialState(makeParticipants(), 7);
    earlyState.gridBoxes[0]!.type = 'execution';
    earlyState.gridBoxes[1]!.type = 'gain200';

    const earlyOutcome = resolveBoxSelection(earlyState, earlyState.players[0]!.id, 0, mulberry32(19));
    expect(earlyOutcome.revealedEffectType).not.toBe('execution');
    expect(earlyOutcome.revealedEffectType).not.toBe('martyrdom');
    expect(earlyOutcome.state.gridBoxes[0]?.isOpened).toBe(true);

    const drainState = createInitialState(makeParticipants(), 7);
    drainState.players[0]!.lp = 500;
    drainState.players[1]!.lp = 750;
    drainState.players[2]!.lp = 640;
    drainState.players[1]!.immunityRounds = 1;

    expect(getValidTargets(drainState.players, drainState.players[0]!.id, 'removeLeader200')).toEqual([]);

    drainState.players[1]!.immunityRounds = 0;
    expect(getValidTargets(drainState.players, drainState.players[0]!.id, 'removeLeader200').map((player) => player.id)).toEqual([
      drainState.players[1]!.id,
    ]);
  });

  it('copies the last power and applies the copied result', () => {
    const state = createInitialState(makeParticipants(), 11);
    state.openedCount = 4;
    state.lastPowerUsed = 'gain200';
    state.gridBoxes[0]!.type = 'copyLastPower';

    const outcome = resolveBoxSelection(state, state.players[0]!.id, 0, mulberry32(29));
    const actor = outcome.state.players.find((player) => player.id === state.players[0]!.id);

    expect(outcome.revealedEffectType).toBe('gain200');
    expect(actor?.lp).toBe(700);
    expect(outcome.message).toMatch(/echoes/i);
  });

  it('prompts a human martyrdom selection and returns unique AI martyrdom targets', () => {
    const state = createInitialState(makeParticipants(5), 13);
    state.openedCount = 4;
    state.gridBoxes[0]!.type = 'martyrdom';

    const outcome = resolveBoxSelection(state, state.players[0]!.id, 0, mulberry32(7));
    const targets = resolveAutoTargetIds(state.players, state.players[0]!.id, 'martyrdom', mulberry32(5));

    expect(outcome.pendingSelection?.step).toBe('martyr-blessing');
    expect(outcome.screenMode).toBe('zoomIn');
    expect(outcome.revealedEffectType).toBe('martyrdom');
    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(2);
    expect(targets).not.toContain(state.players[0]!.id);
  });

  it('matches the previewed next player after skipped turns advance', () => {
    const state = createInitialState(makeParticipants(5), 17);
    state.players[1]!.skipTurns = 1;
    state.players[2]!.skipTurns = 2;
    state.players[3]!.isEliminated = true;
    state.players[3]!.lp = 0;

    const preview = getNextEligiblePlayer(state);
    const advanced = advanceTurn(state);

    expect(preview?.id).toBe(getCurrentPlayer(advanced.state).id);
    expect(advanced.state.players[1]!.skipTurns).toBe(0);
  });
});