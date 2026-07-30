import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { activateCupidArrowNow } from '../../../store/gameSlice';
import settingsReducer from '../../../store/settingsSlice';
import { getConfessionalDecisionPresentation } from '../confessionalDecisionPresentation';
import { buildConfessionalDecisionUnits } from '../cupidDecisionUnits';

function createBaseGame() {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });

  return store.getState().game;
}

describe('getConfessionalDecisionPresentation', () => {
  it('uses stable decision identity data instead of prompt text in the message key', () => {
    const game = createBaseGame();
    const alivePlayers = game.players.filter((player) => player.status === 'active');

    const presentation = getConfessionalDecisionPresentation(
      { type: 'nominations', week: game.week, phase: 'nomination_results' },
      {
        ...game,
        phase: 'nomination_results',
        awaitingNominations: true,
      },
      alivePlayers,
    );

    expect(presentation.prompt).toMatch(/choose the two players you want to nominate/i);
    expect(presentation.key).not.toContain(presentation.prompt);
  });

  it('changes the replacement decision key for different replacement stages', () => {
    const game = createBaseGame();
    const alivePlayers = game.players.filter((player) => player.status === 'active');
    const specialVeto = game.specialVeto ?? {
      seasonUsed: false,
      activeType: null,
      activatedWeek: null,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
      vipUseStage: 0,
    };

    const firstReplacement = getConfessionalDecisionPresentation(
      { type: 'replacement_nominee', week: game.week, phase: 'pos_ceremony_results' },
      {
        ...game,
        phase: 'pos_ceremony_results',
        specialVeto: {
          ...specialVeto,
          activeType: 'coup',
          awaitingCoupReplacement1: true,
          awaitingCoupReplacement2: false,
        },
      },
      alivePlayers,
    );

    const secondReplacement = getConfessionalDecisionPresentation(
      { type: 'replacement_nominee', week: game.week, phase: 'pos_ceremony_results' },
      {
        ...game,
        phase: 'pos_ceremony_results',
        specialVeto: {
          ...specialVeto,
          activeType: 'coup',
          awaitingCoupReplacement1: false,
          awaitingCoupReplacement2: true,
        },
      },
      alivePlayers,
    );

    expect(firstReplacement.key).not.toBe(secondReplacement.key);
  });

  it('presents active Cupid nominees as combined pair choices', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        settings: settingsReducer,
      },
    });
    store.dispatch(activateCupidArrowNow());
    const game = store.getState().game;
    const nomineePlayers = game.cupidArrow!.pairs
      .slice(0, 2)
      .flatMap((pair) =>
        pair.memberIds.map((id) => game.players.find((player) => player.id === id)!),
      );

    const units = buildConfessionalDecisionUnits(game, nomineePlayers);
    const presentation = getConfessionalDecisionPresentation(
      { type: 'eviction_vote', week: game.week, phase: 'live_vote' },
      game,
      game.players,
    );

    expect(units).toHaveLength(2);
    expect(units.every((unit) => unit.players.length === 2)).toBe(true);
    expect(presentation.prompt).toMatch(/joint ballot counts as two votes/i);
  });
});
